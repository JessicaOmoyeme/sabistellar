import { isServer } from "solid-js/web";

const ADMIN_TOKEN_STORAGE_KEY = "sabi_admin_token";

export class MissingAdminTokenError extends Error {
  constructor() {
    super("Admin auth token is missing.");
    this.name = "MissingAdminTokenError";
  }
}

export function readAdminToken() {
  if (!canUseStorage()) {
    return null;
  }

  const token = window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY)?.trim();

  return token ? token : null;
}

export function writeAdminToken(token: string) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
}

export function clearAdminToken() {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
}

export function resolveAdminToken(token?: string | null) {
  const resolvedToken = token ?? readAdminToken();

  if (!resolvedToken) {
    throw new MissingAdminTokenError();
  }

  return resolvedToken;
}

function canUseStorage() {
  return !isServer && typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}
