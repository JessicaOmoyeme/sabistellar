import type { AuthResponse, UserResponse } from "./types.ts";

export const AUTH_SESSION_STORAGE_KEY = "sabi_auth_session";

export interface StoredAuthSession {
  token: string;
  user: UserResponse;
}

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function readStoredAuthSession(): StoredAuthSession | null {
  if (!canUseStorage()) {
    return null;
  }

  try {
    const rawSession = window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY);

    if (!rawSession) {
      return null;
    }

    const parsedSession = JSON.parse(rawSession) as Partial<StoredAuthSession>;

    if (
      typeof parsedSession.token !== "string" ||
      typeof parsedSession.user !== "object" ||
      parsedSession.user === null
    ) {
      return null;
    }

    return {
      token: parsedSession.token,
      user: parsedSession.user as UserResponse,
    };
  } catch {
    return null;
  }
}

export function writeStoredAuthSession(
  session: AuthResponse | StoredAuthSession,
): StoredAuthSession | null {
  if (!canUseStorage()) {
    return null;
  }

  const normalizedSession: StoredAuthSession = {
    token: session.token,
    user: session.user,
  };

  try {
    window.localStorage.setItem(
      AUTH_SESSION_STORAGE_KEY,
      JSON.stringify(normalizedSession),
    );

    return normalizedSession;
  } catch {
    return null;
  }
}

export function clearStoredAuthSession() {
  if (!canUseStorage()) {
    return;
  }

  try {
    window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
  } catch {
    // Ignore storage cleanup failures on unsupported browsers.
  }
}

export function getUserDisplayLabel(user: UserResponse): string {
  if (typeof user.display_name === "string" && user.display_name.trim().length > 0) {
    return user.display_name.trim();
  }

  if (typeof user.username === "string" && user.username.trim().length > 0) {
    return user.username.trim();
  }

  if (typeof user.email === "string" && user.email.trim().length > 0) {
    return user.email.trim();
  }

  const walletAddress = user.wallet?.wallet_address;

  if (typeof walletAddress === "string" && walletAddress.length > 10) {
    return `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
  }

  return "Account";
}
