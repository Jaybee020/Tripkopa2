import { NextResponse } from "next/server";
import { z } from "zod";
export function failure(error: unknown) {
  const e = error as Record<string, unknown> & { status?: number; message?: string };
  const detailKeys = [
    "code",
    "route_category",
    "maximum_installments",
    "maximum_weeks",
    "maximum_percentage",
    "maximum_amount",
    "financing_cap",
    "total_amount",
    "required_amount",
    "scheduled_amount",
  ];
  const details = Object.fromEntries(
    detailKeys.filter((key) => e?.[key] !== undefined).map((key) => [key, e[key]]),
  );
  return NextResponse.json(
    { error: e?.message || "Internal Server Error", ...details },
    { status: e?.status || 500 },
  );
}
export function bad(error: z.ZodError) { return NextResponse.json({ error: error.issues[0]?.message || "Invalid request" }, { status: 400 }); }
export async function body<T>(request: Request, schema: z.ZodType<T>): Promise<T> { return schema.parse(await request.json()); }
export function row(data: unknown) { return NextResponse.json(data); }
export function idFrom(value: string) { return value; }
