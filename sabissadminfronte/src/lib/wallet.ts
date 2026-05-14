export interface WalletProvider {
  kind: "freighter";
}

export type WalletKind = "freighter";

export interface DiscoveredWallet {
  id: string;
  kind: WalletKind;
  name: string;
  icon?: string;
  provider: WalletProvider;
  source: "freighter";
}

export interface StoredWalletPreference {
  walletKind: WalletKind;
  walletAddress?: string;
}

interface FreighterErrorLike {
  code?: unknown;
  ext?: unknown;
  message?: unknown;
}

type FreighterModule = typeof import("@stellar/freighter-api");

const WALLET_PREFERENCE_STORAGE_KEY = "sabi_wallet_preference";
const FREIGHTER_PROVIDER: WalletProvider = Object.freeze({
  kind: "freighter",
});
const FREIGHTER_WALLET: DiscoveredWallet = Object.freeze({
  id: "freighter",
  kind: "freighter",
  name: "Freighter",
  provider: FREIGHTER_PROVIDER,
  source: "freighter",
});

let freighterModulePromise: Promise<FreighterModule> | null = null;

function loadFreighterModule(): Promise<FreighterModule> {
  freighterModulePromise ??= import("@stellar/freighter-api");
  return freighterModulePromise;
}

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function normalizeWalletAddress(value: string): string {
  return value.trim().toUpperCase();
}

function bytesToBase64(bytes: Uint8Array): string | null {
  if (typeof btoa !== "function") {
    return null;
  }

  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function createWalletError(error: FreighterErrorLike | undefined, fallbackMessage: string) {
  const message =
    typeof error?.message === "string" && error.message.trim().length > 0
      ? error.message
      : fallbackMessage;
  const walletError = new Error(message) as Error & {
    code?: number;
    ext?: string[];
  };

  if (typeof error?.code === "number") {
    walletError.code = error.code;
  }

  if (Array.isArray(error?.ext)) {
    walletError.ext = error.ext.filter(
      (value): value is string => typeof value === "string" && value.trim().length > 0,
    );
  }

  return walletError;
}

function normalizeSignedMessage(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  if (value instanceof Uint8Array) {
    return bytesToBase64(value);
  }

  return null;
}

export function getDefaultWalletProvider(): WalletProvider {
  return FREIGHTER_PROVIDER;
}

export async function discoverInjectedWallets(
  _targetWindow?: unknown,
  _waitMs = 140,
): Promise<DiscoveredWallet[]> {
  if (typeof window === "undefined") {
    return [];
  }

  const { isConnected } = await loadFreighterModule();
  const response = await isConnected();

  if (response.error || !response.isConnected) {
    return [];
  }

  return [FREIGHTER_WALLET];
}

export function shortenWalletAddress(address: string): string {
  if (address.length <= 12) {
    return address;
  }

  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

export function walletAddressesEqual(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  if (typeof left !== "string" || typeof right !== "string") {
    return false;
  }

  return normalizeWalletAddress(left) === normalizeWalletAddress(right);
}

export function readStoredWalletPreference(): StoredWalletPreference | null {
  if (!canUseStorage()) {
    return null;
  }

  try {
    const rawPreference = window.localStorage.getItem(WALLET_PREFERENCE_STORAGE_KEY);

    if (!rawPreference) {
      return null;
    }

    const parsedPreference = JSON.parse(rawPreference) as Partial<StoredWalletPreference>;

    if (parsedPreference.walletKind !== "freighter") {
      return null;
    }

    return {
      walletKind: "freighter",
      walletAddress:
        typeof parsedPreference.walletAddress === "string" &&
        parsedPreference.walletAddress.trim().length > 0
          ? parsedPreference.walletAddress.trim()
          : undefined,
    };
  } catch {
    return null;
  }
}

export function writeStoredWalletPreference(
  preference: StoredWalletPreference,
): StoredWalletPreference | null {
  if (!canUseStorage()) {
    return null;
  }

  const normalizedPreference: StoredWalletPreference = {
    walletKind: "freighter",
    ...(typeof preference.walletAddress === "string" &&
    preference.walletAddress.trim().length > 0
      ? { walletAddress: preference.walletAddress.trim() }
      : {}),
  };

  try {
    window.localStorage.setItem(
      WALLET_PREFERENCE_STORAGE_KEY,
      JSON.stringify(normalizedPreference),
    );

    return normalizedPreference;
  } catch {
    return null;
  }
}

export function clearStoredWalletPreference() {
  if (!canUseStorage()) {
    return;
  }

  try {
    window.localStorage.removeItem(WALLET_PREFERENCE_STORAGE_KEY);
  } catch {
    // Ignore storage cleanup failures on unsupported browsers.
  }
}

export async function requestWalletAccount(
  _provider: WalletProvider = FREIGHTER_PROVIDER,
): Promise<string> {
  const { requestAccess } = await loadFreighterModule();
  const response = await requestAccess();

  if (response.error) {
    throw createWalletError(response.error, "Wallet access request was rejected.");
  }

  const account = response.address.trim();

  if (account.length === 0) {
    throw new Error("Wallet did not return any accounts.");
  }

  return account;
}

export async function listWalletAccounts(
  _provider: WalletProvider = FREIGHTER_PROVIDER,
): Promise<string[]> {
  if (typeof window === "undefined") {
    return [];
  }

  const { getAddress } = await loadFreighterModule();
  const response = await getAddress();

  if (response.error) {
    return [];
  }

  const account = response.address.trim();
  return account.length > 0 ? [account] : [];
}

export async function signWalletMessage(
  _provider: WalletProvider,
  account: string,
  message: string,
): Promise<string> {
  const { signMessage } = await loadFreighterModule();
  
  // Ensure message has proper line endings for SEP-0011 compatible signing
  // Normalize to use \n consistently and ensure no trailing/leading whitespace
  const normalizedMessage = message.trim();
  
  const response = await signMessage(normalizedMessage, {
    address: account,
  });

  if (response.error) {
    throw createWalletError(response.error, "Wallet signature request was rejected.");
  }

  const signature = normalizeSignedMessage(response.signedMessage);

  if (!signature) {
    throw new Error("Wallet did not return a signature.");
  }

  return signature;
}
