export type TicketType = "refundable" | "nonrefundable" | "unconfirmed";

export type NormalizedFareRules = {
  ticket_type: TicketType;
  confirmed: boolean;
  summary: string;
  provider_conditions: Record<string, unknown>;
};

function findRuleValue(value: unknown, depth = 0): unknown {
  if (!value || typeof value !== "object" || depth > 5) return undefined;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.replace(/[_\s-]/g, "").toLowerCase();
    if (["refundable", "isrefundable", "refundallowed", "tickettype", "faretype"].includes(normalized)) {
      return child;
    }
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    const found = findRuleValue(child, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

function providerConditions(offer: unknown) {
  if (!offer || typeof offer !== "object") return {};
  const record = offer as Record<string, unknown>;
  return Object.fromEntries(
    ["fareRules", "fare_rules", "penalties", "conditions", "ticketType", "refundable"]
      .filter((key) => record[key] !== undefined)
      .map((key) => [key, record[key]]),
  );
}

export function normalizeFareRules(offer: unknown): NormalizedFareRules {
  const value = findRuleValue(offer);
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  const refundable = value === true || ["refundable", "flexible", "yes", "true"].includes(text);
  const nonrefundable = value === false || ["nonrefundable", "non-refundable", "no", "false"].includes(text);
  if (refundable) {
    return {
      ticket_type: "refundable",
      confirmed: true,
      summary: "Refund eligibility depends on airline rules, timing, penalties, and provider conditions.",
      provider_conditions: providerConditions(offer),
    };
  }
  if (nonrefundable) {
    return {
      ticket_type: "nonrefundable",
      confirmed: true,
      summary: "Refunds are typically unavailable; airline changes or travel credits may still apply.",
      provider_conditions: providerConditions(offer),
    };
  }
  return {
    ticket_type: "unconfirmed",
    confirmed: false,
    summary: "Fare conditions must be confirmed with the provider before cancellation or refund guidance.",
    provider_conditions: providerConditions(offer),
  };
}

export function filterSearchResultsByTicketType(
  result: Record<string, unknown>,
  preference: "refundable" | "nonrefundable" | "any",
) {
  if (preference === "any") return result;
  const details = result.details;
  if (!Array.isArray(details)) return result;
  return {
    ...result,
    details: details.filter((offer) => normalizeFareRules(offer).ticket_type === preference),
    ticket_type_filter: preference,
  };
}
