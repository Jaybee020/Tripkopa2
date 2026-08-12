import { NextResponse } from "next/server";
import { z } from "zod";
import { KycTokenExchangeInput } from "@/lib/api-contracts";
import { bad, failure } from "@/lib/api-utils";
import { supabase as supabaseService } from "@/lib/services/supabase";
import { KYC_SESSION_COOKIE } from "@/lib/auth/kyc";
import { createHash, randomBytes } from "node:crypto";
export async function POST(request: Request) {
  try {
    const input = KycTokenExchangeInput.parse(await request.json());
    const supabase = supabaseService.admin;
    const hash = createHash("sha256").update(input.token).digest("hex");
    const browserToken = randomBytes(32).toString("base64url");
    const browserTokenHash = createHash("sha256").update(browserToken).digest("hex");
    const { data, error } = await supabase
      .from("kyc_sessions")
      .select("*")
      .eq("token_hash", hash)
      .eq("status", "PENDING")
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "KYC link is invalid, expired, or already used" }, { status: 410 });
    const { data: exchanged, error: used } = await supabase
      .from("kyc_sessions")
      .update({ used_at: new Date().toISOString(), browser_token_hash: browserTokenHash })
      .eq("id", data.id)
      .is("used_at", null)
      .select("id,status,expires_at")
      .maybeSingle();
    if (used) throw used;
    if (!exchanged) return NextResponse.json({ error: "KYC link was already used" }, { status: 409 });
    const response = NextResponse.json({ session_id: exchanged.id, status: exchanged.status, expires_at: exchanged.expires_at });
    response.cookies.set(KYC_SESSION_COOKIE, browserToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      expires: new Date(exchanged.expires_at),
    });
    return response;
  } catch (e) {
    return e instanceof z.ZodError ? bad(e) : failure(e);
  }
}
