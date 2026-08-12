import { NextResponse } from "next/server"; import { createServerSupabase } from "@/lib/auth/server"; import { failure } from "@/lib/api-utils";
export async function POST() { try { const supabase=createServerSupabase(); const {error}=await supabase.auth.signOut(); if(error) throw error; return new NextResponse(null,{status:204}); } catch(error) { return failure(error); } }
