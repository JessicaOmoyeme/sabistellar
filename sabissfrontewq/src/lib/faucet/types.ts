export interface FaucetClientOptions {
  baseUrl?: string;
}

export interface FaucetUsdcRequest {
  address: string;
  amount: string;
}

export interface FaucetUsdcResponse {
  token_address: string;
  recipient: string;
  amount: string;
  tx_hash: string;
  requested_at: string;
}

export interface FaucetUsdcBalanceResponse {
  token_address: string;
  address: string;
  balance: string;
  queried_at: string;
}
