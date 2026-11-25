import { z } from "zod";
import { da } from "@/lib/i18n/da";

/**
 * A position as "latitude, longitude", as copied from a map (Google Maps,
 * Apple Maps) or with Danish decimal commas ("55,6761 12,5683").
 */
export function parseCoordinates(text: string): { latitude: number; longitude: number } | null {
  const s = text.trim();
  const parts = /^-?\d+([.,]\d+)?\s*[,;\s]\s*-?\d+([.,]\d+)?$/.test(s)
    ? s.includes(".")
      ? s.split(/\s*[,;\s]\s*/)
      : s.split(/\s*[;\s]\s*/)
    : [];
  if (parts.length !== 2) return null;
  const [latitude, longitude] = parts.map((p) => Number(p.replace(",", "."))) as [number, number];
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

const t = da.workplaces;

export const workplaceSchema = z
  .object({
    name: z.string().trim().min(1, da.validation.required).max(100, da.validation.tooLong),
    address: z
      .string()
      .trim()
      .max(200, da.validation.tooLong)
      .nullish()
      .transform((s) => s || null),
    coordinates: z.string().refine((c) => parseCoordinates(c) !== null, t.invalidPosition),
    radius_m: z.coerce.number().int(t.radiusRange).min(25, t.radiusRange).max(5000, t.radiusRange),
    department_ids: z.array(z.guid()).max(200).default([]),
  })
  .transform((v) => {
    const position = parseCoordinates(v.coordinates)!;
    return {
      name: v.name,
      address: v.address,
      ...position,
      radius_m: v.radius_m,
      department_ids: v.department_ids,
    };
  });
