import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/auth/server";
import { bad, failure } from "@/lib/api-utils";
import { supabase as serviceSupabase } from "@/lib/services/supabase";

const LoginInput = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(500),
}).strict();

function sameSecret(left: string, right: string) {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

async function findAuthUser(email: string) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await serviceSupabase.admin.auth.admin.listUsers({
      page,
      perPage: 100,
    });
    if (error) throw error;
    const match = data.users.find((user) => user.email?.toLowerCase() === email);
    if (match) return match;
    if (data.users.length < 100) return null;
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const input = LoginInput.parse(await request.json());
    const configuredEmail = (
      process.env.TRIPKOPA_ADMIN_EMAIL || process.env.ADMIN_EMAIL || ""
    ).trim().toLowerCase();
    const configuredPassword =
      process.env.TRIPKOPA_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || "";

    if (!configuredEmail || !configuredPassword) {
      throw Object.assign(
        new Error("Admin sign-in is not configured."),
        { status: 503 },
      );
    }

    const submittedEmail = input.email.toLowerCase();
    if (
      !sameSecret(submittedEmail, configuredEmail) ||
      !sameSecret(input.password, configuredPassword)
    ) {
      throw Object.assign(new Error("Invalid admin credentials."), { status: 401 });
    }

    let adminUser = await findAuthUser(configuredEmail);
    if (adminUser) {
      const { data, error } = await serviceSupabase.admin.auth.admin.updateUserById(
        adminUser.id,
        {
          password: configuredPassword,
          email_confirm: true,
          user_metadata: {
            ...adminUser.user_metadata,
            tripkopa_operations_role: "admin",
          },
        },
      );
      if (error) throw error;
      adminUser = data.user;
    } else {
      const { data, error } = await serviceSupabase.admin.auth.admin.createUser({
        email: configuredEmail,
        password: configuredPassword,
        email_confirm: true,
        user_metadata: { tripkopa_operations_role: "admin" },
      });
      if (error) throw error;
      adminUser = data.user;
    }

    const { data: staff, error: staffError } = await serviceSupabase.admin
      .from("staff_profiles")
      .select("id")
      .eq("user_id", adminUser.id)
      .maybeSingle();
    if (staffError) throw staffError;
    const staffWrite = staff
      ? serviceSupabase.admin
          .from("staff_profiles")
          .update({ role: "admin" })
          .eq("id", staff.id)
      : serviceSupabase.admin
          .from("staff_profiles")
          .insert({ user_id: adminUser.id, role: "admin" });
    const { error: staffWriteError } = await staffWrite;
    if (staffWriteError) throw staffWriteError;

    const browserSession = createServerSupabase();
    const { data: session, error: signInError } = await browserSession.auth.signInWithPassword({
      email: configuredEmail,
      password: configuredPassword,
    });
    if (signInError) throw signInError;

    return NextResponse.json({
      user: { id: session.user.id, email: session.user.email },
      role: "admin",
    });
  } catch (error) {
    return error instanceof z.ZodError ? bad(error) : failure(error);
  }
}
