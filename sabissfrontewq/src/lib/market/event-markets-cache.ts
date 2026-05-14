import { marketClient } from "./market.ts";
import type { EventMarketsResponse, MarketResponse } from "./types.ts";

const EVENT_MARKETS_STORAGE_PREFIX = "pm-event-markets/v1:";
const inflightEventMarketsRequests = new Map<string, Promise<EventMarketsResponse | null>>();

function readStoredJson<T>(key: string): T | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(key);

    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeStoredValue(key: string, value: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Ignore storage write failures and keep runtime caches only.
  }
}

export function readStoredEventMarkets(eventId: string): MarketResponse[] | null {
  const stored = readStoredJson<{ event_id?: string; markets?: MarketResponse[] }>(
    `${EVENT_MARKETS_STORAGE_PREFIX}${eventId}`,
  );
  const markets = stored?.markets;

  if (stored?.event_id !== eventId || !Array.isArray(markets) || markets.length === 0) {
    return null;
  }

  return markets;
}

export function writeStoredEventMarkets(eventId: string, markets: readonly MarketResponse[]) {
  writeStoredValue(
    `${EVENT_MARKETS_STORAGE_PREFIX}${eventId}`,
    JSON.stringify({
      event_id: eventId,
      markets,
    }),
  );
}

export async function fetchEventMarketsSnapshot(
  eventId: string,
): Promise<EventMarketsResponse | null> {
  const cachedRequest = inflightEventMarketsRequests.get(eventId);

  if (cachedRequest) {
    return cachedRequest;
  }

  const request = marketClient
    .fetchEventMarkets(eventId)
    .then(response => {
      writeStoredEventMarkets(response.on_chain.event_id, response.markets);
      return response;
    })
    .catch(() => null)
    .finally(() => {
      inflightEventMarketsRequests.delete(eventId);
    });

  inflightEventMarketsRequests.set(eventId, request);
  return request;
}

export function prefetchEventMarketsSnapshot(eventId: string) {
  if (!eventId || readStoredEventMarkets(eventId)) {
    return;
  }

  void fetchEventMarketsSnapshot(eventId);
}
