import {
  discoverInjectedWallets,
  getDefaultWalletProvider,
  requestWalletAccount as requestWalletAccountBase,
  shortenWalletAddress,
  signWalletMessage as signWalletMessageBase,
  type DiscoveredWallet,
  type WalletKind,
  type WalletProvider,
} from "../wallet.ts";

export type EthereumProvider = WalletProvider;

export {
  discoverInjectedWallets,
  shortenWalletAddress,
  type DiscoveredWallet,
  type WalletKind,
};

export function getInjectedEthereumProvider(): EthereumProvider {
  return getDefaultWalletProvider();
}

export async function requestWalletAccount(
  provider: EthereumProvider | null = getInjectedEthereumProvider(),
) {
  return requestWalletAccountBase(provider ?? getInjectedEthereumProvider());
}

export async function requestEthereumAccounts(
  provider: EthereumProvider | null = getInjectedEthereumProvider(),
) {
  return [await requestWalletAccount(provider)];
}

export async function signWalletMessage(
  provider: EthereumProvider | null,
  account: string,
  message: string,
) {
  return signWalletMessageBase(provider ?? getInjectedEthereumProvider(), account, message);
}

export async function signPersonalMessage(
  message: string,
  walletAddress: string,
  provider: EthereumProvider | null = getInjectedEthereumProvider(),
) {
  return signWalletMessage(provider, walletAddress, message);
}
