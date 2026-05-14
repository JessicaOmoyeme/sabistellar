import type {
  AuthClientOptions,
  AuthResponse,
  GoogleSignInRequest,
  MeResponse,
  WalletChallengeRequest,
  WalletChallengeResponse,
  WalletConnectRequest,
} from "./types.ts";
import {
  buildApiUrl,
  normalizeApiBaseUrl,
  requestJson,
} from "../api.ts";
export { ApiError } from "../api.ts";

function readViteEnv(
  key: "VITE_API_BASE_URL" | "VITE_GOOGLE_CLIENT_ID",
): string | undefined {
  return import.meta.env?.[key];
}

export function normalizeAuthBaseUrl(rawBaseUrl: string | undefined): string {
  return normalizeApiBaseUrl(rawBaseUrl);
}

export function buildAuthUrl(baseUrl: string, path: string): string {
  return buildApiUrl(baseUrl, path);
}

export interface AuthClient {
  signInWithGoogle(request: GoogleSignInRequest): Promise<AuthResponse>;
  createWalletChallenge(request: WalletChallengeRequest): Promise<WalletChallengeResponse>;
  connectWallet(request: WalletConnectRequest): Promise<AuthResponse>;
  fetchMe(token: string): Promise<MeResponse>;
}

export function createAuthClient(options: AuthClientOptions = {}): AuthClient {
  const baseUrl = normalizeAuthBaseUrl(options.baseUrl);

  return {
    signInWithGoogle(request) {
      return requestJson<AuthResponse>(baseUrl, "/auth/google/sign-in", {
        method: "POST",
        json: request,
      });
    },

    createWalletChallenge(request) {
      return requestJson<WalletChallengeResponse>(baseUrl, "/auth/wallet/challenge", {
        method: "POST",
        json: request,
      });
    },

    connectWallet(request) {
      return requestJson<AuthResponse>(baseUrl, "/auth/wallet/connect", {
        method: "POST",
        json: request,
      });
    },

    fetchMe(token) {
      return requestJson<MeResponse>(baseUrl, "/auth/me", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    },
  };
}

export const GOOGLE_CLIENT_ID = readViteEnv("VITE_GOOGLE_CLIENT_ID")?.trim() ?? "";

export const authClient = createAuthClient({
  baseUrl: readViteEnv("VITE_API_BASE_URL"),
});
