import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import {
  ApiError,
  createFaucetClient,
  formatUsdcBaseUnits,
  parseUsdcAmountInput,
} from "./faucet/index.ts";

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

test("requestUsdc posts the faucet payload to /faucet/usdc", async () => {
  const client = createFaucetClient({ baseUrl: `${apiBaseUrl}/` });

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });

    return jsonResponse({
      token_address: "0x79ef818716d0355ccef64506234053b503ff96b0",
      recipient: "0x0000000000000000000000000000000000000123",
      amount: "1000000",
      tx_hash: "0xdeadbeef",
      requested_at: "2026-04-06T14:22:00Z",
    });
  }) as typeof fetch;

  const response = await client.requestUsdc({
    address: "0x0000000000000000000000000000000000000123",
    amount: "1000000",
  });

  assert.equal(response.recipient, "0x0000000000000000000000000000000000000123");
  assert.equal(response.amount, "1000000");
  assert.equal(String(calls[0].input), "http://127.0.0.1:8080/faucet/usdc");
  assert.equal(calls[0].init?.method, "POST");

  const headers = new Headers(calls[0].init?.headers);
  assert.equal(headers.get("Accept"), "application/json");
  assert.equal(headers.get("Content-Type"), "application/json");
  assert.equal(
    calls[0].init?.body,
    JSON.stringify({
      address: "0x0000000000000000000000000000000000000123",
      amount: "1000000",
    }),
  );
});

test("fetchUsdcBalance sends GET /faucet/usdc/balance with the wallet address query", async () => {
  const client = createFaucetClient({ baseUrl: `${apiBaseUrl}/` });

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });

    return jsonResponse({
      token_address: "0x79ef818716d0355ccef64506234053b503ff96b0",
      address: "0x0000000000000000000000000000000000000123",
      balance: "25000000",
      queried_at: "2026-04-06T23:55:00Z",
    });
  }) as typeof fetch;

  const response = await client.fetchUsdcBalance(
    "0x0000000000000000000000000000000000000123",
  );

  assert.equal(response.balance, "25000000");
  assert.equal(
    String(calls[0].input),
    "http://127.0.0.1:8080/faucet/usdc/balance?address=0x0000000000000000000000000000000000000123",
  );
  assert.equal(calls[0].init?.method, undefined);

  const headers = new Headers(calls[0].init?.headers);
  assert.equal(headers.get("Accept"), "application/json");
});

test("requestUsdc surfaces backend error messages as ApiError instances", async () => {
  const client = createFaucetClient({ baseUrl: apiBaseUrl });

  globalThis.fetch = (async () => {
    return jsonResponse({ error: "amount must be greater than zero" }, 400);
  }) as typeof fetch;

  await assert.rejects(
    () =>
      client.requestUsdc({
        address: "0x0000000000000000000000000000000000000123",
        amount: "0",
      }),
    (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 400);
      assert.equal(error.message, "amount must be greater than zero");
      return true;
    },
  );
});

test("parseUsdcAmountInput converts human-readable USDC values to base units", () => {
  assert.deepEqual(parseUsdcAmountInput("10.25"), {
    baseUnits: "10250000",
    displayAmount: "10.25",
  });

  assert.deepEqual(parseUsdcAmountInput(".5"), {
    baseUnits: "500000",
    displayAmount: "0.5",
  });

  assert.deepEqual(parseUsdcAmountInput("10."), {
    baseUnits: "10000000",
    displayAmount: "10",
  });
});

test("parseUsdcAmountInput rejects zero and invalid precision", () => {
  assert.throws(() => parseUsdcAmountInput("0"), /Amount must be greater than zero/);
  assert.throws(
    () => parseUsdcAmountInput("1.1234567"),
    /Amount must be a valid USDC value with up to 6 decimals/,
  );
});

test("formatUsdcBaseUnits renders backend faucet amounts as human-readable USDC", () => {
  assert.equal(formatUsdcBaseUnits("10000000"), "10");
  assert.equal(formatUsdcBaseUnits("10250000"), "10.25");
  assert.equal(formatUsdcBaseUnits("500000"), "0.5");
  assert.equal(formatUsdcBaseUnits("1"), "0.000001");
});
