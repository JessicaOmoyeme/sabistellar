export type Uuid = string;
export type IsoDateTimeString = string;

export type MarketTradingStatus = "active" | "paused" | "resolved";
export type MarketPriceHistoryInterval = "5m" | "15m" | "1h" | "4h" | "1d";

export interface MarketClientOptions {
  baseUrl?: string;
}

export interface MarketsHomeQuery {
  limit?: number;
}

export interface ListMarketsQuery {
  category_slug?: string;
  subcategory_slug?: string;
  tag_slug?: string;
  q?: string;
  featured?: boolean;
  breaking?: boolean;
  trading_status?: MarketTradingStatus;
  limit?: number;
  offset?: number;
}

export interface SearchMarketsQuery {
  q?: string;
  category_slug?: string;
  subcategory_slug?: string;
  tag_slug?: string;
  trading_status?: MarketTradingStatus;
  limit?: number;
  offset?: number;
}

export interface MarketPriceHistoryQuery {
  interval?: MarketPriceHistoryInterval;
  limit?: number;
}

export interface ListEventsQuery {
  category_slug?: string;
  subcategory_slug?: string;
  tag_slug?: string;
  featured?: boolean;
  breaking?: boolean;
  include_markets?: boolean;
  limit?: number;
  offset?: number;
}

export interface PublicEventTeaserResponse {
  id: Uuid;
  title: string;
  slug: string;
  category_slug: string;
  subcategory_slug: string | null;
  tag_slugs: string[];
  image_url: string | null;
  summary: string | null;
  featured: boolean;
  breaking: boolean;
  neg_risk: boolean;
}

export interface PublicMarketCardResponse {
  id: Uuid;
  slug: string;
  label: string;
  question: string;
  question_id: string;
  condition_id: string | null;
  market_type: string;
  outcomes: string[];
  end_time: IsoDateTimeString;
  sort_order: number;
  trading_status: string;
  current_prices?: MarketCurrentPricesResponse | null;
  stats?: MarketStatsResponse | null;
  quote_summary?: MarketQuoteSummaryResponse | null;
  event: PublicEventTeaserResponse;
}

export interface MarketsHomeResponse {
  featured: PublicMarketCardResponse[];
  breaking: PublicMarketCardResponse[];
  newest: PublicMarketCardResponse[];
}

export interface MarketListResponse {
  markets: PublicMarketCardResponse[];
  limit: number;
  offset: number;
}

export interface EventResponse {
  title: string;
  slug: string;
  category_slug: string;
  subcategory_slug: string | null;
  tag_slugs: string[];
  image_url: string | null;
  summary: string | null;
  rules: string;
  context: string | null;
  additional_context: string | null;
  resolution_sources: string[];
  resolution_timezone: string;
  starts_at: IsoDateTimeString | null;
  sort_at: IsoDateTimeString | null;
  featured: boolean;
  breaking: boolean;
  searchable: boolean;
  visible: boolean;
  hide_resolved_by_default: boolean;
  publication_status: string;
}

export interface EventOnChainResponse {
  event_id: string;
  group_id: string;
  series_id: string;
  neg_risk: boolean;
  tx_hash: string | null;
}

export interface MarketResponse {
  id: Uuid;
  slug: string;
  label: string;
  question: string;
  question_id: string;
  condition_id: string | null;
  market_type: string;
  outcomes: string[];
  end_time: IsoDateTimeString;
  sort_order: number;
  publication_status: string;
  trading_status: string;
  current_prices?: MarketCurrentPricesResponse | null;
  stats?: MarketStatsResponse | null;
  quote_summary?: MarketQuoteSummaryResponse | null;
}

export interface MarketCurrentPricesResponse {
  yes_bps: number;
  no_bps: number;
}

export interface MarketStatsResponse {
  volume_usd: string;
}

export interface MarketQuoteSummaryResponse {
  buy_yes_bps: number;
  buy_no_bps: number;
  as_of: IsoDateTimeString;
  source: string;
}

export interface MarketQuoteResponse {
  market_id: Uuid;
  condition_id: string | null;
  source: string;
  as_of: IsoDateTimeString;
  buy_yes_bps: number;
  buy_no_bps: number;
  sell_yes_bps: number;
  sell_no_bps: number;
  last_trade_yes_bps: number;
  spread_bps: number;
}

export interface BuyMarketFieldsRequest {
  outcome_index: number;
  usdc_amount: string;
}

export interface BuyMarketRequest {
  trade: BuyMarketFieldsRequest;
}

export interface SellMarketFieldsRequest {
  outcome_index: number;
  token_amount: string;
}

export interface SellMarketRequest {
  trade: SellMarketFieldsRequest;
}

export interface PreparedWalletCallResponse {
  kind: string;
  target: string;
  data: string;
  value: string;
  description: string;
}

export interface MarketTradeExecutionResponse {
  event: EventResponse;
  on_chain: EventOnChainResponse;
  market: MarketResponse;
  wallet_address: string;
  account_kind: string;
  action: string;
  outcome_index: number;
  outcome_label: string;
  execution_mode: string;
  execution_status: string;
  tx_hash?: string;
  prepared_transactions?: PreparedWalletCallResponse[];
  usdc_amount: string;
  token_amount: string;
  price_bps: number;
  price: number;
  market_quote: MarketQuoteResponse;
  requested_at: IsoDateTimeString;
}

export interface MarketResolutionStateResponse {
  status: string;
  proposed_winning_outcome: number;
  final_winning_outcome: number | null;
  payout_vector_hash: string;
  proposed_by_user_id: Uuid;
  proposed_at: IsoDateTimeString;
  dispute_deadline: IsoDateTimeString;
  notes: string | null;
  disputed_by_user_id: Uuid | null;
  disputed_at: IsoDateTimeString | null;
  dispute_reason: string | null;
  finalized_by_user_id: Uuid | null;
  finalized_at: IsoDateTimeString | null;
  emergency_resolved_by_user_id: Uuid | null;
  emergency_resolved_at: IsoDateTimeString | null;
}

export interface MarketDetailResponse {
  event: EventResponse;
  on_chain: EventOnChainResponse;
  market: MarketResponse;
  resolution: MarketResolutionStateResponse | null;
  sibling_markets: MarketResponse[];
}

export interface MarketOutcomeResponse {
  index: number;
  label: string;
  is_winning: boolean | null;
}

export interface MarketOutcomesResponse {
  market_id: Uuid;
  condition_id: string | null;
  market_type: string;
  outcomes: MarketOutcomeResponse[];
}

export interface MarketActivityItemResponse {
  activity_type: string;
  occurred_at: IsoDateTimeString;
  actor_user_id: Uuid | null;
  details: string | null;
}

export interface MarketActivityResponse {
  market_id: Uuid;
  source: string;
  items: MarketActivityItemResponse[];
}

export interface MarketTradeFillResponse {
  id: Uuid;
  match_type: string;
  outcome_index?: number | null;
  fill_token_amount: string;
  collateral_amount: string;
  yes_price_bps: number;
  no_price_bps: number;
  yes_price: number;
  no_price: number;
  tx_hash: string;
  executed_at: IsoDateTimeString;
}

export interface MarketTradesResponse {
  market_id: Uuid;
  condition_id: string | null;
  source: string;
  trades: MarketTradeFillResponse[];
}

export interface MarketPriceHistoryPointResponse {
  timestamp: IsoDateTimeString;
  outcome_index: number;
  outcome_label: string;
  price_bps: number;
  price: number;
}

export interface MarketPriceHistorySeriesPointResponse {
  t: number;
  p: number;
}

export interface MarketPriceHistoryResponse {
  market_id: Uuid;
  condition_id: string | null;
  source: string;
  interval: string;
  history?: MarketPriceHistorySeriesPointResponse[];
  points: MarketPriceHistoryPointResponse[];
}

export interface OrderbookLevelResponse {
  outcome_index: number;
  outcome_label: string;
  price_bps: number;
  price: number;
  quantity: number;
  shares: string;
  notional_usd: string;
}

export interface MarketOrderbookResponse {
  market_id: Uuid;
  condition_id: string | null;
  source: string;
  as_of: IsoDateTimeString;
  spread_bps: number;
  last_trade_yes_bps: number;
  bids: OrderbookLevelResponse[];
  asks: OrderbookLevelResponse[];
}

export interface MarketLiquidityOutcomeResponse {
  outcome_index: number;
  outcome_label: string;
  available: string;
}

export interface PoolLiquidityResponse {
  idle_yes_total: string;
  idle_no_total: string;
  posted_yes_total: string;
  posted_no_total: string;
  claimable_collateral_total: string;
}

export interface MarketLiquidityResponse {
  market_id: Uuid;
  condition_id: string | null;
  source: string;
  exchange_outcomes: MarketLiquidityOutcomeResponse[];
  pool: PoolLiquidityResponse;
}

export interface MarketResolutionReadResponse {
  market_id: Uuid;
  resolution: MarketResolutionStateResponse | null;
}

export interface RelatedMarketsResponse {
  market_id: Uuid;
  related: PublicMarketCardResponse[];
}

export interface PublicEventCardResponse {
  id: Uuid;
  title: string;
  slug: string;
  category_slug: string;
  subcategory_slug: string | null;
  tag_slugs: string[];
  image_url: string | null;
  summary: string | null;
  featured: boolean;
  breaking: boolean;
  neg_risk: boolean;
  starts_at: IsoDateTimeString | null;
  sort_at: IsoDateTimeString | null;
  market_count: number;
  markets?: PublicMarketCardResponse[] | null;
}

export interface EventListResponse {
  events: PublicEventCardResponse[];
  limit: number;
  offset: number;
}

export interface EventDetailResponse {
  event: EventResponse;
  on_chain: EventOnChainResponse;
  markets_count: number;
}

export interface EventMarketsResponse {
  event: EventResponse;
  on_chain: EventOnChainResponse;
  markets: MarketResponse[];
}

export interface CategorySummaryResponse {
  slug: string;
  label: string;
  event_count: number;
  market_count: number;
  featured_event_count: number;
  breaking_event_count: number;
}

export interface CategoriesResponse {
  categories: CategorySummaryResponse[];
}

export interface CategoryDetailResponse {
  category: CategorySummaryResponse;
  markets: PublicMarketCardResponse[];
}

export interface TagSummaryResponse {
  slug: string;
  label: string;
  event_count: number;
  market_count: number;
}

export interface TagsResponse {
  tags: TagSummaryResponse[];
}
