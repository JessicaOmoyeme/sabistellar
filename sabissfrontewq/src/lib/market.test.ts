import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import {
  ApiError,
  buildMarketFeedHref,
  createMarketClient,
  executePreparedMarketTransactions,
  getMarketDisplayLabel,
  groupMarketsByEvent,
  isMarketFeedTargetActive,
  resolveTradeWallet,
  resolveMarketTopicTabTarget,
} from "./market/index.ts";
import {
  normalizeBuyUsdcTradeAmount,
  normalizeSellTradeAmount,
  resolveBuyUsdcTradeAmount,
} from "./market/amount.ts";

const apiBaseUrl = "http://127.0.0.1:8080";
const liveMarketBaseUrl =
  process.env.MARKET_INTEGRATION_BASE_URL ??
  process.env.AUTH_INTEGRATION_BASE_URL ??
  apiBaseUrl;

interface FetchCall {
  input: RequestInfo | URL;
  init?: RequestInit;
}

const sampleMarketId = "550e8400-e29b-41d4-a716-446655440000";
const sampleSiblingMarketId = "550e8400-e29b-41d4-a716-446655440001";
const sampleEventId = "660e8400-e29b-41d4-a716-446655440000";
const sampleUserId = "770e8400-e29b-41d4-a716-446655440000";
const sampleConditionId = "0x0000000000000000000000000000000000000000000000000000000000000001";

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
let calls: FetchCall[] = [];

async function isLiveMarketBackendAvailable(baseUrl: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1000);

  try {
    const response = await originalFetch(`${baseUrl}/health`, {
      signal: controller.signal,
    });

    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function sampleEventResponse() {
  return {
    title: "Will BTC hit $100k?",
    slug: "will-btc-hit-100k",
    category_slug: "crypto",
    subcategory_slug: "bitcoin",
    tag_slugs: ["btc", "price"],
    image_url: "https://example.com/btc.png",
    summary: "Bitcoin price target market",
    rules: "Resolves YES if BTC trades at or above $100k.",
    context: "Cash market reference",
    additional_context: null,
    resolution_sources: ["Coinbase"],
    resolution_timezone: "UTC",
    starts_at: "2026-04-01T00:00:00Z",
    sort_at: "2026-04-01T00:00:00Z",
    featured: true,
    breaking: false,
    searchable: true,
    visible: true,
    hide_resolved_by_default: false,
    publication_status: "published",
  };
}

function sampleOnChainResponse() {
  return {
    event_id: "0xevent",
    group_id: "0xgroup",
    series_id: "0xseries",
    neg_risk: false,
    tx_hash: "0xtxhash",
  };
}

function sampleMarketResponse(id = sampleMarketId, slug = "btc-100k") {
  return {
    id,
    slug,
    label: "BTC 100k",
    question: "Will BTC hit $100k by year end?",
    question_id: "0xquestion",
    condition_id: sampleConditionId,
    market_type: "binary",
    outcomes: ["Yes", "No"],
    end_time: "2026-12-31T23:59:59Z",
    sort_order: 1,
    publication_status: "published",
    trading_status: "active",
  };
}

function sampleMarketStats() {
  return {
    volume_usd: "1234.56",
  };
}

function sampleMarketQuoteSummary() {
  return {
    buy_yes_bps: 6100,
    buy_no_bps: 3900,
    as_of: "2026-04-03T12:00:00Z",
    source: "price_snapshot",
  };
}

function sampleMarketQuoteResponse() {
  return {
    market_id: sampleMarketId,
    condition_id: sampleConditionId,
    source: "fixed_price_pool",
    as_of: "2026-04-03T12:00:00Z",
    buy_yes_bps: 6100,
    buy_no_bps: 3900,
    sell_yes_bps: 6100,
    sell_no_bps: 3900,
    last_trade_yes_bps: 6100,
    spread_bps: 0,
  };
}

function sampleMarketCard(id = sampleMarketId, slug = "btc-100k") {
  return {
    id,
    slug,
    label: "BTC 100k",
    question: "Will BTC hit $100k by year end?",
    question_id: "0xquestion",
    condition_id: sampleConditionId,
    market_type: "binary",
    outcomes: ["Yes", "No"],
    end_time: "2026-12-31T23:59:59Z",
    sort_order: 1,
    trading_status: "active",
    event: {
      id: sampleEventId,
      title: "Bitcoin 2026 Targets",
      slug: "bitcoin-2026-targets",
      category_slug: "crypto",
      subcategory_slug: "bitcoin",
      tag_slugs: ["btc", "price"],
      image_url: "https://example.com/event.png",
      summary: "Bitcoin yearly targets",
      featured: true,
      breaking: false,
      neg_risk: false,
    },
  };
}

function sampleResolutionState() {
  return {
    status: "proposed",
    proposed_winning_outcome: 0,
    final_winning_outcome: null,
    payout_vector_hash: "0xpayout",
    proposed_by_user_id: sampleUserId,
    proposed_at: "2026-04-02T12:00:00Z",
    dispute_deadline: "2026-04-03T12:00:00Z",
    notes: "Awaiting dispute window close",
    disputed_by_user_id: null,
    disputed_at: null,
    dispute_reason: null,
    finalized_by_user_id: null,
    finalized_at: null,
    emergency_resolved_by_user_id: null,
    emergency_resolved_at: null,
  };
}

function samplePreparedTransaction(kind = "trade") {
  return {
    kind,
    target: "0x00000000000000000000000000000000000000aa",
    data: "0xdeadbeef",
    value: "0",
    description:
      kind === "approval"
        ? "Approve USDC for the exchange"
        : "Execute buy against exchange liquidity",
  };
}

function sampleTradeResponse(overrides: Record<string, unknown> = {}) {
  return {
    event: sampleEventResponse(),
    on_chain: sampleOnChainResponse(),
    market: sampleMarketResponse(),
    wallet_address: "0x0000000000000000000000000000000000000123",
    account_kind: "external_eoa",
    action: "buy",
    outcome_index: 0,
    outcome_label: "Yes",
    execution_mode: "external_wallet",
    execution_status: "prepared",
    prepared_transactions: [
      samplePreparedTransaction("approval"),
      samplePreparedTransaction("trade"),
    ],
    usdc_amount: "10.00",
    token_amount: "16.39",
    price_bps: 6100,
    price: 0.61,
    market_quote: sampleMarketQuoteResponse(),
    requested_at: "2026-04-03T12:00:00Z",
    ...overrides,
  };
}

function createMemoryStorage() {
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
  };
}

function createMockProvider(options: {
  accounts?: string[];
  chainId?: string;
  kind?: "metamask" | "coinbase";
}) {
  const {
    accounts = [],
    chainId = "0x279f",
    kind = "metamask",
  } = options;
  const sentTransactions: unknown[] = [];

  const provider = {
    isMetaMask: kind === "metamask",
    isCoinbaseWallet: kind === "coinbase",
    async request(args: { method: string; params?: readonly unknown[] | object }) {
      if (args.method === "eth_accounts" || args.method === "eth_requestAccounts") {
        return accounts;
      }

      if (args.method === "eth_chainId") {
        return chainId;
      }

      if (args.method === "eth_sendTransaction") {
        sentTransactions.push(args.params);
        return `0xtx${sentTransactions.length}`;
      }

      return [];
    },
  };

  return {
    provider,
    sentTransactions,
  };
}

function installMockWalletWindow(providers: Array<{ request: (...args: never[]) => Promise<unknown> }>) {
  const walletWindow = Object.assign(new EventTarget(), {
    ethereum: {
      request: async () => [],
      providers,
    },
    localStorage: createMemoryStorage(),
    setTimeout: globalThis.setTimeout.bind(globalThis),
  });

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: walletWindow,
    writable: true,
  });
}

const liveMarketBackendAvailable = await isLiveMarketBackendAvailable(liveMarketBaseUrl);

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  globalThis.fetch = originalFetch;

  if (originalWindow === undefined) {
    Reflect.deleteProperty(globalThis, "window");
    return;
  }

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: originalWindow,
    writable: true,
  });
});

test("fetchMarketsHome sends GET /markets/home with query params", async () => {
  const client = createMarketClient({ baseUrl: `${apiBaseUrl}/` });

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });

    return jsonResponse({
      featured: [sampleMarketCard()],
      breaking: [],
      newest: [],
    });
  }) as typeof fetch;

  const response = await client.fetchMarketsHome({ limit: 3 });

  assert.equal(response.featured[0]?.id, sampleMarketId);
  assert.equal(String(calls[0].input), "http://127.0.0.1:8080/markets/home?limit=3");
  assert.equal(calls[0].init?.method, undefined);

  const headers = new Headers(calls[0].init?.headers);
  assert.equal(headers.get("Accept"), "application/json");
});

test("buyMarket posts an authenticated payload to /markets/{market_id}/buy", async () => {
  const client = createMarketClient({ baseUrl: apiBaseUrl });

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    return jsonResponse(sampleTradeResponse());
  }) as typeof fetch;

  const response = await client.buyMarket("session-token", sampleMarketId, {
    trade: {
      outcome_index: 0,
      usdc_amount: "5.25",
    },
  });

  assert.equal(response.execution_mode, "external_wallet");
  assert.equal(String(calls[0].input), `http://127.0.0.1:8080/markets/${sampleMarketId}/buy`);
  assert.equal(calls[0].init?.method, "POST");

  const headers = new Headers(calls[0].init?.headers);
  assert.equal(headers.get("Authorization"), "Bearer session-token");
  assert.equal(headers.get("Accept"), "application/json");
  assert.equal(headers.get("Content-Type"), "application/json");
  assert.equal(
    calls[0].init?.body,
    JSON.stringify({
      trade: {
        outcome_index: 0,
        usdc_amount: "5.25",
      },
    }),
  );
});

test("sellMarket posts an authenticated payload to /markets/{market_id}/sell", async () => {
  const client = createMarketClient({ baseUrl: apiBaseUrl });

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    return jsonResponse(
      sampleTradeResponse({
        action: "sell",
        execution_mode: "smart_account",
        execution_status: "submitted",
        tx_hash: "0xsmartaccounttx",
        prepared_transactions: undefined,
      }),
    );
  }) as typeof fetch;

  const response = await client.sellMarket("session-token", sampleMarketId, {
    trade: {
      outcome_index: 1,
      token_amount: "12.5",
    },
  });

  assert.equal(response.execution_mode, "smart_account");
  assert.equal(response.tx_hash, "0xsmartaccounttx");
  assert.equal(String(calls[0].input), `http://127.0.0.1:8080/markets/${sampleMarketId}/sell`);

  const headers = new Headers(calls[0].init?.headers);
  assert.equal(headers.get("Authorization"), "Bearer session-token");
  assert.equal(
    calls[0].init?.body,
    JSON.stringify({
      trade: {
        outcome_index: 1,
        token_amount: "12.5",
      },
    }),
  );
});

test("listMarkets serializes all supported filters", async () => {
  const client = createMarketClient({ baseUrl: apiBaseUrl });

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });

    return jsonResponse({
      markets: [sampleMarketCard()],
      limit: 10,
      offset: 20,
    });
  }) as typeof fetch;

  const response = await client.listMarkets({
    category_slug: "crypto",
    subcategory_slug: "bitcoin",
    tag_slug: "btc",
    q: "btc above 100k",
    featured: true,
    breaking: false,
    trading_status: "active",
    limit: 10,
    offset: 20,
  });

  assert.equal(response.limit, 10);

  const url = new URL(String(calls[0].input));
  assert.equal(url.pathname, "/markets");
  assert.equal(url.searchParams.get("category_slug"), "crypto");
  assert.equal(url.searchParams.get("subcategory_slug"), "bitcoin");
  assert.equal(url.searchParams.get("tag_slug"), "btc");
  assert.equal(url.searchParams.get("q"), "btc above 100k");
  assert.equal(url.searchParams.get("featured"), "true");
  assert.equal(url.searchParams.get("breaking"), "false");
  assert.equal(url.searchParams.get("trading_status"), "active");
  assert.equal(url.searchParams.get("limit"), "10");
  assert.equal(url.searchParams.get("offset"), "20");
});

test("searchMarkets sends GET /markets/search with public search query params", async () => {
  const client = createMarketClient({ baseUrl: apiBaseUrl });

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });

    return jsonResponse({
      markets: [sampleMarketCard()],
      limit: 12,
      offset: 0,
    });
  }) as typeof fetch;

  const response = await client.searchMarkets({
    q: "drake iceman",
    category_slug: "culture",
    trading_status: "active",
    limit: 12,
    offset: 0,
  });

  assert.equal(response.limit, 12);

  const url = new URL(String(calls[0].input));
  assert.equal(url.pathname, "/markets/search");
  assert.equal(url.searchParams.get("q"), "drake iceman");
  assert.equal(url.searchParams.get("category_slug"), "culture");
  assert.equal(url.searchParams.get("trading_status"), "active");
  assert.equal(url.searchParams.get("limit"), "12");
  assert.equal(url.searchParams.get("offset"), "0");
  assert.equal(calls[0].init?.method, undefined);
});

test("groups flat market responses into sorted event cards", () => {
  const groups = groupMarketsByEvent([
    {
      ...sampleMarketCard(sampleSiblingMarketId, "btc-95k"),
      label: "BTC 95k",
      sort_order: 2,
    },
    {
      ...sampleMarketCard(sampleMarketId, "btc-100k"),
      sort_order: 1,
    },
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.event.slug, "bitcoin-2026-targets");
  assert.equal(groups[0]?.marketCount, 2);
  assert.equal(groups[0]?.markets[0]?.slug, "btc-100k");
  assert.equal(groups[0]?.activeMarketsCount, 2);
  assert.equal(getMarketDisplayLabel(groups[0]!.markets[0]!), "BTC 100k");
});

test("market lookup methods hit the expected public endpoints", async () => {
  const client = createMarketClient({ baseUrl: apiBaseUrl });

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });

    return jsonResponse({
      event: sampleEventResponse(),
      on_chain: sampleOnChainResponse(),
      market: sampleMarketResponse(),
      resolution: sampleResolutionState(),
      sibling_markets: [sampleMarketResponse(sampleSiblingMarketId, "btc-95k")],
    });
  }) as typeof fetch;

  const byId = await client.fetchMarket(sampleMarketId);
  const bySlug = await client.fetchMarketBySlug("btc-100k");
  const byCondition = await client.fetchMarketByCondition(sampleConditionId);

  assert.equal(byId.market.id, sampleMarketId);
  assert.equal(bySlug.market.slug, "btc-100k");
  assert.equal(byCondition.market.condition_id, sampleConditionId);
  assert.equal(String(calls[0].input), `http://127.0.0.1:8080/markets/${sampleMarketId}`);
  assert.equal(String(calls[1].input), "http://127.0.0.1:8080/markets/slug/btc-100k");
  assert.equal(
    String(calls[2].input),
    `http://127.0.0.1:8080/markets/by-condition/${encodeURIComponent(sampleConditionId)}`,
  );
});

test("market subresource methods cover liquidity resolution related outcomes activity quote price history and orderbook", async () => {
  const client = createMarketClient({ baseUrl: apiBaseUrl });

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });

    const url = new URL(String(input));

    if (url.pathname.endsWith("/liquidity")) {
      return jsonResponse({
        market_id: sampleMarketId,
        condition_id: sampleConditionId,
        source: "on_chain",
        exchange_outcomes: [
          { outcome_index: 0, outcome_label: "Yes", available: "10.5" },
          { outcome_index: 1, outcome_label: "No", available: "9.5" },
        ],
        pool: {
          idle_yes_total: "3",
          idle_no_total: "4",
          posted_yes_total: "5",
          posted_no_total: "6",
          claimable_collateral_total: "7",
        },
      });
    }

    if (url.pathname.endsWith("/resolution")) {
      return jsonResponse({
        market_id: sampleMarketId,
        resolution: sampleResolutionState(),
      });
    }

    if (url.pathname.endsWith("/related")) {
      return jsonResponse({
        market_id: sampleMarketId,
        related: [sampleMarketCard(sampleSiblingMarketId, "btc-95k")],
      });
    }

    if (url.pathname.endsWith("/outcomes")) {
      return jsonResponse({
        market_id: sampleMarketId,
        condition_id: sampleConditionId,
        market_type: "binary",
        outcomes: [
          { index: 0, label: "Yes", is_winning: null },
          { index: 1, label: "No", is_winning: null },
        ],
      });
    }

    if (url.pathname.endsWith("/activity")) {
      return jsonResponse({
        market_id: sampleMarketId,
        source: "lifecycle_only",
        items: [
          {
            activity_type: "market_created",
            occurred_at: "2026-04-01T00:00:00Z",
            actor_user_id: null,
            details: "Market published",
          },
        ],
      });
    }

    if (url.pathname.endsWith("/quote")) {
      return jsonResponse(sampleMarketQuoteResponse());
    }

    if (url.pathname.endsWith("/price-history")) {
      return jsonResponse({
        market_id: sampleMarketId,
        condition_id: sampleConditionId,
        source: "not_indexed_yet",
        interval: url.searchParams.get("interval"),
        history: [
          {
            t: 1774976415,
            p: 0.61,
          },
        ],
        points: [
          {
            timestamp: "2026-04-01T00:00:00Z",
            outcome_index: 0,
            outcome_label: "Yes",
            price_bps: 6100,
            price: 0.61,
          },
        ],
      });
    }

    if (url.pathname.endsWith("/orderbook")) {
      return jsonResponse({
        market_id: sampleMarketId,
        condition_id: sampleConditionId,
        source: "not_indexed_yet",
        as_of: "2026-04-03T12:00:00Z",
        spread_bps: 0,
        last_trade_yes_bps: 6000,
        bids: [
          {
            outcome_index: 0,
            outcome_label: "Yes",
            price_bps: 6000,
            price: 0.6,
            quantity: 100,
            shares: "100",
            notional_usd: "60",
          },
        ],
        asks: [
          {
            outcome_index: 0,
            outcome_label: "Yes",
            price_bps: 6200,
            price: 0.62,
            quantity: 120,
            shares: "120",
            notional_usd: "74.4",
          },
        ],
      });
    }

    if (url.pathname.endsWith("/trades")) {
      return jsonResponse({
        market_id: sampleMarketId,
        condition_id: sampleConditionId,
        source: "order_fill_history",
        trades: [
          {
            id: "880e8400-e29b-41d4-a716-446655440000",
            match_type: "direct",
            outcome_index: 0,
            fill_token_amount: "100",
            collateral_amount: "61",
            yes_price_bps: 6100,
            no_price_bps: 3900,
            yes_price: 0.61,
            no_price: 0.39,
            tx_hash: "0xtradehash",
            executed_at: "2026-04-03T12:00:00Z",
          },
        ],
      });
    }

    return jsonResponse({ error: "unexpected path" }, 500);
  }) as typeof fetch;

  const liquidity = await client.fetchMarketLiquidity(sampleMarketId);
  const resolution = await client.fetchMarketResolution(sampleMarketId);
  const related = await client.fetchRelatedMarkets(sampleMarketId);
  const outcomes = await client.fetchMarketOutcomes(sampleMarketId);
  const activity = await client.fetchMarketActivity(sampleMarketId);
  const quote = await client.fetchMarketQuote(sampleMarketId);
  const priceHistory = await client.fetchMarketPriceHistory(sampleMarketId, {
    interval: "4h",
    limit: 12,
  });
  const orderbook = await client.fetchMarketOrderbook(sampleMarketId);
  const trades = await client.fetchMarketTrades(sampleMarketId);

  assert.equal(liquidity.pool.claimable_collateral_total, "7");
  assert.equal(resolution.resolution?.status, "proposed");
  assert.equal(related.related[0]?.id, sampleSiblingMarketId);
  assert.equal(outcomes.outcomes.length, 2);
  assert.equal(activity.items[0]?.activity_type, "market_created");
  assert.equal(quote.buy_yes_bps, 6100);
  assert.equal(priceHistory.interval, "4h");
  assert.equal(priceHistory.history?.[0]?.p, 0.61);
  assert.equal(priceHistory.points[0]?.price_bps, 6100);
  assert.equal(orderbook.asks[0]?.quantity, 120);
  assert.equal(orderbook.asks[0]?.price_bps, 6200);
  assert.equal(trades.trades[0]?.match_type, "direct");
  assert.equal(trades.trades[0]?.yes_price_bps, 6100);
  assert.equal(String(calls[0].input), `http://127.0.0.1:8080/markets/${sampleMarketId}/liquidity`);
  assert.equal(String(calls[1].input), `http://127.0.0.1:8080/markets/${sampleMarketId}/resolution`);
  assert.equal(String(calls[2].input), `http://127.0.0.1:8080/markets/${sampleMarketId}/related`);
  assert.equal(String(calls[3].input), `http://127.0.0.1:8080/markets/${sampleMarketId}/outcomes`);
  assert.equal(String(calls[4].input), `http://127.0.0.1:8080/markets/${sampleMarketId}/activity`);
  assert.equal(String(calls[5].input), `http://127.0.0.1:8080/markets/${sampleMarketId}/quote`);
  assert.equal(
    String(calls[6].input),
    `http://127.0.0.1:8080/markets/${sampleMarketId}/price-history?interval=4h&limit=12`,
  );
  assert.equal(String(calls[7].input), `http://127.0.0.1:8080/markets/${sampleMarketId}/orderbook`);
  assert.equal(String(calls[8].input), `http://127.0.0.1:8080/markets/${sampleMarketId}/trades`);
});

test("event category and tag methods hit the expected public endpoints", async () => {
  const client = createMarketClient({ baseUrl: apiBaseUrl });

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });

    const url = new URL(String(input));

    if (url.pathname === "/events") {
      return jsonResponse({
        events: [
          {
            id: sampleEventId,
            title: "Bitcoin 2026 Targets",
            slug: "bitcoin-2026-targets",
            category_slug: "crypto",
            subcategory_slug: "bitcoin",
            tag_slugs: ["btc", "price"],
            image_url: "https://example.com/event.png",
            summary: "Bitcoin yearly targets",
            featured: true,
            breaking: false,
            neg_risk: false,
            starts_at: "2026-04-01T00:00:00Z",
            sort_at: "2026-04-01T00:00:00Z",
            market_count: 3,
            markets: [
              {
                ...sampleMarketCard(),
                current_prices: {
                  yes_bps: 6100,
                  no_bps: 3900,
                },
              },
            ],
          },
        ],
        limit: 5,
        offset: 15,
      });
    }

    if (url.pathname === `/events/${sampleEventId}`) {
      return jsonResponse({
        event: sampleEventResponse(),
        on_chain: sampleOnChainResponse(),
        markets_count: 3,
      });
    }

    if (url.pathname === `/events/${sampleEventId}/markets`) {
      return jsonResponse({
        event: sampleEventResponse(),
        on_chain: sampleOnChainResponse(),
        markets: [
          {
            ...sampleMarketResponse(),
            current_prices: {
              yes_bps: 6100,
              no_bps: 3900,
            },
            stats: sampleMarketStats(),
            quote_summary: sampleMarketQuoteSummary(),
          },
        ],
      });
    }

    if (url.pathname === "/categories") {
      return jsonResponse({
        categories: [
          {
            slug: "crypto",
            label: "Crypto",
            event_count: 8,
            market_count: 20,
            featured_event_count: 2,
            breaking_event_count: 1,
          },
        ],
      });
    }

    if (url.pathname === "/categories/crypto") {
      return jsonResponse({
        category: {
          slug: "crypto",
          label: "Crypto",
          event_count: 8,
          market_count: 20,
          featured_event_count: 2,
          breaking_event_count: 1,
        },
        markets: [sampleMarketCard()],
      });
    }

    if (url.pathname === "/tags") {
      return jsonResponse({
        tags: [
          {
            slug: "btc",
            label: "BTC",
            event_count: 4,
            market_count: 10,
          },
        ],
      });
    }

    return jsonResponse({ error: "unexpected path" }, 500);
  }) as typeof fetch;

  const events = await client.listEvents({
    category_slug: "crypto",
    subcategory_slug: "bitcoin",
    tag_slug: "btc",
    featured: true,
    breaking: false,
    include_markets: true,
    limit: 5,
    offset: 15,
  });
  const event = await client.fetchEvent(sampleEventId);
  const eventMarkets = await client.fetchEventMarkets(sampleEventId);
  const categories = await client.listCategories();
  const category = await client.fetchCategory("crypto");
  const tags = await client.listTags();

  assert.equal(events.events[0]?.market_count, 3);
  assert.equal(event.markets_count, 3);
  assert.equal(eventMarkets.markets[0]?.id, sampleMarketId);
  assert.equal(eventMarkets.markets[0]?.stats?.volume_usd, "1234.56");
  assert.equal(eventMarkets.markets[0]?.quote_summary?.buy_yes_bps, 6100);
  assert.equal(categories.categories[0]?.slug, "crypto");
  assert.equal(category.category.label, "Crypto");
  assert.equal(tags.tags[0]?.slug, "btc");

  const eventsUrl = new URL(String(calls[0].input));
  assert.equal(eventsUrl.pathname, "/events");
  assert.equal(eventsUrl.searchParams.get("category_slug"), "crypto");
  assert.equal(eventsUrl.searchParams.get("subcategory_slug"), "bitcoin");
  assert.equal(eventsUrl.searchParams.get("tag_slug"), "btc");
  assert.equal(eventsUrl.searchParams.get("featured"), "true");
  assert.equal(eventsUrl.searchParams.get("breaking"), "false");
  assert.equal(eventsUrl.searchParams.get("include_markets"), "true");
  assert.equal(eventsUrl.searchParams.get("limit"), "5");
  assert.equal(eventsUrl.searchParams.get("offset"), "15");
  assert.equal(String(calls[1].input), `http://127.0.0.1:8080/events/${sampleEventId}`);
  assert.equal(String(calls[2].input), `http://127.0.0.1:8080/events/${sampleEventId}/markets`);
  assert.equal(String(calls[3].input), "http://127.0.0.1:8080/categories");
  assert.equal(String(calls[4].input), "http://127.0.0.1:8080/categories/crypto");
  assert.equal(String(calls[5].input), "http://127.0.0.1:8080/tags");
});

test("surfaces backend error messages as ApiError instances", async () => {
  const client = createMarketClient({ baseUrl: apiBaseUrl });

  globalThis.fetch = (async () => {
    return jsonResponse({ error: "market not found" }, 404);
  }) as typeof fetch;

  await assert.rejects(
    () => client.fetchMarket(sampleMarketId),
    (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 404);
      assert.equal(error.message, "market not found");
      return true;
    },
  );
});

test("normalizeBuyUsdcTradeAmount converts display USDC into 6-decimal base units", () => {
  assert.equal(normalizeBuyUsdcTradeAmount("100"), "100000000");
  assert.equal(normalizeBuyUsdcTradeAmount(".5"), "500000");
  assert.equal(normalizeBuyUsdcTradeAmount("10000"), "10000000000");
  assert.equal(normalizeBuyUsdcTradeAmount("10000.000001"), null);
});

test("resolveBuyUsdcTradeAmount flags likely base-unit input before submit", () => {
  assert.deepEqual(resolveBuyUsdcTradeAmount("500000000"), {
    normalizedAmount: null,
    errorMessage:
      "This field expects normal USDC. If you meant base units, 500000000 = 500 USDC.",
    hintMessage:
      "This field expects normal USDC. If you meant base units, 500000000 = 500 USDC.",
  });
});

test("normalizeSellTradeAmount converts display token amounts into 6-decimal base units", () => {
  assert.equal(normalizeSellTradeAmount("100"), "100000000");
  assert.equal(normalizeSellTradeAmount(".5"), "500000");
  assert.equal(normalizeSellTradeAmount("100.123456"), "100123456");
  assert.equal(normalizeSellTradeAmount("0"), null);
  assert.equal(normalizeSellTradeAmount("abc"), null);
  assert.equal(normalizeSellTradeAmount("100.1234567"), null);
});

test("resolveMarketTopicTabTarget prefers backend category matches before falling back", () => {
  const categoryTarget = resolveMarketTopicTabTarget(
    {
      label: "Crypto",
      categoryAliases: ["crypto", "cryptocurrency"],
      tagAliases: ["crypto"],
    },
    [
      {
        slug: "cryptocurrency",
        label: "Cryptocurrency",
        event_count: 10,
        market_count: 24,
        featured_event_count: 3,
        breaking_event_count: 1,
      },
    ],
    [
      {
        slug: "crypto",
        label: "Crypto",
        event_count: 14,
        market_count: 30,
      },
    ],
  );

  assert.deepEqual(categoryTarget, {
    kind: "category",
    label: "Crypto",
    categorySlug: "cryptocurrency",
  });

  const searchTarget = resolveMarketTopicTabTarget(
    {
      label: "Weather",
      categoryAliases: ["weather"],
      tagAliases: ["weather"],
    },
    [],
    [],
  );

  assert.deepEqual(searchTarget, {
    kind: "search",
    label: "Weather",
    query: "Weather",
  });
});

test("buildMarketFeedHref produces the public filter routes used by navbar tabs", () => {
  assert.equal(
    buildMarketFeedHref({
      kind: "featured",
      label: "Trending",
    }),
    "/markets?feed=featured&label=Trending",
  );
  assert.equal(
    buildMarketFeedHref({
      kind: "category",
      label: "Politics",
      categorySlug: "politics",
    }),
    "/markets?feed=category&category=politics&label=Politics",
  );
  assert.equal(
    buildMarketFeedHref({
      kind: "search",
      label: "Weather",
      query: "Weather",
    }),
    "/search?q=Weather",
  );
});

test("isMarketFeedTargetActive matches feature, category, and search tabs correctly", () => {
  assert.equal(
    isMarketFeedTargetActive(
      {
        kind: "breaking",
        label: "Breaking",
      },
      "/markets",
      "?feed=breaking&label=Breaking",
    ),
    true,
  );
  assert.equal(
    isMarketFeedTargetActive(
      {
        kind: "category",
        label: "Politics",
        categorySlug: "politics",
      },
      "/markets",
      "?feed=category&category=politics&label=Politics",
    ),
    true,
  );
  assert.equal(
    isMarketFeedTargetActive(
      {
        kind: "search",
        label: "Mentions",
        query: "Mentions",
      },
      "/search",
      "?q=Mentions",
    ),
    true,
  );
  assert.equal(
    isMarketFeedTargetActive(
      {
        kind: "tag",
        label: "Tech",
        tagSlug: "tech",
      },
      "/markets",
      "?feed=category&category=tech&label=Tech",
    ),
    false,
  );
});

test("resolveTradeWallet picks the wallet whose connected account matches the trade wallet", async () => {
  const firstWallet = createMockProvider({
    accounts: ["0x0000000000000000000000000000000000000001"],
    kind: "metamask",
  });
  const secondWallet = createMockProvider({
    accounts: ["0x0000000000000000000000000000000000000002"],
    kind: "coinbase",
  });

  installMockWalletWindow([firstWallet.provider, secondWallet.provider]);

  const wallet = await resolveTradeWallet(
    "0x0000000000000000000000000000000000000002",
    "metamask",
  );

  assert.equal(wallet?.kind, "coinbase");
});

test("executePreparedMarketTransactions submits each prepared transaction in order", async () => {
  const { provider, sentTransactions } = createMockProvider({
    accounts: ["0x0000000000000000000000000000000000000123"],
  });

  const hashes = await executePreparedMarketTransactions({
    wallet: {
      id: "metamask",
      kind: "metamask",
      name: "MetaMask",
      provider,
      source: "legacy",
    },
    walletAddress: "0x0000000000000000000000000000000000000123",
    chainId: 10143,
    preparedTransactions: [
      samplePreparedTransaction("approval"),
      {
        ...samplePreparedTransaction("trade"),
        target: "0x00000000000000000000000000000000000000bb",
        data: "0xcafebabe",
      },
    ],
  });

  assert.deepEqual(hashes, ["0xtx1", "0xtx2"]);
  assert.equal(sentTransactions.length, 2);
  assert.deepEqual(sentTransactions[0], [
    {
      from: "0x0000000000000000000000000000000000000123",
      to: "0x00000000000000000000000000000000000000aa",
      data: "0xdeadbeef",
      value: "0",
    },
  ]);
  assert.deepEqual(sentTransactions[1], [
    {
      from: "0x0000000000000000000000000000000000000123",
      to: "0x00000000000000000000000000000000000000bb",
      data: "0xcafebabe",
      value: "0",
    },
  ]);
});

test(
  "live listCategories returns the public category contract",
  { skip: !liveMarketBackendAvailable },
  async () => {
    const client = createMarketClient({ baseUrl: liveMarketBaseUrl });
    const response = await client.listCategories();

    assert.ok(Array.isArray(response.categories));

    if (response.categories.length > 0) {
      assert.equal(typeof response.categories[0]?.slug, "string");
      assert.equal(typeof response.categories[0]?.market_count, "number");
    }
  },
);

test(
  "live fetchMarketsHome returns the public home-market contract",
  { skip: !liveMarketBackendAvailable },
  async () => {
    const client = createMarketClient({ baseUrl: liveMarketBaseUrl });
    const response = await client.fetchMarketsHome({ limit: 1 });

    assert.ok(Array.isArray(response.featured));
    assert.ok(Array.isArray(response.breaking));
    assert.ok(Array.isArray(response.newest));
  },
);
