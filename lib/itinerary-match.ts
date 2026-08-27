type Segment = {
  carrier: string;
  number: string;
  from: string;
  to: string;
  departure: string;
  arrival: string;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizedText(value: unknown) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function normalizedTimestamp(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return "";
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? value.trim() : new Date(timestamp).toISOString();
}

function findRouteContainer(value: unknown, depth = 0): Record<string, unknown> | null {
  const object = record(value);
  if (!object || depth > 7) return null;
  if (Array.isArray(object.outgoingRoutes) || Array.isArray(object.returnRoutes)) return object;
  for (const [key, child] of Object.entries(object)) {
    if (["price", "pricing", "rules", "fareRules", "fare_rules"].includes(key)) continue;
    const found = findRouteContainer(child, depth + 1);
    if (found) return found;
  }
  return null;
}

function normalizeSegment(value: unknown): Segment | null {
  const item = record(value);
  if (!item) return null;
  const departure = record(item.departure);
  const arrival = record(item.arrival);
  const result = {
    carrier: normalizedText(item.carrierCode ?? item.operatingCarrierCode ?? item.carrier),
    number: normalizedText(item.carrierNumber ?? item.flightNumber ?? item.flight_number),
    from: normalizedText(departure?.iataCode ?? departure?.airport ?? item.origin),
    to: normalizedText(arrival?.iataCode ?? arrival?.airport ?? item.destination),
    departure: normalizedTimestamp(departure?.timestamp ?? departure?.dateTime ?? item.departureTime),
    arrival: normalizedTimestamp(arrival?.timestamp ?? arrival?.dateTime ?? item.arrivalTime),
  };
  return result.from && result.to && result.departure ? result : null;
}

export function itineraryFingerprint(offer: unknown) {
  const routes = findRouteContainer(offer);
  if (!routes) return null;
  const outgoing = Array.isArray(routes.outgoingRoutes) ? routes.outgoingRoutes : [];
  const returning = Array.isArray(routes.returnRoutes) ? routes.returnRoutes : [];
  const segments = [...outgoing, ...returning]
    .map(normalizeSegment)
    .filter((item): item is Segment => Boolean(item));
  if (!segments.length) return null;
  return JSON.stringify(segments);
}

export function itineraryEndpoints(offer: unknown) {
  const routes = findRouteContainer(offer);
  if (!routes) return null;
  const outgoing = Array.isArray(routes.outgoingRoutes)
    ? routes.outgoingRoutes.map(normalizeSegment).filter((item): item is Segment => Boolean(item))
    : [];
  const returning = Array.isArray(routes.returnRoutes)
    ? routes.returnRoutes.map(normalizeSegment).filter((item): item is Segment => Boolean(item))
    : [];
  if (!outgoing.length) return null;
  return {
    origin: outgoing[0].from,
    destination: outgoing.at(-1)!.to,
    departure_date: outgoing[0].departure.slice(0, 10),
    return_date: returning[0]?.departure.slice(0, 10) ?? null,
  };
}

export function itineraryIsDirect(offer: unknown) {
  const routes = findRouteContainer(offer);
  if (!routes) return null;
  const outgoing = Array.isArray(routes.outgoingRoutes) ? routes.outgoingRoutes : [];
  const returning = Array.isArray(routes.returnRoutes) ? routes.returnRoutes : [];
  if (!outgoing.length) return null;
  const legs = returning.length ? [outgoing, returning] : [outgoing];
  return legs.every((segments) => (
    segments.length === 1
    && Number(record(segments[0])?.numberOfStops ?? 0) === 0
  ));
}

export function findEquivalentOffer(original: unknown, offers: unknown[]) {
  const originalFingerprint = itineraryFingerprint(original);
  if (!originalFingerprint) return null;
  for (let index = 0; index < offers.length; index += 1) {
    if (itineraryFingerprint(offers[index]) === originalFingerprint) {
      return { offer: offers[index], offer_index: index };
    }
  }
  return null;
}
