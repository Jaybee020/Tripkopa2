import { createHash } from "node:crypto";
import { requireAgentCustomer } from "@/lib/auth/agent";
import { supabase as supabaseService } from "@/lib/services/supabase";

export const KYC_SESSION_COOKIE = "tripkopa_kyc_session";

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  for (const item of cookie.split(";")) {
    const [key, ...value] = item.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

export async function requireKycSessionAccess(
  request: Request,
  sessionId: string,
) {
  const supabase = supabaseService.admin;

  if (request.headers.has("x-api-key")) {
    const { customer } = await requireAgentCustomer(request);
    const { data, error } = await supabase
      .from("kyc_sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("customer_id", customer.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw Object.assign(new Error("KYC session not found"), { status: 404 });
    return { session: data, customer, supabase };
  }

  const token = cookieValue(request, KYC_SESSION_COOKIE);
  if (!token) throw Object.assign(new Error("KYC session authentication required"), { status: 401 });
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { data, error } = await supabase
    .from("kyc_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("browser_token_hash", tokenHash)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error("KYC session authentication failed"), { status: 401 });
  return { session: data, customer: { id: data.customer_id }, supabase };
}

