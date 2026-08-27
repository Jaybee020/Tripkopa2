import { after, NextResponse } from "next/server";
import { z } from "zod";
import { requireKycSessionAccess } from "@/lib/auth/kyc";
import { qoreid } from "@/lib/services/qoreid";
import { onecap } from "@/lib/services/onecap";
import { bad, failure } from "@/lib/api-utils";
import { sendKycSuccessNotifications } from "@/lib/kyc-notifications";

const Input = z.object({ bvn: z.string().regex(/^\d{11}$/) }).strict();

type BvnLogContext = {
  session_id?: string;
  customer_id?: string;
  reservation_id?: string;
  account_id?: string;
};

type QoreIdBvnResult = {
  id?: string | number;
  applicant?: { firstname?: string; lastname?: string };
  summary?: { bvn_check?: { status?: string } };
  status?: { status?: string; state?: string };
  bvn?: { firstname?: string; lastname?: string; birthdate?: string; gender?: string };
};

type CustomerBvnProfile = {
  first_name: string;
  last_name: string;
  email: string;
  date_of_birth?: string | null;
  gender?: string | null;
  whatsapp_number: string;
};

function safeErrorCause(error: unknown): Record<string, unknown> | undefined {
  if (!(error instanceof Error)) return undefined;
  const cause = (error as Error & { cause?: unknown }).cause;
  if (!(cause instanceof Error)) return undefined;
  const metadata = cause as Error & {
    code?: string;
    errno?: number;
    syscall?: string;
    hostname?: string;
    address?: string;
    port?: number;
  };
  return {
    name: cause.name,
    message: cause.message,
    code: metadata.code,
    errno: metadata.errno,
    syscall: metadata.syscall,
    hostname: metadata.hostname,
    address: metadata.address,
    port: metadata.port,
  };
}

function errorDetails(error: unknown) {
  if (!(error instanceof Error)) {
    return {
      message: String(error),
    };
  }

  const metadata = error as Error & {
    status?: number;
    code?: string;
    details?: string;
    hint?: string;
    provider?: string;
    originalError?: unknown;
  };

  return {
    name: error.name,
    message: error.message,
    status: metadata.status,
    code: metadata.code,
    details: metadata.details,
    hint: metadata.hint,
    provider: metadata.provider,
    cause: safeErrorCause(error),
    originalError:
      metadata.originalError instanceof Error
        ? {
            name: metadata.originalError.name,
            message: metadata.originalError.message,
            cause: safeErrorCause(metadata.originalError),
          }
        : metadata.originalError
          ? "[redacted]"
          : undefined,
  };
}

function logBvnError(
  stage: string,
  error: unknown,
  context: BvnLogContext = {},
) {
  console.error("[kyc.verify-bvn]", {
    stage,
    ...context,
    error: errorDetails(error),
  });
}

function mockBvnResult(
  sessionId: string,
  profile: CustomerBvnProfile,
): QoreIdBvnResult {
  return {
    id: `mock-qoreid-bvn-${sessionId}`,
    applicant: {
      firstname: profile.first_name,
      lastname: profile.last_name,
    },
    summary: {
      bvn_check: {
        status: "MATCH",
      },
    },
    status: {
      status: "verified",
      state: "verified",
    },
    bvn: {
      firstname: profile.first_name,
      lastname: profile.last_name,
      birthdate: profile.date_of_birth || undefined,
      gender: profile.gender || undefined,
    },
  };
}

async function verifyBvn(
  bvn: string,
  sessionId: string,
  profile: CustomerBvnProfile,
  context: BvnLogContext,
) {
  if (process.env.QOREID_MOCK_BVN_SUCCESS === "true") {
    console.info("[kyc.verify-bvn]", {
      stage: "qoreid_mock_success",
      ...context,
      provider: "qoreid",
    });
    return mockBvnResult(sessionId, profile);
  }

  return qoreid.verifyBvnBasic<QoreIdBvnResult>(bvn, {
    firstname: profile.first_name,
    lastname: profile.last_name,
    dob: profile.date_of_birth || undefined,
    phone: profile.whatsapp_number,
    email: profile.email,
    gender: profile.gender || undefined,
  });
}

function normalizedKycResult(result: QoreIdBvnResult, match?: string | null) {
  return {
    provider_verification_id: result.id ? String(result.id) : null,
    status: "VERIFIED",
    name_match: match || null,
    verified_first_name: result.applicant?.firstname || result.bvn?.firstname || null,
    verified_last_name: result.applicant?.lastname || result.bvn?.lastname || null,
    verified_date_of_birth: result.bvn?.birthdate || null,
    verified_gender: result.bvn?.gender || null,
  };
}

function existingActiveAccountResult(
  sessionId: string,
  profile: CustomerBvnProfile,
) {
  return normalizedKycResult(
    {
      id: `existing-onecap-account-${sessionId}`,
      applicant: {
        firstname: profile.first_name,
        lastname: profile.last_name,
      },
      summary: {
        bvn_check: {
          status: "ACCOUNT_ALREADY_ACTIVE",
        },
      },
      status: {
        status: "verified",
        state: "verified",
      },
    },
    "ACCOUNT_ALREADY_ACTIVE",
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ session_id: string }> },
) {
  let context: BvnLogContext = {};
  try {
    const { bvn } = Input.parse(await request.json());
    const { session_id } = await params;
    context = { session_id };
    const { session, customer, supabase } = await requireKycSessionAccess(
      request,
      session_id,
    );
    context.customer_id = customer.id;

    if (session.status !== "CONSENTED") {
      return NextResponse.json(
        { error: "KYC session cannot accept BVN verification" },
        { status: 409 },
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("customers")
      .select("first_name,middle_name,last_name,email,date_of_birth,gender,whatsapp_number")
      .eq("id", customer.id)
      .single();
    if (profileError) {
      logBvnError("load_profile", profileError, context);
      throw profileError;
    }
    if (
      !profile.first_name ||
      !profile.middle_name ||
      !profile.last_name ||
      !profile.email
    ) {
      return NextResponse.json(
        { error: "Complete the customer's full name and email before KYC" },
        { status: 409 },
      );
    }
    const completeProfile: CustomerBvnProfile = {
      first_name: profile.first_name,
      last_name: profile.last_name,
      email: profile.email,
      date_of_birth: profile.date_of_birth,
      gender: profile.gender,
      whatsapp_number: profile.whatsapp_number,
    };

    const { data: existing, error: existingError } = await supabase
      .from("virtual_accounts")
      .select("id,account_number,account_name,bank_name,status")
      .eq("customer_id", customer.id)
      .eq("provider", "onecap_providus")
      .maybeSingle();
    if (existingError) {
      logBvnError("load_existing_virtual_account", existingError, context);
      throw existingError;
    }
    if (existing?.id) context.account_id = existing.id;
    if (existing?.status === "ACTIVE") {
      const existingAccountResult = existingActiveAccountResult(
        session_id,
        completeProfile,
      );
      const { error: kycError } = await supabase
        .from("kyc_sessions")
        .update({
          status: "VERIFIED",
          provider_reference: existingAccountResult.provider_verification_id,
          normalized_result: existingAccountResult,
        })
        .eq("id", session_id)
        .eq("customer_id", customer.id);
      if (kycError) {
        logBvnError("mark_existing_account_kyc_verified", kycError, context);
        throw kycError;
      }
      after(async () => {
        try {
          await sendKycSuccessNotifications(supabase, session_id, {
            id: customer.id,
            email: profile.email,
            whatsapp_number: completeProfile.whatsapp_number,
            first_name: profile.first_name,
            last_name: profile.last_name,
          });
        } catch (notificationError) {
          logBvnError("send_kyc_success_notifications", notificationError, context);
        }
      });
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
    if (reservationError) {
      logBvnError("reserve_virtual_account", reservationError, context);
      throw reservationError;
    }
    context.reservation_id = reservation.id;

    try {
      const result = await verifyBvn(bvn, session_id, completeProfile, context);

      console.info("[kyc.verify-bvn]", {
        stage: "qoreid_response",
        ...context,
        provider_verification_id: result.id ? String(result.id) : null,
        provider_status: result.status?.status || result.status?.state || null,
        name_match: result.summary?.bvn_check?.status || null,
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
        first_name: completeProfile.first_name,
        last_name: completeProfile.last_name,
        email: completeProfile.email,
        phone: completeProfile.whatsapp_number,
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
      if (saveError) {
        logBvnError("save_virtual_account", saveError, context);
        throw saveError;
      }

      const safeKycResult = normalizedKycResult(result, match);
      const { error: kycError } = await supabase
        .from("kyc_sessions")
        .update({
          status: "VERIFIED",
          provider_reference: safeKycResult.provider_verification_id,
          normalized_result: safeKycResult,
        })
        .eq("id", session_id)
        .eq("customer_id", customer.id);
      if (kycError) {
        logBvnError("mark_kyc_verified", kycError, context);
        throw kycError;
      }

      after(async () => {
        try {
          await sendKycSuccessNotifications(supabase, session_id, {
            id: customer.id,
            email: profile.email,
            whatsapp_number: completeProfile.whatsapp_number,
            first_name: profile.first_name,
            last_name: profile.last_name,
          });
        } catch (notificationError) {
          logBvnError("send_kyc_success_notifications", notificationError, context);
        }
      });

      return NextResponse.json(
        { status: "success", virtual_account: saved },
        { status: 201 },
      );
    } catch (error) {
      logBvnError("provider_or_provisioning", error, context);
      const { error: failedUpdateError } = await supabase
        .from("virtual_accounts")
        .update({ status: "FAILED" })
        .eq("id", reservation.id);
      if (failedUpdateError) {
        logBvnError("mark_virtual_account_failed", failedUpdateError, context);
      }
      throw error;
    }
  } catch (error) {
    if (!(error instanceof z.ZodError)) {
      logBvnError("request_failed", error, context);
    }
    return error instanceof z.ZodError ? bad(error) : failure(error);
  }
}
