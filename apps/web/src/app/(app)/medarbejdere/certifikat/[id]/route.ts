import { NextResponse } from "next/server";
import { z } from "zod";
import { getAppContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** Opens a certificate through a short-lived signed URL. RLS decides who may read it. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAppContext();
  if (!ctx) return new NextResponse(null, { status: 401 });
  const id = z.guid().safeParse((await params).id);
  if (!id.success) return new NextResponse(null, { status: 404 });
  const supabase = await createClient();
  const { data } = await supabase
    .from("employee_competence")
    .select("document_path")
    .eq("id", id.data)
    .maybeSingle();
  if (!data?.document_path) return new NextResponse(null, { status: 404 });
  const { data: signed } = await supabase.storage
    .from("certificates")
    .createSignedUrl(data.document_path, 60);
  if (!signed?.signedUrl) return new NextResponse(null, { status: 404 });
  return NextResponse.redirect(signed.signedUrl);
}
