import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import {
  hydrateEventDetailView,
  loadEventDetailView,
  readProjectedEventDetailView,
  resetEventDetailDataCachesForTest,
} from "./data.ts";

const selectedMarketId = "550e8400-e29b-41d4-a716-446655440000";
const siblingMarketId = "550e8400-e29b-41d4-a716-446655440001";
const eventSlug = "what-will-wti-crude-oil-hit-in-april-2026";
const selectedMarketSlug = "what-will-wti-crude-oil-hit-in-april-2026-up-90";
const siblingMarketSlug = "what-will-wti-crude-oil-hit-in-april-2026-up-95";

const originalFetch = globalThis.fetch;
let calls: string[] = [];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function delayedJsonResponse(body: unknown, delayMs = 15): Promise<Response> {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve(jsonResponse(body));
    }, delayMs);
  });
}

function sampleEvent() {
  return {
    title: "WTI crude oil targets for April 2026",
    slug: eventSlug,
    category_slug: "commodities",
    subcategory_slug: "energy",
    tag_slugs: ["oil", "wti"],
    image_url: null,
    summary: "WTI price targets.",
    rules: "Resolves on the referenced settlement print.",
    context: "Prompted from the market detail test harness.",
    additional_context: null,
    resolution_sources: ["CME"],
    resolution_timezone: "UTC",
    starts_at: "2026-04-01T00:00:00Z",
    sort_at: "2026-04-01T00:00:00Z",
    featured: false,
    breaking: false,
    searchable: true,
    visible: true,
    hide_resolved_by_default: false,
    publication_status: "published",
  };
}

function sampleMarket(
  id: string,
  slug: string,
  sortOrder: number,
  label: string,
  currentPrices?: { yes_bps: number; no_bps: number } | null,
) {
  return {
    id,
    slug,
    label,
    question: label,
    question_id: `question-${id}`,
    condition_id: `condition-${id}`,
    market_type: "binary",
    outcomes: ["Yes", "No"],
    end_time: "2026-04-30T23:59:59Z",
    sort_order: sortOrder,
    publication_status: "published",
    trading_status: "active",
    current_prices: currentPrices ?? null,
  };
}

function sampleDetail() {
  return {
    event: sampleEvent(),
    on_chain: {
      event_id: "event-1",
      group_id: "group-1",
      series_id: "series-1",
      neg_risk: false,
      tx_hash: "tx-1",
    },
    market: sampleMarket(selectedMarketId, selectedMarketSlug, 1, "WTI Up 90"),
    resolution: null,
    sibling_markets: [sampleMarket(siblingMarketId, siblingMarketSlug, 2, "WTI Up 95")],
  };
}

function sampleEventMarketsResponse(
  markets = [
    sampleMarket(selectedMarketId, selectedMarketSlug, 1, "WTI Up 90"),
    sampleMarket(siblingMarketId, siblingMarketSlug, 2, "WTI Up 95"),
  ],
) {
  return {
    event: sampleEvent(),
    on_chain: {
      event_id: "event-1",
      group_id: "group-1",
      series_id: "series-1",
      neg_risk: false,
      tx_hash: "tx-1",
    },
    markets,
  };
}

function sampleOrderbook(marketId: string) {
  return {
    market_id: marketId,
    condition_id: `condition-${marketId}`,
    source: "clob",
    as_of: "2026-04-03T12:00:00Z",
    bids: [
      { outcome_index: 0, outcome_label: "Yes", price: 0.58, quantity: 120 },
      { outcome_index: 1, outcome_label: "No", price: 0.41, quantity: 85 },
    ],
    asks: [
      { outcome_index: 0, outcome_label: "Yes", price: 0.61, quantity: 140 },
      { outcome_index: 1, outcome_label: "No", price: 0.44, quantity: 95 },
    ],
  };
}

function sampleActivityResponse(marketId: string) {
  return {
    market_id: marketId,
    source: "lifecycle_only",
    items: [
      {
        activity_type: "market_created",
        occurred_at: "2026-04-01T00:00:00Z",
        actor_user_id: null,
        details: "Market opened",
      },
    ],
  };
}

function sampleCommentsResponse(marketId: string) {
  return {
    event: sampleEvent(),
    on_chain: {
      event_id: "event-1",
      group_id: "group-1",
      series_id: "series-1",
      neg_risk: false,
      tx_hash: "tx-1",
    },
    market: sampleMarket(
      marketId,
      marketId === selectedMarketId ? selectedMarketSlug : siblingMarketSlug,
      marketId === selectedMarketId ? 1 : 2,
      marketId === selectedMarketId ? "WTI Up 90" : "WTI Up 95",
    ),
    comments: [
      {
        id: `comment-${marketId}`,
        body: "Crude stays bid into settlement.",
        parent_comment_id: null,
        author: {
          user_id: "comment-user-1",
          username: "macrodesk",
          display_name: "Macro Desk",
          avatar_url: null,
        },
        like_count: 2,
        reply_count: 1,
        replies: [
          {
            id: `reply-${marketId}`,
            parent_comment_id: `comment-${marketId}`,
            body: "Positioning still looks one-sided.",
            author: {
              user_id: "comment-user-2",
              username: "energybot",
              display_name: "Energy Bot",
              avatar_url: null,
            },
            like_count: 0,
            reply_count: 0,
            replies: [],
            created_at: "2026-04-03T12:30:00Z",
            updated_at: "2026-04-03T12:30:00Z",
          },
        ],
        created_at: "2026-04-03T12:00:00Z",
        updated_at: "2026-04-03T12:00:00Z",
      },
    ],
  };
}

function sampleLiquidityResponse(marketId: string) {
  return {
    market_id: marketId,
    condition_id: `condition-${marketId}`,
    source: "exchange",
    exchange_outcomes: [
      {
        outcome_index: 0,
        outcome_label: "Yes",
        available: "1250",
      },
      {
        outcome_index: 1,
        outcome_label: "No",
        available: "980",
      },
    ],
    pool: {
      idle_yes_total: "400",
      idle_no_total: "380",
      posted_yes_total: "850",
      posted_no_total: "600",
      claimable_collateral_total: "75",
    },
  };
}

function createSessionStorage() {
  const store = new Map<string, string>();

  return {
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

function sampleHomeFeedMarket(id: string, slug: string, sortOrder: number, label: string) {
  return {
    id,
    slug,
    label,
    question: label,
    question_id: `question-${id}`,
    condition_id: `condition-${id}`,
    market_type: "binary",
    outcomes: ["Yes", "No"],
    end_time: "2026-04-30T23:59:59Z",
    sort_order: sortOrder,
    trading_status: "active",
    event: {
      id: "home-event-1",
      title: "WTI crude oil targets for April 2026",
      slug: eventSlug,
      category_slug: "commodities",
      subcategory_slug: "energy",
      tag_slugs: ["oil", "wti"],
      image_url: null,
      summary: "WTI price targets.",
      featured: false,
      breaking: false,
      neg_risk: false,
    },
  };
}

function sampleEnrichedHomeFeedMarket(
  id: string,
  slug: string,
  sortOrder: number,
  label: string,
  yesBps: number,
) {
  return {
    ...sampleHomeFeedMarket(id, slug, sortOrder, label),
    current_prices: {
      yes_bps: yesBps,
      no_bps: 10_000 - yesBps,
    },
    stats: {
      volume_usd: "1234.56",
    },
    quote_summary: {
      buy_yes_bps: yesBps,
      buy_no_bps: 10_000 - yesBps,
      as_of: "2026-04-03T12:00:00Z",
      source: "price_snapshot",
    },
  };
}

function pathFromInput(input: RequestInfo | URL): string {
  return new URL(String(input), "http://localhost").pathname;
}

beforeEach(() => {
  calls = [];
  resetEventDetailDataCachesForTest();
  Reflect.deleteProperty(globalThis, "window");
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  resetEventDetailDataCachesForTest();
  Reflect.deleteProperty(globalThis, "window");
});

test("hydrateEventDetailView only loads the selected market orderbook", async () => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const path = pathFromInput(input);
    calls.push(path);

    if (path === `/markets/slug/${selectedMarketSlug}`) {
      return jsonResponse(sampleDetail());
    }

    if (path === `/markets/${selectedMarketId}/related`) {
      return jsonResponse({
        market_id: selectedMarketId,
        related: [],
      });
    }

    if (path === "/events/event-1/markets") {
      return jsonResponse(sampleEventMarketsResponse());
    }

    if (path === `/markets/${selectedMarketId}/activity`) {
      return jsonResponse(sampleActivityResponse(selectedMarketId));
    }

    if (path === `/markets/${selectedMarketId}/comments`) {
      return jsonResponse(sampleCommentsResponse(selectedMarketId));
    }

    if (path === `/markets/${selectedMarketId}/liquidity`) {
      return jsonResponse(sampleLiquidityResponse(selectedMarketId));
    }

    if (path === `/markets/${selectedMarketId}/orderbook`) {
      return jsonResponse(sampleOrderbook(selectedMarketId));
    }

    if (path === `/markets/${siblingMarketId}/orderbook`) {
      return jsonResponse(sampleOrderbook(siblingMarketId));
    }

    return jsonResponse({ error: `Unexpected path: ${path}` }, 500);
  }) as typeof fetch;

  await loadEventDetailView(eventSlug, selectedMarketSlug);
  const view = await hydrateEventDetailView(eventSlug, selectedMarketSlug);

  assert.equal(
    calls.filter(path => path === `/markets/${selectedMarketId}/orderbook`).length,
    1,
  );
  assert.equal(
    calls.filter(path => path === `/markets/${selectedMarketId}/liquidity`).length,
    1,
  );
  assert.equal(
    calls.filter(path => path === `/markets/${selectedMarketId}/comments`).length,
    1,
  );
  assert.equal(
    calls.filter(path => path === `/markets/${siblingMarketId}/orderbook`).length,
    0,
  );
  assert.equal(view.selectedMarket.quotes[0]?.price, 0.61);
  assert.equal(view.liquidity?.exchange_outcomes[0]?.available, "1250");
  assert.equal(view.comments[0]?.body, "Crude stays bid into settlement.");

  const siblingMarket = view.marketList.find(market => market.id === siblingMarketId);
  assert.equal(siblingMarket?.quotes[0]?.price, null);
});

test("concurrent hydrations reuse the same selected-market requests", async () => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const path = pathFromInput(input);
    calls.push(path);

    if (path === `/markets/slug/${selectedMarketSlug}`) {
      return jsonResponse(sampleDetail());
    }

    if (path === `/markets/${selectedMarketId}/related`) {
      return delayedJsonResponse({
        market_id: selectedMarketId,
        related: [],
      });
    }

    if (path === "/events/event-1/markets") {
      return delayedJsonResponse(sampleEventMarketsResponse());
    }

    if (path === `/markets/${selectedMarketId}/activity`) {
      return delayedJsonResponse(sampleActivityResponse(selectedMarketId));
    }

    if (path === `/markets/${selectedMarketId}/comments`) {
      return delayedJsonResponse(sampleCommentsResponse(selectedMarketId));
    }

    if (path === `/markets/${selectedMarketId}/liquidity`) {
      return delayedJsonResponse(sampleLiquidityResponse(selectedMarketId));
    }

    if (path === `/markets/${selectedMarketId}/orderbook`) {
      return delayedJsonResponse(sampleOrderbook(selectedMarketId));
    }

    return jsonResponse({ error: `Unexpected path: ${path}` }, 500);
  }) as typeof fetch;

  await loadEventDetailView(eventSlug, selectedMarketSlug);

  await Promise.all([
    hydrateEventDetailView(eventSlug, selectedMarketSlug),
    hydrateEventDetailView(eventSlug, selectedMarketSlug),
  ]);

  assert.equal(
    calls.filter(path => path === `/markets/${selectedMarketId}/orderbook`).length,
    1,
  );
  assert.equal(
    calls.filter(path => path === `/markets/${selectedMarketId}/related`).length,
    1,
  );
  assert.equal(
    calls.filter(path => path === `/markets/${selectedMarketId}/activity`).length,
    1,
  );
  assert.equal(
    calls.filter(path => path === `/markets/${selectedMarketId}/comments`).length,
    1,
  );
  assert.equal(
    calls.filter(path => path === `/markets/${selectedMarketId}/liquidity`).length,
    1,
  );
});

test("hydrateEventDetailView can surface liquidity before slower related resources finish", async () => {
  let releaseDeferred: (() => void) | null = null;
  const deferredResponses = new Promise<void>(resolve => {
    releaseDeferred = resolve;
  });

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const path = pathFromInput(input);
    calls.push(path);

    if (path === `/markets/slug/${selectedMarketSlug}`) {
      return jsonResponse(sampleDetail());
    }

    if (path === `/markets/${selectedMarketId}/related`) {
      await deferredResponses;
      return jsonResponse({
        market_id: selectedMarketId,
        related: [],
      });
    }

    if (path === "/events/event-1/markets") {
      return jsonResponse(sampleEventMarketsResponse());
    }

    if (path === `/markets/${selectedMarketId}/activity`) {
      await deferredResponses;
      return jsonResponse(sampleActivityResponse(selectedMarketId));
    }

    if (path === `/markets/${selectedMarketId}/comments`) {
      await deferredResponses;
      return jsonResponse(sampleCommentsResponse(selectedMarketId));
    }

    if (path === `/markets/${selectedMarketId}/liquidity`) {
      return jsonResponse(sampleLiquidityResponse(selectedMarketId));
    }

    if (path === `/markets/${selectedMarketId}/orderbook`) {
      await deferredResponses;
      return jsonResponse(sampleOrderbook(selectedMarketId));
    }

    return jsonResponse({ error: `Unexpected path: ${path}` }, 500);
  }) as typeof fetch;

  await loadEventDetailView(eventSlug, selectedMarketSlug);

  let preview: Awaited<ReturnType<typeof loadEventDetailView>> | null = null;
  const hydratedPromise = hydrateEventDetailView(eventSlug, selectedMarketSlug, {
    onLiquidityReady: view => {
      preview = view;
    },
  });

  await new Promise(resolve => {
    setTimeout(resolve, 0);
  });

  assert.ok(preview);
  assert.equal(preview?.liquidity?.exchange_outcomes[0]?.available, "1250");
  assert.equal(preview?.selectedMarket.quotes[0]?.price, null);

  releaseDeferred?.();

  const hydrated = await hydratedPromise;

  assert.equal(hydrated.selectedMarket.quotes[0]?.price, 0.61);
  assert.equal(
    calls.filter(path => path === `/markets/${selectedMarketId}/liquidity`).length,
    1,
  );
});

test("loadEventDetailView reuses cached liquidity from session storage", async () => {
  const sessionStorage = createSessionStorage();

  globalThis.window = {
    sessionStorage,
  } as Window & typeof globalThis;

  sessionStorage.setItem(
    `pm-market-liquidity/v1:${selectedMarketId}`,
    JSON.stringify(sampleLiquidityResponse(selectedMarketId)),
  );

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const path = pathFromInput(input);
    calls.push(path);

    if (path === `/markets/slug/${selectedMarketSlug}`) {
      return jsonResponse(sampleDetail());
    }

    if (path.endsWith("/price-history")) {
      return jsonResponse({
        market_id: selectedMarketId,
        condition_id: `condition-${selectedMarketId}`,
        source: "not_indexed_yet",
        interval: "1h",
        points: [],
      });
    }

    if (path === `/markets/${selectedMarketId}/liquidity`) {
      return jsonResponse({ error: "liquidity should have been served from cache" }, 500);
    }

    if (path === "/events/event-1/markets") {
      return jsonResponse(sampleEventMarketsResponse());
    }

    return jsonResponse({ error: `Unexpected path: ${path}` }, 500);
  }) as typeof fetch;

  const view = await loadEventDetailView(eventSlug, selectedMarketSlug);

  assert.equal(view.liquidity?.exchange_outcomes[0]?.available, "1250");
  assert.equal(
    calls.filter(path => path === `/markets/${selectedMarketId}/liquidity`).length,
    0,
  );
});

test("failed liquidity fetches are retried instead of being cached as empty", async () => {
  let liquidityAttempts = 0;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const path = pathFromInput(input);
    calls.push(path);

    if (path === `/markets/slug/${selectedMarketSlug}`) {
      return jsonResponse(sampleDetail());
    }

    if (path === `/markets/${selectedMarketId}/related`) {
      return jsonResponse({
        market_id: selectedMarketId,
        related: [],
      });
    }

    if (path === "/events/event-1/markets") {
      return jsonResponse(sampleEventMarketsResponse());
    }

    if (path === `/markets/${selectedMarketId}/activity`) {
      return jsonResponse(sampleActivityResponse(selectedMarketId));
    }

    if (path === `/markets/${selectedMarketId}/comments`) {
      return jsonResponse(sampleCommentsResponse(selectedMarketId));
    }

    if (path === `/markets/${selectedMarketId}/liquidity`) {
      liquidityAttempts += 1;

      if (liquidityAttempts === 1) {
        return jsonResponse({ error: "temporary failure" }, 500);
      }

      return jsonResponse(sampleLiquidityResponse(selectedMarketId));
    }

    if (path === `/markets/${selectedMarketId}/orderbook`) {
      return jsonResponse(sampleOrderbook(selectedMarketId));
    }

    return jsonResponse({ error: `Unexpected path: ${path}` }, 500);
  }) as typeof fetch;

  const shellView = await loadEventDetailView(eventSlug, selectedMarketSlug);
  assert.equal(shellView.liquidity, null);

  const hydratedView = await hydrateEventDetailView(eventSlug, selectedMarketSlug);

  assert.equal(hydratedView.liquidity?.exchange_outcomes[0]?.available, "1250");
  assert.equal(
    calls.filter(path => path === `/markets/${selectedMarketId}/liquidity`).length,
    2,
  );
});

test("readProjectedEventDetailView seeds an event shell from the cached home feed", () => {
  const sessionStorage = createSessionStorage();

  globalThis.window = {
    sessionStorage,
  } as Window & typeof globalThis;

  sessionStorage.setItem(
    "pm-home-feed/v2",
    JSON.stringify({
      markets: [
        sampleHomeFeedMarket(selectedMarketId, selectedMarketSlug, 1, "WTI Up 90"),
        sampleHomeFeedMarket(siblingMarketId, siblingMarketSlug, 2, "WTI Up 95"),
      ],
      nextOffset: 2,
      hasMore: true,
    }),
  );
  sessionStorage.setItem(
    `pm-event-primary-market/v1:${eventSlug}`,
    JSON.stringify(siblingMarketSlug),
  );

  const projected = readProjectedEventDetailView(eventSlug);

  assert.ok(projected);
  assert.equal(projected.eventTitle, "WTI crude oil targets for April 2026");
  assert.equal(projected.marketCount, 2);
  assert.equal(projected.selectedMarket.slug, siblingMarketSlug);
  assert.equal(projected.marketList[0]?.quotes[0]?.price, null);
});

test("readProjectedEventDetailView uses cached event markets for instant quote paint", () => {
  const sessionStorage = createSessionStorage();

  globalThis.window = {
    sessionStorage,
  } as Window & typeof globalThis;

  sessionStorage.setItem(
    "pm-home-feed/v2",
    JSON.stringify({
      markets: [
        sampleHomeFeedMarket(selectedMarketId, selectedMarketSlug, 1, "Edouard Philippe"),
        sampleHomeFeedMarket(siblingMarketId, siblingMarketSlug, 2, "Jordan Bardella"),
      ],
      nextOffset: 2,
      hasMore: true,
    }),
  );
  sessionStorage.setItem(
    "pm-event-markets/v1:home-event-1",
    JSON.stringify({
      event_id: "home-event-1",
      markets: [
        {
          ...sampleMarket(selectedMarketId, selectedMarketSlug, 1, "Edouard Philippe", {
            yes_bps: 2800,
            no_bps: 7200,
          }),
          stats: {
            volume_usd: "1234.56",
          },
          quote_summary: {
            buy_yes_bps: 2800,
            buy_no_bps: 7200,
            as_of: "2026-04-03T12:00:00Z",
            source: "price_snapshot",
          },
        },
        sampleMarket(siblingMarketId, siblingMarketSlug, 2, "Jordan Bardella", {
          yes_bps: 2000,
          no_bps: 8000,
        }),
      ],
    }),
  );

  const projected = readProjectedEventDetailView(eventSlug);

  assert.ok(projected);
  assert.equal(projected.selectedMarket.primaryMetric, "28%");
  assert.equal(projected.selectedMarket.meta, "$1.2K vol · Ends Apr 30");
  assert.equal(projected.selectedMarket.quotes[0]?.centsLabel, "28¢");
  assert.equal(projected.selectedMarket.quotes[1]?.centsLabel, "72¢");
  assert.equal(projected.marketList[1]?.quotes[0]?.centsLabel, "20¢");
});

test("readProjectedEventDetailView preserves enriched home feed odds and volume", () => {
  const sessionStorage = createSessionStorage();

  globalThis.window = {
    sessionStorage,
  } as Window & typeof globalThis;

  sessionStorage.setItem(
    "pm-home-feed/v2",
    JSON.stringify({
      markets: [
        sampleEnrichedHomeFeedMarket(selectedMarketId, selectedMarketSlug, 1, "No change", 9800),
        sampleEnrichedHomeFeedMarket(siblingMarketId, siblingMarketSlug, 2, "25 bps increase", 100),
      ],
      nextOffset: 2,
      hasMore: true,
    }),
  );

  const projected = readProjectedEventDetailView(eventSlug);

  assert.ok(projected);
  assert.equal(projected.selectedMarket.primaryMetric, "98%");
  assert.equal(projected.selectedMarket.meta, "$1.2K vol · Ends Apr 30");
  assert.equal(projected.facts.find(fact => fact.label === "Yes price")?.value, "98%");
  assert.equal(projected.facts.find(fact => fact.label === "Volume")?.value, "$1,234.56");
});

test("loadEventDetailView uses current_prices before orderbook hydration arrives", async () => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const path = pathFromInput(input);
    calls.push(path);

    if (path === `/markets/slug/${selectedMarketSlug}`) {
      return jsonResponse({
        ...sampleDetail(),
        market: sampleMarket(
          selectedMarketId,
          selectedMarketSlug,
          1,
          "WTI Up 200",
          {
            yes_bps: 300,
            no_bps: 9700,
          },
        ),
      });
    }

    if (path === "/events/event-1/markets") {
      return jsonResponse(
        sampleEventMarketsResponse([
          sampleMarket(selectedMarketId, selectedMarketSlug, 1, "WTI Up 200", {
            yes_bps: 300,
            no_bps: 9700,
          }),
          sampleMarket(siblingMarketId, siblingMarketSlug, 2, "WTI Up 95"),
        ]),
      );
    }

    if (path.endsWith("/price-history")) {
      return jsonResponse({
        market_id: selectedMarketId,
        condition_id: `condition-${selectedMarketId}`,
        source: "not_indexed_yet",
        interval: "1h",
        points: [],
      });
    }

    if (path === `/markets/${selectedMarketId}/liquidity`) {
      return jsonResponse(sampleLiquidityResponse(selectedMarketId));
    }

    return jsonResponse({ error: `Unexpected path: ${path}` }, 500);
  }) as typeof fetch;

  const view = await loadEventDetailView(eventSlug, selectedMarketSlug);

  assert.equal(view.selectedMarket.label, "WTI Up 200");
  assert.equal(view.selectedMarket.primaryMetric, "3%");
  assert.equal(view.selectedMarket.meta, "Ends Apr 30");
  assert.equal(view.selectedMarket.quotes[0]?.centsLabel, "3¢");
  assert.equal(view.selectedMarket.quotes[1]?.centsLabel, "97¢");
  assert.equal(view.facts.find(fact => fact.label === "Yes price")?.value, "3%");
  assert.equal(view.facts.find(fact => fact.label === "Volume")?.value, "Unavailable");
});

test("hydrateEventDetailView can surface event market prices before slower detail resources finish", async () => {
  let releaseDeferred: (() => void) | null = null;
  const deferredResponses = new Promise<void>(resolve => {
    releaseDeferred = resolve;
  });

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const path = pathFromInput(input);
    calls.push(path);

    if (path === `/markets/slug/${selectedMarketSlug}`) {
      return jsonResponse(sampleDetail());
    }

    if (path === "/events/event-1/markets") {
      return jsonResponse(
        sampleEventMarketsResponse([
          {
            ...sampleMarket(selectedMarketId, selectedMarketSlug, 1, "Edouard Philippe", {
              yes_bps: 300,
              no_bps: 9700,
            }),
            stats: {
              volume_usd: "1234.56",
            },
            quote_summary: {
              buy_yes_bps: 300,
              buy_no_bps: 9700,
              as_of: "2026-04-03T12:00:00Z",
              source: "price_snapshot",
            },
          },
          sampleMarket(siblingMarketId, siblingMarketSlug, 2, "Jordan Bardella", {
            yes_bps: 1800,
            no_bps: 8200,
          }),
        ]),
      );
    }

    if (path === `/markets/${selectedMarketId}/related`) {
      await deferredResponses;
      return jsonResponse({
        market_id: selectedMarketId,
        related: [],
      });
    }

    if (path === `/markets/${selectedMarketId}/activity`) {
      await deferredResponses;
      return jsonResponse(sampleActivityResponse(selectedMarketId));
    }

    if (path === `/markets/${selectedMarketId}/comments`) {
      await deferredResponses;
      return jsonResponse(sampleCommentsResponse(selectedMarketId));
    }

    if (path === `/markets/${selectedMarketId}/liquidity`) {
      await deferredResponses;
      return jsonResponse(sampleLiquidityResponse(selectedMarketId));
    }

    if (path === `/markets/${selectedMarketId}/orderbook`) {
      await deferredResponses;
      return jsonResponse(sampleOrderbook(selectedMarketId));
    }

    return jsonResponse({ error: `Unexpected path: ${path}` }, 500);
  }) as typeof fetch;

  let preview: Awaited<ReturnType<typeof loadEventDetailView>> | null = null;
  const hydratedPromise = hydrateEventDetailView(eventSlug, selectedMarketSlug, {
    onMarketPricesReady: view => {
      preview = view;
    },
  });

  await new Promise(resolve => {
    setTimeout(resolve, 0);
  });

  assert.ok(preview);
  assert.equal(preview?.selectedMarket.primaryMetric, "3%");
  assert.equal(preview?.selectedMarket.meta, "$1.2K vol · Ends Apr 30");
  assert.equal(preview?.facts.find(fact => fact.label === "Volume")?.value, "$1,234.56");
  assert.equal(preview?.selectedMarket.quotes[0]?.centsLabel, "3¢");
  assert.equal(preview?.marketList[1]?.quotes[0]?.centsLabel, "18¢");

  releaseDeferred?.();
  await hydratedPromise;
});
