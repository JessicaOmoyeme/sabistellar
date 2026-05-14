import {
  discoverInjectedWallets,
  listWalletAccounts,
  walletAddressesEqual,
  type DiscoveredWallet,
  type WalletKind,
} from "../wallet.ts";
import type { PreparedWalletCallResponse } from "./types.ts";

export interface ExecutePreparedMarketTransactionsOptions {
  wallet: DiscoveredWallet;
  walletAddress: string;
  chainId?: number;
  preparedTransactions: readonly PreparedWalletCallResponse[];
}

export async function resolveTradeWallet(
  walletAddress: string,
  preferredWalletKind?: WalletKind,
): Promise<DiscoveredWallet | null> {
  const wallets = await discoverInjectedWallets();

  if (wallets.length === 0) {
    return null;
  }

  const matchingWallets = preferredWalletKind
    ? [
        ...wallets.filter(wallet => wallet.kind === preferredWalletKind),
        ...wallets.filter(wallet => wallet.kind !== preferredWalletKind),
      ]
    : wallets;

  for (const wallet of matchingWallets) {
    const accounts = await listWalletAccounts(wallet.provider);

    if (accounts.some(account => walletAddressesEqual(account, walletAddress))) {
      return wallet;
    }
  }

  if (preferredWalletKind) {
    return wallets.find(wallet => wallet.kind === preferredWalletKind) ?? null;
  }

  return wallets.length === 1 ? wallets[0] ?? null : null;
}

export async function executePreparedMarketTransactions(
  options: ExecutePreparedMarketTransactionsOptions,
): Promise<string[]> {
  const {
    wallet: _wallet,
    walletAddress: _walletAddress,
    chainId: _chainId,
    preparedTransactions,
  } = options;

  if (preparedTransactions.length === 0) {
    return [];
  }

  const firstPreparedTransaction = preparedTransactions[0] as Record<string, unknown>;

  if (
    typeof firstPreparedTransaction.target === "string" ||
    typeof firstPreparedTransaction.data === "string"
  ) {
    throw new Error(
      "This client is configured for a Stellar wallet, but the backend still returned EVM wallet transactions. Update the trade API to return a Stellar execution path.",
    );
  }

  throw new Error("Unsupported wallet transaction format returned by the backend.");
}
