import { NextResponse } from "next/server";
import { z } from "zod";
import { requireKycSessionAccess } from "@/lib/auth/kyc";
import { qoreid } from "@/lib/services/qoreid";
import { onecap } from "@/lib/services/onecap";
import { bad, failure } from "@/lib/api-utils";

const Input = z.object({ bvn: z.string().regex(/^\d{11}$/) }).strict();

type QoreIdBvnResult = {
  id?: string | number;
  applicant?: { firstname?: string; lastname?: string };
  summary?: { bvn_check?: { status?: string } };
  status?: { status?: string; state?: string };
  bvn?: { firstname?: string; lastname?: string; birthdate?: string; gender?: string };
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ session_id: string }> },
) {
  try {
    const { bvn } = Input.parse(await request.json());
    const { session_id } = await params;
    const { session, customer, supabase } = await requireKycSessionAccess(
      request,
      session_id,
    );

    if (session.status !== "CONSENTED") {
      return NextResponse.json(
        { error: "KYC session cannot accept BVN verification" },
        { status: 409 },
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("customers")
      .select("first_name,last_name,email,date_of_birth,gender,whatsapp_number")
      .eq("id", customer.id)
      .single();
    if (profileError) throw profileError;
    if (!profile.first_name || !profile.last_name || !profile.email) {
      return NextResponse.json(
        { error: "Complete the customer name and email before KYC" },
        { status: 409 },
      );
    }

    const { data: existing, error: existingError } = await supabase
      .from("virtual_accounts")
      .select("id,account_number,account_name,bank_name,status")
      .eq("customer_id", customer.id)
      .eq("provider", "onecap_providus")
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing?.status === "ACTIVE") {
      return NextResponse.json({ status: "success", virtual_account: existing });
    }
    if (existing?.status === "PROVISIONING") {
      return NextResponse.json(
        { error: "Virtual account provisioning is already in progress" },
        { status: 409 },
      );
    }

    const reservationQuery = existing
      ? supabase
          .from("virtual_accounts")
          .update({ status: "PROVISIONING" })
          .eq("id", existing.id)
      : supabase.from("virtual_accounts").insert({
          customer_id: customer.id,
          provider: "onecap_providus",
          status: "PROVISIONING",
        });
    const { data: reservation, error: reservationError } = await reservationQuery
      .select("id")
      .single();
    if (reservationError?.code === "23505") {
      return NextResponse.json(
        { error: "Virtual account provisioning is already in progress" },
        { status: 409 },
      );
    }
    if (reservationError) throw reservationError;

    try {
      const result = await qoreid.verifyBvnBasic<QoreIdBvnResult>(bvn, {
        firstname: profile.first_name,
        lastname: profile.last_name,
        dob: profile.date_of_birth || undefined,
        phone: profile.whatsapp_number,
        email: profile.email,
        gender: profile.gender || undefined,
      });

      const verified = result.status?.status?.toLowerCase() === "verified";
      const match = result.summary?.bvn_check?.status?.toUpperCase();
      if (!verified || match === "NO_MATCH") {
        throw Object.assign(
          new Error("BVN verification did not match the customer profile"),
          { status: 422 },
        );
      }

      // BVN exists only in this call stack and is never persisted or returned.
      const provisioned = await onecap.createVirtualAccount({
        first_name: profile.first_name,
        last_name: profile.last_name,
        email: profile.email,
        phone: profile.whatsapp_number,
        bvn,
      });
      const account = provisioned.virtual_account;
      const { data: saved, error: saveError } = await supabase
        .from("virtual_accounts")
        .update({
          account_number: account.account_number,
          account_name: account.account_name,
          bank_name: account.bank_name,
          status: "ACTIVE",
          provider_payload: {
            status: provisioned.status,
            message: provisioned.message,
          },
        })
        .eq("id", reservation.id)
        .select("id,account_number,account_name,bank_name,status")
        .single();
      if (saveError) throw saveError;

      const safeKycResult = {
        provider_verification_id: result.id ? String(result.id) : null,
        status: "VERIFIED",
        name_match: match || null,
        verified_first_name: result.applicant?.firstname || result.bvn?.firstname || null,
        verified_last_name: result.applicant?.lastname || result.bvn?.lastname || null,
        verified_date_of_birth: result.bvn?.birthdate || null,
        verified_gender: result.bvn?.gender || null,
      };
      const { error: kycError } = await supabase
        .from("kyc_sessions")
        .update({
          status: "VERIFIED",
          provider_reference: safeKycResult.provider_verification_id,
          normalized_result: safeKycResult,
        })
        .eq("id", session_id)
        .eq("customer_id", customer.id);
      if (kycError) throw kycError;

      return NextResponse.json(
        { status: "success", virtual_account: saved },
        { status: 201 },
      );
    } catch (error) {
      await supabase
        .from("virtual_accounts")
        .update({ status: "FAILED" })
        .eq("id", reservation.id);
      throw error;
    }
  } catch (error) {
    return error instanceof z.ZodError ? bad(error) : failure(error);
  }
}
