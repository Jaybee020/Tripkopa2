export type RouteCategory = "domestic" | "regional" | "international";

type AirportRegion = { country: string; continent: "AF" | "OTHER" };

// Checked-in reference for Tripkopa's supported corridors. Unknown IATA codes
// are deliberately not guessed and therefore cannot receive flexible pricing.
const AFRICAN_AIRPORTS: Record<string, string> = {
  ABV: "NG", LOS: "NG", PHC: "NG", KAN: "NG", ENU: "NG", QOW: "NG",
  CBQ: "NG", BNI: "NG", ABB: "NG", MIU: "NG", YOL: "NG", SKO: "NG",
  ILR: "NG", IBA: "NG", AKR: "NG", QRW: "NG", JOS: "NG", KAD: "NG",
  ACC: "GH", KMS: "GH", ABJ: "CI", DKR: "SN", DSS: "SN", COO: "BJ",
  LFW: "TG", ROB: "LR", FNA: "SL", BJL: "GM", CKY: "GN", BKO: "ML",
  OUA: "BF", NIM: "NE", NDJ: "TD", DLA: "CM", NSI: "CM", LBV: "GA",
  SSG: "GQ", BZV: "CG", FIH: "CD", JNB: "ZA", CPT: "ZA", DUR: "ZA",
  NBO: "KE", MBA: "KE", ADD: "ET", KGL: "RW", EBB: "UG", DAR: "TZ",
  ZNZ: "TZ", CAI: "EG", HRG: "EG", CMN: "MA", RAK: "MA", ALG: "DZ",
  TUN: "TN", TIP: "LY", LAD: "AO", LUN: "ZM", HRE: "ZW", GBE: "BW",
  WDH: "NA", MPM: "MZ", MRU: "MU", SEZ: "SC", TNR: "MG", JIB: "DJ",
  KRT: "SD", JUB: "SS", ASM: "ER", MGQ: "SO",
};

const OTHER_AIRPORTS: Record<string, string> = {
  LON: "GB", LHR: "GB", LGW: "GB", MAN: "GB", PAR: "FR", CDG: "FR", ORY: "FR", AMS: "NL",
  FRA: "DE", MUC: "DE", MAD: "ES", BCN: "ES", FCO: "IT", MXP: "IT",
  LIS: "PT", BRU: "BE", ZRH: "CH", VIE: "AT", IST: "TR", DXB: "AE",
  AUH: "AE", DOH: "QA", JED: "SA", RUH: "SA", TLV: "IL", BOM: "IN",
  DEL: "IN", SIN: "SG", KUL: "MY", BKK: "TH", HKG: "HK", PEK: "CN",
  PVG: "CN", NRT: "JP", ICN: "KR", MLE: "MV", SYD: "AU", MEL: "AU", JFK: "US",
  NYC: "US", WAS: "US", EWR: "US", IAD: "US", ATL: "US", ORD: "US", LAX: "US", YYZ: "CA",
  YUL: "CA", GRU: "BR", GIG: "BR",
};

export function airportRegion(iata: string): AirportRegion | null {
  const code = iata.trim().toUpperCase();
  if (AFRICAN_AIRPORTS[code]) {
    return { country: AFRICAN_AIRPORTS[code], continent: "AF" };
  }
  if (OTHER_AIRPORTS[code]) {
    return { country: OTHER_AIRPORTS[code], continent: "OTHER" };
  }
  return null;
}

export const LOCAL_ROUTE_UNAVAILABLE_MESSAGE =
  "Local routes aren't available at the moment. Regional flights within Africa and international flights are the available options.";

/**
 * Enforce inventory availability before a provider search is attempted.
 *
 * Unknown codes are left to normal provider validation. A route is rejected
 * only when both endpoints are known Nigerian airports, so this guard cannot
 * accidentally classify an unfamiliar international code as local.
 */
export function assertFlightRouteAvailable(origin: string, destination: string) {
  const from = airportRegion(origin);
  const to = airportRegion(destination);
  if (from?.country === "NG" && to?.country === "NG") {
    throw Object.assign(
      new Error("Local flight routes are temporarily unavailable"),
      {
        status: 422,
        code: "LOCAL_ROUTES_UNAVAILABLE",
        route_category: "domestic",
      },
    );
  }
}

export function classifyRoute(origin: string, destination: string): RouteCategory {
  const from = airportRegion(origin);
  const to = airportRegion(destination);
  if (!from || !to) {
    throw Object.assign(
      new Error("Flexible payment is not available until this route is classified"),
      { status: 422, code: "ROUTE_UNMAPPED", origin, destination },
    );
  }
  if (from.country === "NG" && to.country === "NG") return "domestic";
  if (from.continent === "AF" && to.continent === "AF") return "regional";
  return "international";
}
