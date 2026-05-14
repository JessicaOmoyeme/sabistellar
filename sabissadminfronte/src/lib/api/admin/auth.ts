import { apiRequest } from "~/lib/api/core";
import { resolveAdminToken } from "~/lib/auth/admin-session";

import type {
  AdminMeResponse,
  AuthResponse,
  WalletChallengeRequest,
  WalletChallengeResponse,
  WalletConnectRequest,
} from "./types";

const ADMIN_BASE_PATH = "/admin";

export function requestAdminWalletChallenge(
  payload: WalletChallengeRequest,
  signal?: AbortSignal,
) {
  return apiRequest<WalletChallengeResponse, WalletChallengeRequest>({
    method: "POST",
    path: `${ADMIN_BASE_PATH}/auth/wallet/challenge`,
    body: payload,
    signal,
  });
}

export function connectAdminWallet(payload: WalletConnectRequest, signal?: AbortSignal) {
  return apiRequest<AuthResponse, WalletConnectRequest>({
    method: "POST",
    path: `${ADMIN_BASE_PATH}/auth/wallet/connect`,
    body: payload,
    signal,
  });
}

export function getAdminMe(token?: string | null, signal?: AbortSignal) {
  return apiRequest<AdminMeResponse>({
    method: "GET",
    path: `${ADMIN_BASE_PATH}/me`,
    token: resolveAdminToken(token),
    signal,
  });
}
