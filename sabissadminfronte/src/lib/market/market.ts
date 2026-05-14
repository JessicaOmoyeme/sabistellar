import { normalizeApiBaseUrl, requestJson } from "../api.ts";
import type {
  BuyMarketRequest,
  CategoriesResponse,
  CategoryDetailResponse,
  EventDetailResponse,
  EventListResponse,
  EventMarketsResponse,
  ListEventsQuery,
  ListMarketsQuery,
  MarketActivityResponse,
  MarketClientOptions,
  MarketDetailResponse,
  MarketLiquidityResponse,
  MarketListResponse,
  MarketOrderbookResponse,
  MarketOutcomesResponse,
  MarketPriceHistoryQuery,
  MarketPriceHistoryResponse,
  MarketQuoteResponse,
  MarketResolutionReadResponse,
  MarketTradeExecutionResponse,
  MarketsHomeQuery,
  MarketsHomeResponse,
  RelatedMarketsResponse,
  SellMarketRequest,
  TagsResponse,
} from "./types.ts";

function readViteEnv(key: "VITE_API_BASE_URL"): string | undefined {
  return import.meta.env?.[key];
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value);
}

export interface MarketClient {
  fetchMarketsHome(query?: MarketsHomeQuery): Promise<MarketsHomeResponse>;
  listMarkets(query?: ListMarketsQuery): Promise<MarketListResponse>;
  fetchMarket(marketId: string): Promise<MarketDetailResponse>;
  fetchMarketBySlug(slug: string): Promise<MarketDetailResponse>;
  fetchMarketByCondition(conditionId: string): Promise<MarketDetailResponse>;
  fetchMarketLiquidity(marketId: string): Promise<MarketLiquidityResponse>;
  fetchMarketResolution(marketId: string): Promise<MarketResolutionReadResponse>;
  fetchRelatedMarkets(marketId: string): Promise<RelatedMarketsResponse>;
  fetchMarketOutcomes(marketId: string): Promise<MarketOutcomesResponse>;
  fetchMarketActivity(marketId: string): Promise<MarketActivityResponse>;
  fetchMarketQuote(marketId: string): Promise<MarketQuoteResponse>;
  fetchMarketPriceHistory(
    marketId: string,
    query?: MarketPriceHistoryQuery,
  ): Promise<MarketPriceHistoryResponse>;
  fetchMarketOrderbook(marketId: string): Promise<MarketOrderbookResponse>;
  listEvents(query?: ListEventsQuery): Promise<EventListResponse>;
  fetchEvent(eventId: string): Promise<EventDetailResponse>;
  fetchEventMarkets(eventId: string): Promise<EventMarketsResponse>;
  listCategories(): Promise<CategoriesResponse>;
  fetchCategory(slug: string): Promise<CategoryDetailResponse>;
  listTags(): Promise<TagsResponse>;
  buyMarket(
    token: string,
    marketId: string,
    payload: BuyMarketRequest,
  ): Promise<MarketTradeExecutionResponse>;
  sellMarket(
    token: string,
    marketId: string,
    payload: SellMarketRequest,
  ): Promise<MarketTradeExecutionResponse>;
}

export function createMarketClient(options: MarketClientOptions = {}): MarketClient {
  const baseUrl = normalizeApiBaseUrl(options.baseUrl);

  return {
    fetchMarketsHome(query) {
      return requestJson<MarketsHomeResponse>(baseUrl, "/markets/home", { query });
    },

    listMarkets(query) {
      return requestJson<MarketListResponse>(baseUrl, "/markets", { query });
    },

    fetchMarket(marketId) {
      return requestJson<MarketDetailResponse>(
        baseUrl,
        `/markets/${encodePathSegment(marketId)}`,
      );
    },

    fetchMarketBySlug(slug) {
      return requestJson<MarketDetailResponse>(
        baseUrl,
        `/markets/slug/${encodePathSegment(slug)}`,
      );
    },

    fetchMarketByCondition(conditionId) {
      return requestJson<MarketDetailResponse>(
        baseUrl,
        `/markets/by-condition/${encodePathSegment(conditionId)}`,
      );
    },

    fetchMarketLiquidity(marketId) {
      return requestJson<MarketLiquidityResponse>(
        baseUrl,
        `/markets/${encodePathSegment(marketId)}/liquidity`,
      );
    },

    fetchMarketResolution(marketId) {
      return requestJson<MarketResolutionReadResponse>(
        baseUrl,
        `/markets/${encodePathSegment(marketId)}/resolution`,
      );
    },

    fetchRelatedMarkets(marketId) {
      return requestJson<RelatedMarketsResponse>(
        baseUrl,
        `/markets/${encodePathSegment(marketId)}/related`,
      );
    },

    fetchMarketOutcomes(marketId) {
      return requestJson<MarketOutcomesResponse>(
        baseUrl,
        `/markets/${encodePathSegment(marketId)}/outcomes`,
      );
    },

    fetchMarketActivity(marketId) {
      return requestJson<MarketActivityResponse>(
        baseUrl,
        `/markets/${encodePathSegment(marketId)}/activity`,
      );
    },

    fetchMarketQuote(marketId) {
      return requestJson<MarketQuoteResponse>(
        baseUrl,
        `/markets/${encodePathSegment(marketId)}/quote`,
      );
    },

    fetchMarketPriceHistory(marketId, query) {
      return requestJson<MarketPriceHistoryResponse>(
        baseUrl,
        `/markets/${encodePathSegment(marketId)}/price-history`,
        { query },
      );
    },

    fetchMarketOrderbook(marketId) {
      return requestJson<MarketOrderbookResponse>(
        baseUrl,
        `/markets/${encodePathSegment(marketId)}/orderbook`,
      );
    },

    listEvents(query) {
      return requestJson<EventListResponse>(baseUrl, "/events", { query });
    },

    fetchEvent(eventId) {
      return requestJson<EventDetailResponse>(
        baseUrl,
        `/events/${encodePathSegment(eventId)}`,
      );
    },

    fetchEventMarkets(eventId) {
      return requestJson<EventMarketsResponse>(
        baseUrl,
        `/events/${encodePathSegment(eventId)}/markets`,
      );
    },

    listCategories() {
      return requestJson<CategoriesResponse>(baseUrl, "/categories");
    },

    fetchCategory(slug) {
      return requestJson<CategoryDetailResponse>(
        baseUrl,
        `/categories/${encodePathSegment(slug)}`,
      );
    },

    listTags() {
      return requestJson<TagsResponse>(baseUrl, "/tags");
    },

    buyMarket(token, marketId, payload) {
      return requestJson<MarketTradeExecutionResponse>(
        baseUrl,
        `/markets/${encodePathSegment(marketId)}/buy`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          json: payload,
        },
      );
    },

    sellMarket(token, marketId, payload) {
      return requestJson<MarketTradeExecutionResponse>(
        baseUrl,
        `/markets/${encodePathSegment(marketId)}/sell`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          json: payload,
        },
      );
    },
  };
}

export const marketClient = createMarketClient({
  baseUrl: readViteEnv("VITE_API_BASE_URL"),
});
