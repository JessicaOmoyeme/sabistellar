import { A, useLocation } from "@solidjs/router";
import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";

import type { AdminMeResponse, UserResponse } from "~/lib/api/admin";
import { useAdminAuth } from "~/lib/admin-auth-context";
import { faucetClient, formatUsdcBaseUnits } from "~/lib/faucet";
import { shortenWalletAddress } from "~/lib/wallet/ethereum";
import DepositModal from "./DepositModal";

const featuredLinks = [
  { label: "Trending", href: "/" },
  { label: "Categories", href: "/categories" },
  { label: "Tags", href: "/tags" },
] as const;

const utilityLinks = [
  { label: "All markets", href: "/#all-markets" },
  { label: "About", href: "/about" },
] as const;

interface AvatarPreset {
  backgroundColor: string;
  borderColor: string;
  color: string;
}

const avatarPresets: readonly AvatarPreset[] = [
  {
    backgroundColor: "#fde68a",
    borderColor: "rgba(133, 77, 14, 0.16)",
    color: "#854d0e",
  },
  {
    backgroundColor: "#dbeafe",
    borderColor: "rgba(29, 78, 216, 0.14)",
    color: "#1d4ed8",
  },
  {
    backgroundColor: "#fecdd3",
    borderColor: "rgba(190, 18, 60, 0.14)",
    color: "#be123c",
  },
  {
    backgroundColor: "#dcfce7",
    borderColor: "rgba(21, 128, 61, 0.14)",
    color: "#15803d",
  },
  {
    backgroundColor: "#ede9fe",
    borderColor: "rgba(109, 40, 217, 0.14)",
    color: "#6d28d9",
  },
  {
    backgroundColor: "#cffafe",
    borderColor: "rgba(15, 118, 110, 0.14)",
    color: "#0f766e",
  },
] as const;

function SearchIcon() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <path
        d="M15.75 15.75L11.6386 11.6386"
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.5"
      />
      <path
        d="M7.75 13.25C10.7875 13.25 13.25 10.7875 13.25 7.75C13.25 4.7125 10.7875 2.25 7.75 2.25C4.7125 2.25 2.25 4.7125 2.25 7.75C2.25 10.7875 4.7125 13.25 7.75 13.25Z"
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.5"
      />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <path
        d="M9 1C4.5889 1 1 4.5889 1 9C1 13.4111 4.5889 17 9 17C13.4111 17 17 13.4111 17 9C17 4.5889 13.4111 1 9 1ZM9.75 12.75C9.75 13.1641 9.4141 13.5 9 13.5C8.5859 13.5 8.25 13.1641 8.25 12.75V9.5H7.75C7.3359 9.5 7 9.1641 7 8.75C7 8.3359 7.3359 8 7.75 8H8.5C9.1895 8 9.75 8.5605 9.75 9.25V12.75ZM9 6.75C8.448 6.75 8 6.301 8 5.75C8 5.199 8.448 4.75 9 4.75C9.552 4.75 10 5.199 10 5.75C10 6.301 9.552 6.75 9 6.75Z"
        fill="currentColor"
      />
    </svg>
  );
}

function TrendingIcon() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <path
        d="M1.75,12.25l3.646-3.646c.195-.195,.512-.195,.707,0l3.293,3.293c.195,.195,.512,.195,.707,0l6.146-6.146"
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.5"
      />
      <polyline
        fill="none"
        points="11.25 5.75 16.25 5.75 16.25 10.75"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.5"
      />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <polyline
        fill="none"
        points="1.75 4.25 6 8.5 10.25 4.25"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.5"
      />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <path
        d="M15.75,9.75H2.25c-.414,0-.75-.336-.75-.75s.336-.75,.75-.75H15.75c.414,0,.75,.336,.75,.75s-.336,.75-.75,.75Z"
        fill="currentColor"
      />
      <path
        d="M15.75,4.5H2.25c-.414,0-.75-.336-.75-.75s.336-.75,.75-.75H15.75c.414,0,.75,.336,.75,.75s-.336,.75-.75,.75Z"
        fill="currentColor"
      />
      <path
        d="M15.75,15H2.25c-.414,0-.75-.336-.75-.75s.336-.75,.75-.75H15.75c.414,0,.75,.336,.75,.75s-.336,.75-.75,.75Z"
        fill="currentColor"
      />
    </svg>
  );
}

function hashValue(value: string): number {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function getAvatarPreset(user: UserResponse): AvatarPreset {
  const seed =
    user.id ||
    user.email ||
    user.username ||
    user.wallet?.wallet_address ||
    user.created_at;

  return avatarPresets[hashValue(seed) % avatarPresets.length];
}

function getUserDisplayLabel(user: UserResponse) {
  if (user.display_name?.trim()) {
    return user.display_name.trim();
  }

  if (user.username?.trim()) {
    return `@${user.username.trim()}`;
  }

  if (user.email?.trim()) {
    return user.email.trim();
  }

  if (user.wallet?.wallet_address) {
    return shortenWalletAddress(user.wallet.wallet_address);
  }

  return "Admin operator";
}

function getUserSecondaryLabel(user: UserResponse): string | null {
  if (typeof user.email === "string" && user.email.trim().length > 0) {
    return user.email.trim();
  }

  const walletAddress = user.wallet?.wallet_address;

  if (typeof walletAddress === "string" && walletAddress.length > 0) {
    return walletAddress;
  }

  return null;
}

function getAvatarInitials(user: UserResponse): string {
  const rawLabel =
    user.display_name ||
    user.username ||
    user.email ||
    user.wallet?.wallet_address ||
    "Admin";
  const normalizedLabel = rawLabel.trim();

  if (normalizedLabel.length === 0) {
    return "A";
  }

  if (user.wallet?.wallet_address && normalizedLabel === user.wallet.wallet_address) {
    return "W";
  }

  const emailLocalPart = normalizedLabel.includes("@")
    ? normalizedLabel.slice(0, normalizedLabel.indexOf("@"))
    : normalizedLabel;
  const words = emailLocalPart
    .split(/[\s._-]+/)
    .map(word => word.trim())
    .filter(word => word.length > 0);

  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }

  return words[0]?.[0]?.toUpperCase() ?? "A";
}

function UserAvatar(props: { user: UserResponse }) {
  const [imageFailed, setImageFailed] = createSignal(false);

  return (
    <Show
      when={props.user.avatar_url && !imageFailed()}
      fallback={
        <div
          class="pm-account-avatar pm-account-avatar--fallback"
          style={getAvatarPreset(props.user)}
          aria-label={getUserDisplayLabel(props.user)}
        >
          <span class="pm-account-avatar__initials">{getAvatarInitials(props.user)}</span>
        </div>
      }
    >
      <img
        class="pm-account-avatar"
        src={props.user.avatar_url!}
        alt=""
        loading="lazy"
        referrerpolicy="no-referrer"
        onError={() => setImageFailed(true)}
      />
    </Show>
  );
}

function isCurrentRoute(currentPath: string, href: string) {
  if (href === "/") {
    return currentPath === "/";
  }

  return currentPath.startsWith(href);
}

function getWalletSummary(profile: AdminMeResponse) {
  const walletAddress = profile.user.wallet?.wallet_address;

  if (walletAddress) {
    return shortenWalletAddress(walletAddress);
  }

  return "Admin connected";
}

function formatUsdBalance(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

interface AdminNavbarProps {
  adminDrawerOpen?: boolean;
  onToggleAdminDrawer?: () => void;
}

const CASH_BALANCE_REFRESH_INTERVAL_MS = 15_000;
const ADMIN_CASH_BALANCE_REFRESH_EVENT = "sabi:admin-cash-balance-refresh";

export default function AdminNavbar(props: AdminNavbarProps = {}) {
  const auth = useAdminAuth();
  const location = useLocation();
  const [isAccountMenuOpen, setAccountMenuOpen] = createSignal(false);
  const [isDepositModalOpen, setDepositModalOpen] = createSignal(false);
  const [cashBalanceUsd, setCashBalanceUsd] = createSignal<number | null>(null);
  const [isLoadingCashBalance, setIsLoadingCashBalance] = createSignal(false);
  const [cashBalanceFailed, setCashBalanceFailed] = createSignal(false);
  const profile = createMemo(() => auth.profile());
  let accountMenuRef: HTMLDivElement | undefined;
  let cashBalanceRequestId = 0;

  createEffect(() => {
    if (!isAccountMenuOpen()) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (accountMenuRef?.contains(target)) {
        return;
      }

      setAccountMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAccountMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    onCleanup(() => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    });
  });

  createEffect(() => {
    location.pathname;
    setAccountMenuOpen(false);
  });

  const cashBalanceLabel = () =>
    isLoadingCashBalance()
      ? "Loading..."
      : cashBalanceFailed()
        ? "Unavailable"
        : formatUsdBalance(cashBalanceUsd() ?? 0);

  const refreshCashBalance = async (
    walletAddress = profile()?.user.wallet?.wallet_address?.trim() ?? "",
  ) => {
    if (!walletAddress) {
      setCashBalanceUsd(null);
      setIsLoadingCashBalance(false);
      setCashBalanceFailed(false);
      return;
    }

    const requestId = ++cashBalanceRequestId;
    setIsLoadingCashBalance(true);
    setCashBalanceFailed(false);

    try {
      const response = await faucetClient.fetchUsdcBalance(walletAddress);
      const normalizedBalance = formatUsdcBaseUnits(response.balance);
      const balanceUsd = Number(normalizedBalance);

      if (requestId !== cashBalanceRequestId) {
        return;
      }

      setCashBalanceUsd(Number.isFinite(balanceUsd) ? balanceUsd : 0);
      setCashBalanceFailed(false);
    } catch {
      if (requestId !== cashBalanceRequestId) {
        return;
      }

      setCashBalanceUsd(null);
      setCashBalanceFailed(true);
    } finally {
      if (requestId === cashBalanceRequestId) {
        setIsLoadingCashBalance(false);
      }
    }
  };

  createEffect(() => {
    const walletAddress = profile()?.user.wallet?.wallet_address?.trim() ?? "";

    if (!walletAddress || typeof window === "undefined" || typeof document === "undefined") {
      void refreshCashBalance(walletAddress);
      return;
    }

    const refresh = () => void refreshCashBalance(walletAddress);
    const handleWindowFocus = () => refresh();
    const handleBalanceRefresh = () => refresh();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };
    const intervalId = window.setInterval(refresh, CASH_BALANCE_REFRESH_INTERVAL_MS);

    refresh();
    window.addEventListener("focus", handleWindowFocus);
    window.addEventListener(ADMIN_CASH_BALANCE_REFRESH_EVENT, handleBalanceRefresh);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    onCleanup(() => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleWindowFocus);
      window.removeEventListener(ADMIN_CASH_BALANCE_REFRESH_EVENT, handleBalanceRefresh);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    });
  });

  const openAuthDialog = () => {
    setAccountMenuOpen(false);
    auth.openAuthDialog();
  };

  const openDepositModal = () => {
    setAccountMenuOpen(false);
    void refreshCashBalance();
    setDepositModalOpen(true);
  };

  const closeDepositModal = () => {
    setDepositModalOpen(false);
    void refreshCashBalance();
  };

  const toggleAdminDrawer = () => {
    setAccountMenuOpen(false);
    props.onToggleAdminDrawer?.();
  };

  const signOut = () => {
    setAccountMenuOpen(false);
    setDepositModalOpen(false);
    setCashBalanceUsd(null);
    setIsLoadingCashBalance(false);
    setCashBalanceFailed(false);
    auth.logout();
  };

  return (
    <>
      <header class="pm-navbar pm-admin-navbar">
        <nav class="pm-navbar__nav" aria-label="Primary">
          <div class="pm-navbar__border" aria-hidden="true" />

          <div class="pm-navbar__top-row">
            <div class="pm-navbar__brand-wrap">
              <A class="pm-brand" aria-label="Sabi Admin home" href="/">
                <span class="pm-brand__badge">
                  <img src="/c7xdtwf0cz6mneysxo8.svg" alt="" aria-hidden="true" />
                </span>
                <span class="pm-brand__name">Sabi Admin</span>
              </A>
            </div>

            <div class="pm-navbar__search-group">
              <form class="pm-search-form" role="search" onSubmit={event => event.preventDefault()}>
                <div class="pm-search-field">
                  <span class="pm-search-field__icon">
                    <SearchIcon />
                  </span>
                  <input
                    class="pm-search-field__input"
                    type="search"
                    aria-label="Search public markets"
                    autoComplete="off"
                    placeholder="Search public markets..."
                  />
                  <kbd class="pm-search-field__kbd">/</kbd>
                </div>
              </form>

              <A class="pm-link-action pm-link-action--admin" href="/about">
                <InfoIcon />
                <span>How it works</span>
              </A>
            </div>

            <div class="pm-navbar__account">
              <div class="pm-navbar__auth">
                <Show
                  when={profile()}
                  fallback={
                    <>
                      <button class="pm-button pm-button--ghost" type="button" onClick={openAuthDialog}>
                        Admin access
                      </button>
                      <button
                        class="pm-button pm-button--primary"
                        type="button"
                        onClick={openAuthDialog}
                      >
                        Connect wallet
                      </button>
                    </>
                  }
                >
                  {currentProfile => (
                    <>
                      <div class="pm-navbar-balance" aria-label="Admin cash balance">
                        <div class="pm-navbar-balance__item">
                          <span class="pm-navbar-balance__label">Cash</span>
                          <span class="pm-navbar-balance__value">{cashBalanceLabel()}</span>
                        </div>
                      </div>

                      <button
                        class="pm-button pm-button--primary pm-deposit-button"
                        type="button"
                        onClick={openDepositModal}
                      >
                        Deposit
                      </button>

                      <button
                        class={`pm-menu-trigger pm-menu-trigger--admin${
                          props.adminDrawerOpen ? " pm-menu-trigger--open" : ""
                        }`}
                        type="button"
                        aria-label="Toggle admin drawer"
                        aria-expanded={props.adminDrawerOpen ? "true" : "false"}
                        onClick={toggleAdminDrawer}
                      >
                        <MenuIcon />
                      </button>

                      <div class="pm-account-session" ref={accountMenuRef}>
                        <button
                          class={`pm-account-trigger pm-account-trigger--admin${
                            isAccountMenuOpen() ? " pm-account-trigger--open" : ""
                          }`}
                          type="button"
                          aria-label="Open admin account menu"
                          aria-expanded={isAccountMenuOpen()}
                          aria-haspopup="menu"
                          onClick={() => setAccountMenuOpen(open => !open)}
                        >
                          <UserAvatar user={currentProfile().user} />
                          <span class="pm-admin-navbar__session-copy">
                            <span class="pm-admin-navbar__session-value">
                              {getWalletSummary(currentProfile())}
                            </span>
                          </span>
                          <span class="pm-account-trigger__chevron" aria-hidden="true">
                            <ChevronDownIcon />
                          </span>
                        </button>

                        <Show when={isAccountMenuOpen()}>
                          <div class="pm-account-menu pm-account-menu--admin" role="menu" aria-label="Admin account menu">
                            <div class="pm-account-menu__header">
                              <UserAvatar user={currentProfile().user} />
                              <div class="pm-account-menu__identity">
                                <p class="pm-account-menu__name">
                                  {getUserDisplayLabel(currentProfile().user)}
                                </p>
                                <Show when={getUserSecondaryLabel(currentProfile().user)}>
                                  {secondaryLabel => (
                                    <p class="pm-account-menu__meta" title={secondaryLabel()}>
                                      {secondaryLabel()}
                                    </p>
                                  )}
                                </Show>
                              </div>
                            </div>

                            <div class="pm-admin-navbar__menu-pills">
                              <span class="pm-market-chip">Monad #{currentProfile().monad_chain_id}</span>
                              <span class="pm-market-chip">Admin session</span>
                            </div>

                            <div class="pm-account-menu__divider" aria-hidden="true" />

                            <button
                              class="pm-account-menu__item pm-account-menu__item--danger"
                              type="button"
                              role="menuitem"
                              onClick={signOut}
                            >
                              Disconnect
                            </button>
                          </div>
                        </Show>
                      </div>
                    </>
                  )}
                </Show>
              </div>
            </div>
          </div>

          <div class="pm-navbar__bottom-row">
            <div class="pm-tabs-shell">
              <div class="pm-tabs-fade pm-tabs-fade--left" aria-hidden="true" />

              <div class="pm-tabs-scroll" role="navigation" aria-label="Admin routes">
                <For each={featuredLinks}>
                  {link => (
                    <A
                      class={`pm-tab${isCurrentRoute(location.pathname, link.href) ? " pm-tab--active" : ""}`}
                      href={link.href}
                      aria-current={isCurrentRoute(location.pathname, link.href) ? "page" : undefined}
                    >
                      <Show when={link.label === "Trending"}>
                        <span class="pm-tab__icon">
                          <TrendingIcon />
                        </span>
                      </Show>
                      <span>{link.label}</span>
                    </A>
                  )}
                </For>

                <div class="pm-tabs-divider" aria-hidden="true" />

                <For each={utilityLinks}>
                  {link => (
                    <A class="pm-tab" href={link.href}>
                      <span>{link.label}</span>
                    </A>
                  )}
                </For>
              </div>

              <div class="pm-tabs-fade pm-tabs-fade--right" aria-hidden="true" />
            </div>
          </div>
        </nav>
      </header>

      <DepositModal
        open={isDepositModalOpen()}
        user={profile()?.user ?? null}
        onClose={closeDepositModal}
        onBalanceRefresh={() => void refreshCashBalance()}
      />
    </>
  );
}
