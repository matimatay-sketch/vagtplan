import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAppContext } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log ind" };

export default async function LoginPage() {
  if (await getAppContext()) redirect("/oversigt");
  return <LoginForm />;
}
