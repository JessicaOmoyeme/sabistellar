import { createSignal, onMount, type Accessor } from "solid-js";

import {
  connectAdminWallet,
  getAdminMe,
  requestAdminWalletChallenge,
  type AdminMeResponse,
  type AuthResponse,
  type WalletChallengeResponse,
  type WalletConnectRequest,
} from "~/lib/api/admin";
import { getErrorMessage, isApiError } from "~/lib/api/core";
import { clearAdminToken, readAdminToken, writeAdminToken } from "~/lib/auth/admin-session";
import {
  getInjectedEthereumProvider,
  requestEthereumAccounts,
  signPersonalMessage,
  type EthereumProvider,
} from "../wallet/ethereum";

interface UseAdminWalletAuthOptions {
  restoreOnMount?: boolean;
}

interface ConnectWithSignatureOptions {
  walletAddress: string;
  signMessage: (message: string) => Promise<string>;
  username?: string;
}

interface ConnectWithInjectedWalletOptions {
  walletAddress?: string;
  provider?: EthereumProvider | null;
  username?: string;
}

interface UseAdminWalletAuthResult {
  challenge: Accessor<WalletChallengeResponse | null>;
  clearError: () => void;
  completeConnection: (payload: WalletConnectRequest) => Promise<AuthResponse>;
  connectWithInjectedWallet: (
    options?: ConnectWithInjectedWalletOptions,
  ) => Promise<AuthResponse>;
  connectWithSignature: (options: ConnectWithSignatureOptions) => Promise<AuthResponse>;
  error: Accessor<string | null>;
  isAuthenticated: () => boolean;
  logout: () => void;
  pending: Accessor<boolean>;
  profile: Accessor<AdminMeResponse | null>;
  refreshProfile: (token?: string | null) => Promise<AdminMeResponse | null>;
  requestChallenge: (walletAddress: string) => Promise<WalletChallengeResponse>;
  restoreSession: () => Promise<AdminMeResponse | null>;
  session: Accessor<AuthResponse | null>;
}

export function useAdminWalletAuth(
  options: UseAdminWalletAuthOptions = {},
): UseAdminWalletAuthResult {
  const [session, setSession] = createSignal<AuthResponse | null>(null);
  const [profile, setProfile] = createSignal<AdminMeResponse | null>(null);
  const [challenge, setChallenge] = createSignal<WalletChallengeResponse | null>(null);
  const [pending, setPending] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  async function requestChallenge(walletAddress: string) {
    setPending(true);
    setError(null);

    try {
      const nextChallenge = await requestAdminWalletChallenge({
        wallet_address: walletAddress,
      });

      setChallenge(nextChallenge);

      return nextChallenge;
    } catch (authError) {
      setError(getErrorMessage(authError));
      throw authError;
    } finally {
      setPending(false);
    }
  }

  async function completeConnection(payload: WalletConnectRequest) {
    setPending(true);
    setError(null);

    try {
      const nextSession = await connectAdminWallet(payload);
      writeAdminToken(nextSession.token);
      setSession(nextSession);
      try {
        await refreshProfile(nextSession.token);
      } catch (profileError) {
        clearAdminToken();
        setSession(null);
        setProfile(null);
        throw profileError;
      }

      return nextSession;
    } catch (authError) {
      setError(getErrorMessage(authError));
      throw authError;
    } finally {
      setPending(false);
    }
  }

  async function connectWithSignature({
    walletAddress,
    signMessage,
    username,
  }: ConnectWithSignatureOptions) {
    const nextChallenge = await requestChallenge(walletAddress);
    const signature = await signMessage(nextChallenge.message);

    return completeConnection({
      challenge_id: nextChallenge.challenge_id,
      signature,
      username,
    });
  }

  async function connectWithInjectedWallet({
    walletAddress,
    provider = getInjectedEthereumProvider(),
    username,
  }: ConnectWithInjectedWalletOptions = {}) {
    const selectedWalletAddress =
      walletAddress ?? (await requestEthereumAccounts(provider))[0];

    if (!selectedWalletAddress) {
      throw new Error("No wallet account available.");
    }

    return connectWithSignature({
      walletAddress: selectedWalletAddress,
      username,
      signMessage: message => signPersonalMessage(message, selectedWalletAddress, provider),
    });
  }

  async function refreshProfile(token = readAdminToken()) {
    if (!token) {
      setProfile(null);
      return null;
    }

    try {
      const nextProfile = await getAdminMe(token);
      setProfile(nextProfile);
      setSession(currentSession =>
        currentSession ?? {
          token,
          user: nextProfile.user,
        },
      );

      return nextProfile;
    } catch (profileError) {
      if (isApiError(profileError) && (profileError.status === 401 || profileError.status === 403)) {
        logout();
      }

      throw profileError;
    }
  }

  async function restoreSession() {
    const token = readAdminToken();

    if (!token) {
      setSession(null);
      setProfile(null);
      return null;
    }

    setPending(true);
    setError(null);

    try {
      return await refreshProfile(token);
    } catch (restoreError) {
      setError(getErrorMessage(restoreError));
      throw restoreError;
    } finally {
      setPending(false);
    }
  }

  function clearError() {
    setError(null);
  }

  function logout() {
    clearAdminToken();
    setChallenge(null);
    setSession(null);
    setProfile(null);
    setError(null);
  }

  onMount(() => {
    if (options.restoreOnMount === false) {
      return;
    }

    void restoreSession().catch(() => undefined);
  });

  return {
    challenge,
    clearError,
    completeConnection,
    connectWithInjectedWallet,
    connectWithSignature,
    error,
    isAuthenticated: () => Boolean(readAdminToken()),
    logout,
    pending,
    profile,
    refreshProfile,
    requestChallenge,
    restoreSession,
    session,
  };
}
