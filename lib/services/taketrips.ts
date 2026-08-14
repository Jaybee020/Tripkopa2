import { ServiceAuthError, ServiceError } from "./errors";
import { supabase } from "./supabase";

const PROVIDER = "taketrips";
const DEFAULT_BASE_URL = "https://appsconnect.taketrips.co";

type LogInput = {
  operation: string;
  method: string;
  path: string;
  request_payload?: unknown;
  response_status?: number;
  response_payload?: unknown;
  error_message?: string;
  error_payload?: unknown;
  duration_ms: number;
  success: boolean;
};

const SENSITIVE_KEYS = new Set([
  "authorization",
  "apikey",
  "api_key",
  "password",
  "secret",
  "token",
  "accesstoken",
  "bvn",
  "nin",
  "passport_number",
  "passportnumber",
  "date_of_birth",
  "dateofbirth",
  "dob",
  "first_name",
  "firstname",
  "last_name",
  "lastname",
  "middle_name",
  "middlename",
  "email",
  "phone",
]);

function base() {
  return (process.env.TAKETRIPS_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
}

function key() {
  const value = process.env.TAKETRIPS_API_KEY;
  if (!value) {
    throw new ServiceAuthError(
      PROVIDER,
      new Error("missing TAKETRIPS_API_KEY"),
    );
  }
  return value;
}

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[truncated]";
  if (Array.isArray(value)) return value.map((item) => sanitize(item, depth + 1));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([keyName, child]) => {
      const normalized = keyName.replace(/[_\-\s]/g, "").toLowerCase();
      return [
        keyName,
        SENSITIVE_KEYS.has(normalized)
          ? "[redacted]"
          : sanitize(child, depth + 1),
      ];
    }),
  );
}

function providerMessage(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Record<string, unknown>;
  const message = payload.message ?? payload.error;
  return typeof message === "string" && message.trim() ? message : null;
}

async function writeLog(input: LogInput) {
  try {
    const { error } = await supabase.admin.from("take_trip_logs").insert({
      operation: input.operation,
      method: input.method,
      path: input.path,
      request_payload: sanitize(input.request_payload ?? null),
      response_status: input.response_status ?? null,
      response_payload: sanitize(input.response_payload ?? null),
      error_message: input.error_message ?? null,
      error_payload: sanitize(input.error_payload ?? null),
      duration_ms: input.duration_ms,
      success: input.success,
    });
    if (error) {
      console.warn("[taketrips.log] insert failed", {
        message: error.message,
        code: error.code,
      });
    }
  } catch (error) {
    console.warn("[taketrips.log] insert failed", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function call<T>(
  operation: string,
  path: string,
  init: RequestInit,
  requestPayload?: unknown,
): Promise<T> {
  const startedAt = Date.now();
  const method = init.method || "GET";
  let response: Response | null = null;
  let body: unknown = {};

  try {
    response = await fetch(`${base()}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${key()}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
    body = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = providerMessage(body);
      const errorMessage = message
        ? `TakeTrips request failed: ${message}`
        : "TakeTrips request failed";
      await writeLog({
        operation,
        method,
        path,
        request_payload: requestPayload,
        response_status: response.status,
        response_payload: body,
        error_message: errorMessage,
        error_payload: body,
        duration_ms: Date.now() - startedAt,
        success: false,
      });
      const error = new ServiceError(errorMessage, PROVIDER, body);
      error.status = response.status >= 500 ? 502 : response.status;
      throw error;
    }

    await writeLog({
      operation,
      method,
      path,
      request_payload: requestPayload,
      response_status: response.status,
      response_payload: body,
      duration_ms: Date.now() - startedAt,
      success: true,
    });
    return body as T;
  } catch (error) {
    if (!response) {
      await writeLog({
        operation,
        method,
        path,
        request_payload: requestPayload,
        error_message: error instanceof Error ? error.message : String(error),
        error_payload:
          error instanceof Error && "originalError" in error
            ? (error as { originalError?: unknown }).originalError
            : undefined,
        duration_ms: Date.now() - startedAt,
        success: false,
      });
    }
    throw error;
  }
}

export class TakeTripsService {
  search(input: Record<string, unknown>) {
    const queryEntries = Object.entries(input).filter(
      ([, value]) => value !== undefined && value !== null,
    );
    const query = new URLSearchParams(
      queryEntries.map(([name, value]) => [name, String(value)]),
    );
    const path = `/resellers/flights/search?${query}`;
    return call<Record<string, unknown>>(
      "search",
      path,
      { method: "GET" },
      Object.fromEntries(queryEntries),
    );
  }

  validate(offer: unknown) {
    return call<Record<string, unknown>>(
      "validate",
      "/resellers/flights/validate",
      { method: "POST", body: JSON.stringify(offer) },
      offer,
    );
  }

  order(offer: unknown, passengers: unknown[], paymentRef?: string) {
    const payload = { flightOffer: offer, passengers, paymentRef };
    return call<Record<string, unknown>>(
      "order",
      "/resellers/flights/order",
      { method: "POST", body: JSON.stringify(payload) },
      payload,
    );
  }
}

export const taketrips = new TakeTripsService();
