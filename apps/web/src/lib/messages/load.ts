import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { SwapView } from "@/components/messages/swap-card";
import type { CancellationView } from "@/components/messages/cancellation-card";

type Client = Awaited<ReturnType<typeof createClient>>;

/** Swaps and afbud by id, as the current user may see them. */
export async function loadShiftItems(
  supabase: Client,
  swapIds: string[],
  cancellationIds: string[],
): Promise<{ swaps: Map<string, SwapView>; cancellations: Map<string, CancellationView> }> {
  const [{ data: swaps }, { data: cancellations }] = await Promise.all([
    swapIds.length
      ? supabase.rpc("swap_details", { p_ids: swapIds })
      : Promise.resolve({ data: [] }),
    cancellationIds.length
      ? supabase.rpc("cancellation_details", { p_ids: cancellationIds })
      : Promise.resolve({ data: [] }),
  ]);
  return {
    swaps: new Map((swaps ?? []).map((s) => [s.id, s as SwapView])),
    cancellations: new Map((cancellations ?? []).map((c) => [c.id, c as CancellationView])),
  };
}
