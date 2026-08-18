import { NextResponse } from "next/server";
import { z } from "zod";
import { requireKycSessionAccess } from "@/lib/auth/kyc";
import { bad, failure } from "@/lib/api-utils";

const Input = z
  .object({
    first_name: z.string().trim().min(1).max(100),
    middle_name: z.string().trim().min(1).max(100),
    last_name: z.string().trim().min(1).max(100),
    email: z.string().trim().email(),
  })
  .strict();

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ session_id: string }> },
) {
  try {
    const input = Input.parse(await request.json());
    const { session_id } = await params;
    const { customer, supabase } = await requireKycSessionAccess(
      request,
      session_id,
    );

    const { data, error } = await supabase
      .from("customers")
      .update({
        ...input,
        profile_completed_at: new Date().toISOString(),
      })
      .eq("id", customer.id)
      .select("id,first_name,middle_name,last_name,email,profile_completed_at")
      .single();
    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    return error instanceof z.ZodError ? bad(error) : failure(error);
  }
}
