import assert from "node:assert/strict";
import test from "node:test";

import { buildEventHref, buildMarketHref, buildOutcomeHref, buildOutcomeQuotes } from "./format.ts";

test("event detail hrefs stay event-scoped and omit the default outcome query", () => {
  const eventSlug = "what-will-wti-crude-oil-hit-in-april-2026";
  const marketSlug = "what-will-wti-crude-oil-hit-in-april-2026-up-90";

  assert.equal(buildEventHref(eventSlug), `/event/${eventSlug}`);
  assert.equal(buildMarketHref(eventSlug, marketSlug), `/event/${eventSlug}`);
  assert.equal(buildOutcomeHref(eventSlug, marketSlug, 0), `/event/${eventSlug}`);
  assert.equal(buildOutcomeHref(eventSlug, marketSlug, 1), `/event/${eventSlug}`);
});

test("current_prices provide fallback quotes when orderbook data is unavailable", () => {
  const eventSlug = "what-will-wti-crude-oil-hit-in-april-2026";
  const marketSlug = "what-will-wti-crude-oil-hit-in-april-2026-up-200";
  const quotes = buildOutcomeQuotes(
    {
      id: "market-1",
      slug: marketSlug,
      label: "Up 200",
      question: "Will WTI hit $200?",
      question_id: "question-1",
      condition_id: "condition-1",
      market_type: "binary",
      outcomes: ["Yes", "No"],
      end_time: "2026-05-01T00:00:00Z",
      sort_order: 1,
      publication_status: "published",
      trading_status: "active",
      current_prices: {
        yes_bps: 290,
        no_bps: 9710,
      },
    },
    null,
    null,
    ["Yes", "No"],
    eventSlug,
    marketSlug,
  );

  assert.equal(quotes[0]?.price, 0.029);
  assert.equal(quotes[0]?.probabilityLabel, "3%");
  assert.equal(quotes[0]?.centsLabel, "2.9¢");
  assert.equal(quotes[1]?.price, 0.971);
  assert.equal(quotes[1]?.probabilityLabel, "97%");
  assert.equal(quotes[1]?.centsLabel, "97¢");
});

test("orderbook quotes still win over current_prices when both are present", () => {
  const quotes = buildOutcomeQuotes(
    {
      id: "market-1",
      slug: "what-will-wti-crude-oil-hit-in-april-2026-up-200",
      label: "Up 200",
      question: "Will WTI hit $200?",
      question_id: "question-1",
      condition_id: "condition-1",
      market_type: "binary",
      outcomes: ["Yes", "No"],
      end_time: "2026-05-01T00:00:00Z",
      sort_order: 1,
      publication_status: "published",
      trading_status: "active",
      current_prices: {
        yes_bps: 290,
        no_bps: 9710,
      },
    },
    {
      market_id: "market-1",
      condition_id: "condition-1",
      source: "clob",
      as_of: "2026-04-03T12:00:00Z",
      spread_bps: 0,
      last_trade_yes_bps: 310,
      bids: [],
      asks: [
        {
          outcome_index: 0,
          outcome_label: "Yes",
          price_bps: 310,
          price: 0.031,
          quantity: 100,
          shares: "100",
          notional_usd: "3.1",
        },
        {
          outcome_index: 1,
          outcome_label: "No",
          price_bps: 9680,
          price: 0.968,
          quantity: 100,
          shares: "100",
          notional_usd: "96.8",
        },
      ],
    },
    null,
    ["Yes", "No"],
    "what-will-wti-crude-oil-hit-in-april-2026",
    "what-will-wti-crude-oil-hit-in-april-2026-up-200",
  );

  assert.equal(quotes[0]?.price, 0.031);
  assert.equal(quotes[0]?.centsLabel, "3.1¢");
  assert.equal(quotes[1]?.price, 0.968);
  assert.equal(quotes[1]?.centsLabel, "97¢");
});

test("history series provides quote fallbacks when only simplified history is available", () => {
  const eventSlug = "what-will-wti-crude-oil-hit-in-april-2026";
  const marketSlug = "what-will-wti-crude-oil-hit-in-april-2026-up-200";
  const quotes = buildOutcomeQuotes(
    {
      id: "market-1",
      slug: marketSlug,
      label: "Up 200",
      question: "Will WTI hit $200?",
      question_id: "question-1",
      condition_id: "condition-1",
      market_type: "binary",
      outcomes: ["Yes", "No"],
      end_time: "2026-05-01T00:00:00Z",
      sort_order: 1,
      publication_status: "published",
      trading_status: "active",
      current_prices: null,
    },
    null,
    {
      market_id: "market-1",
      condition_id: "condition-1",
      source: "order_fill_history",
      interval: "15m",
      history: [
        {
          t: 1774976415,
          p: 0.025,
        },
      ],
      points: [],
    },
    ["Yes", "No"],
    eventSlug,
    marketSlug,
  );

  assert.equal(quotes[0]?.price, 0.025);
  assert.equal(quotes[0]?.centsLabel, "2.5¢");
  assert.equal(quotes[1]?.price, 0.975);
  assert.equal(quotes[1]?.centsLabel, "98¢");
});
