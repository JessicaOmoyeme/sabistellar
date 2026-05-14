import { commentClient } from "~/lib/comment/index.ts";
import type { MarketCommentResponse } from "~/lib/comment/types.ts";
import { marketClient } from "~/lib/market/index.ts";
import type {
  EventResponse,
  MarketActivityItemResponse,
  MarketDetailResponse,
  MarketLiquidityResponse,
  MarketOrderbookResponse,
  MarketPriceHistoryResponse,
  MarketResolutionStateResponse,
  PublicEventTeaserResponse,
  PublicMarketCardResponse,
  MarketResponse,
  PublicEventCardResponse,
} from "~/lib/market/types.ts";
import {
  fetchEventMarketsSnapshot,
  readStoredEventMarkets,
  writeStoredEventMarkets,
} from "~/lib/market/event-markets-cache.ts";
import { formatSlugLabel } from "~/lib/market/view.ts";
import {
  buildMarketHref,
  buildOutcomeQuotes,
  compareMarkets,
  formatProbabilityFromBps,
  formatLongDate,
  formatShortDate,
  formatStatusLabel,
  formatUsdVolume,
  resolveMarketLabel,
  resolveMarketPillLabel,
} from "./format.ts";
import type { EventDetailViewModel, EventFactItem, EventMarketListItem } from "./types.ts";

const EVENT_LOOKUP_LIMIT = 100;
const EVENT_LOOKUP_MAX_PAGES = 12;
const HOME_FEED_STORAGE_KEY = "pm-home-feed/v3";
const LEGACY_HOME_FEED_STORAGE_KEY = "pm-home-feed/v2";
const EVENT_PRIMARY_MARKET_STORAGE_PREFIX = "pm-event-primary-market/v1:";
const MARKET_LIQUIDITY_STORAGE_PREFIX = "pm-market-liquidity/v1:";
const MAX_CACHED_ORDERBOOKS_PER_EVENT = 3;
const eventLookupCache = new Map<string, Promise<PublicEventCardResponse>>();
const detailContextCache = new Map<string, Promise<EventDetailContext>>();
const eventViewCache = new Map<string, EventViewCache>();

interface EventDetailContext {
  eventSlug: string;
  selectedMarketSlug: string;
  eventView: EventViewCache;
}

interface HydrateEventDetailOptions {
  onLiquidityReady?: (view: EventDetailViewModel) => void;
  onMarketPricesReady?: (view: EventDetailViewModel) => void;
  onCommentsReady?: (view: EventDetailViewModel) => void;
}

interface EventViewCache {
  eventSlug: string;
  eventId: string | null;
  event: EventResponse;
  sortedMarkets: MarketResponse[];
  resolutionsBySlug: Map<string, MarketResolutionStateResponse | null>;
  orderbookByMarketId: Map<string, MarketOrderbookResponse | null>;
  priceHistoryByMarketId: Map<string, MarketPriceHistoryResponse | null>;
  activityByMarketId: Map<string, MarketActivityItemResponse[]>;
  commentsByMarketId: Map<string, MarketCommentResponse[]>;
  liquidityByMarketId: Map<string, MarketLiquidityResponse | null>;
  relatedByMarketId: Map<string, PublicMarketCardResponse[]>;
  eventMarketsRequest: Promise<void> | null;
  detailRequestByMarketSlug: Map<string, Promise<MarketDetailResponse | null>>;
  orderbookRequestByMarketId: Map<string, Promise<MarketOrderbookResponse | null>>;
  priceHistoryRequestByMarketId: Map<string, Promise<MarketPriceHistoryResponse | null>>;
  activityRequestByMarketId: Map<string, Promise<MarketActivityItemResponse[] | null>>;
  commentsRequestByMarketId: Map<string, Promise<MarketCommentResponse[] | null>>;
  liquidityRequestByMarketId: Map<string, Promise<MarketLiquidityResponse | null>>;
  relatedRequestByMarketId: Map<string, Promise<PublicMarketCardResponse[] | null>>;
}

async function readOptional<T>(request: Promise<T>): Promise<T | null> {
  try {
    return await request;
  } catch {
    return null;
  }
}

function getDetailContextCacheKey(eventSlug: string, marketSlug?: string): string {
  return `${eventSlug}::${marketSlug ?? ""}`;
}

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

function comparePublicMarkets(
  left: PublicMarketCardResponse,
  right: PublicMarketCardResponse,
): number {
  if (left.sort_order !== right.sort_order) {
    return left.sort_order - right.sort_order;
  }

  return left.end_time.localeCompare(right.end_time);
}

function readPreferredMarketSlug(eventSlug: string): string | null {
  return readStoredJson<string>(`${EVENT_PRIMARY_MARKET_STORAGE_PREFIX}${eventSlug}`);
}

function writePreferredMarketSlug(eventSlug: string, marketSlug: string) {
  writeStoredValue(`${EVENT_PRIMARY_MARKET_STORAGE_PREFIX}${eventSlug}`, JSON.stringify(marketSlug));
}

function readStoredLiquidity(marketId: string): MarketLiquidityResponse | null {
  const stored = readStoredJson<MarketLiquidityResponse>(
    `${MARKET_LIQUIDITY_STORAGE_PREFIX}${marketId}`,
  );

  if (!stored || stored.market_id !== marketId) {
    return null;
  }

  return stored;
}

function writeStoredLiquidity(marketId: string, liquidity: MarketLiquidityResponse) {
  writeStoredValue(
    `${MARKET_LIQUIDITY_STORAGE_PREFIX}${marketId}`,
    JSON.stringify(liquidity),
  );
}

function readHomeFeedMarketsForEvent(eventSlug: string): PublicMarketCardResponse[] {
  const stored =
    readStoredJson<{
      markets?: PublicMarketCardResponse[];
      events?: PublicEventCardResponse[];
    }>(HOME_FEED_STORAGE_KEY) ??
    readStoredJson<{
      markets?: PublicMarketCardResponse[];
      events?: PublicEventCardResponse[];
    }>(LEGACY_HOME_FEED_STORAGE_KEY);

  if (Array.isArray(stored?.markets)) {
    return stored.markets.filter(market => market?.event?.slug === eventSlug).sort(comparePublicMarkets);
  }

  const event = stored?.events?.find(candidate => candidate?.slug === eventSlug);
  const markets = event?.markets;

  if (!Array.isArray(markets)) {
    return [];
  }

  return markets.sort(comparePublicMarkets);
}

function buildShellEvent(event: PublicEventTeaserResponse): EventResponse {
  return {
    title: event.title,
    slug: event.slug,
    category_slug: event.category_slug,
    subcategory_slug: event.subcategory_slug,
    tag_slugs: event.tag_slugs,
    image_url: event.image_url,
    summary: event.summary,
    rules: "",
    context: null,
    additional_context: null,
    resolution_sources: [],
    resolution_timezone: "UTC",
    starts_at: null,
    sort_at: null,
    featured: event.featured,
    breaking: event.breaking,
    searchable: true,
    visible: true,
    hide_resolved_by_default: false,
    publication_status: "published",
  };
}

function hasCurrentPrices(market: MarketResponse): boolean {
  return (
    typeof market.current_prices?.yes_bps === "number" ||
    typeof market.current_prices?.no_bps === "number"
  );
}

function hasSnapshotEnrichment(market: MarketResponse): boolean {
  return market.stats !== undefined || market.quote_summary !== undefined;
}

function formatMarketVolumeLabel(market: MarketResponse, compact = true): string | null {
  return formatUsdVolume(market.stats?.volume_usd, compact);
}

function formatMarketYesProbabilityLabel(market: MarketResponse): string | null {
  return (
    formatProbabilityFromBps(market.quote_summary?.buy_yes_bps) ??
    formatProbabilityFromBps(market.current_prices?.yes_bps)
  );
}

function mergeMarketSnapshots(
  existingMarkets: readonly MarketResponse[],
  incomingMarkets: readonly MarketResponse[],
): MarketResponse[] {
  const incomingById = new Map(incomingMarkets.map(market => [market.id, market]));
  const mergedMarkets = existingMarkets.map(existingMarket => {
    const incomingMarket = incomingById.get(existingMarket.id);

    if (!incomingMarket) {
      return existingMarket;
    }

    return {
      ...existingMarket,
      ...incomingMarket,
      current_prices: incomingMarket.current_prices ?? existingMarket.current_prices ?? null,
      stats: incomingMarket.stats ?? existingMarket.stats ?? null,
      quote_summary: incomingMarket.quote_summary ?? existingMarket.quote_summary ?? null,
    };
  });

  for (const incomingMarket of incomingMarkets) {
    if (!mergedMarkets.some(existingMarket => existingMarket.id === incomingMarket.id)) {
      mergedMarkets.push(incomingMarket);
    }
  }

  return dedupeMarkets(mergedMarkets);
}

function buildShellMarket(market: PublicMarketCardResponse): MarketResponse {
  return {
    id: market.id,
    slug: market.slug,
    label: market.label,
    question: market.question,
    question_id: market.question_id,
    condition_id: market.condition_id,
    market_type: market.market_type,
    outcomes: market.outcomes,
    end_time: market.end_time,
    sort_order: market.sort_order,
    publication_status: "published",
    trading_status: market.trading_status,
    current_prices: market.current_prices ?? null,
    stats: market.stats ?? null,
    quote_summary: market.quote_summary ?? null,
  };
}

function seedEventViewFromHomeFeed(eventSlug: string): EventViewCache | null {
  const homeFeedMarkets = readHomeFeedMarketsForEvent(eventSlug);

  if (homeFeedMarkets.length === 0) {
    return null;
  }

  const shellEvent = buildShellEvent(homeFeedMarkets[0]!.event);
  const shellMarkets = homeFeedMarkets.map(buildShellMarket).sort(compareMarkets);
  const eventId = homeFeedMarkets[0]!.event.id;
  const storedMarkets = readStoredEventMarkets(eventId);
  const hydratedMarkets = storedMarkets ? mergeMarketSnapshots(shellMarkets, storedMarkets) : shellMarkets;

  return ensureEventView(eventSlug, shellEvent, hydratedMarkets, eventId);
}

async function resolveEventCardBySlug(eventSlug: string): Promise<PublicEventCardResponse> {
  const cached = eventLookupCache.get(eventSlug);

  if (cached) {
    return cached;
  }

  const request = (async () => {
    let offset = 0;

    for (let page = 0; page < EVENT_LOOKUP_MAX_PAGES; page += 1) {
      const response = await marketClient.listEvents({
        limit: EVENT_LOOKUP_LIMIT,
        offset,
      });
      const found = response.events.find(event => event.slug === eventSlug);

      if (found) {
        return found;
      }

      if (response.events.length < EVENT_LOOKUP_LIMIT) {
        break;
      }

      offset += EVENT_LOOKUP_LIMIT;
    }

    throw new Error("Unable to find that market event.");
  })();

  eventLookupCache.set(
    eventSlug,
    request.catch(error => {
      eventLookupCache.delete(eventSlug);
      throw error;
    }),
  );

  return eventLookupCache.get(eventSlug)!;
}

function buildFacts(
  marketCount: number,
  selectedMarket: MarketResponse,
  selectedMarketType: string,
): EventFactItem[] {
  const yesPrice = formatMarketYesProbabilityLabel(selectedMarket);
  const volume = formatUsdVolume(selectedMarket.stats?.volume_usd, false);

  return [
    {
      label: "Markets",
      value: String(marketCount),
    },
    {
      label: "Yes price",
      value: yesPrice ?? "Unavailable",
    },
    {
      label: "Volume",
      value: volume ?? "Unavailable",
    },
    {
      label: "Ends",
      value: formatLongDate(selectedMarket.end_time),
    },
    {
      label: "Type",
      value: formatSlugLabel(selectedMarketType),
    },
    {
      label: "Condition",
      value: selectedMarket.condition_id ?? "Unavailable",
      mono: true,
    },
  ];
}

function buildMarketListItem(
  eventSlug: string,
  market: MarketResponse,
  orderbook: MarketOrderbookResponse | null,
  priceHistory: MarketPriceHistoryResponse | null,
  selectedMarketSlug: string,
): EventMarketListItem {
  const label = resolveMarketLabel(market.label, market.question, market.end_time);
  const quotes = buildOutcomeQuotes(
    market,
    orderbook,
    priceHistory,
    market.outcomes,
    eventSlug,
    market.slug,
  );
  const primaryMetric =
    quotes[0]?.price !== null
      ? quotes[0]?.probabilityLabel
      : formatMarketYesProbabilityLabel(market) ?? "--";
  const href = buildMarketHref(eventSlug, market.slug);
  const volumeLabel = formatMarketVolumeLabel(market);
  const endLabel = `Ends ${formatShortDate(market.end_time)}`;

  return {
    id: market.id,
    slug: market.slug,
    label,
    meta: volumeLabel ? `${volumeLabel} · ${endLabel}` : endLabel,
    href,
    primaryMetric,
    isSelected: market.slug === selectedMarketSlug,
    quotes,
    pill: {
      label: resolveMarketPillLabel(market.label, market.end_time),
      href,
      marketSlug: market.slug,
      isSelected: market.slug === selectedMarketSlug,
    },
  };
}

function composeContext(
  summary: string | null,
  context: string | null,
  additionalContext: string | null,
): string | null {
  const parts = [summary, context, additionalContext]
    .map(value => value?.trim() ?? "")
    .filter(Boolean);

  if (parts.length === 0) {
    return null;
  }

  return parts.join("\n\n");
}

function sortCommentsByNewest(
  comments: readonly MarketCommentResponse[],
): MarketCommentResponse[] {
  return [...comments].sort((left, right) => {
    const leftTimestamp = Date.parse(left.created_at);
    const rightTimestamp = Date.parse(right.created_at);

    if (Number.isNaN(leftTimestamp) || Number.isNaN(rightTimestamp)) {
      return right.id.localeCompare(left.id);
    }

    return rightTimestamp - leftTimestamp;
  });
}

function listMarketsFromDetail(detail: MarketDetailResponse): MarketResponse[] {
  return [detail.market, ...detail.sibling_markets].sort(compareMarkets);
}

function dedupeMarkets(markets: readonly MarketResponse[]): MarketResponse[] {
  const seen = new Set<string>();
  const deduped: MarketResponse[] = [];

  for (const market of [...markets].sort(compareMarkets)) {
    const key = market.id || market.slug;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(market);
  }

  return deduped;
}

function ensureEventView(
  eventSlug: string,
  event: EventResponse,
  sortedMarkets: readonly MarketResponse[],
  eventId: string | null = null,
): EventViewCache {
  const existing = eventViewCache.get(eventSlug);

  if (existing) {
    existing.event = event;
    existing.sortedMarkets = dedupeMarkets(sortedMarkets);

    if (eventId) {
      existing.eventId = eventId;
    }

    return existing;
  }

  const created: EventViewCache = {
    eventSlug,
    eventId,
    event,
    sortedMarkets: dedupeMarkets(sortedMarkets),
    resolutionsBySlug: new Map<string, MarketResolutionStateResponse | null>(),
    orderbookByMarketId: new Map<string, MarketOrderbookResponse | null>(),
    priceHistoryByMarketId: new Map<string, MarketPriceHistoryResponse | null>(),
    activityByMarketId: new Map<string, MarketActivityItemResponse[]>(),
    commentsByMarketId: new Map<string, MarketCommentResponse[]>(),
    liquidityByMarketId: new Map<string, MarketLiquidityResponse | null>(),
    relatedByMarketId: new Map<string, PublicMarketCardResponse[]>(),
    eventMarketsRequest: null,
    detailRequestByMarketSlug: new Map<string, Promise<MarketDetailResponse | null>>(),
    orderbookRequestByMarketId: new Map<string, Promise<MarketOrderbookResponse | null>>(),
    priceHistoryRequestByMarketId: new Map<string, Promise<MarketPriceHistoryResponse | null>>(),
    activityRequestByMarketId: new Map<string, Promise<MarketActivityItemResponse[] | null>>(),
    commentsRequestByMarketId: new Map<string, Promise<MarketCommentResponse[] | null>>(),
    liquidityRequestByMarketId: new Map<string, Promise<MarketLiquidityResponse | null>>(),
    relatedRequestByMarketId: new Map<string, Promise<PublicMarketCardResponse[] | null>>(),
  };

  eventViewCache.set(eventSlug, created);
  return created;
}

function applyDetailToEventView(
  eventSlug: string,
  eventView: EventViewCache,
  detail: MarketDetailResponse,
) {
  if (detail.event.slug !== eventSlug) {
    return;
  }

  eventView.event = detail.event;
  eventView.eventId = detail.on_chain.event_id;
  eventView.sortedMarkets = mergeMarketSnapshots(
    listMarketsFromDetail(detail),
    eventView.sortedMarkets,
  );
  eventView.resolutionsBySlug.set(detail.market.slug, detail.resolution);
  writePreferredMarketSlug(eventSlug, detail.market.slug);
}

function applyEventMarketsToEventView(
  eventView: EventViewCache,
  event: EventResponse,
  eventId: string,
  markets: readonly MarketResponse[],
) {
  eventView.event = event;
  eventView.eventId = eventId;
  eventView.sortedMarkets = mergeMarketSnapshots(eventView.sortedMarkets, markets);
  writeStoredEventMarkets(eventId, eventView.sortedMarkets);
}

function cacheOrderbook(
  eventView: EventViewCache,
  marketId: string,
  orderbook: MarketOrderbookResponse | null,
) {
  eventView.orderbookByMarketId.delete(marketId);
  eventView.orderbookByMarketId.set(marketId, orderbook);

  while (eventView.orderbookByMarketId.size > MAX_CACHED_ORDERBOOKS_PER_EVENT) {
    const oldestMarketId = eventView.orderbookByMarketId.keys().next().value;

    if (!oldestMarketId) {
      break;
    }

    eventView.orderbookByMarketId.delete(oldestMarketId);
  }
}

async function loadResolutionForMarket(
  eventSlug: string,
  eventView: EventViewCache,
  marketSlug: string,
): Promise<MarketDetailResponse | null> {
  if (eventView.resolutionsBySlug.has(marketSlug)) {
    return null;
  }

  const cachedRequest = eventView.detailRequestByMarketSlug.get(marketSlug);

  if (cachedRequest) {
    return cachedRequest;
  }

  const request = readOptional(marketClient.fetchMarketBySlug(marketSlug))
    .then(detail => {
      if (detail) {
        applyDetailToEventView(eventSlug, eventView, detail);
      }

      return detail;
    })
    .finally(() => {
      eventView.detailRequestByMarketSlug.delete(marketSlug);
    });

  eventView.detailRequestByMarketSlug.set(marketSlug, request);
  return request;
}

async function loadEventMarketsForEvent(
  eventView: EventViewCache,
): Promise<void> {
  const eventId = eventView.eventId;

  if (!eventId) {
    return;
  }

  if (
    eventView.sortedMarkets.length > 0 &&
    eventView.sortedMarkets.every(market => hasCurrentPrices(market) && hasSnapshotEnrichment(market))
  ) {
    return;
  }

  const storedMarkets = readStoredEventMarkets(eventId);

  if (storedMarkets) {
    applyEventMarketsToEventView(eventView, eventView.event, eventId, storedMarkets);

    if (
      eventView.sortedMarkets.every(
        market => hasCurrentPrices(market) && hasSnapshotEnrichment(market),
      )
    ) {
      return;
    }
  }

  if (eventView.eventMarketsRequest) {
    return eventView.eventMarketsRequest;
  }

  const request = fetchEventMarketsSnapshot(eventId)
    .then(response => {
      if (!response) {
        return;
      }

      applyEventMarketsToEventView(
        eventView,
        response.event,
        response.on_chain.event_id,
        response.markets,
      );
    })
    .finally(() => {
      eventView.eventMarketsRequest = null;
    });

  eventView.eventMarketsRequest = request;
  return request;
}

async function loadRelatedMarketsForMarket(
  eventView: EventViewCache,
  marketId: string,
): Promise<PublicMarketCardResponse[] | null> {
  if (eventView.relatedByMarketId.has(marketId)) {
    return eventView.relatedByMarketId.get(marketId) ?? [];
  }

  const cachedRequest = eventView.relatedRequestByMarketId.get(marketId);

  if (cachedRequest) {
    return cachedRequest;
  }

  const request = readOptional(marketClient.fetchRelatedMarkets(marketId))
    .then(response => {
      const related = response?.related ?? null;

      if (related) {
        eventView.relatedByMarketId.set(marketId, related);
      }

      return related;
    })
    .finally(() => {
      eventView.relatedRequestByMarketId.delete(marketId);
    });

  eventView.relatedRequestByMarketId.set(marketId, request);
  return request;
}

async function loadActivityForMarket(
  eventView: EventViewCache,
  marketId: string,
): Promise<MarketActivityItemResponse[] | null> {
  if (eventView.activityByMarketId.has(marketId)) {
    return eventView.activityByMarketId.get(marketId) ?? [];
  }

  const cachedRequest = eventView.activityRequestByMarketId.get(marketId);

  if (cachedRequest) {
    return cachedRequest;
  }

  const request = readOptional(marketClient.fetchMarketActivity(marketId))
    .then(response => {
      const items = response?.items ?? null;

      if (items) {
        eventView.activityByMarketId.set(marketId, items);
      }

      return items;
    })
    .finally(() => {
      eventView.activityRequestByMarketId.delete(marketId);
    });

  eventView.activityRequestByMarketId.set(marketId, request);
  return request;
}

async function loadCommentsForMarket(
  eventView: EventViewCache,
  marketId: string,
): Promise<MarketCommentResponse[] | null> {
  if (eventView.commentsByMarketId.has(marketId)) {
    return eventView.commentsByMarketId.get(marketId) ?? [];
  }

  const cachedRequest = eventView.commentsRequestByMarketId.get(marketId);

  if (cachedRequest) {
    return cachedRequest;
  }

  const request = readOptional(commentClient.fetchMarketComments(marketId))
    .then(response => {
      if (!response) {
        return null;
      }

      eventView.event = response.event;
      eventView.eventId = response.on_chain.event_id;
      eventView.sortedMarkets = mergeMarketSnapshots(eventView.sortedMarkets, [response.market]);

      const comments = sortCommentsByNewest(response.comments);
      eventView.commentsByMarketId.set(marketId, comments);
      return comments;
    })
    .finally(() => {
      eventView.commentsRequestByMarketId.delete(marketId);
    });

  eventView.commentsRequestByMarketId.set(marketId, request);
  return request;
}

async function loadLiquidityForMarket(
  eventView: EventViewCache,
  marketId: string,
): Promise<MarketLiquidityResponse | null> {
  if (eventView.liquidityByMarketId.has(marketId)) {
    return eventView.liquidityByMarketId.get(marketId) ?? null;
  }

  const storedLiquidity = readStoredLiquidity(marketId);

  if (storedLiquidity) {
    eventView.liquidityByMarketId.set(marketId, storedLiquidity);
    return storedLiquidity;
  }

  const cachedRequest = eventView.liquidityRequestByMarketId.get(marketId);

  if (cachedRequest) {
    return cachedRequest;
  }

  const request = readOptional(marketClient.fetchMarketLiquidity(marketId))
    .then(liquidity => {
      if (liquidity) {
        eventView.liquidityByMarketId.set(marketId, liquidity);
        writeStoredLiquidity(marketId, liquidity);
      }

      return liquidity;
    })
    .finally(() => {
      eventView.liquidityRequestByMarketId.delete(marketId);
    });

  eventView.liquidityRequestByMarketId.set(marketId, request);
  return request;
}

async function loadOrderbookForMarket(
  eventView: EventViewCache,
  marketId: string,
): Promise<MarketOrderbookResponse | null> {
  if (eventView.orderbookByMarketId.has(marketId)) {
    return eventView.orderbookByMarketId.get(marketId) ?? null;
  }

  const cachedRequest = eventView.orderbookRequestByMarketId.get(marketId);

  if (cachedRequest) {
    return cachedRequest;
  }

  const request = readOptional(marketClient.fetchMarketOrderbook(marketId))
    .then(orderbook => {
      cacheOrderbook(eventView, marketId, orderbook);
      return orderbook;
    })
    .finally(() => {
      eventView.orderbookRequestByMarketId.delete(marketId);
    });

  eventView.orderbookRequestByMarketId.set(marketId, request);
  return request;
}

async function loadPriceHistoryForMarket(
  eventView: EventViewCache,
  marketId: string,
): Promise<MarketPriceHistoryResponse | null> {
  if (eventView.priceHistoryByMarketId.has(marketId)) {
    return eventView.priceHistoryByMarketId.get(marketId) ?? null;
  }

  const cachedRequest = eventView.priceHistoryRequestByMarketId.get(marketId);

  if (cachedRequest) {
    return cachedRequest;
  }

  const request = readOptional(
    marketClient.fetchMarketPriceHistory(marketId, {
      interval: "1h",
      limit: 16,
    }),
  )
    .then(history => {
      eventView.priceHistoryByMarketId.set(marketId, history);
      return history;
    })
    .finally(() => {
      eventView.priceHistoryRequestByMarketId.delete(marketId);
    });

  eventView.priceHistoryRequestByMarketId.set(marketId, request);
  return request;
}

function prefetchEventMarketPriceHistory(eventView: EventViewCache) {
  if (typeof window === "undefined") {
    return;
  }

  for (const market of eventView.sortedMarkets) {
    void loadPriceHistoryForMarket(eventView, market.id);
  }
}

function resolveSelectedMarketBase(context: EventDetailContext): MarketResponse {
  const selectedMarketBase =
    context.eventView.sortedMarkets.find(market => market.slug === context.selectedMarketSlug) ??
    context.eventView.sortedMarkets[0];

  if (!selectedMarketBase) {
    throw new Error("This event does not have any markets yet.");
  }

  return selectedMarketBase;
}

function buildViewModel(context: EventDetailContext): EventDetailViewModel {
  const eventView = context.eventView;
  const sortedMarkets = eventView.sortedMarkets;
  const selectedMarketBase = resolveSelectedMarketBase(context);

  const selectedMarketSlug = selectedMarketBase.slug;
  const marketList = sortedMarkets.map(market =>
    buildMarketListItem(
      context.eventSlug,
      market,
      eventView.orderbookByMarketId.get(market.id) ?? null,
      eventView.priceHistoryByMarketId.get(market.id) ?? null,
      selectedMarketSlug,
    ),
  );
  const selectedMarket =
    marketList.find(market => market.slug === selectedMarketSlug) ?? marketList[0];
  const selectedMarketType = selectedMarketBase.market_type;
  const rules = eventView.event.rules.trim();
  const contextCopy = composeContext(
    eventView.event.summary,
    eventView.event.context,
    eventView.event.additional_context,
  );

  return {
    eventId: eventView.eventId,
    eventSlug: context.eventSlug,
    eventTitle: eventView.event.title,
    eventImageUrl: eventView.event.image_url,
    categorySlug: eventView.event.category_slug,
    categoryLabel: formatSlugLabel(eventView.event.category_slug),
    subcategoryLabel: eventView.event.subcategory_slug
      ? formatSlugLabel(eventView.event.subcategory_slug)
      : null,
    tagSlugs: [...eventView.event.tag_slugs],
    marketCount: sortedMarkets.length,
    selectedMarketId: selectedMarketBase.id,
    selectedConditionId: selectedMarketBase.condition_id,
    selectedMarket,
    selectedMarketQuestion: selectedMarketBase.question,
    selectedMarketType,
    selectedMarketStatus: formatStatusLabel(selectedMarketBase.trading_status),
    selectedMarketVolumeLabel: formatMarketVolumeLabel(selectedMarketBase, false),
    selectedMarketEndsAt: selectedMarketBase.end_time,
    selectedMarketOrderbook: eventView.orderbookByMarketId.get(selectedMarketBase.id) ?? null,
    selectedMarketPriceHistory:
      eventView.priceHistoryByMarketId.get(selectedMarketBase.id) ?? null,
    rules: rules.length > 0 ? rules : "No written rules were provided for this market yet.",
    context: contextCopy,
    resolutionSources: eventView.event.resolution_sources,
    facts: buildFacts(sortedMarkets.length, selectedMarketBase, selectedMarketType),
    marketTabs: marketList.map(market => market.pill),
    marketList,
    relatedMarkets: eventView.relatedByMarketId.get(selectedMarketBase.id) ?? [],
    comments: eventView.commentsByMarketId.get(selectedMarketBase.id) ?? [],
    activity: eventView.activityByMarketId.get(selectedMarketBase.id) ?? [],
    liquidity: eventView.liquidityByMarketId.get(selectedMarketBase.id) ?? null,
    resolution: eventView.resolutionsBySlug.get(selectedMarketSlug) ?? null,
  };
}

export function readProjectedEventDetailView(
  eventSlug: string,
  marketSlug?: string,
): EventDetailViewModel | null {
  const eventView = eventViewCache.get(eventSlug) ?? seedEventViewFromHomeFeed(eventSlug);

  if (!eventView || eventView.sortedMarkets.length === 0) {
    return null;
  }

  if (eventView.eventId) {
    const storedMarkets = readStoredEventMarkets(eventView.eventId);

    if (storedMarkets) {
      eventView.sortedMarkets = mergeMarketSnapshots(eventView.sortedMarkets, storedMarkets);
    }
  }

  const selectedMarketSlug =
    marketSlug ??
    readPreferredMarketSlug(eventSlug) ??
    eventView.sortedMarkets[0]?.slug;

  if (!selectedMarketSlug) {
    return null;
  }

  if (!eventView.sortedMarkets.some(market => market.slug === selectedMarketSlug)) {
    return null;
  }

  return buildViewModel({
    eventSlug,
    selectedMarketSlug,
    eventView,
  });
}

async function fetchDetailFromPreferredSlug(
  eventSlug: string,
  preferredMarketSlug: string | null,
): Promise<MarketDetailResponse | null> {
  if (!preferredMarketSlug) {
    return null;
  }

  const detail = await readOptional(marketClient.fetchMarketBySlug(preferredMarketSlug));

  if (!detail || detail.event.slug !== eventSlug) {
    return null;
  }

  return detail;
}

async function resolveDetailContext(
  eventSlug: string,
  marketSlug?: string,
): Promise<EventDetailContext> {
  const cacheKey = getDetailContextCacheKey(eventSlug, marketSlug);
  const cached = detailContextCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const request = (async () => {
    const cachedEventView = eventViewCache.get(eventSlug);

    if (cachedEventView && cachedEventView.sortedMarkets.length > 0) {
      if (marketSlug && cachedEventView.sortedMarkets.some(market => market.slug === marketSlug)) {
        return {
          eventSlug,
          selectedMarketSlug: marketSlug,
          eventView: cachedEventView,
        };
      }

      if (!marketSlug) {
        const preferredSlug =
          readPreferredMarketSlug(eventSlug) ?? cachedEventView.sortedMarkets[0]?.slug;

        if (preferredSlug) {
          return {
            eventSlug,
            selectedMarketSlug: preferredSlug,
            eventView: cachedEventView,
          };
        }
      }
    }

    const seededEventView = seedEventViewFromHomeFeed(eventSlug);

    if (seededEventView && seededEventView.sortedMarkets.length > 0) {
      if (marketSlug && seededEventView.sortedMarkets.some(market => market.slug === marketSlug)) {
        return {
          eventSlug,
          selectedMarketSlug: marketSlug,
          eventView: seededEventView,
        };
      }

      if (!marketSlug) {
        const preferredSlug =
          readPreferredMarketSlug(eventSlug) ?? seededEventView.sortedMarkets[0]?.slug;

        if (preferredSlug) {
          return {
            eventSlug,
            selectedMarketSlug: preferredSlug,
            eventView: seededEventView,
          };
        }
      }
    }

    let selectedDetail: MarketDetailResponse | null = null;

    if (marketSlug) {
      selectedDetail = await marketClient.fetchMarketBySlug(marketSlug);

      if (selectedDetail.event.slug !== eventSlug) {
        throw new Error("Unable to find that market event.");
      }
    } else {
      selectedDetail = await fetchDetailFromPreferredSlug(eventSlug, readPreferredMarketSlug(eventSlug));

      if (!selectedDetail) {
        const homeFeedMarket = readHomeFeedMarketsForEvent(eventSlug)[0];
        selectedDetail = await fetchDetailFromPreferredSlug(eventSlug, homeFeedMarket?.slug ?? null);
      }

      if (!selectedDetail) {
        const eventCard = await resolveEventCardBySlug(eventSlug);
        const eventMarkets = await marketClient.fetchEventMarkets(eventCard.id);
        const selectedMarketBase = [...eventMarkets.markets].sort(compareMarkets)[0];

        if (!selectedMarketBase) {
          throw new Error("This event does not have any markets yet.");
        }

        selectedDetail = await marketClient.fetchMarketBySlug(selectedMarketBase.slug);

        if (selectedDetail.event.slug !== eventSlug) {
          throw new Error("Unable to find that market event.");
        }
      }
    }

    const sortedMarkets = dedupeMarkets(listMarketsFromDetail(selectedDetail));
    const eventView = ensureEventView(
      eventSlug,
      selectedDetail.event,
      sortedMarkets,
      selectedDetail.on_chain.event_id,
    );
    applyDetailToEventView(eventSlug, eventView, selectedDetail);

    if (eventView.sortedMarkets.length === 0) {
      throw new Error("This event does not have any markets yet.");
    }

    return {
      eventSlug,
      selectedMarketSlug: selectedDetail.market.slug,
      eventView,
    };
  })();

  detailContextCache.set(
    cacheKey,
    request.catch(error => {
      detailContextCache.delete(cacheKey);
      throw error;
    }),
  );

  return detailContextCache.get(cacheKey)!;
}

export async function loadEventDetailView(
  eventSlug: string,
  marketSlug?: string,
): Promise<EventDetailViewModel> {
  const context = await resolveDetailContext(eventSlug, marketSlug);
  const selectedMarket = resolveSelectedMarketBase(context);
  void loadEventMarketsForEvent(context.eventView);
  void loadLiquidityForMarket(context.eventView, selectedMarket.id);
  prefetchEventMarketPriceHistory(context.eventView);
  return buildViewModel(context);
}

export async function hydrateEventDetailView(
  eventSlug: string,
  marketSlug?: string,
  options: HydrateEventDetailOptions = {},
): Promise<EventDetailViewModel> {
  const context = await resolveDetailContext(eventSlug, marketSlug);
  const eventView = context.eventView;
  const selectedMarket = resolveSelectedMarketBase(context);

  prefetchEventMarketPriceHistory(eventView);

  const eventMarketsRequest = loadEventMarketsForEvent(eventView);
  const resolutionRequest = loadResolutionForMarket(eventSlug, eventView, selectedMarket.slug);
  const relatedRequest = loadRelatedMarketsForMarket(eventView, selectedMarket.id);
  const activityRequest = loadActivityForMarket(eventView, selectedMarket.id);
  const commentsRequest = loadCommentsForMarket(eventView, selectedMarket.id);
  const liquidityRequest = loadLiquidityForMarket(eventView, selectedMarket.id);
  const orderbookRequest = loadOrderbookForMarket(eventView, selectedMarket.id);
  let publishedMarketPricesPreview = false;
  let publishedLiquidityPreview = false;
  let publishedCommentsPreview = false;
  const publishPreview = (
    publisher: ((view: EventDetailViewModel) => void) | undefined,
    alreadyPublished: boolean,
  ) => {
    if (!publisher || alreadyPublished) {
      return true;
    }

    publisher(
      buildViewModel({
        eventSlug,
        selectedMarketSlug: selectedMarket.slug,
        eventView,
      }),
    );

    return true;
  };

  void eventMarketsRequest.then(() => {
    if (!eventView.sortedMarkets.some(market => hasCurrentPrices(market) || hasSnapshotEnrichment(market))) {
      return;
    }

    publishedMarketPricesPreview = publishPreview(
      options.onMarketPricesReady,
      publishedMarketPricesPreview,
    );
  });

  void commentsRequest.then(comments => {
    if (!comments || comments.length === 0) {
      return;
    }

    publishedCommentsPreview = publishPreview(
      options.onCommentsReady,
      publishedCommentsPreview,
    );
  });

  let liquidity = await liquidityRequest;

  if (!liquidity && !eventView.liquidityByMarketId.has(selectedMarket.id)) {
    liquidity = await loadLiquidityForMarket(eventView, selectedMarket.id);
  }

  if (liquidity) {
    publishedLiquidityPreview = publishPreview(
      options.onLiquidityReady,
      publishedLiquidityPreview,
    );
  }

  await Promise.all([
    eventMarketsRequest,
    resolutionRequest,
    relatedRequest,
    activityRequest,
    commentsRequest,
    orderbookRequest,
  ]);

  return buildViewModel({
    eventSlug,
    selectedMarketSlug: selectedMarket.slug,
    eventView,
  });
}

export function resetEventDetailDataCachesForTest() {
  eventLookupCache.clear();
  detailContextCache.clear();
  eventViewCache.clear();
}

export function replaceCachedMarketComments(
  eventSlug: string,
  marketId: string,
  comments: readonly MarketCommentResponse[],
) {
  const eventView = eventViewCache.get(eventSlug);

  if (!eventView) {
    return;
  }

  eventView.commentsByMarketId.set(marketId, sortCommentsByNewest(comments));
}
