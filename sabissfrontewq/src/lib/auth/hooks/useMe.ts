import { authClient, type AuthClient } from "../auth.ts";
import type { MeResponse } from "../types.ts";
import { createAsyncEndpointHandler } from "./shared.ts";

export function useMe(client: AuthClient = authClient) {
  const handler = createAsyncEndpointHandler<MeResponse, [string]>(token =>
    client.fetchMe(token),
  );

  return {
    response: handler.data,
    error: handler.error,
    status: handler.status,
    fetchMe: handler.run,
    reset: handler.reset,
  };
}
