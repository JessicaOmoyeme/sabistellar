import {
  For,
  Show,
  createEffect,
  createSignal,
  onCleanup,
  type Component,
} from "solid-js";
import { Portal } from "solid-js/web";

import {
  type AuthResponse,
  type WalletChallengeResponse,
  type WalletConnectRequest,
} from "~/lib/api/admin";
import { ApiError } from "~/lib/api/core";
import {
  discoverInjectedWallets,
  requestWalletAccount,
  shortenWalletAddress,
  signWalletMessage,
  type DiscoveredWallet,
  type WalletKind,
} from "../lib/wallet/ethereum";

interface AdminAuthDialogProps {
  open: boolean;
  pending: boolean;
  onClose: () => void;
  requestChallenge: (walletAddress: string) => Promise<WalletChallengeResponse>;
  completeConnection: (payload: WalletConnectRequest) => Promise<AuthResponse>;
}

interface PendingWalletConnect {
  account: string;
  challengeId: string;
  signature: string;
}

type AuthPhase =
  | "idle"
  | "discovering"
  | "requesting_account"
  | "challenge"
  | "signing"
  | "verifying"
  | "username"
  | "success";

const walletSkeletonTiles = Array.from({ length: 1 });

function FreighterIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="10" fill="#102a66" />
      <path
        d="M10.5 21.5c2.5-6.44 6.03-10.8 11.12-13.72-.96 1.93-1.71 4.15-2.23 6.69 2.05.26 3.86 1 5.41 2.23-4.57-.2-7.95 1.77-11.42 7.3l-2.88-2.5Z"
        fill="#fff"
      />
      <circle cx="22.6" cy="9.4" r="1.75" fill="#7dd3fc" />
    </svg>
  );
}

function BrowserWalletIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <rect x="2.25" y="3.5" width="15.5" height="13" rx="3" fill="#102a66" />
      <rect x="4.25" y="5.5" width="11.5" height="9" rx="2" fill="#eff6ff" />
      <path
        d="M8.2 12.6V8.1h2.45c1.13 0 1.85.62 1.85 1.62 0 .62-.29 1.1-.8 1.36l1.04 1.52H11.2l-.83-1.27H9.55v1.27H8.2Zm1.35-2.39h.96c.45 0 .74-.2.74-.56 0-.36-.29-.56-.74-.56h-.96v1.12Z"
        fill="#102a66"
      />
    </svg>
  );
}

function getFallbackWalletIcon(kind: WalletKind): Component {
  switch (kind) {
    case "freighter":
      return FreighterIcon;
    default:
      return BrowserWalletIcon;
  }
}

function WalletTileIcon(props: { wallet: DiscoveredWallet }) {
  const [useFallbackIcon, setUseFallbackIcon] = createSignal(false);
  const FallbackIcon = getFallbackWalletIcon(props.wallet.kind);

  return (
    <Show when={props.wallet.icon && !useFallbackIcon()} fallback={<FallbackIcon />}>
      <img
        src={props.wallet.icon}
        alt=""
        loading="lazy"
        referrerpolicy="no-referrer"
        onError={() => setUseFallbackIcon(true)}
      />
    </Show>
  );
}

function isUsernameRequiredError(error: unknown) {
  return (
    error instanceof ApiError &&
    error.status === 400 &&
    error.message === "username is required for new wallet users"
  );
}

function validateWalletUsername(value: string) {
  const normalizedValue = value.trim().toLowerCase();

  if (normalizedValue.length === 0) {
    return "Enter a username to continue.";
  }

  if (normalizedValue.length < 3 || normalizedValue.length > 24) {
    return "Username must be between 3 and 24 characters.";
  }

  if (!/^[a-z0-9_]+$/.test(normalizedValue)) {
    return "Username can only use letters, numbers, and underscores.";
  }

  return null;
}

function getAdminWalletErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 403 && error.message === "admin access required") {
      return "This wallet is not on the admin allowlist.";
    }

    return error.message;
  }

  if (typeof error === "object" && error !== null && "code" in error) {
    const errorCode = (error as { code?: unknown }).code;

    if (errorCode === 4001) {
      return "Signature request rejected in your wallet.";
    }

    if (errorCode === -32002) {
      return "Open your wallet to continue the pending request.";
    }
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Unable to complete admin wallet sign-in.";
}

function getPhaseLabel(phase: AuthPhase) {
  switch (phase) {
    case "discovering":
    case "requesting_account":
    case "challenge":
      return "Wallet";
    case "signing":
      return "Signature";
    case "verifying":
      return "Verifying";
    case "username":
      return "Username";
    case "success":
      return "Connected";
    default:
      return null;
  }
}

export default function AdminAuthDialog(props: AdminAuthDialogProps) {
  const [wallets, setWallets] = createSignal<DiscoveredWallet[]>([]);
  const [isDiscoveringWallets, setDiscoveringWallets] = createSignal(false);
  const [activeWalletId, setActiveWalletId] = createSignal<string | null>(null);
  const [walletUsername, setWalletUsername] = createSignal("");
  const [pendingWalletConnect, setPendingWalletConnect] =
    createSignal<PendingWalletConnect | null>(null);
  const [statusMessage, setStatusMessage] = createSignal<string | null>(null);
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);
  const [phase, setPhase] = createSignal<AuthPhase>("idle");
  let discoveryId = 0;
  let closeTimer: number | undefined;

  createEffect(() => {
    if (!props.open || typeof document === "undefined") {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !props.pending) {
        props.onClose();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    onCleanup(() => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    });
  });

  createEffect(() => {
    if (!props.open) {
      discoveryId += 1;
      setWallets([]);
      setDiscoveringWallets(false);
      setActiveWalletId(null);
      setWalletUsername("");
      setPendingWalletConnect(null);
      setStatusMessage(null);
      setErrorMessage(null);
      setPhase("idle");

      if (closeTimer !== undefined) {
        window.clearTimeout(closeTimer);
        closeTimer = undefined;
      }

      return;
    }

    const currentDiscoveryId = ++discoveryId;

    setDiscoveringWallets(true);
    setErrorMessage(null);
    setStatusMessage("Choose a wallet to continue.");
    setPhase("discovering");

    void discoverInjectedWallets()
      .then((discoveredWallets: DiscoveredWallet[]) => {
        if (currentDiscoveryId !== discoveryId) {
          return;
        }

        setWallets(discoveredWallets);
        setStatusMessage(
          discoveredWallets.length > 0
            ? "Choose a wallet to continue."
            : "No Stellar wallet found in this browser.",
        );
      })
      .catch((error: unknown) => {
        if (currentDiscoveryId !== discoveryId) {
          return;
        }

        setErrorMessage(getAdminWalletErrorMessage(error));
        setStatusMessage(null);
        setPhase("idle");
      })
      .finally(() => {
        if (currentDiscoveryId !== discoveryId) {
          return;
        }

        setDiscoveringWallets(false);
      });
  });

  async function attemptConnection(pendingConnect: PendingWalletConnect, username?: string) {
    const normalizedUsername = username?.trim().toLowerCase() || undefined;

    await props.completeConnection({
      challenge_id: pendingConnect.challengeId,
      signature: pendingConnect.signature,
      ...(normalizedUsername ? { username: normalizedUsername } : {}),
    });

    setPendingWalletConnect(null);
    setWalletUsername("");
    setPhase("success");
    setStatusMessage(`Connected ${shortenWalletAddress(pendingConnect.account)}.`);

    closeTimer = window.setTimeout(() => {
      props.onClose();
    }, 650);
  }

  async function handleWalletClick(wallet: DiscoveredWallet) {
    setActiveWalletId(wallet.id);
    setPendingWalletConnect(null);
    setWalletUsername("");
    setErrorMessage(null);

    try {
      setPhase("requesting_account");
      setStatusMessage(`Open ${wallet.name} to continue.`);
      const account = await requestWalletAccount(wallet.provider);

      setPhase("challenge");
      setStatusMessage("Requesting challenge...");
      const challenge = await props.requestChallenge(account);

      setPhase("signing");
      setStatusMessage(`Sign the message in ${wallet.name}.`);
      const signature = await signWalletMessage(wallet.provider, account, challenge.message);
      const pendingConnect = {
        account,
        challengeId: challenge.challenge_id,
        signature,
      };

      setPhase("verifying");
      setStatusMessage("Verifying access...");

      try {
        await attemptConnection(pendingConnect);
      } catch (error) {
        if (isUsernameRequiredError(error)) {
          setPendingWalletConnect(pendingConnect);
          setPhase("username");
          setStatusMessage("Choose a username to finish setup.");
          setErrorMessage(null);
          return;
        }

        throw error;
      }
    } catch (error) {
      setPhase("idle");
      setStatusMessage(null);
      setErrorMessage(getAdminWalletErrorMessage(error));
    } finally {
      setActiveWalletId(null);
    }
  }

  async function handleWalletUsernameSubmit(event: SubmitEvent) {
    event.preventDefault();

    const pendingConnect = pendingWalletConnect();

    if (!pendingConnect) {
      return;
    }

    const normalizedUsername = walletUsername().trim().toLowerCase();
    const validationError = validateWalletUsername(normalizedUsername);

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setErrorMessage(null);
    setActiveWalletId(pendingConnect.challengeId);
    setPhase("verifying");
    setStatusMessage("Finishing setup...");

    try {
      await attemptConnection(pendingConnect, normalizedUsername);
    } catch (error) {
      setPhase("username");
      setStatusMessage("Choose a username to finish setup.");
      setErrorMessage(getAdminWalletErrorMessage(error));
    } finally {
      setActiveWalletId(null);
    }
  }

  return (
    <Show when={props.open}>
      <Portal>
        <div
          class="pm-connect-modal__overlay"
          onClick={() => {
            if (!props.pending) {
              props.onClose();
            }
          }}
        >
          <section
            class="pm-connect-modal__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-auth-dialog-title"
            onClick={event => event.stopPropagation()}
          >
            <div class="pm-connect-modal__header">
              <div>
                <Show when={getPhaseLabel(phase())}>
                  {label => <p class="pm-connect-modal__eyebrow">{label()}</p>}
                </Show>
                <h2 class="pm-connect-modal__title" id="admin-auth-dialog-title">
                  {pendingWalletConnect() ? "Choose username" : "Connect wallet"}
                </h2>
                <p class="pm-connect-modal__subtitle">
                  {pendingWalletConnect()
                    ? "This wallet needs a username for its first admin session."
                    : "Select an installed wallet."}
                </p>
              </div>

              <button
                class="pm-connect-modal__close"
                type="button"
                aria-label="Close connect wallet dialog"
                disabled={props.pending}
                onClick={props.onClose}
              >
                Close
              </button>
            </div>

            <div class="pm-connect-modal__body">
              <Show
                when={pendingWalletConnect()}
                fallback={
                  <Show
                    when={!isDiscoveringWallets() || wallets().length > 0}
                    fallback={
                      <div class="pm-connect-wallet-grid" aria-hidden="true">
                        <For each={walletSkeletonTiles}>
                          {() => <div class="pm-connect-wallet-skeleton" />}
                        </For>
                      </div>
                    }
                  >
                    <Show
                      when={wallets().length > 0}
                      fallback={
                        <div class="pm-connect-wallet-empty">
                          <p>No Stellar wallet found.</p>
                          <p>Install the Freighter browser extension to continue.</p>
                        </div>
                      }
                    >
                      <div class="pm-connect-wallet-grid">
                        <For each={wallets()}>
                          {wallet => (
                            <button
                              class={`pm-connect-wallet-tile${
                                activeWalletId() === wallet.id
                                  ? " pm-connect-wallet-tile--active"
                                  : ""
                              }`}
                              type="button"
                              aria-label={`Connect ${wallet.name}`}
                              disabled={props.pending || activeWalletId() !== null}
                              onClick={() => void handleWalletClick(wallet)}
                            >
                              <span class="pm-connect-wallet-tile__icon">
                                <WalletTileIcon wallet={wallet} />
                              </span>
                              <span class="pm-connect-wallet-tile__name">{wallet.name}</span>
                            </button>
                          )}
                        </For>
                      </div>
                    </Show>
                  </Show>
                }
              >
                {pendingConnect => (
                  <form class="pm-connect-username" onSubmit={handleWalletUsernameSubmit}>
                    <div class="pm-connect-username__header">
                      <h3 class="pm-connect-username__title">Finish setup</h3>
                      <p class="pm-connect-username__hint">
                        This wallet is approved. Add a username to continue.
                      </p>
                    </div>

                    <div class="pm-connect-username__selected">
                      <span class="pm-connect-username__selected-label">Wallet</span>
                      <span class="pm-connect-username__selected-value">
                        {shortenWalletAddress(pendingConnect().account)}
                      </span>
                    </div>

                    <label class="pm-connect-username__field">
                      <span class="pm-connect-username__label">Username</span>
                      <input
                        class="pm-connect-username__input"
                        type="text"
                        name="username"
                        autocomplete="username"
                        inputMode="text"
                        spellcheck={false}
                        placeholder="sabi_operator"
                        value={walletUsername()}
                        onInput={event => setWalletUsername(event.currentTarget.value)}
                      />
                    </label>

                    <div class="pm-connect-username__actions">
                      <button class="pm-button pm-button--primary" type="submit" disabled={props.pending}>
                        {activeWalletId() === pendingConnect().challengeId
                          ? "Continuing..."
                          : "Continue"}
                      </button>
                      <button
                        class="pm-button pm-button--ghost"
                        type="button"
                        disabled={props.pending}
                        onClick={() => {
                          setPendingWalletConnect(null);
                          setWalletUsername("");
                          setPhase("idle");
                          setStatusMessage("Choose a wallet to continue.");
                          setErrorMessage(null);
                        }}
                      >
                        Choose another wallet
                      </button>
                    </div>
                  </form>
                )}
              </Show>

              <Show when={statusMessage() || errorMessage()}>
                <p
                  class={`pm-connect-feedback${
                    errorMessage() ? " pm-connect-feedback--error" : ""
                  }`}
                  role={errorMessage() ? "alert" : "status"}
                >
                  {errorMessage() || statusMessage()}
                </p>
              </Show>
            </div>
          </section>
        </div>
      </Portal>
    </Show>
  );
}
