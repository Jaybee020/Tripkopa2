type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function string(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function segmentSummary(value: unknown) {
  const segment = record(value);
  const departure = record(segment.departure);
  const arrival = record(segment.arrival);
  const carrierCode = string(segment.carrierCode) || string(segment.carrier);
  const carrierNumber = string(segment.carrierNumber);
  return {
    departure_airport: string(departure.iataCode),
    departure_terminal: string(departure.terminal),
    departure_at: string(departure.timestamp),
    arrival_airport: string(arrival.iataCode),
    arrival_terminal: string(arrival.terminal),
    arrival_at: string(arrival.timestamp),
    carrier: string(segment.carrier),
    carrier_code: carrierCode,
    flight_number:
      carrierCode && carrierNumber
        ? `${carrierCode}${carrierNumber}`
        : carrierNumber,
    aircraft_code: string(segment.aircraftCode),
    duration: string(segment.routeDuration),
    stops:
      typeof segment.numberOfStops === "number"
        ? segment.numberOfStops
        : null,
  };
}

export function summarizeFlight(flightDetails: unknown) {
  const root = record(flightDetails);
  const details = Object.keys(record(root.details)).length
    ? record(root.details)
    : root;
  const itineraries = record(details.itenaries || details.itineraries);
  const routes = record(itineraries.routes);
  const outgoing = list(routes.outgoingRoutes).map(segmentSummary);
  const returning = list(routes.returnRoutes).map(segmentSummary);
  const allSegments = [...outgoing, ...returning];
  const first = outgoing[0] || allSegments[0];
  const lastOutbound = outgoing.at(-1) || allSegments.at(-1);
  const cityRoutes = record(record(routes.cityRoutes).single);

  return {
    origin: first?.departure_airport || string(cityRoutes.from),
    destination: lastOutbound?.arrival_airport || string(cityRoutes.to),
    departure_at: first?.departure_at || string(cityRoutes.departureDate),
    arrival_at: lastOutbound?.arrival_at,
    return_at: returning[0]?.departure_at || string(cityRoutes.returnDate),
    carrier: first?.carrier,
    carrier_code: first?.carrier_code,
    flight_number: first?.flight_number,
    cabin_class: string(details.cabinClass),
    trip_type: details.oneWay === false ? "Return" : "One way",
    total_duration:
      typeof itineraries.totalTripduration === "number"
        ? itineraries.totalTripduration
        : string(itineraries.totalTripduration),
    segment_count: allSegments.length,
    stops: first?.stops ?? null,
    segments: allSegments,
  };
}
