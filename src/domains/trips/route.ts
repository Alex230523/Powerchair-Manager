/**
 * 3 (8): an estimate of the driving time between two addresses. Off by
 * default: without OPENROUTESERVICE_API_KEY, the duration is typed by hand
 * and the « Itinéraire » links (Google Maps, Waze) do the rest. With a free
 * OpenRouteService key, the estimate fills the step's duration on demand.
 */
export interface RouteEstimator {
  /** Minutes by car, or null when an address is not found. */
  minutes(from: string, to: string): Promise<number | null>;
}

const base = "https://api.openrouteservice.org";

export class OpenRouteServiceEstimator implements RouteEstimator {
  constructor(private readonly key: string) {}
  private async point(address: string) {
    const r = await fetch(`${base}/geocode/search?api_key=${encodeURIComponent(this.key)}&size=1&text=${encodeURIComponent(address)}`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const v = (await r.json()) as { features?: { geometry?: { coordinates?: [number, number] } }[] };
    return v.features?.[0]?.geometry?.coordinates ?? null;
  }
  async minutes(from: string, to: string) {
    const [a, b] = [await this.point(from), await this.point(to)];
    if (!a || !b) return null;
    const r = await fetch(`${base}/v2/directions/driving-car`, {
      method: "POST",
      headers: { Authorization: this.key, "Content-Type": "application/json" },
      body: JSON.stringify({ coordinates: [a, b] }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const v = (await r.json()) as { routes?: { summary?: { duration?: number } }[] };
    const s = v.routes?.[0]?.summary?.duration;
    return typeof s === "number" ? Math.round(s / 60) : null;
  }
}

/** The estimator in use, or null when none is switched on. */
export function routeEstimator(): RouteEstimator | null {
  const key = process.env.OPENROUTESERVICE_API_KEY?.trim();
  return key ? new OpenRouteServiceEstimator(key) : null;
}
