export type SupplementAmount = { amountType: "per_hour" | "fixed" | "percent"; amount: number };

/** "25,00 kr./t", "100,00 kr./vagt", "12,5 %". Shared by server and client components. */
export function formatSupplementAmount(s: SupplementAmount): string {
  const kr = (ore: number) =>
    (ore / 100).toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (s.amountType === "per_hour") return `${kr(s.amount)} kr./t`;
  if (s.amountType === "fixed") return `${kr(s.amount)} kr./vagt`;
  return `${(s.amount / 100).toLocaleString("da-DK")} %`;
}
