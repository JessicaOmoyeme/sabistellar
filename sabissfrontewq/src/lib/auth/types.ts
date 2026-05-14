export interface GoogleSignInRequest {
  credential: string;
  g_csrf_token?: string;
  client_id?: string;
}

export interface WalletChallengeRequest {
  wallet_address: string;
}

export interface WalletConnectRequest {
  challenge_id: string;
  signature: string;
  username?: string;
}

export interface WalletResponse {
  wallet_address: string;
  chain_id: number;
  account_kind: string;
  owner_address: string | null;
  owner_provider: string | null;
  factory_address: string | null;
  entry_point_address: string | null;
  created_at: string;
}

export interface UserResponse {
  id: string;
  email: string | null;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  wallet: WalletResponse | null;
  created_at: string;
  updated_at: string;
}

export interface AuthResponse {
  token: string;
  user: UserResponse;
}

export interface WalletChallengeResponse {
  challenge_id: string;
  message: string;
  expires_at: string;
}

export interface MeResponse {
  user: UserResponse;
}

export interface ErrorResponse {
  error: string;
}

export interface AuthClientOptions {
  baseUrl?: string;
}

export type AuthAsyncStatus = "idle" | "pending" | "success" | "error";
