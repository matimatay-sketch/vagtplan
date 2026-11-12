import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAppContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Opret virksomhed" };

export default async function SignupPage() {
  if (await getAppContext()) redirect("/oversigt");
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return <SignupForm signedIn={Boolean(data?.claims)} />;
}
