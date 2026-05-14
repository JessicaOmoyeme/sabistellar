export interface ConfigClientOptions {
  baseUrl?: string;
}

export interface PublicContractsAddressesResponse {
  conditional_tokens: string;
  usdc: string;
  market_factory: string;
  liquidity_manager: string;
  pool_exchange: string;
  orderbook_exchange: string;
  redemption: string;
  neg_risk_adapter: string;
}

export interface PublicContractsConfigResponse {
  chain_id: number;
  contracts: PublicContractsAddressesResponse;
}
