import { NextResponse } from "next/server";
import { requireOperationsStaff } from "@/lib/auth/operations";
import { failure } from "@/lib/api-utils";
import { supabase as serviceSupabase } from "@/lib/services/supabase";

function amount(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET() {
  try {
    await requireOperationsStaff();
    const admin = serviceSupabase.admin;
    const [customers, wallets, accounts, kyc, bookings, payments, allocations] =
      await Promise.all([
        admin
          .from("customers")
          .select("id,whatsapp_number,status,title,first_name,middle_name,last_name,email,date_of_birth,gender,preferred_currency,profile_completed_at,trust_tier,trust_tier_override,successful_cycles,on_time_repayment_rate,reminder_dependency_rate,created_at,updated_at")
          .order("created_at", { ascending: false })
          .limit(500),
        admin.from("wallets").select("id,customer_id,currency,balance,updated_at"),
        admin
          .from("virtual_accounts")
          .select("id,customer_id,provider,account_number,account_name,bank_name,status,created_at,updated_at"),
        admin
          .from("kyc_sessions")
          .select("id,customer_id,provider,status,provider_reference,created_at,updated_at")
          .order("created_at", { ascending: false }),
        admin
          .from("bookings")
          .select("id,customer_id,status,booking_type,total_amount,amount_paid,balance_amount,currency,created_at"),
        admin
          .from("payments")
          .select("id,customer_id,booking_id,provider,provider_reference,payment_type,amount,currency,status,created_at,updated_at")
          .eq("provider", "onecap_providus")
          .order("created_at", { ascending: false })
          .limit(500),
        admin
          .from("payment_allocations")
          .select("id,payment_id,booking_id,amount,currency,allocation_type,provider_paid_at,created_at")
          .order("created_at", { ascending: false })
          .limit(1000),
      ]);

    for (const result of [customers, wallets, accounts, kyc, bookings, payments, allocations]) {
      if (result.error) throw result.error;
    }

    const customerById = new Map(
      (customers.data || []).map((customer) => [customer.id, customer]),
    );
    const walletByCustomer = new Map(
      (wallets.data || []).map((wallet) => [wallet.customer_id, wallet]),
    );
    const accountByCustomer = new Map(
      (accounts.data || []).map((account) => [account.customer_id, account]),
    );
    const latestKycByCustomer = new Map<string, Record<string, unknown>>();
    for (const session of kyc.data || []) {
      if (!latestKycByCustomer.has(session.customer_id)) {
        latestKycByCustomer.set(session.customer_id, session);
      }
    }
    const bookingsByCustomer = new Map<string, typeof bookings.data>();
    for (const booking of bookings.data || []) {
      const rows = bookingsByCustomer.get(booking.customer_id) || [];
      rows.push(booking);
      bookingsByCustomer.set(booking.customer_id, rows);
    }
    const allocationsByPayment = new Map<string, typeof allocations.data>();
    for (const allocation of allocations.data || []) {
      const rows = allocationsByPayment.get(allocation.payment_id) || [];
      rows.push(allocation);
      allocationsByPayment.set(allocation.payment_id, rows);
    }

    const customerSummaries = (customers.data || []).map((customer) => {
      const customerBookings = bookingsByCustomer.get(customer.id) || [];
      return {
        ...customer,
        wallet: walletByCustomer.get(customer.id) || null,
        virtual_account: accountByCustomer.get(customer.id) || null,
        latest_kyc: latestKycByCustomer.get(customer.id) || null,
        booking_summary: {
          total: customerBookings.length,
          open: customerBookings.filter(
            (booking) =>
              !["PAID", "CANCELLED", "REFUNDED", "FAILED"].includes(
                booking.status,
              ),
          ).length,
          total_paid: customerBookings.reduce(
            (sum, booking) => sum + amount(booking.amount_paid),
            0,
          ),
          outstanding: customerBookings.reduce(
            (sum, booking) => sum + amount(booking.balance_amount),
            0,
          ),
        },
      };
    });

    const deposits = (payments.data || []).map((payment) => {
      const paymentAllocations = allocationsByPayment.get(payment.id) || [];
      const allocatedAmount = paymentAllocations.reduce(
        (sum, allocation) => sum + amount(allocation.amount),
        0,
      );
      const customer = customerById.get(payment.customer_id);
      return {
        ...payment,
        customer: customer
          ? {
              id: customer.id,
              first_name: customer.first_name,
              last_name: customer.last_name,
              email: customer.email,
              whatsapp_number: customer.whatsapp_number,
            }
          : null,
        virtual_account: accountByCustomer.get(payment.customer_id) || null,
        allocated_amount: allocatedAmount,
        unallocated_amount:
          payment.status === "SUCCEEDED"
            ? Math.max(0, amount(payment.amount) - allocatedAmount)
            : 0,
        allocations: paymentAllocations,
      };
    });

    return NextResponse.json({
      customers: customerSummaries,
      deposits,
      metrics: {
        customers: customerSummaries.length,
        active_virtual_accounts: (accounts.data || []).filter(
          (account) => account.status === "ACTIVE",
        ).length,
        wallet_balance: (wallets.data || []).reduce(
          (sum, wallet) => sum + amount(wallet.balance),
          0,
        ),
        successful_deposits: deposits.filter(
          (payment) => payment.status === "SUCCEEDED",
        ).length,
        total_deposited: deposits
          .filter((payment) => payment.status === "SUCCEEDED")
          .reduce((sum, payment) => sum + amount(payment.amount), 0),
        unallocated_funds: (wallets.data || []).reduce(
          (sum, wallet) => sum + amount(wallet.balance),
          0,
        ),
      },
    });
  } catch (error) {
    return failure(error);
  }
}
