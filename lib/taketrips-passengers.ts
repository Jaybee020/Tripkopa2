type Passenger = Record<string, unknown>;

const ALIASES = new Set([
  "first_name",
  "middle_name",
  "last_name",
  "date_of_birth",
  "dateOfBirth",
  "passport_number",
  "passport_expiry",
  "passport_expiry_date",
  "issuance_date",
  "passport_issuance_date",
  "passport_issuing_authority",
  "email_address",
  "phone_number",
  "whatsapp_number",
  "passenger_type",
  "save_details",
]);

function firstString(passenger: Passenger, keys: string[]) {
  for (const key of keys) {
    const value = passenger[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function passengerError(index: number, message: string) {
  return Object.assign(new Error(`Passenger ${index + 1}: ${message}`), {
    status: 400,
  });
}

function requiredString(passenger: Passenger, keys: string[], name: string, index: number) {
  const value = firstString(passenger, keys);
  if (!value) throw passengerError(index, `${name} is required`);
  return value;
}

function isoDate(value: string, name: string, index: number) {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw passengerError(index, `${name} must use YYYY-MM-DD format`);
  }
  return value;
}

/** Convert Tripkopa passenger fields into the exact casing TakeTrips expects. */
export function normalizeTakeTripsPassengers(passengers: unknown[]): Passenger[] {
  return passengers.map((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw passengerError(index, "must be an object");
    }

    const passenger = value as Passenger;
    const firstName = requiredString(passenger, ["firstName", "first_name"], "firstName", index);
    const lastName = requiredString(passenger, ["lastName", "last_name"], "lastName", index);
    const dob = isoDate(
      requiredString(passenger, ["dob", "dateOfBirth", "date_of_birth"], "dob", index),
      "dob",
      index,
    );
    const gender = requiredString(passenger, ["gender"], "gender", index).toUpperCase();
    if (!['MALE', 'FEMALE'].includes(gender)) {
      throw passengerError(index, "gender must be MALE or FEMALE");
    }
    const passportNumber = requiredString(
      passenger,
      ["passportNumber", "passport_number"],
      "passportNumber",
      index,
    );
    const passportExpiry = isoDate(
      requiredString(
        passenger,
        ["passportExpiry", "passport_expiry", "passport_expiry_date"],
        "passportExpiry",
        index,
      ),
      "passportExpiry",
      index,
    );
    const email = requiredString(passenger, ["email", "email_address"], "email", index);
    const phone = requiredString(
      passenger,
      ["phone", "phone_number", "whatsapp_number"],
      "phone",
      index,
    );

    const normalized: Passenger = Object.fromEntries(
      Object.entries(passenger).filter(([key]) => !ALIASES.has(key)),
    );
    Object.assign(normalized, {
      firstName,
      lastName,
      dob,
      gender,
      passportNumber,
      passportExpiry,
      email,
      phone,
    });

    const optionalStrings: Array<[string, string[]]> = [
      ["title", ["title"]],
      ["middleName", ["middleName", "middle_name"]],
      ["issuanceDate", ["issuanceDate", "issuance_date", "passport_issuance_date"]],
      ["passportIssuingAuthority", ["passportIssuingAuthority", "passport_issuing_authority"]],
      ["label", ["label", "passenger_type"]],
    ];
    for (const [target, keys] of optionalStrings) {
      const optional = firstString(passenger, keys);
      if (optional) normalized[target] = target === "label" ? optional.toUpperCase() : optional;
      else delete normalized[target];
    }

    delete normalized.saveDetails;
    const saveDetails = passenger.saveDetails ?? passenger.save_details;
    if (typeof saveDetails === "boolean") normalized.saveDetails = saveDetails;

    return normalized;
  });
}
