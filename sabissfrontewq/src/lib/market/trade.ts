import {
  discoverInjectedWallets,
  listWalletAccounts,
  requestWalletAccount,
  requestWalletChainId,
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
    wallet,
    walletAddress,
    chainId,
    preparedTransactions,
  } = options;

  if (preparedTransactions.length === 0) {
    return [];
  }

  const connectedAccount = await requestWalletAccount(wallet.provider);

  if (!walletAddressesEqual(connectedAccount, walletAddress)) {
    throw new Error("Connected wallet account does not match the signed-in account.");
  }

  if (typeof chainId === "number") {
    const connectedChainId = await requestWalletChainId(wallet.provider);

    if (connectedChainId !== chainId) {
      throw new Error(
        `Connected wallet is on chain ${connectedChainId}, expected ${chainId}.`,
      );
    }
  }

  const transactionHashes: string[] = [];

  for (const preparedTransaction of preparedTransactions) {
    const response = await wallet.provider.request({
      method: "eth_sendTransaction",
      params: [
        {
          from: connectedAccount,
          to: preparedTransaction.target,
          data: preparedTransaction.data,
          value: preparedTransaction.value,
        },
      ],
    });

    if (typeof response !== "string" || response.length === 0) {
      throw new Error(
        `Wallet did not return a transaction hash for ${preparedTransaction.kind}.`,
      );
    }

    transactionHashes.push(response);
  }

  return transactionHashes;
}
