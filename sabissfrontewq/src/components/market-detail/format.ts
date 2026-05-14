import type {
  MarketOrderbookResponse,
  MarketPriceHistoryResponse,
  MarketResponse,
  OrderbookLevelResponse,
} from "~/lib/market/types.ts";
import { formatSlugLabel } from "~/lib/market/view.ts";
import type { OutcomeQuote } from "./types.ts";

export function buildEventHref(eventSlug: string): string {
  return `/event/${encodeURIComponent(eventSlug)}`;
}

export function buildMarketHref(eventSlug: string, marketSlug: string): string {
  return buildEventHref(eventSlug);
}

export function buildOutcomeHref(
  eventSlug: string,
  marketSlug: string,
  outcomeIndex: number,
): string {
  return buildEventHref(eventSlug);
}

export function compareMarkets(left: MarketResponse, right: MarketResponse): number {
  if (left.sort_order !== right.sort_order) {
    return left.sort_order - right.sort_order;
  }

  return left.end_time.localeCompare(right.end_time);
}

export function formatStatusLabel(value: string): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    return "Unknown";
  }

  return normalized
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map(token => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

export function formatShortDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "TBD";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

export function formatLongDate(value: string | null): string {
  if (!value) {
    return "TBD";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "TBD";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatRelativeTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Just now";
  }

  const deltaMs = date.getTime() - Date.now();
  const deltaMinutes = Math.round(deltaMs / 60000);
  const formatter = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });

  if (Math.abs(deltaMinutes) < 60) {
    return formatter.format(deltaMinutes, "minute");
  }

  const deltaHours = Math.round(deltaMinutes / 60);

  if (Math.abs(deltaHours) < 24) {
    return formatter.format(deltaHours, "hour");
  }

  const deltaDays = Math.round(deltaHours / 24);
  return formatter.format(deltaDays, "day");
}

function clampProbability(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function resolveMarketLabel(label: string, question: string, endTime: string): string {
  const trimmedLabel = label.trim();

  if (trimmedLabel.length > 0) {
    return trimmedLabel;
  }

  const trimmedQuestion = question.trim();

  if (trimmedQuestion.length > 0) {
    return trimmedQuestion;
  }

  return formatShortDate(endTime);
}

export function resolveMarketPillLabel(label: string, endTime: string): string {
  const trimmedLabel = label.trim();

  if (trimmedLabel.length > 0) {
    return trimmedLabel;
  }

  return formatShortDate(endTime);
}

export function formatCents(price: number | null): string {
  if (price === null || Number.isNaN(price)) {
    return "--";
  }

  const cents = price * 100;
  const rounded = Number(cents.toFixed(cents < 10 ? 1 : 0));
  return `${rounded}¢`;
}

export function formatProbability(price: number | null): string {
  if (price === null || Number.isNaN(price)) {
    return "--";
  }

  return `${Math.round(price * 100)}%`;
}

export function formatProbabilityFromBps(value: number | null | undefined): string | null {
  const price = normalizeBpsPrice(value);

  if (price === null) {
    return null;
  }

  const percent = price * 100;

  if (percent > 0 && percent < 1) {
    return "<1%";
  }

  return `${Math.round(percent)}%`;
}

export function formatUsdVolume(
  value: string | null | undefined,
  compact = false,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = Number.parseFloat(value);

  if (!Number.isFinite(normalized) || normalized <= 0) {
    return null;
  }

  if (!compact) {
    return `$${normalized.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  if (normalized < 1000) {
    const fractionDigits = normalized < 10 ? 2 : normalized < 100 ? 1 : 0;
    return `$${normalized.toLocaleString("en-US", {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    })} vol`;
  }

  return `$${new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(normalized)} vol`;
}

function buildBestPriceByOutcome(
  levels: readonly OrderbookLevelResponse[],
  prefersCandidate: (candidate: number, current: number) => boolean,
): Map<number, number> {
  const bestPriceByOutcome = new Map<number, number>();

  for (const level of levels) {
    const currentBest = bestPriceByOutcome.get(level.outcome_index);

    if (currentBest === undefined || prefersCandidate(level.price, currentBest)) {
      bestPriceByOutcome.set(level.outcome_index, level.price);
    }
  }

  return bestPriceByOutcome;
}

function buildLatestHistoryPriceByOutcome(
  history: MarketPriceHistoryResponse | null,
): Map<number, number> | null {
  if (!history) {
    return null;
  }

  if ((history.history?.length ?? 0) > 0) {
    let latestSample: { price: number; timestamp: number } | null = null;

    for (const point of history.history ?? []) {
      const timestamp = point.t * 1000;

      if (!Number.isFinite(timestamp) || !Number.isFinite(point.p)) {
        continue;
      }

      if (!latestSample || timestamp >= latestSample.timestamp) {
        latestSample = {
          price: clampProbability(point.p),
          timestamp,
        };
      }
    }

    if (latestSample) {
      const yesPrice = latestSample.price;
      return new Map<number, number>([
        [0, yesPrice],
        [1, clampProbability(1 - yesPrice)],
      ]);
    }
  }

  const latestPriceByOutcome = new Map<number, { price: number; timestamp: number }>();

  for (const point of history.points) {
    const timestamp = Date.parse(point.timestamp);
    const current = latestPriceByOutcome.get(point.outcome_index);

    if (!current || timestamp >= current.timestamp) {
      latestPriceByOutcome.set(point.outcome_index, {
        price: point.price,
        timestamp,
      });
    }
  }

  if (latestPriceByOutcome.size === 0) {
    return null;
  }

  return new Map(
    [...latestPriceByOutcome.entries()].map(([outcomeIndex, snapshot]) => [
      outcomeIndex,
      snapshot.price,
    ]),
  );
}

function normalizeBpsPrice(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  if (value < 0 || value > 10_000) {
    return null;
  }

  return value / 10_000;
}

function buildCurrentPriceByOutcome(
  market: MarketResponse,
): Map<number, number> | null {
  const yesPrice = normalizeBpsPrice(market.current_prices?.yes_bps);
  const noPrice = normalizeBpsPrice(market.current_prices?.no_bps);

  if (yesPrice === null && noPrice === null) {
    return null;
  }

  const priceByOutcome = new Map<number, number>();

  if (yesPrice !== null) {
    priceByOutcome.set(0, yesPrice);
  }

  if (noPrice !== null) {
    priceByOutcome.set(1, noPrice);
  }

  return priceByOutcome;
}

export function buildOutcomeQuotes(
  market: MarketResponse,
  orderbook: MarketOrderbookResponse | null,
  priceHistory: MarketPriceHistoryResponse | null,
  labels: readonly string[],
  eventSlug: string,
  marketSlug: string,
): OutcomeQuote[] {
  const bestAskByOutcome = orderbook
    ? buildBestPriceByOutcome(orderbook.asks, (candidate, current) => candidate < current)
    : null;
  const bestBidByOutcome = orderbook
    ? buildBestPriceByOutcome(orderbook.bids, (candidate, current) => candidate > current)
    : null;
  const currentPriceByOutcome = buildCurrentPriceByOutcome(market);
  const latestHistoryPriceByOutcome = buildLatestHistoryPriceByOutcome(priceHistory);

  return labels.map((label, outcomeIndex) => {
    const price =
      bestAskByOutcome?.get(outcomeIndex) ??
      bestBidByOutcome?.get(outcomeIndex) ??
      currentPriceByOutcome?.get(outcomeIndex) ??
      latestHistoryPriceByOutcome?.get(outcomeIndex) ??
      null;

    return {
      outcomeIndex,
      label,
      price,
      centsLabel: formatCents(price),
      probabilityLabel: formatProbability(price),
      href: buildOutcomeHref(eventSlug, marketSlug, outcomeIndex),
    };
  });
}

export function describeActivityType(activityType: string): string {
  return formatSlugLabel(activityType.replace(/[_\s]+/g, "-"));
}
