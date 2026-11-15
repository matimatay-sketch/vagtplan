import type { IsoDate } from "./civil-date";

export type DatedRange = { valid_from: IsoDate; valid_to: IsoDate | null };
export type ContractStatus = "active" | "ended" | "future";

/** Validity is inclusive on both ends. ISO dates compare lexicographically. */
export function contractStatus(contract: DatedRange, on: IsoDate): ContractStatus {
  if (on < contract.valid_from) return "future";
  if (contract.valid_to !== null && on > contract.valid_to) return "ended";
  return "active";
}

export function findActiveContract<T extends DatedRange>(
  contracts: readonly T[],
  on: IsoDate,
): T | undefined {
  return contracts.find((c) => contractStatus(c, on) === "active");
}
