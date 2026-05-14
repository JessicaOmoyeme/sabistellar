import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { createRoot } from "solid-js";

import {
  ApiError,
  createAuthClient,
  useGoogleSignIn,
  useMe,
  useWalletChallenge,
  useWalletConnect,
} from "./auth/index.ts";
import type {
  AuthResponse,
  ErrorResponse,
  GoogleSignInRequest,
  MeResponse,
  WalletChallengeRequest,
  WalletChallengeResponse,
  WalletConnectRequest,
} from "./auth/index.ts";

const apiBaseUrl = "http://127.0.0.1:8080";
const liveAuthBaseUrl = process.env.AUTH_INTEGRATION_BASE_URL ?? apiBaseUrl;

interface FetchCall {
  input: RequestInfo | URL;
  init?: RequestInit;
}

const originalFetch = globalThis.fetch;
let calls: FetchCall[] = [];

async function isLiveAuthBackendAvailable(baseUrl: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1000);

  try {
    const response = await originalFetch(`${baseUrl}/auth/me`, {
      signal: controller.signal,
    });

    return response.status === 401;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

const liveAuthBackendAvailable = await isLiveAuthBackendAvailable(liveAuthBaseUrl);

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("posts google sign-in credentials to the backend contract", async () => {
  const client = createAuthClient({ baseUrl: `${apiBaseUrl}/` });

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });

    return new Response(
      JSON.stringify({
        token: "jwt-token",
        user: {
          id: "user-1",
          email: "sabi@example.com",
          username: null,
          display_name: "Sabi",
          avatar_url: null,
          wallet: null,
          created_at: "2026-03-31T10:00:00Z",
          updated_at: "2026-03-31T10:00:00Z",
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }) as typeof fetch;

  const response = await client.signInWithGoogle({
    credential: "google-credential",
    g_csrf_token: "csrf-token",
    client_id: "client-id",
  });

  assert.equal(response.token, "jwt-token");
  assert.equal(String(calls[0].input), "http://127.0.0.1:8080/auth/google/sign-in");
  assert.equal(calls[0].init?.method, "POST");

  const headers = new Headers(calls[0].init?.headers);
  assert.equal(headers.get("Accept"), "application/json");
  assert.equal(headers.get("Content-Type"), "application/json");
  assert.equal(
    calls[0].init?.body,
    JSON.stringify({
      credential: "google-credential",
      g_csrf_token: "csrf-token",
      client_id: "client-id",
    }),
  );
});

test("posts wallet challenge requests with the required wallet_address field", async () => {
  const client = createAuthClient({ baseUrl: apiBaseUrl });

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });

    return new Response(
      JSON.stringify({
        challenge_id: "550e8400-e29b-41d4-a716-446655440000",
        message: "Sign this message",
        expires_at: "2026-03-31T10:10:00Z",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }) as typeof fetch;

  const response = await client.createWalletChallenge({
    wallet_address: "0x1234",
  });

  assert.equal(response.challenge_id, "550e8400-e29b-41d4-a716-446655440000");
  assert.equal(String(calls[0].input), "http://127.0.0.1:8080/auth/wallet/challenge");
  assert.equal(calls[0].init?.method, "POST");
  assert.equal(calls[0].init?.body, JSON.stringify({ wallet_address: "0x1234" }));
});

test("posts wallet connect payloads including optional usernames", async () => {
  const client = createAuthClient({ baseUrl: apiBaseUrl });

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });

    return new Response(
      JSON.stringify({
        token: "wallet-token",
        user: {
          id: "user-2",
          email: null,
          username: "wallet_user",
          display_name: "wallet_user",
          avatar_url: null,
          wallet: {
            wallet_address: "0x1234",
            chain_id: 10143,
            created_at: "2026-03-31T10:00:00Z",
          },
          created_at: "2026-03-31T10:00:00Z",
          updated_at: "2026-03-31T10:00:00Z",
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }) as typeof fetch;

  const response = await client.connectWallet({
    challenge_id: "550e8400-e29b-41d4-a716-446655440000",
    signature: "signed-message",
    username: "wallet_user",
  });

  assert.equal(response.user.username, "wallet_user");
  assert.equal(String(calls[0].input), "http://127.0.0.1:8080/auth/wallet/connect");
  assert.equal(
    calls[0].init?.body,
    JSON.stringify({
      challenge_id: "550e8400-e29b-41d4-a716-446655440000",
      signature: "signed-message",
      username: "wallet_user",
    }),
  );
});

test("fetches /auth/me with the required bearer token", async () => {
  const client = createAuthClient({ baseUrl: apiBaseUrl });

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });

    return new Response(
      JSON.stringify({
        user: {
          id: "user-3",
          email: "sabi@example.com",
          username: null,
          display_name: "Sabi",
          avatar_url: null,
          wallet: null,
          created_at: "2026-03-31T10:00:00Z",
          updated_at: "2026-03-31T10:00:00Z",
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }) as typeof fetch;

  const response = await client.fetchMe("session-token");

  assert.equal(response.user.id, "user-3");
  assert.equal(String(calls[0].input), "http://127.0.0.1:8080/auth/me");

  const headers = new Headers(calls[0].init?.headers);
  assert.equal(headers.get("Authorization"), "Bearer session-token");
  assert.equal(headers.get("Accept"), "application/json");
});

test("surfaces backend error messages as ApiError instances", async () => {
  const client = createAuthClient({ baseUrl: apiBaseUrl });

  globalThis.fetch = (async () => {
    return new Response(JSON.stringify({ error: "username already taken" }), {
      status: 409,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  await assert.rejects(
    () =>
      client.connectWallet({
        challenge_id: "550e8400-e29b-41d4-a716-446655440000",
        signature: "signed-message",
        username: "wallet_user",
      }),
    (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 409);
      assert.equal(error.message, "username already taken");
      return true;
    },
  );
});

test("useGoogleSignIn updates state around a successful request", async () => {
  const request: GoogleSignInRequest = {
    credential: "credential",
    client_id: "client-id",
  };
  const response: AuthResponse = {
    token: "token",
    user: {
      id: "user-1",
      email: "sabi@example.com",
      username: null,
      display_name: "Sabi",
      avatar_url: null,
      wallet: null,
      created_at: "2026-03-31T10:00:00Z",
      updated_at: "2026-03-31T10:00:00Z",
    },
  };

  await createRoot(async dispose => {
    const hook = useGoogleSignIn({
      signInWithGoogle: async payload => {
        assert.deepEqual(payload, request);
        return response;
      },
      createWalletChallenge: async () => {
        throw new Error("unreachable");
      },
      connectWallet: async () => {
        throw new Error("unreachable");
      },
      fetchMe: async () => {
        throw new Error("unreachable");
      },
    });

    assert.equal(hook.status(), "idle");
    const result = await hook.signIn(request);
    assert.equal(result.token, "token");
    assert.equal(hook.status(), "success");
    assert.equal(hook.response()?.token, "token");
    assert.equal(hook.error(), null);
    dispose();
  });
});

test("useWalletChallenge exposes backend failures", async () => {
  const request: WalletChallengeRequest = {
    wallet_address: "0x1234",
  };

  await createRoot(async dispose => {
    const hook = useWalletChallenge({
      signInWithGoogle: async () => {
        throw new Error("unreachable");
      },
      createWalletChallenge: async payload => {
        assert.deepEqual(payload, request);
        throw new ApiError("invalid wallet address", 400);
      },
      connectWallet: async () => {
        throw new Error("unreachable");
      },
      fetchMe: async () => {
        throw new Error("unreachable");
      },
    });

    await assert.rejects(() => hook.requestChallenge(request), ApiError);
    assert.equal(hook.status(), "error");
    assert.equal(hook.error(), "invalid wallet address");
    dispose();
  });
});

test("useWalletConnect captures successful responses", async () => {
  const request: WalletConnectRequest = {
    challenge_id: "550e8400-e29b-41d4-a716-446655440000",
    signature: "signed-message",
    username: "wallet_user",
  };
  const response: AuthResponse = {
    token: "wallet-token",
    user: {
      id: "user-2",
      email: null,
      username: "wallet_user",
      display_name: "wallet_user",
      avatar_url: null,
      wallet: {
        wallet_address: "0x1234",
        chain_id: 10143,
        created_at: "2026-03-31T10:00:00Z",
      },
      created_at: "2026-03-31T10:00:00Z",
      updated_at: "2026-03-31T10:00:00Z",
    },
  };

  await createRoot(async dispose => {
    const hook = useWalletConnect({
      signInWithGoogle: async () => {
        throw new Error("unreachable");
      },
      createWalletChallenge: async () => {
        throw new Error("unreachable");
      },
      connectWallet: async payload => {
        assert.deepEqual(payload, request);
        return response;
      },
      fetchMe: async () => {
        throw new Error("unreachable");
      },
    });

    const result = await hook.connect(request);
    assert.equal(result.user.username, "wallet_user");
    assert.equal(hook.status(), "success");
    assert.equal(hook.response()?.user.username, "wallet_user");
    dispose();
  });
});

test("useMe fetches authenticated user state", async () => {
  const response: MeResponse = {
    user: {
      id: "user-3",
      email: "sabi@example.com",
      username: null,
      display_name: "Sabi",
      avatar_url: null,
      wallet: null,
      created_at: "2026-03-31T10:00:00Z",
      updated_at: "2026-03-31T10:00:00Z",
    },
  };

  await createRoot(async dispose => {
    const hook = useMe({
      signInWithGoogle: async () => {
        throw new Error("unreachable");
      },
      createWalletChallenge: async () => {
        throw new Error("unreachable");
      },
      connectWallet: async () => {
        throw new Error("unreachable");
      },
      fetchMe: async token => {
        assert.equal(token, "session-token");
        return response;
      },
    });

    const result = await hook.fetchMe("session-token");
    assert.equal(result.user.id, "user-3");
    assert.equal(hook.status(), "success");
    assert.equal(hook.response()?.user.id, "user-3");
    dispose();
  });
});

test(
  "live /auth/me rejects requests without a bearer token",
  { skip: !liveAuthBackendAvailable },
  async () => {
    const response = await originalFetch(`${liveAuthBaseUrl}/auth/me`);

    assert.equal(response.status, 401);
    assert.deepEqual(await readJson<ErrorResponse>(response), {
      error: "missing bearer token",
    });
  },
);

test(
  "live /auth/google/sign-in validates the required credential payload",
  { skip: !liveAuthBackendAvailable },
  async () => {
    const response = await originalFetch(`${liveAuthBaseUrl}/auth/google/sign-in`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    assert.equal(response.status, 422);
    assert.match(await response.text(), /missing field `credential`/);
  },
);

test(
  "live createWalletChallenge returns a challenge for a valid wallet address",
  { skip: !liveAuthBackendAvailable },
  async () => {
    const client = createAuthClient({ baseUrl: liveAuthBaseUrl });
    const response = await client.createWalletChallenge({
      wallet_address: "0x0000000000000000000000000000000000000000",
    });

    assert.match(
      response.challenge_id,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    assert.match(response.message, /Wallet: 0x0000000000000000000000000000000000000000/);
    assert.ok(Number.isFinite(Date.parse(response.expires_at)));
  },
);

test(
  "live connectWallet rejects invalid signatures",
  { skip: !liveAuthBackendAvailable },
  async () => {
    const client = createAuthClient({ baseUrl: liveAuthBaseUrl });
    const challenge = await client.createWalletChallenge({
      wallet_address: "0x0000000000000000000000000000000000000000",
    });

    await assert.rejects(
      () =>
        client.connectWallet({
          challenge_id: challenge.challenge_id,
          signature: "0xdeadbeef",
          username: "wallet_user",
        }),
      (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 400);
        assert.equal(error.message, "invalid wallet signature");
        return true;
      },
    );
  },
);

test(
  "live fetchMe surfaces invalid bearer tokens through the auth client",
  { skip: !liveAuthBackendAvailable },
  async () => {
    const client = createAuthClient({ baseUrl: liveAuthBaseUrl });

    await assert.rejects(
      () => client.fetchMe("fake-token"),
      (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 401);
        assert.equal(error.message, "invalid bearer token");
        return true;
      },
    );
  },
);
