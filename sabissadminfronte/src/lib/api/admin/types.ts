export type Uuid = string;
export type IsoDateString = string;
export type CreateEventPublishMode = "draft" | "prepare" | "publish";
export type AdminPublicationStatusFilter = "draft" | "published" | "all";

export interface WalletChallengeRequest {
  wallet_address: string;
}

export interface WalletConnectRequest {
  challenge_id: Uuid;
  signature: string;
  username?: string;
}

export interface WalletChallengeResponse {
  challenge_id: Uuid;
  message: string;
  expires_at: IsoDateString;
}

export interface WalletResponse {
  wallet_address: string;
  chain_id: number | null;
  account_kind?: string | null;
  network_passphrase?: string | null;
  created_at: IsoDateString;
}

export interface UserResponse {
  id: Uuid;
  email: string | null;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  wallet: WalletResponse | null;
  created_at: IsoDateString;
  updated_at: IsoDateString;
}

export interface AuthResponse {
  token: string;
  user: UserResponse;
}

export interface AdminMeResponse {
  user: UserResponse;
  monad_chain_id: number;
}

export interface AdminImageAssetResponse {
  id: Uuid;
  storage_provider: string;
  bucket_name: string;
  scope: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  cid: string;
  ipfs_url: string;
  gateway_url: string;
  created_at: IsoDateString;
}

export interface AdminImageUploadResponse {
  asset: AdminImageAssetResponse;
}

export interface AdminListEventsQuery {
  publication_status?: AdminPublicationStatusFilter;
  category_slug?: string;
  subcategory_slug?: string;
  tag_slug?: string;
  featured?: boolean;
  breaking?: boolean;
  limit?: number;
  offset?: number;
}

export interface AdminEventMarketsQuery {
  publication_status?: AdminPublicationStatusFilter;
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
  starts_at: IsoDateString | null;
  sort_at: IsoDateString | null;
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
  end_time: IsoDateString;
  sort_order: number;
  publication_status: string;
  trading_status: string;
}

export interface MarketResolutionStateResponse {
  status: string;
  proposed_winning_outcome: number;
  final_winning_outcome: number | null;
  payout_vector_hash: string;
  proposed_by_user_id: Uuid;
  proposed_at: IsoDateString;
  dispute_deadline: IsoDateString;
  notes: string | null;
  disputed_by_user_id: Uuid | null;
  disputed_at: IsoDateString | null;
  dispute_reason: string | null;
  finalized_by_user_id: Uuid | null;
  finalized_at: IsoDateString | null;
  emergency_resolved_by_user_id: Uuid | null;
  emergency_resolved_at: IsoDateString | null;
}

export interface NegRiskRegistrationStateResponse {
  registered: boolean;
  has_other: boolean;
  other_market_id: Uuid | null;
  other_condition_id: string | null;
  tx_hash: string | null;
  registered_by_user_id: Uuid;
  registered_at: IsoDateString;
}

export interface CreateEventMetadataRequest {
  title: string;
  slug: string;
  category_slug: string;
  subcategory_slug?: string | null;
  tag_slugs?: string[];
  image_url?: string | null;
  summary?: string | null;
  rules: string;
  context?: string | null;
  additional_context?: string | null;
  resolution_sources?: string[];
  resolution_timezone?: string;
  starts_at?: IsoDateString | null;
  sort_at?: IsoDateString | null;
  featured?: boolean;
  breaking?: boolean;
  searchable?: boolean;
  visible?: boolean;
  hide_resolved_by_default?: boolean;
}

export interface CreateStandaloneMarketMetadataRequest {
  title: string;
  slug: string;
  category_slug: string;
  subcategory_slug?: string | null;
  tag_slugs?: string[];
  image_url?: string | null;
  summary?: string | null;
  rules: string;
  context?: string | null;
  additional_context?: string | null;
  resolution_sources?: string[];
  resolution_timezone?: string;
  starts_at?: IsoDateString | null;
  sort_at?: IsoDateString | null;
  end_time: IsoDateString;
  outcomes?: string[];
  featured?: boolean;
  breaking?: boolean;
  searchable?: boolean;
  visible?: boolean;
  hide_resolved_by_default?: boolean;
}

export interface UpdateMarketFieldsRequest {
  slug?: string;
  label?: string;
  question?: string;
  end_time?: IsoDateString | null;
  outcomes?: string[];
  sort_order?: number;
  oracle_address?: string;
}

export interface ProposeMarketResolutionFieldsRequest {
  winning_outcome: number;
  notes?: string | null;
}

export interface DisputeMarketResolutionFieldsRequest {
  reason: string;
}

export interface EmergencyMarketResolutionFieldsRequest {
  winning_outcome: number;
  reason: string;
}

export interface RegisterNegRiskEventFieldsRequest {
  other_market_id?: Uuid | null;
}

export interface SetMarketPricesFieldsRequest {
  yes_bps: number;
  no_bps: number;
}

export interface BootstrapMarketLiquidityFieldsRequest {
  yes_bps: number;
  no_bps: number;
  inventory_usdc_amount: string;
  exit_collateral_usdc_amount: string;
}

export interface BootstrapEventLiquidityMarketRequest {
  market_id: Uuid;
  yes_bps: number;
  no_bps: number;
  inventory_usdc_amount: string;
  exit_collateral_usdc_amount: string;
}

export interface BootstrapEventLiquidityFieldsRequest {
  markets: BootstrapEventLiquidityMarketRequest[];
}

export interface CreateEventChainRequest {
  neg_risk?: boolean;
  group_key: string;
  series_key: string;
}

export interface CreateStandaloneMarketChainRequest {
  oracle_address: string;
  neg_risk?: boolean;
}

export interface CreateEventPublishRequest {
  mode?: CreateEventPublishMode;
}

export interface CreateEventMarketRequest {
  label: string;
  slug: string;
  question: string;
  end_time: IsoDateString;
  outcomes?: string[];
  sort_order?: number | null;
  oracle_address: string;
}

export interface CreatePriceLadderTemplateRequest {
  underlying: string;
  deadline_label: string;
  end_time: IsoDateString;
  oracle_address: string;
  unit_symbol?: string;
  up_thresholds?: string[];
  down_thresholds?: string[];
}

export interface CreateEventRequest {
  event: CreateEventMetadataRequest;
  chain: CreateEventChainRequest;
  publish?: CreateEventPublishRequest;
}

export interface CreateMarketRequest {
  market: CreateStandaloneMarketMetadataRequest;
  chain: CreateStandaloneMarketChainRequest;
  publish?: CreateEventPublishRequest;
}

export interface UpdateMarketRequest {
  market: UpdateMarketFieldsRequest;
}

export interface ProposeMarketResolutionRequest {
  resolution: ProposeMarketResolutionFieldsRequest;
}

export interface DisputeMarketResolutionRequest {
  resolution: DisputeMarketResolutionFieldsRequest;
}

export interface EmergencyMarketResolutionRequest {
  resolution: EmergencyMarketResolutionFieldsRequest;
}

export interface RegisterNegRiskEventRequest {
  neg_risk: RegisterNegRiskEventFieldsRequest;
}

export interface SetMarketPricesRequest {
  prices: SetMarketPricesFieldsRequest;
}

export interface BootstrapMarketLiquidityRequest {
  liquidity: BootstrapMarketLiquidityFieldsRequest;
}

export interface BootstrapEventLiquidityRequest {
  liquidity: BootstrapEventLiquidityFieldsRequest;
}

export interface CreateEventMarketsRequest {
  markets: CreateEventMarketRequest[];
  publish?: CreateEventPublishRequest;
}

export interface CreateEventMarketLadderRequest {
  template: CreatePriceLadderTemplateRequest;
  publish?: CreateEventPublishRequest;
}

export interface CreateEventResponse {
  id: Uuid;
  event: EventResponse;
  on_chain: EventOnChainResponse;
  created_at: IsoDateString;
}

export interface CreateEventMarketsResponse {
  event_id: Uuid;
  event_slug: string;
  markets: MarketResponse[];
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

export interface AdminEventCardResponse {
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
  publication_status: string;
  starts_at: IsoDateString | null;
  sort_at: IsoDateString | null;
  created_at: IsoDateString;
  market_count: number;
}

export interface AdminEventListResponse {
  events: AdminEventCardResponse[];
  limit: number;
  offset: number;
}

export interface CreateMarketResponse {
  event: EventResponse;
  on_chain: EventOnChainResponse;
  market: MarketResponse;
  created_at: IsoDateString;
}

export interface UpdateMarketResponse {
  event: EventResponse;
  on_chain: EventOnChainResponse;
  market: MarketResponse;
  updated_at: IsoDateString;
}

export interface MarketTradingStatusResponse {
  event: EventResponse;
  on_chain: EventOnChainResponse;
  market: MarketResponse;
  updated_at: IsoDateString;
}

export interface MarketResolutionWorkflowResponse {
  event: EventResponse;
  on_chain: EventOnChainResponse;
  market: MarketResponse;
  resolution: MarketResolutionStateResponse;
  updated_at: IsoDateString;
}

export interface NegRiskRegistrationResponse {
  event: EventResponse;
  on_chain: EventOnChainResponse;
  neg_risk: NegRiskRegistrationStateResponse;
  updated_at: IsoDateString;
}

export interface MarketPriceTxHashesResponse {
  yes_price: string;
  no_price: string;
}

export interface MarketPricesStateResponse {
  yes_bps: number;
  no_bps: number;
  tx_hashes: MarketPriceTxHashesResponse;
}

export interface MarketLiquidityBootstrapTxHashesResponse {
  yes_price: string;
  no_price: string;
  split_and_add_liquidity: string;
  deposit_collateral: string | null;
}

export interface MarketLiquidityBootstrapStateResponse {
  yes_bps: number;
  no_bps: number;
  inventory_usdc_amount: string;
  exit_collateral_usdc_amount: string;
  tx_hashes: MarketLiquidityBootstrapTxHashesResponse;
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

export interface EventLiquidityBootstrapItemResponse {
  market: MarketResponse;
  bootstrap: MarketLiquidityBootstrapStateResponse;
  liquidity: MarketLiquidityResponse;
}

export interface MarketPricesResponse {
  event: EventResponse;
  on_chain: EventOnChainResponse;
  market: MarketResponse;
  prices: MarketPricesStateResponse;
  updated_at: IsoDateString;
}

export interface MarketLiquidityBootstrapResponse {
  event: EventResponse;
  on_chain: EventOnChainResponse;
  market: MarketResponse;
  bootstrap: MarketLiquidityBootstrapStateResponse;
  liquidity: MarketLiquidityResponse;
  updated_at: IsoDateString;
}

export interface EventLiquidityBootstrapResponse {
  event: EventResponse;
  on_chain: EventOnChainResponse;
  results: EventLiquidityBootstrapItemResponse[];
  updated_at: IsoDateString;
}
