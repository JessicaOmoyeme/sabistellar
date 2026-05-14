import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  onCleanup,
  onMount,
  Show,
  Switch,
} from "solid-js";
import { curveMonotoneX } from "@visx/curve";
import { scaleLinear, scaleTime } from "@visx/scale";
import { line as buildLinePath } from "@visx/shape";

import { marketClient } from "~/lib/market/index.ts";
import type {
  MarketOrderbookResponse,
  MarketPriceHistoryInterval,
  MarketPriceHistoryResponse,
  MarketTradesResponse,
  OrderbookLevelResponse,
} from "~/lib/market/types.ts";

import { ClockIcon, ExpandChartIcon, SettingsGearIcon, TrendTriangleIcon } from "./icons.tsx";
import { formatCents, formatLongDate } from "./format.ts";
import type { EventMarketListItem } from "./types.ts";

type MarketPricePanelTab = "graph" | "orderbook";
type ChartRangeKey = "1H" | "6H" | "1D" | "1W" | "1M" | "ALL";

interface ChartRangeConfig {
  label: ChartRangeKey;
  interval: MarketPriceHistoryInterval;
  limit: number;
}

interface ChartPoint {
  timestamp: number;
  price: number;
}

interface MarketPricePanelProps {
  market: EventMarketListItem;
  question: string;
  status: string;
  volumeLabel: string | null;
  endsAt: string;
  orderbook: MarketOrderbookResponse | null;
  priceHistory: MarketPriceHistoryResponse | null;
  selectedOutcomeIndex: number;
  onSelectOutcome: (outcomeIndex: number) => void;
}

interface HoveredChartState {
  timestamp: number;
  x: number;
}

interface ChartMetrics {
  width: number;
  height: number;
  plotLeft: number;
  plotRight: number;
  plotTop: number;
  plotBottom: number;
  xScale: ReturnType<typeof scaleTime>;
  yScale: ReturnType<typeof scaleLinear>;
  xTicks: Date[];
  yTicks: number[];
  primaryPath: string;
  secondaryPath: string;
}

const CHART_HEIGHT = 320;
const CHART_DEFAULT_WIDTH = 760;

const chartRanges: readonly ChartRangeConfig[] = [
  { label: "1H", interval: "5m", limit: 24 },
  { label: "6H", interval: "5m", limit: 96 },
  { label: "1D", interval: "15m", limit: 96 },
  { label: "1W", interval: "1h", limit: 168 },
  { label: "1M", interval: "4h", limit: 180 },
  { label: "ALL", interval: "4h", limit: 240 },
];

function parseNumericValue(value: string | number | null | undefined): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampProbability(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function buildOutcomeChartPoints(
  history: MarketPriceHistoryResponse | null,
  outcomeIndex: number,
): ChartPoint[] {
  if (!history) {
    return [];
  }

  if ((history.history?.length ?? 0) > 0 && (outcomeIndex === 0 || outcomeIndex === 1)) {
    return [...(history.history ?? [])]
      .map(point => ({
        timestamp: point.t * 1000,
        price: clampProbability(outcomeIndex === 0 ? point.p : 1 - point.p),
      }))
      .filter(point => Number.isFinite(point.timestamp) && Number.isFinite(point.price))
      .sort((left, right) => left.timestamp - right.timestamp);
  }

  const directPoints = history.points
    .filter(point => point.outcome_index === outcomeIndex)
    .map(point => ({
      timestamp: Date.parse(point.timestamp),
      price: clampProbability(point.price),
    }))
    .filter(point => Number.isFinite(point.timestamp) && Number.isFinite(point.price))
    .sort((left, right) => left.timestamp - right.timestamp);

  if (directPoints.length > 0) {
    return directPoints;
  }

  const complementIndex = outcomeIndex === 0 ? 1 : 0;
  const complementPoints = history.points
    .filter(point => point.outcome_index === complementIndex)
    .map(point => ({
      timestamp: Date.parse(point.timestamp),
      price: clampProbability(1 - point.price),
    }))
    .filter(point => Number.isFinite(point.timestamp) && Number.isFinite(point.price))
    .sort((left, right) => left.timestamp - right.timestamp);

  return complementPoints;
}

function buildHistoryCacheKey(marketId: string, range: ChartRangeKey): string {
  return `${marketId}:${range}`;
}

function getRangeWindowMs(range: ChartRangeKey): number | null {
  switch (range) {
    case "1H":
      return 60 * 60 * 1000;
    case "6H":
      return 6 * 60 * 60 * 1000;
    case "1D":
      return 24 * 60 * 60 * 1000;
    case "1W":
      return 7 * 24 * 60 * 60 * 1000;
    case "1M":
      return 30 * 24 * 60 * 60 * 1000;
    case "ALL":
    default:
      return null;
  }
}

function buildOutcomeTradePoints(
  trades: MarketTradesResponse | null,
  outcomeIndex: number,
  range: ChartRangeKey,
): ChartPoint[] {
  if (!trades) {
    return [];
  }

  const points = trades.trades
    .map(trade => ({
      timestamp: Date.parse(trade.executed_at),
      price: clampProbability(outcomeIndex === 0 ? trade.yes_price : trade.no_price),
    }))
    .filter(point => Number.isFinite(point.timestamp) && Number.isFinite(point.price))
    .sort((left, right) => left.timestamp - right.timestamp);

  if (points.length === 0) {
    return [];
  }

  const windowMs = getRangeWindowMs(range);

  if (windowMs === null) {
    return points;
  }

  const cutoff = points[points.length - 1]!.timestamp - windowMs;
  return points.filter(point => point.timestamp >= cutoff);
}

function selectPreferredChartPoints(
  historyPoints: readonly ChartPoint[],
  tradePoints: readonly ChartPoint[],
): ChartPoint[] {
  if (historyPoints.length >= 2) {
    return [...historyPoints];
  }

  if (tradePoints.length >= 2) {
    return [...tradePoints];
  }

  if (historyPoints.length > 0) {
    return [...historyPoints];
  }

  return [...tradePoints];
}

function formatCompactNumber(value: number): string {
  const maximumFractionDigits = value >= 1000 ? 0 : value >= 100 ? 1 : 2;

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
  }).format(value);
}

function formatMoney(value: number | null): string {
  if (value === null) {
    return "--";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value >= 100 ? 0 : 2,
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

function formatAxisPercent(value: number): string {
  const percent = value * 100;

  if (percent > 0 && percent < 1) {
    return "<1%";
  }

  const rounded =
    Math.abs(percent) >= 10 ? Math.round(percent) : Math.round(percent * 10) / 10;

  return `${rounded}%`;
}

function formatProbabilityValue(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return "--";
  }

  const percent = value * 100;

  if (percent > 0 && percent < 1) {
    return "<1";
  }

  const rounded =
    Math.abs(percent) >= 10 ? Math.round(percent) : Math.round(percent * 10) / 10;

  return String(rounded);
}

function formatChangeMagnitude(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return "0";
  }

  const percentagePoints = Math.abs(value * 100);

  if (percentagePoints >= 10) {
    return String(Math.round(percentagePoints));
  }

  return String(Math.round(percentagePoints * 10) / 10);
}

function formatChartTickLabel(timestamp: number, spanMs: number): string {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const options: Intl.DateTimeFormatOptions =
    spanMs <= 6 * 60 * 60 * 1000
      ? { hour: "numeric", minute: "2-digit" }
      : spanMs <= 24 * 60 * 60 * 1000
        ? { hour: "numeric" }
        : spanMs <= 31 * 24 * 60 * 60 * 1000
          ? { month: "short", day: "numeric" }
          : { month: "short", year: "2-digit" };

  return new Intl.DateTimeFormat("en-US", options).format(date);
}

function formatChartHoverTimestamp(timestamp: number, spanMs: number): string {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  };

  return new Intl.DateTimeFormat("en-US", options).format(date);
}

function findNearestPointByTimestamp(
  points: readonly ChartPoint[],
  timestamp: number,
): ChartPoint | null {
  if (points.length === 0) {
    return null;
  }

  return points.reduce((closest, point) =>
    Math.abs(point.timestamp - timestamp) < Math.abs(closest.timestamp - timestamp)
      ? point
      : closest,
  );
}

function buildProbabilityDomain(
  points: readonly ChartPoint[],
  autoscaleEnabled: boolean,
): [number, number] {
  if (!autoscaleEnabled || points.length === 0) {
    return [0, 1];
  }

  let min = 1;
  let max = 0;

  for (const point of points) {
    min = Math.min(min, point.price);
    max = Math.max(max, point.price);
  }

  const span = max - min;
  const padding = span < 0.02 ? 0.05 : Math.min(0.12, span * 0.18);
  const domainMin = clampProbability(min - padding);
  const domainMax = clampProbability(max + padding);

  if (domainMin === domainMax) {
    return [clampProbability(domainMin - 0.05), clampProbability(domainMax + 0.05)];
  }

  return [domainMin, domainMax];
}

function buildTimeDomain(points: readonly ChartPoint[]): [Date, Date] {
  if (points.length === 0) {
    const now = Date.now();
    return [new Date(now - 60 * 60 * 1000), new Date(now)];
  }

  const first = points[0]!.timestamp;
  const last = points[points.length - 1]!.timestamp;

  if (first === last) {
    return [new Date(first - 30 * 60 * 1000), new Date(last + 30 * 60 * 1000)];
  }

  return [new Date(first), new Date(last)];
}

function formatShares(level: OrderbookLevelResponse): string {
  const parsedShares = parseNumericValue(level.shares);
  const value = parsedShares ?? level.quantity;

  if (!Number.isFinite(value)) {
    return "--";
  }

  return formatCompactNumber(value);
}

function formatOrderbookTotal(level: OrderbookLevelResponse): string {
  return formatMoney(parseNumericValue(level.notional_usd));
}

function getLastTradePrice(
  orderbook: MarketOrderbookResponse | null,
  outcomeIndex: number,
): number | null {
  if (!orderbook || !Number.isFinite(orderbook.last_trade_yes_bps)) {
    return null;
  }

  const yesPrice = clampProbability(orderbook.last_trade_yes_bps / 10_000);

  if (outcomeIndex === 0) {
    return yesPrice;
  }

  if (outcomeIndex === 1) {
    return clampProbability(1 - yesPrice);
  }

  return null;
}

function sortBookSide(
  levels: readonly OrderbookLevelResponse[],
  direction: "asks" | "bids",
): OrderbookLevelResponse[] {
  return [...levels].sort((left, right) =>
    direction === "asks" ? right.price - left.price : right.price - left.price,
  );
}

function ChartToggleRow(props: {
  label: string;
  checked: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      class="pm-market-chart__settings-row"
      onClick={() => props.onToggle(!props.checked)}
    >
      <span class="pm-market-chart__settings-label">{props.label}</span>
      <span
        classList={{
          "pm-market-chart__settings-switch": true,
          "pm-market-chart__settings-switch--on": props.checked,
        }}
      >
        <span class="pm-market-chart__settings-switch-thumb" />
      </span>
    </button>
  );
}

export default function MarketPricePanel(props: MarketPricePanelProps) {
  const [activeTab, setActiveTab] = createSignal<MarketPricePanelTab>("graph");
  const [activeRange, setActiveRange] = createSignal<ChartRangeKey>("1D");
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [autoscale, setAutoscale] = createSignal(true);
  const [xAxisVisible, setXAxisVisible] = createSignal(true);
  const [yAxisVisible, setYAxisVisible] = createSignal(true);
  const [horizontalGridVisible, setHorizontalGridVisible] = createSignal(true);
  const [verticalGridVisible, setVerticalGridVisible] = createSignal(false);
  const [annotationsVisible, setAnnotationsVisible] = createSignal(true);
  const [showBothOutcomes, setShowBothOutcomes] = createSignal(false);
  const [historyCache, setHistoryCache] = createSignal<
    Record<string, MarketPriceHistoryResponse | null | undefined>
  >({});
  const [tradesCache, setTradesCache] = createSignal<
    Record<string, MarketTradesResponse | null | undefined>
  >({});
  const [chartLoading, setChartLoading] = createSignal(false);
  const [chartError, setChartError] = createSignal<string | null>(null);
  const [hoveredChartState, setHoveredChartState] = createSignal<HoveredChartState | null>(null);
  const [chartViewportWidth, setChartViewportWidth] = createSignal(0);
  let historyRequestVersion = 0;
  let tradesRequestVersion = 0;
  let chartResizeObserver: ResizeObserver | null = null;
  let chartFrameRef: HTMLDivElement | undefined;

  const selectedQuote = createMemo(
    () => props.market.quotes[props.selectedOutcomeIndex] ?? props.market.quotes[0] ?? null,
  );
  const historyCacheKey = createMemo(() =>
    buildHistoryCacheKey(props.market.id, activeRange()),
  );
  const seededActiveHistory = createMemo(() =>
    activeRange() === "1D" ? props.priceHistory : null,
  );
  const activeHistory = createMemo(
    () => historyCache()[historyCacheKey()] ?? seededActiveHistory() ?? null,
  );
  const activeTrades = createMemo(() => tradesCache()[props.market.id] ?? null);
  const selectedOutcomeIndex = createMemo(() => selectedQuote()?.outcomeIndex ?? 0);
  const chartTone = createMemo(() => (selectedOutcomeIndex() === 0 ? "yes" : "no"));
  const primaryHistoryPoints = createMemo<ChartPoint[]>(() =>
    buildOutcomeChartPoints(activeHistory(), selectedOutcomeIndex()),
  );
  const primaryTradePoints = createMemo<ChartPoint[]>(() =>
    buildOutcomeTradePoints(activeTrades(), selectedOutcomeIndex(), activeRange()),
  );
  const primaryChartPoints = createMemo<ChartPoint[]>(() =>
    selectPreferredChartPoints(primaryHistoryPoints(), primaryTradePoints()),
  );
  const secondaryChartPoints = createMemo<ChartPoint[]>(() => {
    if (!showBothOutcomes() || props.market.quotes.length < 2) {
      return [];
    }

    const alternateOutcome = selectedOutcomeIndex() === 0 ? 1 : 0;
    const tradePoints = buildOutcomeTradePoints(activeTrades(), alternateOutcome, activeRange());
    const historyPoints = buildOutcomeChartPoints(activeHistory(), alternateOutcome);

    return selectPreferredChartPoints(historyPoints, tradePoints);
  });
  const chartSummary = createMemo(() => {
    const points = primaryChartPoints();
    const latestPoint = points[points.length - 1];
    const firstPoint = points[0];
    const currentPrice = latestPoint?.price ?? selectedQuote()?.price ?? null;
    const change =
      latestPoint && firstPoint ? latestPoint.price - firstPoint.price : null;

    return {
      currentPrice,
      change,
    };
  });
  const chartSpanMs = createMemo(() => {
    const points = primaryChartPoints();

    if (points.length < 2) {
      return 24 * 60 * 60 * 1000;
    }

    return Math.max(points[points.length - 1]!.timestamp - points[0]!.timestamp, 1);
  });
  const hoveredPrimaryPoint = createMemo<ChartPoint | null>(() => {
    const hoveredState = hoveredChartState();

    if (!hoveredState) {
      return null;
    }

    return findNearestPointByTimestamp(primaryChartPoints(), hoveredState.timestamp);
  });
  const hoveredSecondaryPoint = createMemo<ChartPoint | null>(() => {
    const hoveredState = hoveredChartState();

    if (!hoveredState || secondaryChartPoints().length === 0) {
      return null;
    }

    return findNearestPointByTimestamp(secondaryChartPoints(), hoveredState.timestamp);
  });
  const hoveredTooltip = createMemo(() => {
    const hoveredState = hoveredChartState();
    const point = hoveredPrimaryPoint();
    const width = chartViewportWidth();

    if (!annotationsVisible() || !hoveredState || !point || width <= 0) {
      return null;
    }

    const secondaryPoint = hoveredSecondaryPoint();
    const alignment =
      hoveredState.x / width < 0.2 ? "left" : hoveredState.x / width > 0.8 ? "right" : "center";

    return {
      point,
      secondaryPoint,
      leftPercent: (hoveredState.x / width) * 100,
      alignment,
      timestampLabel: formatChartHoverTimestamp(point.timestamp, chartSpanMs()),
    };
  });
  const chartMetrics = createMemo<ChartMetrics | null>(() => {
    const primaryPoints = primaryChartPoints();
    const secondaryPoints = showBothOutcomes() ? secondaryChartPoints() : [];

    if (primaryPoints.length === 0) {
      return null;
    }

    const width = chartViewportWidth() > 0 ? chartViewportWidth() : CHART_DEFAULT_WIDTH;
    const plotLeft = 12;
    const plotTop = 16;
    const plotRightPadding = yAxisVisible() ? 42 : 12;
    const plotBottomPadding = xAxisVisible() ? 28 : 12;
    const plotRight = Math.max(width - plotRightPadding, plotLeft + 48);
    const plotBottom = CHART_HEIGHT - plotBottomPadding;
    const visiblePoints = [...primaryPoints, ...secondaryPoints];
    const [timeDomainStart, timeDomainEnd] = buildTimeDomain(visiblePoints);
    const [probabilityDomainMin, probabilityDomainMax] = buildProbabilityDomain(
      visiblePoints,
      autoscale(),
    );
    const xScale = scaleTime({
      domain: [timeDomainStart, timeDomainEnd],
      range: [plotLeft, plotRight],
      round: true,
    });
    const yScale = scaleLinear({
      domain: [probabilityDomainMin, probabilityDomainMax],
      range: [plotBottom, plotTop],
      round: true,
    });
    const xTickCount = Math.max(2, Math.min(6, Math.round((plotRight - plotLeft) / 140)));
    const primaryPath =
      buildLinePath<ChartPoint>({
        x: point => xScale(new Date(point.timestamp)) ?? 0,
        y: point => yScale(point.price) ?? 0,
        curve: curveMonotoneX,
      })(primaryPoints) ?? "";
    const secondaryPath =
      buildLinePath<ChartPoint>({
        x: point => xScale(new Date(point.timestamp)) ?? 0,
        y: point => yScale(point.price) ?? 0,
        curve: curveMonotoneX,
      })(secondaryPoints) ?? "";

    return {
      width,
      height: CHART_HEIGHT,
      plotLeft,
      plotRight,
      plotTop,
      plotBottom,
      xScale,
      yScale,
      xTicks: xScale.ticks(xTickCount),
      yTicks: yScale.ticks(5),
      primaryPath,
      secondaryPath,
    };
  });
  const orderbookView = createMemo(() => {
    const outcomeIndex = selectedQuote()?.outcomeIndex ?? 0;
    const orderbook = props.orderbook;

    if (!orderbook) {
      return null;
    }

    const asks = sortBookSide(
      orderbook.asks.filter(level => level.outcome_index === outcomeIndex),
      "asks",
    );
    const bids = sortBookSide(
      orderbook.bids.filter(level => level.outcome_index === outcomeIndex),
      "bids",
    );
    const askTotal = asks.reduce(
      (total, level) => total + (parseNumericValue(level.notional_usd) ?? level.quantity * level.price),
      0,
    );
    const bidTotal = bids.reduce(
      (total, level) => total + (parseNumericValue(level.notional_usd) ?? level.quantity * level.price),
      0,
    );

    return {
      outcomeIndex,
      asks,
      bids,
      askTotal,
      bidTotal,
      lastTradePrice: getLastTradePrice(orderbook, outcomeIndex),
    };
  });

  createEffect(() => {
    props.market.id;
    setActiveTab("graph");
    setActiveRange("1D");
    setSettingsOpen(false);
    setChartError(null);
    setChartLoading(false);
    setHoveredChartState(null);
  });

  createEffect(() => {
    activeRange();
    props.selectedOutcomeIndex;
    setHoveredChartState(null);
  });

  createEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const marketId = props.market.id;
    const range = activeRange();
    const cacheKey = buildHistoryCacheKey(marketId, range);
    const cachedHistory = historyCache()[cacheKey];
    const config = chartRanges.find(candidate => candidate.label === range);

    if (!config) {
      return;
    }

    if (cachedHistory !== undefined) {
      setChartLoading(false);
      return;
    }

    const version = ++historyRequestVersion;

    setChartLoading(true);
    setChartError(null);

    void marketClient
      .fetchMarketPriceHistory(marketId, {
        interval: config.interval,
        limit: config.limit,
      })
      .then(history => {
        if (version !== historyRequestVersion) {
          return;
        }

        setHistoryCache(cache => ({
          ...cache,
          [cacheKey]: history,
        }));
        setChartLoading(false);
      })
      .catch(error => {
        if (version !== historyRequestVersion) {
          return;
        }

        setHistoryCache(cache => ({
          ...cache,
          [cacheKey]: null,
        }));
        setChartError(error instanceof Error ? error.message : "Unable to load chart data.");
        setChartLoading(false);
      });
  });

  createEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const marketId = props.market.id;
    const currentTrades = tradesCache()[marketId];

    if (currentTrades !== undefined) {
      return;
    }

    const version = ++tradesRequestVersion;

    void marketClient
      .fetchMarketTrades(marketId)
      .then(trades => {
        if (version !== tradesRequestVersion) {
          return;
        }

        setTradesCache(cache => ({
          ...cache,
          [marketId]: trades,
        }));
      })
      .catch(() => {
        if (version !== tradesRequestVersion) {
          return;
        }

        setTradesCache(cache => ({
          ...cache,
          [marketId]: null,
        }));
      });
  });
  createEffect(() => {
    if (!annotationsVisible() || primaryChartPoints().length === 0) {
      setHoveredChartState(null);
    }
  });

  const syncChartSize = () => {
    const nextWidth = chartFrameRef?.clientWidth ?? 0;

    if (nextWidth > 0) {
      setChartViewportWidth(nextWidth);
    }
  };

  onMount(() => {
    if (typeof window === "undefined" || !chartFrameRef) {
      return;
    }

    syncChartSize();
    chartResizeObserver = new ResizeObserver(() => syncChartSize());
    chartResizeObserver.observe(chartFrameRef);

    onCleanup(() => {
      chartResizeObserver?.disconnect();
      chartResizeObserver = null;
    });
  });

  const handleChartPointerMove = (event: PointerEvent & { currentTarget: SVGSVGElement }) => {
    const metrics = chartMetrics();

    if (!metrics || !annotationsVisible()) {
      setHoveredChartState(null);
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();

    if (bounds.width <= 0) {
      return;
    }

    const relativeX = ((event.clientX - bounds.left) / bounds.width) * metrics.width;
    const clampedX = Math.min(metrics.plotRight, Math.max(metrics.plotLeft, relativeX));
    const hoveredDate = metrics.xScale.invert(clampedX);
    const nearestPoint = findNearestPointByTimestamp(
      primaryChartPoints(),
      hoveredDate.getTime(),
    );

    if (!nearestPoint) {
      setHoveredChartState(null);
      return;
    }

    setHoveredChartState({
      timestamp: nearestPoint.timestamp,
      x: metrics.xScale(new Date(nearestPoint.timestamp)) ?? clampedX,
    });
  };

  const clearHoveredChartState = () => {
    setHoveredChartState(null);
  };

  const alternateQuote = createMemo(
    () =>
      props.market.quotes.find(quote => quote.outcomeIndex !== selectedOutcomeIndex()) ?? null,
  );

  return (
    <section class="pm-market-stage">
      <div class="pm-market-stage__header">
        <div class="pm-market-stage__market">
          <div class="pm-market-stage__copy">
            <p class="pm-market-stage__headline">{props.market.label}</p>
            <div class="pm-market-stage__meta">
              <Show when={props.volumeLabel}>
                <span>{props.volumeLabel}</span>
              </Show>
              <span>{formatLongDate(props.endsAt)}</span>
              <span>{props.status}</span>
            </div>
          </div>
        </div>

        <div class="pm-market-stage__primary-metric">
          <p class="pm-market-stage__metric-value">
            {selectedQuote()?.probabilityLabel ?? props.market.primaryMetric}
          </p>
        </div>

        <div class="pm-market-stage__quote-grid">
          <For each={props.market.quotes.slice(0, 2)}>
            {quote => (
              <button
                type="button"
                classList={{
                  "pm-market-stage__quote": true,
                  "pm-market-stage__quote--yes": quote.outcomeIndex === 0,
                  "pm-market-stage__quote--no": quote.outcomeIndex !== 0,
                  "pm-market-stage__quote--active":
                    quote.outcomeIndex === props.selectedOutcomeIndex,
                }}
                onClick={() => props.onSelectOutcome(quote.outcomeIndex)}
              >
                <span class="pm-market-stage__quote-label">Buy {quote.label}</span>
                <strong>{quote.centsLabel}</strong>
              </button>
            )}
          </For>
        </div>
      </div>

      <div class="pm-market-stage__toolbar">
        <div class="pm-market-stage__tabs" role="tablist" aria-label="Selected market views">
          <button
            type="button"
            classList={{
              "pm-market-stage__tab": true,
              "pm-market-stage__tab--active": activeTab() === "graph",
            }}
            onClick={() => setActiveTab("graph")}
          >
            Graph
          </button>
          <button
            type="button"
            classList={{
              "pm-market-stage__tab": true,
              "pm-market-stage__tab--active": activeTab() === "orderbook",
            }}
            onClick={() => setActiveTab("orderbook")}
          >
            Order Book
          </button>
        </div>
      </div>

      <Switch>
        <Match when={activeTab() === "graph"}>
          <div class="pm-market-chart">
            <div
              classList={{
                "pm-market-chart__heading": true,
                "pm-market-chart__heading--yes": chartTone() === "yes",
                "pm-market-chart__heading--no": chartTone() === "no",
              }}
            >
              <p class="pm-market-chart__heading-label">
                {(selectedQuote()?.label ?? "Outcome").toUpperCase()}
              </p>
              <div class="pm-market-chart__heading-line">
                <p class="pm-market-chart__heading-value">
                  {formatProbabilityValue(chartSummary().currentPrice)}% chance
                </p>
                <div
                  classList={{
                    "pm-market-chart__delta": true,
                    "pm-market-chart__delta--up": (chartSummary().change ?? 0) > 0,
                    "pm-market-chart__delta--down": (chartSummary().change ?? 0) < 0,
                  }}
                >
                  <TrendTriangleIcon
                    direction={(chartSummary().change ?? 0) > 0 ? "up" : "down"}
                  />
                  <span>{formatChangeMagnitude(chartSummary().change)}%</span>
                </div>
              </div>
            </div>

            <div class="pm-market-chart__frame pm-market-chart__frame--exact" ref={chartFrameRef}>
              <div class="pm-market-chart__watermark" aria-hidden="true">
                <img src="/c7xdtwf0cz6mneysxo8.svg" alt="" class="pm-market-chart__watermark-badge" />
                <span>Sabimarket</span>
              </div>
              <Show when={hoveredTooltip()}>
                {tooltip => (
                  <div
                    classList={{
                      "pm-market-chart__tooltip": true,
                      "pm-market-chart__tooltip--left": tooltip().alignment === "left",
                      "pm-market-chart__tooltip--center": tooltip().alignment === "center",
                      "pm-market-chart__tooltip--right": tooltip().alignment === "right",
                    }}
                    style={{ left: `${tooltip().leftPercent}%` }}
                  >
                    <p class="pm-market-chart__tooltip-time">{tooltip().timestampLabel}</p>
                    <div class="pm-market-chart__tooltip-values">
                      <div class="pm-market-chart__tooltip-row">
                        <span
                          classList={{
                            "pm-market-chart__tooltip-swatch": true,
                            "pm-market-chart__tooltip-swatch--yes": chartTone() === "yes",
                            "pm-market-chart__tooltip-swatch--no": chartTone() === "no",
                          }}
                        />
                        <span class="pm-market-chart__tooltip-label">
                          {selectedQuote()?.label ?? "Selected"}
                        </span>
                        <strong class="pm-market-chart__tooltip-value">
                          {formatProbabilityValue(tooltip().point.price)}%
                        </strong>
                      </div>
                      <Show
                        when={showBothOutcomes() && tooltip().secondaryPoint && alternateQuote()}
                      >
                        <div class="pm-market-chart__tooltip-row">
                          <span
                            classList={{
                              "pm-market-chart__tooltip-swatch": true,
                              "pm-market-chart__tooltip-swatch--yes": chartTone() === "no",
                              "pm-market-chart__tooltip-swatch--no": chartTone() === "yes",
                            }}
                          />
                          <span class="pm-market-chart__tooltip-label">
                            {alternateQuote()?.label ?? "Other"}
                          </span>
                          <strong class="pm-market-chart__tooltip-value">
                            {formatProbabilityValue(tooltip().secondaryPoint?.price ?? null)}%
                          </strong>
                        </div>
                      </Show>
                    </div>
                  </div>
                )}
              </Show>
              <div class="pm-market-chart__canvas-shell">
                <Show when={chartMetrics()}>
                  {metrics => (
                    <svg
                      class="pm-market-chart__canvas"
                      role="img"
                      aria-label={`${selectedQuote()?.label ?? "Selected"} price history`}
                      viewBox={`0 0 ${metrics().width} ${metrics().height}`}
                      preserveAspectRatio="none"
                      onPointerMove={handleChartPointerMove}
                      onPointerLeave={clearHoveredChartState}
                    >
                      <Show when={horizontalGridVisible()}>
                        <For each={metrics().yTicks}>
                          {tick => (
                            <line
                              class="pm-market-chart__grid-line"
                              x1={metrics().plotLeft}
                              x2={metrics().plotRight}
                              y1={metrics().yScale(tick) ?? 0}
                              y2={metrics().yScale(tick) ?? 0}
                            />
                          )}
                        </For>
                      </Show>

                      <Show when={verticalGridVisible()}>
                        <For each={metrics().xTicks}>
                          {tick => (
                            <line
                              class="pm-market-chart__grid-line pm-market-chart__grid-line--vertical"
                              x1={metrics().xScale(tick) ?? 0}
                              x2={metrics().xScale(tick) ?? 0}
                              y1={metrics().plotTop}
                              y2={metrics().plotBottom}
                            />
                          )}
                        </For>
                      </Show>

                      <Show when={metrics().secondaryPath}>
                        <path
                          d={metrics().secondaryPath}
                          classList={{
                            "pm-market-chart__line": true,
                            "pm-market-chart__line--secondary": true,
                            "pm-market-chart__line--secondary-yes": chartTone() === "no",
                            "pm-market-chart__line--secondary-no": chartTone() === "yes",
                          }}
                        />
                      </Show>

                      <Show when={metrics().primaryPath}>
                        <>
                          <path
                            d={metrics().primaryPath}
                            classList={{
                              "pm-market-chart__line-shadow": true,
                              "pm-market-chart__line-shadow--yes": chartTone() === "yes",
                              "pm-market-chart__line-shadow--no": chartTone() === "no",
                            }}
                          />
                          <path
                            d={metrics().primaryPath}
                            classList={{
                              "pm-market-chart__line": true,
                              "pm-market-chart__line--yes": chartTone() === "yes",
                              "pm-market-chart__line--no": chartTone() === "no",
                            }}
                          />
                        </>
                      </Show>

                      <Show when={annotationsVisible() && hoveredPrimaryPoint()}>
                        {point => {
                          const hoveredX = metrics().xScale(new Date(point().timestamp)) ?? 0;
                          const hoveredY = metrics().yScale(point().price) ?? 0;

                          return (
                            <>
                              <line
                                class="pm-market-chart__crosshair"
                                x1={hoveredX}
                                x2={hoveredX}
                                y1={metrics().plotTop}
                                y2={metrics().plotBottom}
                              />
                              <line
                                class="pm-market-chart__crosshair"
                                x1={metrics().plotLeft}
                                x2={metrics().plotRight}
                                y1={hoveredY}
                                y2={hoveredY}
                              />
                              <Show when={yAxisVisible()}>
                                <text
                                  class="pm-market-chart__axis-label"
                                  x={metrics().width - 4}
                                  y={hoveredY - 6}
                                  text-anchor="end"
                                >
                                  {formatAxisPercent(point().price)}
                                </text>
                              </Show>
                              <circle
                                cx={hoveredX}
                                cy={hoveredY}
                                r="5"
                                classList={{
                                  "pm-market-chart__hover-dot": true,
                                  "pm-market-chart__hover-dot--yes": chartTone() === "yes",
                                  "pm-market-chart__hover-dot--no": chartTone() === "no",
                                }}
                              />
                              <Show when={showBothOutcomes() && hoveredSecondaryPoint()}>
                                {secondaryPoint => (
                                  <circle
                                    cx={metrics().xScale(new Date(secondaryPoint().timestamp)) ?? 0}
                                    cy={metrics().yScale(secondaryPoint().price) ?? 0}
                                    r="4"
                                    class="pm-market-chart__hover-dot pm-market-chart__hover-dot--secondary"
                                  />
                                )}
                              </Show>
                            </>
                          );
                        }}
                      </Show>

                      <Show when={primaryChartPoints().length > 0}>
                        {() => {
                          const point = primaryChartPoints()[primaryChartPoints().length - 1]!;
                          const x = metrics().xScale(new Date(point.timestamp)) ?? 0;
                          const y = metrics().yScale(point.price) ?? 0;

                          return (
                            <>
                              <circle
                                cx={x}
                                cy={y}
                                r="10"
                                classList={{
                                  "pm-market-chart__dot-ring": true,
                                  "pm-market-chart__dot-ring--yes": chartTone() === "yes",
                                  "pm-market-chart__dot-ring--no": chartTone() === "no",
                                }}
                              />
                              <circle
                                cx={x}
                                cy={y}
                                r="4"
                                classList={{
                                  "pm-market-chart__dot": true,
                                  "pm-market-chart__dot--yes": chartTone() === "yes",
                                  "pm-market-chart__dot--no": chartTone() === "no",
                                }}
                              />
                            </>
                          );
                        }}
                      </Show>

                      <Show when={xAxisVisible()}>
                        <For each={metrics().xTicks}>
                          {tick => (
                            <text
                              class="pm-market-chart__axis-label"
                              x={metrics().xScale(tick) ?? 0}
                              y={metrics().height - 6}
                              text-anchor="middle"
                            >
                              {formatChartTickLabel(tick.getTime(), chartSpanMs())}
                            </text>
                          )}
                        </For>
                      </Show>

                      <Show when={yAxisVisible()}>
                        <For each={metrics().yTicks}>
                          {tick => (
                            <text
                              class="pm-market-chart__axis-label"
                              x={metrics().width - 4}
                              y={(metrics().yScale(tick) ?? 0) - 6}
                              text-anchor="end"
                            >
                              {formatAxisPercent(tick)}
                            </text>
                          )}
                        </For>
                      </Show>
                    </svg>
                  )}
                </Show>
              </div>
              <Show when={primaryChartPoints().length === 0}>
                <div class="pm-market-chart__empty">
                  <p>{chartLoading() ? "Loading chart…" : "No chart data yet."}</p>
                  <Show when={chartError()}>
                    <p>{chartError()}</p>
                  </Show>
                </div>
              </Show>
            </div>

            <div class="pm-market-chart__footer">
              <div class="pm-market-chart__footer-meta">
                <Show when={props.volumeLabel}>
                  <p class="pm-market-chart__footer-volume">{props.volumeLabel}</p>
                </Show>
                <Show when={props.volumeLabel}>
                  <span class="pm-market-chart__footer-divider" aria-hidden="true" />
                </Show>
                <div class="pm-market-chart__footer-date">
                  <ClockIcon />
                  <span>{formatLongDate(props.endsAt)}</span>
                </div>
              </div>

              <div class="pm-market-chart__footer-controls">
                <div
                  class="pm-market-chart__ranges"
                  role="tablist"
                  aria-label="Select chart window"
                >
                  <For each={chartRanges}>
                    {range => (
                      <button
                        type="button"
                        role="tab"
                        classList={{
                          "pm-market-chart__range": true,
                          "pm-market-chart__range--active": activeRange() === range.label,
                        }}
                        aria-selected={activeRange() === range.label}
                        onClick={() => setActiveRange(range.label)}
                      >
                        {range.label}
                      </button>
                    )}
                  </For>
                </div>

                <div class="pm-market-chart__footer-actions">
                  <button
                    type="button"
                    class="pm-market-chart__icon-button"
                    aria-label="Expand chart"
                  >
                    <ExpandChartIcon />
                  </button>

                  <div class="pm-market-chart__settings">
                    <button
                      type="button"
                      class="pm-market-chart__icon-button"
                      aria-label="Chart settings"
                      aria-expanded={settingsOpen()}
                      onClick={() => setSettingsOpen(open => !open)}
                    >
                      <SettingsGearIcon />
                    </button>

                    <Show when={settingsOpen()}>
                      <div class="pm-market-chart__settings-menu">
                        <p class="pm-market-chart__settings-title">Settings</p>
                        <ChartToggleRow
                          label="Autoscale"
                          checked={autoscale()}
                          onToggle={setAutoscale}
                        />
                        <ChartToggleRow
                          label="X-Axis"
                          checked={xAxisVisible()}
                          onToggle={setXAxisVisible}
                        />
                        <ChartToggleRow
                          label="Y-Axis"
                          checked={yAxisVisible()}
                          onToggle={setYAxisVisible}
                        />
                        <ChartToggleRow
                          label="Horizontal Grid"
                          checked={horizontalGridVisible()}
                          onToggle={setHorizontalGridVisible}
                        />
                        <ChartToggleRow
                          label="Vertical Grid"
                          checked={verticalGridVisible()}
                          onToggle={setVerticalGridVisible}
                        />
                        <ChartToggleRow
                          label="Annotations"
                          checked={annotationsVisible()}
                          onToggle={setAnnotationsVisible}
                        />
                        <Show when={props.market.quotes.length === 2}>
                          <ChartToggleRow
                            label="Both Outcomes"
                            checked={showBothOutcomes()}
                            onToggle={setShowBothOutcomes}
                          />
                        </Show>
                      </div>
                    </Show>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Match>

        <Match when={true}>
          <Show
            when={orderbookView()}
            fallback={
              <div class="pm-market-orderbook__empty">
                No resting orders have been published for this market yet.
              </div>
            }
          >
            {book => (
              <div class="pm-market-orderbook">
                <div class="pm-market-orderbook__header">
                  <span class="pm-market-orderbook__cell pm-market-orderbook__cell--label">
                    Trade {selectedQuote()?.label ?? "Outcome"}
                  </span>
                  <span class="pm-market-orderbook__cell">Price</span>
                  <span class="pm-market-orderbook__cell">Shares</span>
                  <span class="pm-market-orderbook__cell">Total</span>
                </div>

                <div class="pm-market-orderbook__rows">
                  <For each={book().asks}>
                    {level => {
                      const notional =
                        parseNumericValue(level.notional_usd) ?? level.quantity * level.price;
                      const width =
                        book().askTotal > 0
                          ? `${5 + (notional / book().askTotal) * 95}%`
                          : "5%";

                      return (
                        <button type="button" class="pm-market-orderbook__row pm-market-orderbook__row--ask">
                          <span
                            class="pm-market-orderbook__depth pm-market-orderbook__depth--ask"
                            style={{ width }}
                            aria-hidden="true"
                          />
                          <span class="pm-market-orderbook__cell pm-market-orderbook__cell--label pm-market-orderbook__side">
                            Ask
                          </span>
                          <strong class="pm-market-orderbook__cell pm-market-orderbook__price pm-market-orderbook__price--ask">
                            {formatCents(level.price)}
                          </strong>
                          <span class="pm-market-orderbook__cell">{formatShares(level)}</span>
                          <span class="pm-market-orderbook__cell">
                            {formatOrderbookTotal(level)}
                          </span>
                        </button>
                      );
                    }}
                  </For>

                  <div class="pm-market-orderbook__spread">
                    <span class="pm-market-orderbook__cell pm-market-orderbook__cell--label">
                      Last: {formatCents(book().lastTradePrice)}
                    </span>
                    <span class="pm-market-orderbook__cell">
                      Spread:{" "}
                      {formatCents(
                        props.orderbook ? props.orderbook.spread_bps / 10_000 : null,
                      )}
                    </span>
                  </div>

                  <For each={book().bids}>
                    {level => {
                      const notional =
                        parseNumericValue(level.notional_usd) ?? level.quantity * level.price;
                      const width =
                        book().bidTotal > 0
                          ? `${5 + (notional / book().bidTotal) * 95}%`
                          : "5%";

                      return (
                        <button type="button" class="pm-market-orderbook__row pm-market-orderbook__row--bid">
                          <span
                            class="pm-market-orderbook__depth pm-market-orderbook__depth--bid"
                            style={{ width }}
                            aria-hidden="true"
                          />
                          <span class="pm-market-orderbook__cell pm-market-orderbook__cell--label pm-market-orderbook__side">
                            Bid
                          </span>
                          <strong class="pm-market-orderbook__cell pm-market-orderbook__price pm-market-orderbook__price--bid">
                            {formatCents(level.price)}
                          </strong>
                          <span class="pm-market-orderbook__cell">{formatShares(level)}</span>
                          <span class="pm-market-orderbook__cell">
                            {formatOrderbookTotal(level)}
                          </span>
                        </button>
                      );
                    }}
                  </For>
                </div>
              </div>
            )}
          </Show>
        </Match>
      </Switch>
    </section>
  );
}
