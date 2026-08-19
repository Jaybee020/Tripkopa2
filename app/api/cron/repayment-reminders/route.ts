import { NextResponse } from "next/server";
import { loadFinancingRules } from "@/lib/financing-rules";
import {
  sendScheduledRepaymentReminder,
  type ReminderBooking,
  type ReminderCustomer,
  type ReminderInstallment,
} from "@/lib/repayment-reminders";
import { supabase } from "@/lib/services/supabase";
import { evaluateRepaymentLifecycle } from "@/lib/trust-financing";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function parseDayList(value: string | undefined, fallback: number[]) {
  if (!value) return fallback;
  const parsed = [...new Set(value.split(",")
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter((item) => Number.isInteger(item) && item >= 0 && item <= 60))];
  return parsed.length ? parsed : fallback;
}

function lagosToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string) {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  );
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "Cron authentication is not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = supabase.admin;
  const today = lagosToday();
  const upcomingDays = parseDayList(process.env.REPAYMENT_REMINDER_DAYS_BEFORE, [7, 3, 1, 0]);
  const overdueDays = parseDayList(process.env.REPAYMENT_OVERDUE_REMINDER_DAYS, [1, 2, 3, 7]);
  const maximumUpcoming = Math.max(...upcomingDays, 0);
  const configuredBatchSize = Number.parseInt(process.env.REPAYMENT_REMINDER_BATCH_SIZE || "500", 10);
  const batchSize = Number.isInteger(configuredBatchSize)
    ? Math.min(Math.max(configuredBatchSize, 1), 1000)
    : 500;

  const { data: initialRows, error: initialError } = await admin
    .from("installments")
    .select("id,customer_id,booking_id")
    .in("status", ["PENDING", "PARTIALLY_PAID", "DUE", "OVERDUE", "GRACE"])
    .lte("due_date", addDays(today, maximumUpcoming))
    .order("due_date")
    .limit(batchSize);
  if (initialError) throw initialError;

  const rules = await loadFinancingRules(admin);
  const lifecycleKeys = new Set<string>();
  for (const row of initialRows || []) {
    const key = `${row.customer_id}:${row.booking_id}`;
    if (lifecycleKeys.has(key)) continue;
    lifecycleKeys.add(key);
    await evaluateRepaymentLifecycle(admin, row.customer_id, rules, row.booking_id);
  }

  const { data: installmentRows, error: installmentError } = await admin
    .from("installments")
    .select("*")
    .in("status", ["PENDING", "PARTIALLY_PAID", "DUE", "OVERDUE", "GRACE"])
    .lte("due_date", addDays(today, maximumUpcoming))
    .order("due_date")
    .limit(batchSize);
  if (installmentError) throw installmentError;
  const installments = (installmentRows || []) as ReminderInstallment[];
  if (!installments.length) {
    return NextResponse.json({ checked: 0, eligible: 0, sent: 0, duplicates: 0, failed: 0 });
  }

  const bookingIds = [...new Set(installments.map((item) => item.booking_id))];
  const customerIds = [...new Set(installments.map((item) => item.customer_id))];
  const [{ data: bookingRows, error: bookingError }, { data: customerRows, error: customerError }] = await Promise.all([
    admin.from("bookings").select("id,customer_id,status,currency").in("id", bookingIds),
    admin.from("customers").select("id,email,first_name,last_name").in("id", customerIds),
  ]);
  if (bookingError) throw bookingError;
  if (customerError) throw customerError;
  const bookings = new Map((bookingRows as ReminderBooking[]).map((item) => [item.id, item]));
  const customers = new Map((customerRows as ReminderCustomer[]).map((item) => [item.id, item]));

  const summary = {
    checked: installments.length,
    eligible: 0,
    sent: 0,
    duplicates: 0,
    skipped: 0,
    failed: 0,
  };
  const failures: Array<{ installment_id: string; error: string }> = [];

  for (const installment of installments) {
    const daysUntilDue = daysBetween(today, installment.due_date);
    let reminderKind: "UPCOMING" | "DUE_TODAY" | "OVERDUE" | "GRACE" | null = null;
    let scheduleKey = "";
    if (daysUntilDue >= 0 && upcomingDays.includes(daysUntilDue)) {
      reminderKind = daysUntilDue === 0 ? "DUE_TODAY" : "UPCOMING";
      scheduleKey = `before-${daysUntilDue}`;
    } else if (daysUntilDue < 0 && overdueDays.includes(Math.abs(daysUntilDue))) {
      reminderKind = installment.status === "GRACE" ? "GRACE" : "OVERDUE";
      scheduleKey = `overdue-${Math.abs(daysUntilDue)}`;
    }
    if (!reminderKind) {
      summary.skipped += 1;
      continue;
    }

    const booking = bookings.get(installment.booking_id);
    const customer = customers.get(installment.customer_id);
    if (!booking || !customer) {
      summary.failed += 1;
      failures.push({ installment_id: installment.id, error: "Booking or customer record is missing" });
      continue;
    }

    summary.eligible += 1;
    try {
      const result = await sendScheduledRepaymentReminder({
        supabase: admin,
        customer,
        booking,
        installment,
        reminderKind,
        idempotencyKey: `cron:${installment.id}:${installment.due_date}:${scheduleKey}`,
      });
      if (result.sent) {
        summary.sent += result.duplicate ? 0 : 1;
        summary.duplicates += result.duplicate ? 1 : 0;
      } else {
        summary.skipped += 1;
      }
    } catch (error) {
      summary.failed += 1;
      failures.push({
        installment_id: installment.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return NextResponse.json({ ...summary, failures: failures.slice(0, 25) }, {
    headers: { "Cache-Control": "no-store" },
  });
}
