import { NextResponse } from "next/server";
import { z } from "zod";
import { CustomerProfile, CustomerProfileUpdate } from "@/lib/api-contracts";
import { requireAgentCustomer } from "@/lib/auth/agent";
import { bad, failure } from "@/lib/api-utils";

export async function GET(request: Request) {
  try {
    const { customer } = await requireAgentCustomer(request);
    return NextResponse.json(CustomerProfile.parse(customer));
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const input = CustomerProfileUpdate.parse(await request.json());
    const { customer, supabase } = await requireAgentCustomer(request);
    const completesProfile = Boolean(
      (input.first_name ?? customer.first_name) &&
      (input.last_name ?? customer.last_name),
    );
    const { data, error } = await supabase
      .from("customers")
      .update({
        ...input,
        ...(completesProfile && !customer.profile_completed_at
          ? { profile_completed_at: new Date().toISOString() }
          : {}),
      })
      .eq("id", customer.id)
      .select("*")
      .single();
    if (error) throw error;
    return NextResponse.json(CustomerProfile.parse(data));
  } catch (error) {
    return error instanceof z.ZodError ? bad(error) : failure(error);
  }
}
