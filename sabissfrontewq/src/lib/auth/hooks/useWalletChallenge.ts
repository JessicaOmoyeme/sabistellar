import { authClient, type AuthClient } from "../auth.ts";
import type { WalletChallengeRequest, WalletChallengeResponse } from "../types.ts";
import { createAsyncEndpointHandler } from "./shared.ts";

export function useWalletChallenge(client: AuthClient = authClient) {
  const handler = createAsyncEndpointHandler<
    WalletChallengeResponse,
    [WalletChallengeRequest]
  >(request => client.createWalletChallenge(request));

  return {
    response: handler.data,
    error: handler.error,
    status: handler.status,
    requestChallenge: handler.run,
    reset: handler.reset,
  };
}
