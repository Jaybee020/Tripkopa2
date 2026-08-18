import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, isoDate } from "./flexible-payments";
import { isTrustTier, type FinancingRules, type TrustTier } from "./financing-rules";

type BookingRow = {
  id: string;
  status: string;
  travel_completion_date?: string | null;
  repayment_deadline?: string | null;
  grace_deadline?: string | null;
  balance_amount?: number | string;
};

type InstallmentRow = {
  id: string;
  booking_id: string;
  sequence_number: number;
  due_date: string;
  paid_at?: string | null;
  paid_amount: number | string;
  amount: number | string;
  status: string;
  phase?: string;
  reminder_count?: number;
};

type RiskEvent = {
  id: string;
  booking_id?: string | null;
  event_type: string;
  severity: string;
  status: string;
};

const TIER_ORDER: TrustTier[] = ["OBSERVER", "EXPLORER", "VOYAGER", "NAVIGATOR", "AMBASSADOR"];

function lowerTier(tier: TrustTier) {
  return TIER_ORDER[Math.max(0, TIER_ORDER.indexOf(tier) - 1)];
}

function computeTier(cycles: number, onTimeRate: number, reminderRate: number): TrustTier {
  if (cycles >= 21 && onTimeRate >= 0.95 && reminderRate <= 0.2) return "AMBASSADOR";
  if (cycles >= 16 && onTimeRate >= 0.95 && reminderRate <= 0.2) return "NAVIGATOR";
  if (cycles >= 11 && onTimeRate >= 0.9 && reminderRate <= 0.2) return "VOYAGER";
  if (cycles >= 5) return "EXPLORER";
  return "OBSERVER";
}

function paidInFull(item: InstallmentRow) {
  return Number(item.paid_amount) >= Number(item.amount);
}

function onTime(item: InstallmentRow) {
  return Boolean(item.paid_at && item.paid_at.slice(0, 10) <= item.due_date);
}

async function ensureRiskEvent(
  supabase: SupabaseClient,
  customerId: string,
  bookingId: string,
  eventType: string,
  severity: string,
  details: Record<string, unknown>,
) {
  const { data, error } = await supabase
    .from("customer_risk_events")
    .select("id")
    .eq("customer_id", customerId)
    .eq("booking_id", bookingId)
    .eq("event_type", eventType)
    .eq("status", "OPEN")
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const { error: insertError } = await supabase.from("customer_risk_events").insert({
      customer_id: customerId,
      booking_id: bookingId,
      event_type: eventType,
      severity,
      details,
    });
    if (insertError) throw insertError;
  }
}

export async function evaluateRepaymentLifecycle(
  supabase: SupabaseClient,
  customerId: string,
  rules: FinancingRules,
  bookingId?: string,
) {
  let bookingQuery = supabase
    .from("bookings")
    .select("id,status,travel_completion_date,repayment_deadline,grace_deadline")
    .eq("customer_id", customerId)
    .eq("booking_type", "flexible");
  if (bookingId) bookingQuery = bookingQuery.eq("id", bookingId);
  const { data: bookingData, error: bookingError } = await bookingQuery;
  if (bookingError) throw bookingError;
  const bookings = (bookingData || []) as BookingRow[];
  if (bookings.length === 0) return;

  const ids = bookings.map((booking) => booking.id);
  const { data: installmentData, error: installmentError } = await supabase
    .from("installments")
    .select("*")
    .in("booking_id", ids)
    .order("sequence_number");
  if (installmentError) throw installmentError;
  const installments = (installmentData || []) as InstallmentRow[];
  const today = isoDate(new Date());

  for (const booking of bookings) {
    const rows = installments.filter((item) => item.booking_id === booking.id);
    const preTravel = rows.filter((item) => item.phase !== "POST_TRAVEL");
    const finalPre = preTravel.at(-1);
    for (const row of rows) {
      if (paidInFull(row) || row.due_date >= today) continue;
      const isFinalPre = row.id === finalPre?.id;
      const hardGrace = booking.grace_deadline ||
        (booking.repayment_deadline
          ? isoDate(addDays(new Date(`${booking.repayment_deadline}T00:00:00Z`), rules.grace_period_days))
          : row.due_date);
      const status = isFinalPre && today <= hardGrace ? "GRACE" : isFinalPre || row.phase === "POST_TRAVEL" ? "DEFAULTED" : "OVERDUE";
      if (row.status !== status) {
        const { error } = await supabase.from("installments").update({ status }).eq("id", row.id);
        if (error) throw error;
      }
      if (status === "DEFAULTED") {
        await ensureRiskEvent(supabase, customerId, booking.id, "FINAL_DEFAULT", "MAJOR", {
          installment_id: row.id,
          due_date: row.due_date,
          phase: row.phase || "PRE_TRAVEL",
        });
        if (booking.status !== "CANCELLATION_REVIEW") {
          const { error } = await supabase
            .from("bookings")
            .update({ status: "CANCELLATION_REVIEW" })
            .eq("id", booking.id);
          if (error) throw error;
        }
      }
    }
  }
}

export async function refreshCustomerTrustTier(
  supabase: SupabaseClient,
  customerId: string,
): Promise<{
  computed_tier: TrustTier;
  effective_tier: TrustTier;
  successful_cycles: number;
  on_time_repayment_rate: number;
  reminder_dependency_rate: number;
}> {
  const [{ data: customer, error: customerError }, { data: bookings, error: bookingError }, { data: installments, error: installmentError }, { data: riskEvents, error: riskError }] = await Promise.all([
    supabase.from("customers").select("trust_tier,trust_tier_override").eq("id", customerId).single(),
    supabase.from("bookings").select("id,status,travel_completion_date,balance_amount").eq("customer_id", customerId).eq("booking_type", "flexible"),
    supabase.from("installments").select("*").eq("customer_id", customerId),
    supabase.from("customer_risk_events").select("id,booking_id,event_type,severity,status").eq("customer_id", customerId),
  ]);
  if (customerError) throw customerError;
  if (bookingError) throw bookingError;
  if (installmentError) throw installmentError;
  if (riskError) throw riskError;

  const bookingRows = (bookings || []) as BookingRow[];
  const installmentRows = (installments || []) as InstallmentRow[];
  const risks = (riskEvents || []) as RiskEvent[];
  const today = isoDate(new Date());
  const blockedBookings = new Set(risks.filter((event) => event.severity === "SEVERE" || event.event_type === "FINAL_DEFAULT").map((event) => event.booking_id));
  const successfulCycles = bookingRows.filter((booking) =>
    Number(booking.balance_amount || 0) === 0 &&
    Boolean(booking.travel_completion_date && booking.travel_completion_date <= today) &&
    !blockedBookings.has(booking.id),
  ).length;
  const completed = installmentRows.filter(paidInFull);
  const onTimeRate = completed.length ? completed.filter(onTime).length / completed.length : 1;
  const reminderRate = completed.length
    ? completed.filter((item) => Number(item.reminder_count || 0) > 0).length / completed.length
    : 0;
  let computedTier = computeTier(successfulCycles, onTimeRate, reminderRate);
  const openRisks = risks.filter((event) => event.status === "OPEN");
  if (openRisks.some((event) => event.severity === "SEVERE" || event.event_type === "FRAUD")) {
    computedTier = "OBSERVER";
  } else if (openRisks.some((event) => event.event_type === "FINAL_DEFAULT")) {
    computedTier = lowerTier(computedTier);
  }
  const effectiveTier = isTrustTier(customer.trust_tier_override)
    ? customer.trust_tier_override
    : computedTier;
  const previousTier = isTrustTier(customer.trust_tier_override)
    ? customer.trust_tier_override
    : isTrustTier(customer.trust_tier)
      ? customer.trust_tier
      : "OBSERVER";
  const metrics = {
    successful_cycles: successfulCycles,
    on_time_repayment_rate: onTimeRate,
    reminder_dependency_rate: reminderRate,
  };
  const { error: updateError } = await supabase.from("customers").update({
    trust_tier: computedTier,
    ...metrics,
  }).eq("id", customerId);
  if (updateError) throw updateError;
  if (previousTier !== effectiveTier) {
    const { error: historyError } = await supabase.from("trust_tier_history").insert({
      customer_id: customerId,
      previous_tier: previousTier,
      computed_tier: computedTier,
      effective_tier: effectiveTier,
      reason: openRisks.length ? "risk_adjustment" : "behavioral_history",
      metrics,
    });
    if (historyError) throw historyError;
  }
  return { computed_tier: computedTier, effective_tier: effectiveTier, ...metrics };
}
