import {
  For,
  Show,
  createEffect,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";

import { authClient } from "../lib/auth/auth.ts";
import {
  clearStoredAuthSession,
  getUserDisplayLabel,
  readStoredAuthSession,
  writeStoredAuthSession,
} from "../lib/auth/session.ts";
import type { AuthResponse, UserResponse } from "../lib/auth/types.ts";
import { clearStoredWalletPreference } from "../lib/wallet.ts";
import AuthModal from "./AuthModal";
import DepositModal from "./DepositModal";

const featuredLinks = [
  { label: "Trending", href: "/", active: true },
  { label: "Breaking", href: "#breaking" },
  { label: "New", href: "#new" },
];

const categoryLinks = [
  { label: "Politics", href: "#politics" },
  { label: "Sports", href: "#sports" },
  { label: "Crypto", href: "#crypto" },
  { label: "Esports", href: "#esports" },
  { label: "Iran", href: "#iran" },
  { label: "Finance", href: "#finance" },
  { label: "Geopolitics", href: "#geopolitics" },
  { label: "Tech", href: "#tech" },
  { label: "Culture", href: "#culture" },
  { label: "Economy", href: "#economy" },
  { label: "Weather", href: "#weather" },
  { label: "Mentions", href: "#mentions" },
  { label: "Elections", href: "#elections" },
];

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

interface AvatarPreset {
  backgroundColor: string;
  color: string;
  borderColor: string;
}

const avatarPresets: readonly AvatarPreset[] = [
  {
    backgroundColor: "#fde68a",
    color: "#854d0e",
    borderColor: "rgba(133, 77, 14, 0.16)",
  },
  {
    backgroundColor: "#dbeafe",
    color: "#1d4ed8",
    borderColor: "rgba(29, 78, 216, 0.14)",
  },
  {
    backgroundColor: "#fecdd3",
    color: "#be123c",
    borderColor: "rgba(190, 18, 60, 0.14)",
  },
  {
    backgroundColor: "#dcfce7",
    color: "#15803d",
    borderColor: "rgba(21, 128, 61, 0.14)",
  },
  {
    backgroundColor: "#ede9fe",
    color: "#6d28d9",
    borderColor: "rgba(109, 40, 217, 0.14)",
  },
  {
    backgroundColor: "#cffafe",
    color: "#0f766e",
    borderColor: "rgba(15, 118, 110, 0.14)",
  },
];

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

function getAvatarInitials(user: UserResponse): string {
  const rawLabel =
    user.display_name ||
    user.username ||
    user.email ||
    user.wallet?.wallet_address ||
    "Account";

  const normalizedLabel = rawLabel.trim();

  if (normalizedLabel.length === 0) {
    return "A";
  }

  const walletAddress = user.wallet?.wallet_address?.trim();

  if (
    typeof walletAddress === "string" &&
    walletAddress.length > 0 &&
    normalizedLabel === walletAddress
  ) {
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

  const firstWord = words[0] ?? emailLocalPart;
  return firstWord[0]?.toUpperCase() ?? "A";
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
          <span class="pm-account-avatar__initials">
            {getAvatarInitials(props.user)}
          </span>
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

export default function Navbar() {
  const [isAuthModalOpen, setAuthModalOpen] = createSignal(false);
  const [isDepositModalOpen, setDepositModalOpen] = createSignal(false);
  const [authUser, setAuthUser] = createSignal<UserResponse | null>(null);
  const [isAccountMenuOpen, setAccountMenuOpen] = createSignal(false);
  let accountMenuRef: HTMLDivElement | undefined;

  const openAuthModal = () => {
    setAccountMenuOpen(false);
    setAuthModalOpen(true);
  };
  const closeAuthModal = () => setAuthModalOpen(false);
  const openDepositModal = () => {
    setAccountMenuOpen(false);
    setDepositModalOpen(true);
  };
  const closeDepositModal = () => setDepositModalOpen(false);
  const signOut = () => {
    clearStoredAuthSession();
    clearStoredWalletPreference();
    setAccountMenuOpen(false);
    setDepositModalOpen(false);
    setAuthUser(null);
  };
  const handleAuthenticated = (response: AuthResponse) => {
    writeStoredAuthSession(response);
    setAccountMenuOpen(false);
    setAuthUser(response.user);
    closeAuthModal();
  };

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

  onMount(() => {
    const handleOpenAuthModal = () => {
      openAuthModal();
    };
    const storedSession = readStoredAuthSession();

    window.addEventListener("sabi:open-auth-modal", handleOpenAuthModal);

    onCleanup(() => {
      window.removeEventListener("sabi:open-auth-modal", handleOpenAuthModal);
    });

    if (!storedSession) {
      return;
    }

    setAuthUser(storedSession.user);

    void authClient
      .fetchMe(storedSession.token)
      .then(response => {
        writeStoredAuthSession({
          token: storedSession.token,
          user: response.user,
        });
        setAuthUser(response.user);
      })
      .catch(() => {
        clearStoredAuthSession();
        setAuthUser(null);
      });
  });

  return (
    <>
      <header class="pm-navbar">
        <nav class="pm-navbar__nav" aria-label="Primary">
          <div class="pm-navbar__border" aria-hidden="true" />

          <div class="pm-navbar__top-row">
            <div class="pm-navbar__brand-wrap">
              <a class="pm-brand" aria-label="Sabimarket Logo" href="/">
                <span class="pm-brand__badge">
                  <img src="/c7xdtwf0cz6mneysxo8.svg" alt="" aria-hidden="true" />
                </span>
                <span class="pm-brand__name">Sabimarket</span>
              </a>
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
                    aria-label="Search sabimarkets"
                    autoComplete="off"
                    placeholder="Search sabimarkets..."
                  />
                  <kbd class="pm-search-field__kbd">/</kbd>
                </div>
              </form>

              <button class="pm-link-action" type="button">
                <InfoIcon />
                <span>How it works</span>
              </button>
            </div>

            <div class="pm-navbar__account">
              <div class="pm-navbar__auth">
                <Show
                  when={authUser()}
                  fallback={
                    <>
                      <button
                        class="pm-button pm-button--ghost"
                        type="button"
                        onClick={openAuthModal}
                      >
                        Log In
                      </button>
                      <button
                        class="pm-button pm-button--primary"
                        type="button"
                        onClick={openAuthModal}
                      >
                        Sign Up
                      </button>
                    </>
                  }
                >
                  {user => (
                    <div class="pm-account-session" ref={accountMenuRef}>
                      <button
                        class={`pm-account-trigger${
                          isAccountMenuOpen() ? " pm-account-trigger--open" : ""
                        }`}
                        type="button"
                        aria-label="Open account menu"
                        aria-expanded={isAccountMenuOpen()}
                        aria-haspopup="menu"
                        onClick={() => setAccountMenuOpen(open => !open)}
                      >
                        <UserAvatar user={user()} />
                        <span class="pm-account-trigger__chevron" aria-hidden="true">
                          <ChevronDownIcon />
                        </span>
                      </button>

                      <button
                        class="pm-button pm-button--primary pm-deposit-button"
                        type="button"
                        onClick={openDepositModal}
                      >
                        Deposit
                      </button>

                      <Show when={isAccountMenuOpen()}>
                        <div class="pm-account-menu" role="menu" aria-label="Account menu">
                          <div class="pm-account-menu__header">
                            <UserAvatar user={user()} />
                            <div class="pm-account-menu__identity">
                              <p class="pm-account-menu__name">
                                {getUserDisplayLabel(user())}
                              </p>
                              <Show when={getUserSecondaryLabel(user())}>
                                {secondaryLabel => (
                                  <p
                                    class="pm-account-menu__meta"
                                    title={secondaryLabel()}
                                  >
                                    {secondaryLabel()}
                                  </p>
                                )}
                              </Show>
                            </div>
                          </div>

                          <div class="pm-account-menu__divider" aria-hidden="true" />

                          <button
                            class="pm-account-menu__item pm-account-menu__item--danger"
                            type="button"
                            role="menuitem"
                            onClick={signOut}
                          >
                            Sign Out
                          </button>
                        </div>
                      </Show>
                    </div>
                  )}
                </Show>
              </div>

              <button class="pm-menu-trigger" type="button" aria-label="Open user menu">
                <MenuIcon />
              </button>
            </div>
          </div>

          <div class="pm-navbar__bottom-row">
            <div class="pm-tabs-shell">
              <div class="pm-tabs-fade pm-tabs-fade--left" aria-hidden="true" />

              <div class="pm-tabs-scroll" role="navigation" aria-label="Market categories">
                <For each={featuredLinks}>
                  {link => (
                    <a
                      class={`pm-tab${link.active ? " pm-tab--active" : ""}`}
                      href={link.href}
                      aria-current={link.active ? "page" : undefined}
                    >
                      {link.label === "Trending" && (
                        <span class="pm-tab__icon">
                          <TrendingIcon />
                        </span>
                      )}
                      <span>{link.label}</span>
                    </a>
                  )}
                </For>

                <div class="pm-tabs-divider" aria-hidden="true" />

                <For each={categoryLinks}>
                  {link => (
                    <a class="pm-tab" href={link.href}>
                      <span>{link.label}</span>
                    </a>
                  )}
                </For>

                <button class="pm-tab pm-tab--more" type="button" aria-label="Open more links">
                  <span>More</span>
                  <span class="pm-tab__chevron">
                    <ChevronDownIcon />
                  </span>
                </button>
              </div>

              <div class="pm-tabs-fade pm-tabs-fade--right" aria-hidden="true" />
            </div>
          </div>
        </nav>
      </header>

      <AuthModal
        open={isAuthModalOpen()}
        onClose={closeAuthModal}
        onAuthenticated={handleAuthenticated}
      />
      <DepositModal
        open={isDepositModalOpen()}
        user={authUser()}
        onClose={closeDepositModal}
      />
    </>
  );
}
