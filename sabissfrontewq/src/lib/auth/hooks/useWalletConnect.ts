import { authClient, type AuthClient } from "../auth.ts";
import type { AuthResponse, WalletConnectRequest } from "../types.ts";
import { createAsyncEndpointHandler } from "./shared.ts";

export function useWalletConnect(client: AuthClient = authClient) {
  const handler = createAsyncEndpointHandler<AuthResponse, [WalletConnectRequest]>(request =>
    client.connectWallet(request),
  );

  return {
    response: handler.data,
    error: handler.error,
    status: handler.status,
    connect: handler.run,
    reset: handler.reset,
  };
}
