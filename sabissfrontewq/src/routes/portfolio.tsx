import { A } from "@solidjs/router";
import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";

import PublicPageLayout from "~/components/public-browser/PublicPageLayout.tsx";
import PublicState from "~/components/public-browser/PublicState.tsx";
import {
  AUTH_SESSION_CHANGE_EVENT,
  readStoredAuthSession,
  type StoredAuthSession,
} from "~/lib/auth/session.ts";
import { orderClient, type MyPortfolioResponse } from "~/lib/order/index.ts";

type PortfolioPageStatus = "loading" | "ready" | "error" | "unauthenticated";

function formatUsdAmount(value: string): string {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue)) {
    return value;
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parsedValue);
}

function formatWalletAddress(value: string): string {
  if (value.length <= 12) {
    return value;
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatExecutedAt(value: string): string {
  const parsedValue = Date.parse(value);

  if (Number.isNaN(parsedValue)) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(parsedValue));
}

function buildMarketHref(eventSlug: string, marketSlug: string): string {
  return `/event/${encodeURIComponent(eventSlug)}/${encodeURIComponent(marketSlug)}`;
}

function openAuthModal() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event("sabi:open-auth-modal"));
}

export default function PortfolioRoute() {
  const [session, setSession] = createSignal<StoredAuthSession | null>(null);
  const [didReadSession, setDidReadSession] = createSignal(false);
  const [portfolio, setPortfolio] = createSignal<MyPortfolioResponse | null>(null);
  const [status, setStatus] = createSignal<PortfolioPageStatus>("loading");
  const [error, setError] = createSignal<string | null>(null);
  let portfolioRequestVersion = 0;

  onMount(() => {
    setSession(readStoredAuthSession());
    setDidReadSession(true);

    const handleSessionChange = (event: Event) => {
      const nextSession = (event as CustomEvent<StoredAuthSession | null>).detail;
      setSession(nextSession ?? readStoredAuthSession());
      setDidReadSession(true);
    };

    window.addEventListener(AUTH_SESSION_CHANGE_EVENT, handleSessionChange);

    onCleanup(() => {
      window.removeEventListener(AUTH_SESSION_CHANGE_EVENT, handleSessionChange);
    });
  });

  createEffect(() => {
    if (!didReadSession()) {
      setStatus("loading");
      return;
    }

    const token = session()?.token?.trim() ?? "";

    if (token.length === 0) {
      setPortfolio(null);
      setError(null);
      setStatus("unauthenticated");
      return;
    }

    const requestId = ++portfolioRequestVersion;
    setStatus("loading");
    setError(null);

    void orderClient
      .fetchMyPortfolio(token)
      .then(response => {
        if (requestId !== portfolioRequestVersion) {
          return;
        }

        setPortfolio(response);
        setStatus("ready");
      })
      .catch(caughtError => {
        if (requestId !== portfolioRequestVersion) {
          return;
        }

        setPortfolio(null);
        setError(
          caughtError instanceof Error ? caughtError.message : "Unable to load your portfolio.",
        );
        setStatus("error");
      });
  });

  const summaryCards = createMemo(() => {
    const data = portfolio();

    if (!data) {
      return [];
    }

    return [
      {
        label: "Portfolio balance",
        value: formatUsdAmount(data.summary.portfolio_balance),
      },
      {
        label: "Cash balance",
        value: formatUsdAmount(data.summary.cash_balance),
      },
      {
        label: "Total balance",
        value: formatUsdAmount(data.summary.total_balance),
      },
      {
        label: "Total bought",
        value: formatUsdAmount(data.summary.total_buy_amount),
      },
      {
        label: "Total sold",
        value: formatUsdAmount(data.summary.total_sell_amount),
      },
    ];
  });

  const visibleMarkets = createMemo(() => portfolio()?.markets.slice(0, 8) ?? []);
  const visibleHistory = createMemo(() => portfolio()?.history.slice(0, 8) ?? []);
  const retryLoad = () => {
    const activeSession = readStoredAuthSession();
    setSession(activeSession ? { ...activeSession } : null);
  };

  return (
    <PublicPageLayout
      title="Portfolio | Sabimarket"
      kicker="Account"
      heading="Portfolio"
      summary="This page is now backed by the authenticated `/me/portfolio` endpoint."
      actions={
        <Show when={portfolio()}>
          {data => (
            <div class="pm-browser__button-row">
              <span class="pm-browser__pill">{data().account_kind.replace(/_/g, " ")}</span>
              <span class="pm-browser__pill">{formatWalletAddress(data().wallet_address)}</span>
            </div>
          )}
        </Show>
      }
    >
      <Show when={status() === "loading"}>
        <PublicState title="Loading portfolio" copy="Fetching your authenticated portfolio data." />
      </Show>

      <Show when={status() === "unauthenticated"}>
        <PublicState
          title="Sign in to view your portfolio"
          copy="Your portfolio page requires an authenticated session before it can load `/me/portfolio`."
          actionLabel="Open sign in"
          onAction={openAuthModal}
        />
      </Show>

      <Show when={status() === "error"}>
        <PublicState
          title="Unable to load portfolio"
          copy={error() ?? "The portfolio endpoint could not be loaded."}
          actionLabel="Try again"
          onAction={retryLoad}
        />
      </Show>

      <Show when={status() === "ready" && portfolio()}>
        {() => (
          <>
            <section class="pm-home__section">
              <div class="pm-browser__summary-grid">
                <For each={summaryCards()}>
                  {card => (
                    <article class="pm-browser__summary-card">
                      <p class="pm-browser__summary-kicker">{card.label}</p>
                      <h2 class="pm-browser__summary-title">{card.value}</h2>
                    </article>
                  )}
                </For>
              </div>
            </section>

            <section class="pm-home__section">
              <div class="pm-detail__grid">
                <article class="pm-detail__card">
                  <h2 class="pm-detail__card-title">Markets</h2>
                  <p class="pm-detail__card-copy">
                    Highest-value market rows from your current portfolio snapshot.
                  </p>

                  <Show
                    when={visibleMarkets().length > 0}
                    fallback={<p class="pm-detail__card-copy">No market positions yet.</p>}
                  >
                    <div class="pm-detail__list">
                      <For each={visibleMarkets()}>
                        {market => (
                          <A
                            class="pm-detail__list-link"
                            href={buildMarketHref(market.event.slug, market.market.slug)}
                          >
                            <span>{market.market.label}</span>
                            <span>{formatUsdAmount(market.portfolio_balance)}</span>
                          </A>
                        )}
                      </For>
                    </div>
                  </Show>
                </article>

                <article class="pm-detail__card">
                  <h2 class="pm-detail__card-title">Recent Activity</h2>
                  <p class="pm-detail__card-copy">
                    Latest trade history items returned by `/me/portfolio`.
                  </p>

                  <Show
                    when={visibleHistory().length > 0}
                    fallback={<p class="pm-detail__card-copy">No trade history yet.</p>}
                  >
                    <div class="pm-detail__timeline">
                      <For each={visibleHistory()}>
                        {trade => (
                          <div class="pm-detail__timeline-item">
                            <span class="pm-detail__timeline-dot" aria-hidden="true" />
                            <div class="pm-detail__timeline-copy">
                              <p class="pm-detail__timeline-title">
                                {trade.action.toUpperCase()} {trade.outcome_label} in{" "}
                                {trade.market.label}
                              </p>
                              <p class="pm-detail__timeline-meta">
                                {formatUsdAmount(trade.usdc_amount)} • {trade.token_amount} shares
                              </p>
                              <p class="pm-detail__timeline-detail">
                                {trade.event.title} • {formatExecutedAt(trade.executed_at)}
                              </p>
                            </div>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                </article>
              </div>
            </section>
          </>
        )}
      </Show>
    </PublicPageLayout>
  );
}
