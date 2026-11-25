/**
 * The device's position, once (no tracking). Browser only. In the store app
 * the web view asks for the same permission.
 */
export type PositionResult =
  | { ok: true; latitude: number; longitude: number; accuracy: number }
  | { ok: false; reason: "denied" | "unavailable" };

export function currentPosition(timeoutMs = 15_000): Promise<PositionResult> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation)
      return resolve({ ok: false, reason: "unavailable" });
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          ok: true,
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          accuracy: p.coords.accuracy,
        }),
      (e) =>
        resolve({ ok: false, reason: e.code === e.PERMISSION_DENIED ? "denied" : "unavailable" }),
      // Always a fresh position: a cached one could be from before the employee arrived.
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}
