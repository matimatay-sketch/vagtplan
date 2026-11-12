import { parseIsoDate, type IsoDate } from "./civil-date";

/**
 * Completed years on a given date. A 29 February birthday is reached on
 * 1 March in non-leap years.
 */
export function ageOn(birthDate: IsoDate, on: IsoDate): number {
  const b = parseIsoDate(birthDate);
  const o = parseIsoDate(on);
  let age = o.y - b.y;
  if (o.m < b.m || (o.m === b.m && o.d < b.d)) age -= 1;
  return age;
}

export function isYoungWorker(birthDate: IsoDate, on: IsoDate): boolean {
  return ageOn(birthDate, on) < 18;
}
