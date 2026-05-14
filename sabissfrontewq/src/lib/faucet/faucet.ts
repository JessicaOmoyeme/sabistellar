import { normalizeApiBaseUrl, requestJson } from "../api.ts";
import type {
  FaucetClientOptions,
  FaucetUsdcBalanceResponse,
  FaucetUsdcRequest,
  FaucetUsdcResponse,
} from "./types.ts";

function readViteEnv(key: "VITE_API_BASE_URL"): string | undefined {
  return import.meta.env?.[key];
}

export interface FaucetClient {
  requestUsdc(request: FaucetUsdcRequest): Promise<FaucetUsdcResponse>;
  fetchUsdcBalance(address: string): Promise<FaucetUsdcBalanceResponse>;
}

export function createFaucetClient(options: FaucetClientOptions = {}): FaucetClient {
  const baseUrl = normalizeApiBaseUrl(options.baseUrl);

  return {
    requestUsdc(request) {
      return requestJson<FaucetUsdcResponse>(baseUrl, "/faucet/usdc", {
        method: "POST",
        json: request,
      });
    },

    fetchUsdcBalance(address) {
      return requestJson<FaucetUsdcBalanceResponse>(baseUrl, "/faucet/usdc/balance", {
        query: {
          address,
        },
      });
    },
  };
}

export const faucetClient = createFaucetClient({
  baseUrl: readViteEnv("VITE_API_BASE_URL"),
});

export { ApiError } from "../api.ts";
