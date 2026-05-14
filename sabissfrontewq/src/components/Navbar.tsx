import { A, useLocation, useNavigate } from "@solidjs/router";
import {
  For,
  Show,
  createEffect,
  createMemo,
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
import { faucetClient, formatUsdcBaseUnits } from "../lib/faucet/index.ts";
import {
  buildMarketFeedHref,
  formatSlugLabel,
  getMarketDisplayLabel,
  isMarketFeedTargetActive,
  MARKET_FEATURED_TAB_TARGETS,
  MARKET_TOPIC_TAB_DEFINITIONS,
  marketClient,
  resolveMarketTopicTabTarget,
  type CategorySummaryResponse,
  type MarketFeedTarget,
  type PublicMarketCardResponse,
  type TagSummaryResponse,
} from "../lib/market/index.ts";
import { orderClient } from "../lib/order/index.ts";
import { clearStoredWalletPreference } from "../lib/wallet.ts";
import AuthModal from "./AuthModal";
import DepositModal from "./DepositModal";

const EVENT_PRIMARY_MARKET_STORAGE_PREFIX = "pm-event-primary-market/v1:";
const SEARCH_RESULT_LIMIT = 6;
const SEARCH_DEBOUNCE_MS = 200;
const MIN_SEARCH_LENGTH = 2;

interface BrowseTabMetadata {
  categories: CategorySummaryResponse[];
  tags: TagSummaryResponse[];
}

let cachedBrowseTabMetadata: BrowseTabMetadata | null = null;
let inflightBrowseTabMetadata: Promise<BrowseTabMetadata> | null = null;

async function loadBrowseTabMetadata(): Promise<BrowseTabMetadata> {
  if (cachedBrowseTabMetadata) {
    return cachedBrowseTabMetadata;
  }

  if (inflightBrowseTabMetadata) {
    return inflightBrowseTabMetadata;
  }

  inflightBrowseTabMetadata = Promise.allSettled([
    marketClient.listCategories(),
    marketClient.listTags(),
  ])
    .then(([categoriesResult, tagsResult]) => {
      const nextMetadata: BrowseTabMetadata = {
        categories:
          categoriesResult.status === "fulfilled" ? categoriesResult.value.categories : [],
        tags: tagsResult.status === "fulfilled" ? tagsResult.value.tags : [],
      };

      cachedBrowseTabMetadata = nextMetadata;
      return nextMetadata;
    })
    .finally(() => {
      inflightBrowseTabMetadata = null;
    });

  return inflightBrowseTabMetadata;
}

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

function formatUsdBalance(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function parseUsdBalance(value: string): number | null {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function buildSearchHref(eventSlug: string): string {
  return `/event/${encodeURIComponent(eventSlug)}`;
}

function rememberPreferredMarket(eventSlug: string, marketSlug: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      `${EVENT_PRIMARY_MARKET_STORAGE_PREFIX}${eventSlug}`,
      JSON.stringify(marketSlug),
    );
  } catch {
    // Ignore storage write failures and fall back to plain navigation.
  }
}

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isAuthModalOpen, setAuthModalOpen] = createSignal(false);
  const [isDepositModalOpen, setDepositModalOpen] = createSignal(false);
  const [authUser, setAuthUser] = createSignal<UserResponse | null>(null);
  const [authToken, setAuthToken] = createSignal<string | null>(null);
  const [isAccountMenuOpen, setAccountMenuOpen] = createSignal(false);
  const [cashBalanceUsd, setCashBalanceUsd] = createSignal<number | null>(null);
  const [isLoadingCashBalance, setIsLoadingCashBalance] = createSignal(false);
  const [cashBalanceFailed, setCashBalanceFailed] = createSignal(false);
  const [portfolioBalanceUsd, setPortfolioBalanceUsd] = createSignal<number | null>(null);
  const [isLoadingPortfolioBalance, setIsLoadingPortfolioBalance] = createSignal(false);
  const [portfolioBalanceFailed, setPortfolioBalanceFailed] = createSignal(false);
  const [searchQuery, setSearchQuery] = createSignal("");
  const [searchResults, setSearchResults] = createSignal<PublicMarketCardResponse[]>([]);
  const [isSearchLoading, setSearchLoading] = createSignal(false);
  const [searchError, setSearchError] = createSignal<string | null>(null);
  const [isSearchFocused, setSearchFocused] = createSignal(false);
  const [activeSearchIndex, setActiveSearchIndex] = createSignal(-1);
  const [browseTabMetadata, setBrowseTabMetadata] = createSignal<BrowseTabMetadata>({
    categories: [],
    tags: [],
  });
  let accountMenuRef: HTMLDivElement | undefined;
  let searchFieldRef: HTMLDivElement | undefined;
  const isAuthenticated = () => authUser() !== null;
  let cashBalanceRequestId = 0;
  let portfolioBalanceRequestId = 0;
  let searchRequestVersion = 0;
  const normalizedSearchQuery = () => searchQuery().trim();
  const isSearchDropdownOpen = () =>
    isSearchFocused() && normalizedSearchQuery().length >= MIN_SEARCH_LENGTH;
  const featuredTabs = createMemo(() => MARKET_FEATURED_TAB_TARGETS);
  const topicTabs = createMemo(() =>
    MARKET_TOPIC_TAB_DEFINITIONS.map(definition => ({
      label: definition.label,
      target: resolveMarketTopicTabTarget(
        definition,
        browseTabMetadata().categories,
        browseTabMetadata().tags,
      ),
    })),
  );
  const isTabActive = (target: MarketFeedTarget) =>
    isMarketFeedTargetActive(target, location.pathname, location.search);

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
    setAuthToken(null);
    setAuthUser(null);
  };
  const handleAuthenticated = (response: AuthResponse) => {
    writeStoredAuthSession(response);
    setAccountMenuOpen(false);
    setAuthToken(response.token);
    setAuthUser(response.user);
    closeAuthModal();
  };
  const cashBalanceLabel = () =>
    isLoadingCashBalance()
      ? "Loading..."
      : cashBalanceFailed()
        ? "Unavailable"
        : formatUsdBalance(cashBalanceUsd() ?? 0);
  const portfolioBalanceLabel = () =>
    isLoadingPortfolioBalance()
      ? "Loading..."
      : portfolioBalanceFailed()
        ? "Unavailable"
        : formatUsdBalance(portfolioBalanceUsd() ?? 0);
  const refreshNavbarBalance = async () => {
    const address = authUser()?.wallet?.wallet_address?.trim();

    if (!address) {
      setCashBalanceUsd(null);
      setIsLoadingCashBalance(false);
      setCashBalanceFailed(false);
      return;
    }

    const requestId = ++cashBalanceRequestId;
    setIsLoadingCashBalance(true);
    setCashBalanceFailed(false);

    try {
      const response = await faucetClient.fetchUsdcBalance(address);
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
  const refreshPortfolioBalance = async (token: string) => {
    const requestId = ++portfolioBalanceRequestId;
    setIsLoadingPortfolioBalance(true);
    setPortfolioBalanceFailed(false);

    try {
      const response = await orderClient.fetchMyPortfolio(token);
      const balanceUsd = parseUsdBalance(response.summary.portfolio_balance);

      if (requestId !== portfolioBalanceRequestId) {
        return;
      }

      setPortfolioBalanceUsd(balanceUsd ?? 0);
      setPortfolioBalanceFailed(false);
    } catch {
      if (requestId !== portfolioBalanceRequestId) {
        return;
      }

      setPortfolioBalanceUsd(null);
      setPortfolioBalanceFailed(true);
    } finally {
      if (requestId === portfolioBalanceRequestId) {
        setIsLoadingPortfolioBalance(false);
      }
    }
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
    let isDisposed = false;

    window.addEventListener("sabi:open-auth-modal", handleOpenAuthModal);

    onCleanup(() => {
      isDisposed = true;
      window.removeEventListener("sabi:open-auth-modal", handleOpenAuthModal);
    });

    void loadBrowseTabMetadata()
      .then(metadata => {
        if (!isDisposed) {
          setBrowseTabMetadata(metadata);
        }
      })
      .catch(() => {
        if (!isDisposed) {
          setBrowseTabMetadata({
            categories: [],
            tags: [],
          });
        }
      });

    if (!storedSession) {
      return;
    }

    setAuthToken(storedSession.token);
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
        setAuthToken(null);
        setAuthUser(null);
      });
  });

  createEffect(() => {
    const walletAddress = authUser()?.wallet?.wallet_address?.trim() ?? "";

    if (walletAddress.length === 0) {
      setCashBalanceUsd(null);
      setIsLoadingCashBalance(false);
      setCashBalanceFailed(false);
      return;
    }

    void refreshNavbarBalance();
  });

  createEffect(() => {
    const token = authToken()?.trim() ?? "";

    if (token.length === 0) {
      setPortfolioBalanceUsd(null);
      setIsLoadingPortfolioBalance(false);
      setPortfolioBalanceFailed(false);
      return;
    }

    void refreshPortfolioBalance(token);
  });

  createEffect(() => {
    const currentQuery = new URLSearchParams(location.search).get("q")?.trim() ?? "";

    if (location.pathname === "/search") {
      setSearchQuery(currentQuery);
      return;
    }

    setSearchQuery("");
  });

  createEffect(() => {
    const currentQuery = normalizedSearchQuery();

    setActiveSearchIndex(-1);

    if (currentQuery.length < MIN_SEARCH_LENGTH) {
      setSearchResults([]);
      setSearchLoading(false);
      setSearchError(null);
      return;
    }

    const version = ++searchRequestVersion;
    setSearchLoading(true);
    setSearchError(null);
    setSearchResults([]);

    const timeoutId = setTimeout(() => {
      void marketClient
        .searchMarkets({
          q: currentQuery,
          limit: SEARCH_RESULT_LIMIT,
        })
        .then(response => {
          if (version !== searchRequestVersion) {
            return;
          }

          setSearchResults(response.markets);
          setSearchLoading(false);
        })
        .catch(caughtError => {
          if (version !== searchRequestVersion) {
            return;
          }

          setSearchResults([]);
          setSearchLoading(false);
          setSearchError(
            caughtError instanceof Error ? caughtError.message : "Unable to search markets.",
          );
        });
    }, SEARCH_DEBOUNCE_MS);

    onCleanup(() => clearTimeout(timeoutId));
  });

  createEffect(() => {
    if (!isSearchDropdownOpen()) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (searchFieldRef?.contains(target)) {
        return;
      }

      setSearchFocused(false);
      setActiveSearchIndex(-1);
    };

    window.addEventListener("pointerdown", handlePointerDown);

    onCleanup(() => {
      window.removeEventListener("pointerdown", handlePointerDown);
    });
  });

  const navigateToSearchResult = (market: PublicMarketCardResponse) => {
    rememberPreferredMarket(market.event.slug, market.slug);
    setSearchFocused(false);
    setActiveSearchIndex(-1);
    navigate(buildSearchHref(market.event.slug));
  };

  const handleSearchKeyDown = (event: KeyboardEvent) => {
    if (!isSearchDropdownOpen()) {
      if (event.key === "Escape") {
        setSearchFocused(false);
      }

      return;
    }

    const results = searchResults();

    if (event.key === "Escape") {
      event.preventDefault();
      setSearchFocused(false);
      setActiveSearchIndex(-1);
      return;
    }

    if (results.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveSearchIndex(index => Math.min(index + 1, results.length - 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveSearchIndex(index => Math.max(index - 1, 0));
      return;
    }

    if (event.key === "Enter") {
      const selectedResult = results[activeSearchIndex()];

      if (!selectedResult) {
        return;
      }

      event.preventDefault();
      navigateToSearchResult(selectedResult);
    }
  };

  const handleSearchSubmit = (event: SubmitEvent) => {
    event.preventDefault();

    const trimmedQuery = normalizedSearchQuery();
    setSearchFocused(false);
    setActiveSearchIndex(-1);

    if (trimmedQuery.length === 0) {
      navigate("/search");
      return;
    }

    navigate(`/search?q=${encodeURIComponent(trimmedQuery)}`);
  };

  return (
    <>
      <header class="pm-navbar">
        <nav
          class={`pm-navbar__nav${isAuthenticated() ? " pm-navbar__nav--authenticated" : ""}`}
          aria-label="Primary"
        >
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
              <form class="pm-search-form" role="search" onSubmit={handleSearchSubmit}>
                <div class="pm-search-field" ref={searchFieldRef}>
                  <span class="pm-search-field__icon">
                    <SearchIcon />
                  </span>
                  <input
                    class="pm-search-field__input"
                    type="search"
                    aria-label="Search sabimarkets"
                    aria-autocomplete="list"
                    aria-activedescendant={
                      activeSearchIndex() >= 0 ? `pm-search-result-${activeSearchIndex()}` : undefined
                    }
                    aria-controls="pm-search-results"
                    aria-expanded={isSearchDropdownOpen()}
                    autoComplete="off"
                    placeholder="Search sabimarkets..."
                    value={searchQuery()}
                    onInput={event => setSearchQuery(event.currentTarget.value)}
                    onFocus={() => setSearchFocused(true)}
                    onKeyDown={handleSearchKeyDown}
                  />
                  <kbd class="pm-search-field__kbd">/</kbd>

                  <Show when={isSearchDropdownOpen()}>
                    <div class="pm-search-field__panel" id="pm-search-results" role="listbox">
                      <Show when={isSearchLoading()}>
                        <p class="pm-search-field__status">Searching markets...</p>
                      </Show>

                      <Show when={!isSearchLoading() && searchError()}>
                        <p class="pm-search-field__status pm-search-field__status--error">
                          {searchError()}
                        </p>
                      </Show>

                      <Show
                        when={
                          !isSearchLoading() &&
                          !searchError() &&
                          searchResults().length === 0 &&
                          normalizedSearchQuery().length >= MIN_SEARCH_LENGTH
                        }
                      >
                        <p class="pm-search-field__status">
                          No published markets matched "{normalizedSearchQuery()}".
                        </p>
                      </Show>

                      <Show when={searchResults().length > 0}>
                        <div class="pm-search-field__results">
                          <For each={searchResults()}>
                            {(market, index) => {
                              const displayLabel = getMarketDisplayLabel(market);
                              const question = market.question.trim();
                              const showQuestion =
                                question.length > 0 &&
                                question.toLowerCase() !== displayLabel.toLowerCase();

                              return (
                                <button
                                  type="button"
                                  role="option"
                                  id={`pm-search-result-${index()}`}
                                  class="pm-search-field__result"
                                  classList={{
                                    "pm-search-field__result--active":
                                      index() === activeSearchIndex(),
                                  }}
                                  aria-selected={index() === activeSearchIndex()}
                                  onMouseEnter={() => setActiveSearchIndex(index())}
                                  onClick={() => navigateToSearchResult(market)}
                                >
                                  <span class="pm-search-field__result-topline">
                                    <span class="pm-search-field__result-title">{displayLabel}</span>
                                    <span class="pm-search-field__result-status">
                                      {market.trading_status}
                                    </span>
                                  </span>
                                  <Show when={showQuestion}>
                                    <span class="pm-search-field__result-question">{question}</span>
                                  </Show>
                                  <span class="pm-search-field__result-meta">
                                    {market.event.title} • {formatSlugLabel(market.event.category_slug)}
                                  </span>
                                </button>
                              );
                            }}
                          </For>
                        </div>
                      </Show>

                      <Show when={!isSearchLoading() && normalizedSearchQuery().length >= MIN_SEARCH_LENGTH}>
                        <button
                          type="button"
                          class="pm-search-field__view-all"
                          onClick={() => {
                            setSearchFocused(false);
                            setActiveSearchIndex(-1);
                            navigate(`/search?q=${encodeURIComponent(normalizedSearchQuery())}`);
                          }}
                        >
                          View all results for "{normalizedSearchQuery()}"
                        </button>
                      </Show>
                    </div>
                  </Show>
                </div>
              </form>

              <Show
                when={!isAuthenticated()}
                fallback={<div class="pm-navbar__search-balance-spacer" aria-hidden="true" />}
              >
                <button class="pm-link-action" type="button">
                  <InfoIcon />
                  <span>How it works</span>
                </button>
              </Show>
            </div>

            <div class="pm-navbar__account">
              <Show when={isAuthenticated()}>
                <div class="pm-navbar-balance" aria-label="Portfolio balance">
                  <A
                    class="pm-navbar-balance__item pm-navbar-balance__item--link"
                    href="/portfolio"
                    aria-label="Open portfolio"
                  >
                    <span class="pm-navbar-balance__label">Portfolio</span>
                    <span class="pm-navbar-balance__value">
                      {portfolioBalanceLabel()}
                    </span>
                  </A>

                  <div class="pm-navbar-balance__item">
                    <span class="pm-navbar-balance__label">Cash</span>
                    <span class="pm-navbar-balance__value">
                      {cashBalanceLabel()}
                    </span>
                  </div>
                </div>
              </Show>

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
                <For each={featuredTabs()}>
                  {target => (
                    <A
                      class="pm-tab"
                      classList={{
                        "pm-tab--active": isTabActive(target),
                      }}
                      href={buildMarketFeedHref(target)}
                      aria-current={isTabActive(target) ? "page" : undefined}
                    >
                      {target.label === "Trending" && (
                        <span class="pm-tab__icon">
                          <TrendingIcon />
                        </span>
                      )}
                      <span>{target.label}</span>
                    </A>
                  )}
                </For>

                <div class="pm-tabs-divider" aria-hidden="true" />

                <For each={topicTabs()}>
                  {tab => (
                    <A
                      class="pm-tab"
                      classList={{
                        "pm-tab--active": isTabActive(tab.target),
                      }}
                      href={buildMarketFeedHref(tab.target)}
                      aria-current={isTabActive(tab.target) ? "page" : undefined}
                    >
                      <span>{tab.label}</span>
                    </A>
                  )}
                </For>

                <A
                  class="pm-tab pm-tab--more"
                  classList={{
                    "pm-tab--active":
                      location.pathname === "/categories" ||
                      location.pathname.startsWith("/categories/"),
                  }}
                  href="/categories"
                  aria-label="Browse more categories"
                  aria-current={
                    location.pathname === "/categories" ||
                    location.pathname.startsWith("/categories/")
                      ? "page"
                      : undefined
                  }
                >
                  <span>More</span>
                  <span class="pm-tab__chevron">
                    <ChevronDownIcon />
                  </span>
                </A>
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
        onBalanceRefresh={() => void refreshNavbarBalance()}
      />
    </>
  );
}
