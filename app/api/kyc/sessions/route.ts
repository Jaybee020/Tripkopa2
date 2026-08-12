import { NextResponse } from "next/server";
import { z } from "zod";
import { KycSessionCreateInput } from "@/lib/api-contracts";
import { requireAgentCustomer } from "@/lib/auth/agent";
import { bad, failure } from "@/lib/api-utils";
import { randomBytes, createHash } from "node:crypto";
export async function POST(request: Request) {
  try {
    const input = KycSessionCreateInput.parse(await request.json());
    const { customer, supabase } = await requireAgentCustomer(request);
    const token = randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("kyc_sessions")
      .insert({
        customer_id: customer.id,
        provider: input.provider,
        status: "PENDING",
        token_hash: createHash("sha256").update(token).digest("hex"),
        expires_at: expires,
      })
      .select("*")
      .single();
    if (error) throw error;
    return NextResponse.json(
      {
        ...data,
        url: `${process.env.NEXT_PUBLIC_APP_URL || ""}/verify/s/${token}`,
      },
      { status: 201 },
    );
  } catch (e) {
    return e instanceof z.ZodError ? bad(e) : failure(e);
  }
}
