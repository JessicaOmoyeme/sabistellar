import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { createConfigClient } from "./config/index.ts";

const apiBaseUrl = "http://127.0.0.1:8080";

interface FetchCall {
  input: RequestInfo | URL;
  init?: RequestInit;
}

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

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("fetchContractsConfig sends GET /config/contracts", async () => {
  const client = createConfigClient({ baseUrl: `${apiBaseUrl}/` });

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });

    return jsonResponse({
      chain_id: 10143,
      contracts: {
        conditional_tokens: "0x1000",
        usdc: "0x2000",
        market_factory: "0x3000",
        liquidity_manager: "0x4000",
        pool_exchange: "0x5000",
        orderbook_exchange: "0x6000",
        redemption: "0x7000",
        neg_risk_adapter: "0x8000",
      },
    });
  }) as typeof fetch;

  const response = await client.fetchContractsConfig();

  assert.equal(response.chain_id, 10143);
  assert.equal(response.contracts.orderbook_exchange, "0x6000");
  assert.equal(String(calls[0].input), "http://127.0.0.1:8080/config/contracts");
  assert.equal(calls[0].init?.method, undefined);

  const headers = new Headers(calls[0].init?.headers);
  assert.equal(headers.get("Accept"), "application/json");
});
