import { createHash, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as supabaseService } from "@/lib/services/supabase";

const API_KEY_HEADER = "x-api-key";
const WHATSAPP_HEADER = "x-whatsapp-number";

type Customer = Record<string, unknown> & {
  id: string;
  whatsapp_number: string;
  status: string;
};

class AgentRequestError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "AgentRequestError";
  }
}

function equalSecret(provided: string, expected: string) {
  const providedHash = createHash("sha256").update(provided).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(providedHash, expectedHash);
}

/** Normalize a provider-supplied international number to E.164. */
export function normalizeWhatsAppNumber(value: string) {
  const cleaned = value.trim().replace(/^whatsapp:/i, "");
  const digits = cleaned.replace(/\D/g, "");
  if (!/^\d{8,15}$/.test(digits) || digits.startsWith("0")) {
    throw new AgentRequestError(
      "X-WhatsApp-Number must be an international number in E.164 format",
      400,
    );
  }
  return `+${digits}`;
}

/**
 * Authenticate SupaOS and resolve the asserted WhatsApp identity.
 * First contact atomically creates an ACTIVE customer.
 */
export async function requireAgentCustomer(request: Request): Promise<{
  customer: Customer;
  supabase: SupabaseClient;
}> {
  const expectedKey = process.env.WHATSAPP_AGENT_API_SECRET;
  if (!expectedKey) {
    throw new AgentRequestError("Agent authentication is not configured", 500);
  }

  const providedKey = request.headers.get(API_KEY_HEADER) ?? "";
  if (!providedKey || !equalSecret(providedKey, expectedKey)) {
    throw new AgentRequestError("Invalid API key", 401);
  }

  const assertedNumber = request.headers.get(WHATSAPP_HEADER);
  if (!assertedNumber) {
    throw new AgentRequestError("X-WhatsApp-Number header is required", 400);
  }
  const whatsappNumber = normalizeWhatsAppNumber(assertedNumber);
  const supabase = supabaseService.admin;

  const { data: existing, error: lookupError } = await supabase
    .from("customers")
    .select("*")
    .eq("whatsapp_number", whatsappNumber)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) {
    if (["SUSPENDED", "CLOSED"].includes(existing.status)) {
      throw new AgentRequestError("Customer account is not active", 403);
    }
    await ensureWallet(supabase, existing as Customer);
    return { customer: existing as Customer, supabase };
  }

  // The unique WhatsApp constraint makes concurrent first-contact requests safe.
  const { data: created, error: createError } = await supabase
    .from("customers")
    .upsert(
      { whatsapp_number: whatsappNumber, status: "ACTIVE" },
      { onConflict: "whatsapp_number", ignoreDuplicates: false },
    )
    .select("*")
    .single();
  if (createError) throw createError;
  await ensureWallet(supabase, created as Customer);
  return { customer: created as Customer, supabase };
}

async function ensureWallet(supabase: SupabaseClient, customer: Customer) {
  const currency =
    typeof customer.preferred_currency === "string"
      ? customer.preferred_currency
      : "NGN";
  const { error } = await supabase.from("wallets").upsert(
    { customer_id: customer.id, currency, balance: 0 },
    { onConflict: "customer_id", ignoreDuplicates: true },
  );
  if (error) throw error;
}
