import type {
  EventOnChainResponse,
  EventResponse,
  IsoDateTimeString,
  MarketResponse,
  PreparedWalletCallResponse,
  Uuid,
} from "../market/types.ts";

export interface OrderClientOptions {
  baseUrl?: string;
}

export interface CreateOrderFieldsRequest {
  market_id: Uuid;
  outcome_index: number;
  side: string;
  price_bps: number;
  token_amount: string;
  expiry_epoch_seconds?: number | null;
  salt: string;
  signature: string;
}

export interface CreateOrderRequest {
  order: CreateOrderFieldsRequest;
}

export interface CancelOrderFieldsRequest {
  order_id: Uuid;
}

export interface CancelOrderRequest {
  order: CancelOrderFieldsRequest;
}

export interface OrderResponse {
  id: Uuid;
  status: string;
  order_hash: string;
  order_digest: string;
  side: string;
  outcome_index: number;
  outcome_label: string;
  price_bps: number;
  price: number;
  token_amount: string;
  filled_token_amount: string;
  remaining_token_amount: string;
  quoted_usdc_amount: string;
  expiry_epoch_seconds?: number | null;
  expires_at?: IsoDateTimeString | null;
  salt: string;
  created_at: IsoDateTimeString;
  updated_at: IsoDateTimeString;
  cancelled_at?: IsoDateTimeString | null;
}

export interface OrderItemResponse {
  event: EventResponse;
  on_chain: EventOnChainResponse;
  market: MarketResponse;
  order: OrderResponse;
}

export interface CreateOrderResponse {
  wallet_address: string;
  account_kind: string;
  order: OrderItemResponse;
}

export interface CancelOrderResponse {
  wallet_address: string;
  account_kind: string;
  cancellation_scope: string;
  cancellation_status: string;
  prepared_transactions?: PreparedWalletCallResponse[] | null;
  order: OrderItemResponse;
}

export interface MyOrdersResponse {
  wallet_address: string;
  account_kind: string;
  orders: OrderItemResponse[];
}

export interface PositionOutcomeResponse {
  outcome_index: number;
  outcome_label: string;
  token_amount: string;
  estimated_value_usdc?: string | null;
}

export interface PortfolioSummaryResponse {
  cash_balance: string;
  portfolio_balance: string;
  total_balance: string;
  total_buy_amount: string;
  total_sell_amount: string;
}

export interface PortfolioMarketSummaryResponse {
  event: EventResponse;
  on_chain: EventOnChainResponse;
  market: MarketResponse;
  buy_amount: string;
  sell_amount: string;
  portfolio_balance: string;
  positions: PositionOutcomeResponse[];
  last_traded_at?: IsoDateTimeString | null;
}

export interface PortfolioTradeHistoryItemResponse {
  id: string;
  execution_source: string;
  event: EventResponse;
  on_chain: EventOnChainResponse;
  market: MarketResponse;
  action: string;
  outcome_index: number;
  outcome_label: string;
  usdc_amount: string;
  token_amount: string;
  price_bps: number;
  price: number;
  tx_hash?: string | null;
  executed_at: IsoDateTimeString;
}

export interface MyPortfolioResponse {
  wallet_address: string;
  account_kind: string;
  summary: PortfolioSummaryResponse;
  markets: PortfolioMarketSummaryResponse[];
  history: PortfolioTradeHistoryItemResponse[];
}
