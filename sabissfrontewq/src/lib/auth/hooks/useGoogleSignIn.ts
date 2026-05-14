import { authClient, type AuthClient } from "../auth.ts";
import type { AuthResponse, GoogleSignInRequest } from "../types.ts";
import { createAsyncEndpointHandler } from "./shared.ts";

export function useGoogleSignIn(client: AuthClient = authClient) {
  const handler = createAsyncEndpointHandler<AuthResponse, [GoogleSignInRequest]>(request =>
    client.signInWithGoogle(request),
  );

  return {
    response: handler.data,
    error: handler.error,
    status: handler.status,
    signIn: handler.run,
    reset: handler.reset,
  };
}
