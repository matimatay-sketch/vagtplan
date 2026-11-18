import { NextResponse } from "next/server";
import { openApiDocument } from "@/lib/api/openapi";
import { env } from "@/lib/env";

export function GET() {
  return NextResponse.json(openApiDocument(env.siteUrl));
}
