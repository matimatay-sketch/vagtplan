import "server-only";
import { NextResponse, after } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import type { ApiScope } from "@/lib/domain/api";
import { hashApiKey } from "./crypto";
import { dispatchWebhooks } from "./webhooks";

export type ServiceClient = ReturnType<typeof createServiceClient>;

/**
 * The request's organization. The service client bypasses RLS, so every
 * query in a route MUST filter on `organizationId` (and does, through the
 * helpers below or explicitly).
 */
export type ApiContext = {
  organizationId: string;
  keyId: string;
  scopes: readonly string[];
  db: ServiceClient;
  url: URL;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const headers = { "cache-control": "no-store" };
export const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers });
export const problem = (status: number, code: string, message: string) =>
  json({ error: { code, message } }, status);

/** Database errors as API errors (no internal details). */
export function dbError(e: { code?: string; message?: string; hint?: string } | null): ApiError {
  switch (e?.code) {
    case "23505":
      return new ApiError(409, "conflict", "already exists");
    case "P0002":
      return new ApiError(404, "not_found", "not found");
    case "42501":
      return new ApiError(403, "forbidden", "not allowed");
    case "P0001":
      return new ApiError(409, e.hint ?? "conflict", e.hint ?? "conflict");
    case "23503":
    case "23514":
    case "22023":
    case "22P02":
    case "22007":
      return new ApiError(422, "invalid", e.message ?? "invalid");
    default:
      return new ApiError(500, "internal", "internal error");
  }
}

/** Reads and validates a JSON body. */
export async function readJson<T>(
  req: Request,
  parse: (
    v: unknown,
  ) =>
    | { success: true; data: T }
    | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } },
): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, "invalid_json", "the body must be JSON");
  }
  const r = parse(body);
  if (!r.success)
    throw new ApiError(
      422,
      "invalid",
      r.error.issues
        .map((i) => `${i.path.map(String).join(".") || "body"}: ${i.message}`)
        .join("; "),
    );
  return r.data;
}

/**
 * Wraps a route: authenticates the API key (Authorization: Bearer tk_…),
 * checks the scope, maps errors, and (for writes) sends webhooks afterwards.
 */
export function apiRoute<P = Record<string, never>>(
  scope: ApiScope,
  handler: (ctx: ApiContext, req: Request, params: P) => Promise<Response>,
  opts: { dispatch?: boolean } = {},
) {
  return async (req: Request, segment: { params: Promise<P> }): Promise<Response> => {
    const m = /^Bearer\s+(tk_[A-Za-z0-9_-]{20,100})$/.exec(req.headers.get("authorization") ?? "");
    if (!m) return problem(401, "unauthorized", "missing or malformed API key");
    const db = createServiceClient();
    const { data, error } = await db.rpc("api_key_lookup", { p_hash: hashApiKey(m[1]!) });
    const key = data?.[0];
    if (error || !key) return problem(401, "unauthorized", "unknown or revoked API key");
    if (!key.scopes.includes(scope))
      return problem(403, "insufficient_scope", `the key lacks the scope ${scope}`);
    try {
      const res = await handler(
        {
          organizationId: key.organization_id,
          keyId: key.key_id,
          scopes: key.scopes,
          db,
          url: new URL(req.url),
        },
        req,
        await segment.params,
      );
      if (opts.dispatch) after(() => dispatchWebhooks());
      return res;
    } catch (e) {
      if (e instanceof ApiError) return problem(e.status, e.code, e.message);
      console.error("API error", e);
      return problem(500, "internal", "internal error");
    }
  };
}
