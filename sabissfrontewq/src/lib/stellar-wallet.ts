import { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit";
import { Keypair, SigningError } from "stellar-sdk";

export interface StellarProvider {
  isConnected?: boolean;
  publicKey?: string;
  name: string;
  icon?: string;
}

export type StellarWalletKind = "freighter" | "lobstr" | "albedo" | "ledger" | "browser";

export interface DiscoveredStellarWallet {
  id: string;
  kind: StellarWalletKind;
  name: string;
  icon?: string;
  provider: StellarWalletsKit;
}

export interface StoredWalletPreference {
  walletKind: StellarWalletKind;
  walletAddress?: string;
}

const WALLET_KIND_LABELS: Record<StellarWalletKind, string> = {
  freighter: "Freighter",
  lobstr: "Lobstr",
  albedo: "Albedo",
  ledger: "Ledger",
  browser: "Browser Wallet",
};

const WALLET_PREFERENCE_STORAGE_KEY = "sabi_stellar_wallet_preference";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function normalizeWalletAddress(value: string): string {
  return value.trim().toUpperCase();
}

export function shortenWalletAddress(address: string): string {
  if (address.length <= 10) {
    return address;
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
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

    if (typeof parsedPreference.walletKind !== "string") {
      return null;
    }

    return {
      walletKind: parsedPreference.walletKind as StellarWalletKind,
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
    walletKind: preference.walletKind,
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

export async function discoverInstalledWallets(): Promise<DiscoveredStellarWallet[]> {
  if (typeof window === "undefined") {
    return [];
  }

  const wallets: DiscoveredStellarWallet[] = [];

  // Initialize Stellar Wallets Kit to detect available wallets
  const walletsKit = new StellarWalletsKit();

  // Check for Freighter
  if (typeof (window as any).freighter !== "undefined") {
    wallets.push({
      id: "freighter",
      kind: "freighter",
      name: WALLET_KIND_LABELS.freighter,
      provider: walletsKit,
    });
  }

  // Check for Lobstr
  if (typeof (window as any).Lobstr !== "undefined") {
    wallets.push({
      id: "lobstr",
      kind: "lobstr",
      name: WALLET_KIND_LABELS.lobstr,
      provider: walletsKit,
    });
  }

  // Check for Albedo
  if (typeof (window as any).albedo !== "undefined") {
    wallets.push({
      id: "albedo",
      kind: "albedo",
      name: WALLET_KIND_LABELS.albedo,
      provider: walletsKit,
    });
  }

  return wallets;
}

export async function requestWalletAccount(
  walletKit: StellarWalletsKit,
  walletKind: StellarWalletKind,
): Promise<string> {
  try {
    let publicKey: string;

    switch (walletKind) {
      case "freighter": {
        const result = await walletKit.requestOpenAccount(
          "freighter",
        );
        publicKey = result.publicKey;
        break;
      }
      case "lobstr": {
        const result = await walletKit.requestOpenAccount(
          "LOBSTR",
        );
        publicKey = result.publicKey;
        break;
      }
      case "albedo": {
        const result = await walletKit.requestOpenAccount(
          "albedo",
        );
        publicKey = result.publicKey;
        break;
      }
      case "ledger": {
        const result = await walletKit.requestOpenAccount(
          "ledger",
        );
        publicKey = result.publicKey;
        break;
      }
      default: {
        throw new Error(`Unsupported wallet kind: ${walletKind}`);
      }
    }

    if (!publicKey || publicKey.trim().length === 0) {
      throw new Error("Wallet did not return any account.");
    }

    return publicKey;
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : "Failed to request wallet account.",
    );
  }
}

export async function signWalletMessage(
  walletKit: StellarWalletsKit,
  walletKind: StellarWalletKind,
  message: string,
): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const messageBytes = encoder.encode(message);

    const result = await walletKit.signMessage({
      message: messageBytes,
      walletType: getWalletTypeForKind(walletKind),
    });

    if (!result.signature || result.signature.trim().length === 0) {
      throw new Error("Wallet did not return a signature.");
    }

    return result.signature;
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : "Failed to sign message with wallet.",
    );
  }
}

function getWalletTypeForKind(kind: StellarWalletKind): string {
  switch (kind) {
    case "freighter":
      return "freighter";
    case "lobstr":
      return "LOBSTR";
    case "albedo":
      return "albedo";
    case "ledger":
      return "ledger";
    default:
      throw new Error(`Unknown wallet kind: ${kind}`);
  }
}
