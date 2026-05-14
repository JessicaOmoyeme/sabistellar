import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { ApiError, createCommentClient } from "./comment/index.ts";

const apiBaseUrl = "http://127.0.0.1:8080";

interface FetchCall {
  input: RequestInfo | URL;
  init?: RequestInit;
}

const sampleMarketId = "550e8400-e29b-41d4-a716-446655440000";
const sampleEventId = "660e8400-e29b-41d4-a716-446655440000";
const sampleUserId = "770e8400-e29b-41d4-a716-446655440000";
const sampleConditionId = "0x0000000000000000000000000000000000000000000000000000000000000001";
const sampleCommentId = "880e8400-e29b-41d4-a716-446655440000";
const sampleReplyId = "990e8400-e29b-41d4-a716-446655440000";

const originalFetch = globalThis.fetch;
let calls: FetchCall[] = [];

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
    event_id: sampleEventId,
    group_id: "0xgroup",
    series_id: "0xseries",
    neg_risk: false,
    tx_hash: "0xtxhash",
  };
}

function sampleMarketResponse() {
  return {
    id: sampleMarketId,
    slug: "btc-100k",
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

function sampleCommentResponse() {
  return {
    id: sampleCommentId,
    body: "Market structure looks bullish.",
    author: {
      user_id: sampleUserId,
      username: "sabi",
      display_name: "Sabi",
      avatar_url: "https://example.com/avatar.png",
    },
    like_count: 3,
    reply_count: 1,
    replies: [
      {
        id: sampleReplyId,
        parent_comment_id: sampleCommentId,
        body: "Agreed, flows look strong.",
        author: {
          user_id: "aa0e8400-e29b-41d4-a716-446655440000",
          username: "desk",
          display_name: "Desk",
          avatar_url: null,
        },
        like_count: 0,
        reply_count: 0,
        replies: [],
        created_at: "2026-04-07T10:05:00Z",
        updated_at: "2026-04-07T10:05:00Z",
      },
    ],
    created_at: "2026-04-07T10:00:00Z",
    updated_at: "2026-04-07T10:00:00Z",
  };
}

function sampleCommentLikeResponse() {
  return {
    comment_id: sampleCommentId,
    market_id: sampleMarketId,
    like_count: 4,
    liked: true,
    updated_at: "2026-04-07T10:06:00Z",
  };
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("fetchMarketComments sends GET /markets/{market_id}/comments", async () => {
  const client = createCommentClient({ baseUrl: `${apiBaseUrl}/` });

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });

    return jsonResponse({
      event: sampleEventResponse(),
      on_chain: sampleOnChainResponse(),
      market: sampleMarketResponse(),
      comments: [sampleCommentResponse()],
    });
  }) as typeof fetch;

  const response = await client.fetchMarketComments(sampleMarketId);

  assert.equal(response.market.id, sampleMarketId);
  assert.equal(response.comments[0]?.author.username, "sabi");
  assert.equal(response.comments[0]?.like_count, 3);
  assert.equal(response.comments[0]?.replies[0]?.parent_comment_id, sampleCommentId);
  assert.equal(
    String(calls[0].input),
    `http://127.0.0.1:8080/markets/${sampleMarketId}/comments`,
  );
  assert.equal(calls[0].init?.method, undefined);

  const headers = new Headers(calls[0].init?.headers);
  assert.equal(headers.get("Accept"), "application/json");
});

test("createMarketComment posts an authenticated payload to /markets/{market_id}/comments", async () => {
  const client = createCommentClient({ baseUrl: apiBaseUrl });

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });

    return jsonResponse({
      event: sampleEventResponse(),
      on_chain: sampleOnChainResponse(),
      market: sampleMarketResponse(),
      comment: sampleCommentResponse(),
    });
  }) as typeof fetch;

  const response = await client.createMarketComment("session-token", sampleMarketId, {
    comment: {
      body: "Market structure looks bullish.",
    },
  });

  assert.equal(response.comment.body, "Market structure looks bullish.");
  assert.equal(
    String(calls[0].input),
    `http://127.0.0.1:8080/markets/${sampleMarketId}/comments`,
  );
  assert.equal(calls[0].init?.method, "POST");

  const headers = new Headers(calls[0].init?.headers);
  assert.equal(headers.get("Authorization"), "Bearer session-token");
  assert.equal(headers.get("Accept"), "application/json");
  assert.equal(headers.get("Content-Type"), "application/json");
  assert.equal(
    calls[0].init?.body,
    JSON.stringify({
      comment: {
        body: "Market structure looks bullish.",
      },
    }),
  );
});

test("createMarketCommentReply posts an authenticated payload to /markets/{market_id}/comments/{comment_id}/replies", async () => {
  const client = createCommentClient({ baseUrl: apiBaseUrl });

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });

    return jsonResponse({
      event: sampleEventResponse(),
      on_chain: sampleOnChainResponse(),
      market: sampleMarketResponse(),
      comment: {
        ...sampleCommentResponse().replies[0],
      },
    });
  }) as typeof fetch;

  const response = await client.createMarketCommentReply(
    "session-token",
    sampleMarketId,
    sampleCommentId,
    {
      comment: {
        body: "Agreed, flows look strong.",
      },
    },
  );

  assert.equal(response.comment.parent_comment_id, sampleCommentId);
  assert.equal(
    String(calls[0].input),
    `http://127.0.0.1:8080/markets/${sampleMarketId}/comments/${sampleCommentId}/replies`,
  );
  assert.equal(calls[0].init?.method, "POST");

  const headers = new Headers(calls[0].init?.headers);
  assert.equal(headers.get("Authorization"), "Bearer session-token");
  assert.equal(headers.get("Content-Type"), "application/json");
  assert.equal(
    calls[0].init?.body,
    JSON.stringify({
      comment: {
        body: "Agreed, flows look strong.",
      },
    }),
  );
});

test("likeComment posts to /comments/{comment_id}/likes", async () => {
  const client = createCommentClient({ baseUrl: apiBaseUrl });

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    return jsonResponse(sampleCommentLikeResponse());
  }) as typeof fetch;

  const response = await client.likeComment("session-token", sampleCommentId);

  assert.equal(response.comment_id, sampleCommentId);
  assert.equal(response.liked, true);
  assert.equal(
    String(calls[0].input),
    `http://127.0.0.1:8080/comments/${sampleCommentId}/likes`,
  );
  assert.equal(calls[0].init?.method, "POST");

  const headers = new Headers(calls[0].init?.headers);
  assert.equal(headers.get("Authorization"), "Bearer session-token");
  assert.equal(headers.get("Accept"), "application/json");
});

test("unlikeComment deletes /comments/{comment_id}/likes", async () => {
  const client = createCommentClient({ baseUrl: apiBaseUrl });

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    return jsonResponse({
      ...sampleCommentLikeResponse(),
      like_count: 3,
      liked: false,
    });
  }) as typeof fetch;

  const response = await client.unlikeComment("session-token", sampleCommentId);

  assert.equal(response.comment_id, sampleCommentId);
  assert.equal(response.liked, false);
  assert.equal(
    String(calls[0].input),
    `http://127.0.0.1:8080/comments/${sampleCommentId}/likes`,
  );
  assert.equal(calls[0].init?.method, "DELETE");

  const headers = new Headers(calls[0].init?.headers);
  assert.equal(headers.get("Authorization"), "Bearer session-token");
  assert.equal(headers.get("Accept"), "application/json");
});

test("createMarketComment surfaces backend error messages as ApiError instances", async () => {
  const client = createCommentClient({ baseUrl: apiBaseUrl });

  globalThis.fetch = (async () => {
    return jsonResponse({ error: "comment.body is required" }, 400);
  }) as typeof fetch;

  await assert.rejects(
    () =>
      client.createMarketComment("session-token", sampleMarketId, {
        comment: {
          body: "",
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 400);
      assert.equal(error.message, "comment.body is required");
      return true;
    },
  );
});
