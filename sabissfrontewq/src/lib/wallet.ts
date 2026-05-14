export interface Eip1193RequestArguments {
  method: string;
  params?: readonly unknown[] | object;
}

export interface Eip1193Provider {
  request(args: Eip1193RequestArguments): Promise<unknown>;
  providers?: Eip1193Provider[];
  isMetaMask?: boolean;
  isCoinbaseWallet?: boolean;
  isBraveWallet?: boolean;
  isPhantom?: boolean;
  isRabby?: boolean;
  isTally?: boolean;
}

interface Eip6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

interface Eip6963ProviderDetail {
  info: Eip6963ProviderInfo;
  provider: Eip1193Provider;
}

interface Eip6963AnnounceProviderEvent extends Event {
  detail: Eip6963ProviderDetail;
}

interface WalletAwareWindow extends Window {
  ethereum?: Eip1193Provider;
  phantom?: {
    ethereum?: Eip1193Provider;
  };
}

export type WalletKind =
  | "metamask"
  | "coinbase"
  | "brave"
  | "phantom"
  | "rabby"
  | "tally"
  | "browser";

export interface DiscoveredWallet {
  id: string;
  kind: WalletKind;
  name: string;
  icon?: string;
  rdns?: string;
  provider: Eip1193Provider;
  source: "eip6963" | "legacy";
}

export interface StoredWalletPreference {
  walletKind: WalletKind;
  walletAddress?: string;
}

const WALLET_KIND_LABELS: Record<WalletKind, string> = {
  metamask: "MetaMask",
  coinbase: "Coinbase Wallet",
  brave: "Brave Wallet",
  phantom: "Phantom",
  rabby: "Rabby",
  tally: "Taho",
  browser: "Browser Wallet",
};
const WALLET_PREFERENCE_STORAGE_KEY = "sabi_wallet_preference";

function sleep(timeoutMs: number) {
  return new Promise(resolve => {
    window.setTimeout(resolve, timeoutMs);
  });
}

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function normalizeWalletAddress(value: string): string {
  return value.trim().toLowerCase();
}

function getWalletWindow(targetWindow?: WalletAwareWindow): WalletAwareWindow | undefined {
  if (targetWindow) {
    return targetWindow;
  }

  if (typeof window === "undefined") {
    return undefined;
  }

  return window as WalletAwareWindow;
}

function isSafeIconUrl(icon: string | undefined): icon is string {
  if (!icon) {
    return false;
  }

  return (
    icon.startsWith("data:image/") ||
    icon.startsWith("https://") ||
    icon.startsWith("http://")
  );
}

function inferWalletKindFromText(value: string | undefined): WalletKind | null {
  if (!value) {
    return null;
  }

  const normalizedValue = value.toLowerCase();

  if (normalizedValue.includes("brave")) {
    return "brave";
  }

  if (normalizedValue.includes("coinbase")) {
    return "coinbase";
  }

  if (normalizedValue.includes("phantom")) {
    return "phantom";
  }

  if (normalizedValue.includes("rabby")) {
    return "rabby";
  }

  if (normalizedValue.includes("tally") || normalizedValue.includes("taho")) {
    return "tally";
  }

  if (normalizedValue.includes("metamask")) {
    return "metamask";
  }

  return null;
}

function inferWalletKindFromProvider(provider: Eip1193Provider): WalletKind {
  if (provider.isBraveWallet) {
    return "brave";
  }

  if (provider.isCoinbaseWallet) {
    return "coinbase";
  }

  if (provider.isPhantom) {
    return "phantom";
  }

  if (provider.isRabby) {
    return "rabby";
  }

  if (provider.isTally) {
    return "tally";
  }

  if (provider.isMetaMask) {
    return "metamask";
  }

  return "browser";
}

function buildWalletFromProvider(
  provider: Eip1193Provider,
  detail?: Eip6963ProviderDetail,
): DiscoveredWallet {
  const inferredKind =
    inferWalletKindFromText(detail?.info.rdns) ??
    inferWalletKindFromText(detail?.info.name) ??
    inferWalletKindFromProvider(provider);
  const safeIcon = isSafeIconUrl(detail?.info.icon) ? detail.info.icon : undefined;
  const name = detail?.info.name?.trim() || WALLET_KIND_LABELS[inferredKind];
  const rdns = detail?.info.rdns?.trim();

  return {
    id: rdns || detail?.info.uuid || inferredKind,
    kind: inferredKind,
    name,
    icon: safeIcon,
    rdns,
    provider,
    source: detail ? "eip6963" : "legacy",
  };
}

function mergeWalletDetails(
  existingWallet: DiscoveredWallet,
  nextWallet: DiscoveredWallet,
): DiscoveredWallet {
  if (existingWallet.source === "eip6963" && nextWallet.source !== "eip6963") {
    return existingWallet;
  }

  if (nextWallet.source === "eip6963") {
    return {
      ...existingWallet,
      ...nextWallet,
      icon: nextWallet.icon || existingWallet.icon,
      rdns: nextWallet.rdns || existingWallet.rdns,
    };
  }

  return {
    ...existingWallet,
    icon: existingWallet.icon || nextWallet.icon,
    rdns: existingWallet.rdns || nextWallet.rdns,
  };
}

function collectLegacyProviders(walletWindow: WalletAwareWindow): Eip1193Provider[] {
  const providerSet = new Set<Eip1193Provider>();
  const rootProvider = walletWindow.ethereum;

  if (rootProvider) {
    if (Array.isArray(rootProvider.providers) && rootProvider.providers.length > 0) {
      for (const nestedProvider of rootProvider.providers) {
        providerSet.add(nestedProvider);
      }
    } else {
      providerSet.add(rootProvider);
    }
  }

  const phantomProvider = walletWindow.phantom?.ethereum;

  if (phantomProvider) {
    providerSet.add(phantomProvider);
  }

  return Array.from(providerSet);
}

function collectDiscoveredWallets(
  walletWindow: WalletAwareWindow,
  announcedProviders: Map<Eip1193Provider, Eip6963ProviderDetail>,
): DiscoveredWallet[] {
  const wallets: DiscoveredWallet[] = [];
  const providerIndex = new Map<Eip1193Provider, number>();
  const rdnsIndex = new Map<string, number>();

  const upsertWallet = (wallet: DiscoveredWallet) => {
    const matchingIndex =
      providerIndex.get(wallet.provider) ??
      (wallet.rdns ? rdnsIndex.get(wallet.rdns) : undefined);

    if (matchingIndex === undefined) {
      wallets.push(wallet);
      providerIndex.set(wallet.provider, wallets.length - 1);

      if (wallet.rdns) {
        rdnsIndex.set(wallet.rdns, wallets.length - 1);
      }

      return;
    }

    wallets[matchingIndex] = mergeWalletDetails(wallets[matchingIndex], wallet);
    providerIndex.set(wallet.provider, matchingIndex);

    if (wallet.rdns) {
      rdnsIndex.set(wallet.rdns, matchingIndex);
    }
  };

  for (const detail of announcedProviders.values()) {
    upsertWallet(buildWalletFromProvider(detail.provider, detail));
  }

  for (const provider of collectLegacyProviders(walletWindow)) {
    upsertWallet(buildWalletFromProvider(provider, announcedProviders.get(provider)));
  }

  return wallets;
}

export async function discoverInjectedWallets(
  targetWindow?: WalletAwareWindow,
  waitMs = 140,
): Promise<DiscoveredWallet[]> {
  const walletWindow = getWalletWindow(targetWindow);

  if (!walletWindow) {
    return [];
  }

  const announcedProviders = new Map<Eip1193Provider, Eip6963ProviderDetail>();
  const onProviderAnnouncement = (event: Event) => {
    const detail = (event as Eip6963AnnounceProviderEvent).detail;

    if (!detail?.provider) {
      return;
    }

    announcedProviders.set(detail.provider, detail);
  };

  walletWindow.addEventListener(
    "eip6963:announceProvider",
    onProviderAnnouncement as EventListener,
  );

  try {
    walletWindow.dispatchEvent(new Event("eip6963:requestProvider"));
    await sleep(waitMs);
  } finally {
    walletWindow.removeEventListener(
      "eip6963:announceProvider",
      onProviderAnnouncement as EventListener,
    );
  }

  return collectDiscoveredWallets(walletWindow, announcedProviders);
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
      walletKind: parsedPreference.walletKind as WalletKind,
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

export async function requestWalletAccount(provider: Eip1193Provider): Promise<string> {
  const response = await provider.request({
    method: "eth_requestAccounts",
  });

  if (!Array.isArray(response)) {
    throw new Error("Wallet did not return any accounts.");
  }

  const account = response.find(
    value => typeof value === "string" && value.trim().length > 0,
  );

  if (typeof account !== "string") {
    throw new Error("Wallet did not return any accounts.");
  }

  return account;
}

export async function listWalletAccounts(provider: Eip1193Provider): Promise<string[]> {
  const response = await provider.request({
    method: "eth_accounts",
  });

  if (!Array.isArray(response)) {
    return [];
  }

  return response.filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );
}

export async function requestWalletChainId(provider: Eip1193Provider): Promise<number> {
  const response = await provider.request({
    method: "eth_chainId",
  });

  if (typeof response === "number" && Number.isSafeInteger(response) && response >= 0) {
    return response;
  }

  if (typeof response === "string") {
    const normalizedResponse = response.trim();
    const parsedResponse = normalizedResponse.startsWith("0x")
      ? Number.parseInt(normalizedResponse, 16)
      : Number.parseInt(normalizedResponse, 10);

    if (Number.isSafeInteger(parsedResponse) && parsedResponse >= 0) {
      return parsedResponse;
    }
  }

  throw new Error("Wallet did not return a valid chain ID.");
}

function stringToHex(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let hex = "0x";

  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }

  return hex;
}

export async function signWalletMessage(
  provider: Eip1193Provider,
  account: string,
  message: string,
): Promise<string> {
  const hexMessage = stringToHex(message);
  const parameterSets: readonly (readonly [string, string])[] = [
    [message, account],
    [hexMessage, account],
    [account, message],
    [account, hexMessage],
  ];
  let lastError: unknown = null;

  for (const params of parameterSets) {
    try {
      const response = await provider.request({
        method: "personal_sign",
        params,
      });

      if (typeof response === "string" && response.length > 0) {
        return response;
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error("Wallet did not return a signature.");
}
