import { A } from "@solidjs/router";
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";

import {
  formatProbabilityFromBps,
  formatUsdVolume,
} from "~/components/market-detail/format.ts";
import type { GroupedMarketEvent, PublicMarketCardResponse } from "~/lib/market/index.ts";
import {
  fetchEventMarketsSnapshot,
  readStoredEventMarkets,
} from "~/lib/market/event-markets-cache.ts";
import type {
  MarketCurrentPricesResponse,
  MarketQuoteSummaryResponse,
  MarketResponse,
  MarketStatsResponse,
} from "~/lib/market/types.ts";

interface PublicMarketSectionsProps {
  cards: GroupedMarketEvent[];
  title?: string;
  onRetry?: () => void;
  loading?: boolean;
  error?: string | null;
  canLoadMore?: boolean;
  loadingMore?: boolean;
  loadMoreError?: string | null;
  onLoadMore?: () => void;
}

const EVENT_PRIMARY_MARKET_STORAGE_PREFIX = "pm-event-primary-market/v1:";
const EAGER_CARD_IMAGE_COUNT = 12;
const EAGER_CARD_DATA_COUNT = 12;

interface HomeCardMarket {
  id: string;
  slug: string;
  label: string;
  question: string;
  outcomes: string[];
  end_time: string;
  sort_order: number;
  trading_status: string;
  current_prices?: MarketCurrentPricesResponse | null;
  stats?: MarketStatsResponse | null;
  quote_summary?: MarketQuoteSummaryResponse | null;
}

function formatRowLabel(market: HomeCardMarket): string {
  const label = market.label.trim();

  if (label.length > 0) {
    return label;
  }

  const date = new Date(market.end_time);

  if (Number.isNaN(date.getTime())) {
    return "Open market";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
  }).format(date);
}

function formatMarketMetric(market: HomeCardMarket): string {
  const probability =
    formatProbabilityFromBps(market.quote_summary?.buy_yes_bps) ??
    formatProbabilityFromBps(market.current_prices?.yes_bps);

  if (probability) {
    return probability;
  }

  const volume = formatUsdVolume(market.stats?.volume_usd, true);

  if (volume) {
    return volume;
  }

  return "--";
}

function compareMarkets(left: HomeCardMarket, right: HomeCardMarket): number {
  if (left.sort_order !== right.sort_order) {
    return left.sort_order - right.sort_order;
  }

  return left.end_time.localeCompare(right.end_time);
}

function toHomeCardMarket(market: PublicMarketCardResponse | MarketResponse): HomeCardMarket {
  return {
    id: market.id,
    slug: market.slug,
    label: market.label,
    question: market.question,
    outcomes: market.outcomes,
    end_time: market.end_time,
    sort_order: market.sort_order,
    trading_status: market.trading_status,
    current_prices: "current_prices" in market ? market.current_prices ?? null : null,
    stats: "stats" in market ? market.stats ?? null : null,
    quote_summary: "quote_summary" in market ? market.quote_summary ?? null : null,
  };
}

function buildEventHref(eventSlug: string, marketSlug?: string): string {
  return `/event/${encodeURIComponent(eventSlug)}`;
}

function buildMarketHref(eventSlug: string, marketSlug: string): string {
  return buildEventHref(eventSlug, marketSlug);
}

function buildOutcomeHref(eventSlug: string, marketSlug: string, outcomeIndex: number): string {
  return buildEventHref(eventSlug, marketSlug);
}

function rememberPreferredMarket(eventSlug: string, marketSlug?: string) {
  if (!marketSlug || typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      `${EVENT_PRIMARY_MARKET_STORAGE_PREFIX}${eventSlug}`,
      JSON.stringify(marketSlug),
    );
  } catch {
    // Ignore storage failures and fall back to route-only navigation.
  }
}

function EventArtwork(props: { card: GroupedMarketEvent; eager?: boolean }) {
  const title = props.card.event.title.trim();
  const fallbackLetter = title.charAt(0).toUpperCase() || "M";

  return (
    <div class="pm-compact-card__art">
      <Show
        when={props.card.event.image_url}
        fallback={<span class="pm-compact-card__art-fallback">{fallbackLetter}</span>}
      >
        <img
          src={props.card.event.image_url ?? ""}
          alt={`${props.card.event.title} card icon`}
          loading={props.eager ? "eager" : "lazy"}
          decoding={props.eager ? "sync" : "async"}
          fetchpriority={props.eager ? "high" : "auto"}
        />
      </Show>
    </div>
  );
}

function OutcomeButton(props: {
  eventSlug: string;
  marketSlug: string;
  label: string;
  outcomeIndex: number;
}) {
  return (
    <A
      href={buildOutcomeHref(props.eventSlug, props.marketSlug, props.outcomeIndex)}
      onClick={() => rememberPreferredMarket(props.eventSlug, props.marketSlug)}
      class={
        props.outcomeIndex === 0
          ? "pm-compact-card__outcome pm-compact-card__outcome--yes"
          : "pm-compact-card__outcome pm-compact-card__outcome--no"
      }
    >
      {props.label}
    </A>
  );
}

function CompactMarketCard(props: { card: GroupedMarketEvent; eagerData?: boolean; eagerImage?: boolean }) {
  const [snapshotMarkets, setSnapshotMarkets] = createSignal<HomeCardMarket[] | null>(null);
  let cardRef: HTMLElement | undefined;
  const displayedMarkets = createMemo<HomeCardMarket[]>(() => {
    const hydrated = snapshotMarkets();

    if (hydrated && hydrated.length > 0) {
      return hydrated;
    }

    return props.card.markets.map(toHomeCardMarket).sort(compareMarkets);
  });
  const primaryMarketSlug = createMemo(() => displayedMarkets()[0]?.slug ?? props.card.markets[0]?.slug);

  const syncStoredSnapshot = () => {
    const storedMarkets = readStoredEventMarkets(props.card.event.id);

    if (!storedMarkets || storedMarkets.length === 0) {
      return null;
    }

    const normalizedMarkets = storedMarkets.map(toHomeCardMarket).sort(compareMarkets);
    setSnapshotMarkets(normalizedMarkets);
    return normalizedMarkets;
  };

  const warmEventSnapshot = () => {
    if (syncStoredSnapshot()) {
      return;
    }

    void fetchEventMarketsSnapshot(props.card.event.id).then(response => {
      if (!response?.markets?.length) {
        return;
      }

      setSnapshotMarkets(response.markets.map(toHomeCardMarket).sort(compareMarkets));
    });
  };

  createEffect(() => {
    setSnapshotMarkets(null);
    syncStoredSnapshot();

    if (props.eagerData) {
      warmEventSnapshot();
    }
  });

  createEffect(() => {
    const card = cardRef;

    if (!card || snapshotMarkets() || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            warmEventSnapshot();
            observer.disconnect();
            break;
          }
        }
      },
      {
        rootMargin: "160px",
      },
    );

    observer.observe(card);

    onCleanup(() => {
      observer.disconnect();
    });
  });

  return (
    <div class="pm-compact-card-shell">
      <article
        class="pm-compact-card"
        ref={cardRef}
        onPointerEnter={warmEventSnapshot}
        onPointerDown={warmEventSnapshot}
        onFocusIn={warmEventSnapshot}
        onTouchStart={warmEventSnapshot}
      >
        <div class="pm-compact-card__header">
          <EventArtwork card={props.card} eager={props.eagerImage} />
          <div class="pm-compact-card__title-wrap">
            <A
              href={buildEventHref(props.card.event.slug)}
              class="pm-compact-card__title-link"
              onClick={() => rememberPreferredMarket(props.card.event.slug, primaryMarketSlug())}
            >
              <div class="pm-compact-card__title-box">
                <h2 class="pm-compact-card__title">{props.card.event.title}</h2>
              </div>
            </A>
          </div>
        </div>

        <div class="pm-compact-card__body">
          <div class="pm-compact-card__rows">
            <For each={displayedMarkets()}>
              {market => (
                <div class="pm-compact-card__row">
                  <div class="pm-compact-card__row-copy">
                    <A
                      href={buildMarketHref(props.card.event.slug, market.slug)}
                      class="pm-compact-card__row-link"
                      onClick={() => rememberPreferredMarket(props.card.event.slug, market.slug)}
                    >
                      <p class="pm-compact-card__row-label">{formatRowLabel(market)}</p>
                    </A>
                  </div>

                  <div class="pm-compact-card__row-actions">
                    <p class="pm-compact-card__metric">
                      {formatMarketMetric(market)}
                    </p>
                    <OutcomeButton
                      eventSlug={props.card.event.slug}
                      marketSlug={market.slug}
                      label={market.outcomes[0] ?? "Yes"}
                      outcomeIndex={0}
                    />
                    <OutcomeButton
                      eventSlug={props.card.event.slug}
                      marketSlug={market.slug}
                      label={market.outcomes[1] ?? "No"}
                      outcomeIndex={1}
                    />
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>

        <div class="pm-compact-card__footer">
          <p class="pm-compact-card__footer-text">{displayedMarkets().length} markets</p>
        </div>
      </article>
    </div>
  );
}

function CompactCardSkeleton() {
  return (
    <div class="pm-compact-card-shell">
      <article class="pm-compact-card pm-compact-card--skeleton" aria-hidden="true">
        <div class="pm-compact-card__header">
          <div class="pm-compact-card__art pm-compact-card__placeholder" />
          <div class="pm-compact-card__title-wrap">
            <div class="pm-compact-card__title-box">
              <div class="pm-compact-card__line pm-compact-card__line--title" />
            </div>
          </div>
        </div>

        <div class="pm-compact-card__body">
          <div class="pm-compact-card__rows">
            <For each={Array.from({ length: 2 })}>
              {() => (
                <div class="pm-compact-card__row">
                  <div class="pm-compact-card__row-copy">
                    <div class="pm-compact-card__line pm-compact-card__line--row" />
                  </div>
                  <div class="pm-compact-card__row-actions">
                    <div class="pm-compact-card__line pm-compact-card__line--metric" />
                    <div class="pm-compact-card__chip-placeholder" />
                    <div class="pm-compact-card__chip-placeholder" />
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>

        <div class="pm-compact-card__footer">
          <div class="pm-compact-card__line pm-compact-card__line--footer" />
        </div>
      </article>
    </div>
  );
}

export default function PublicMarketSections(props: PublicMarketSectionsProps) {
  let loadTriggerRef: HTMLDivElement | undefined;

  createEffect(() => {
    const trigger = loadTriggerRef;

    if (
      !trigger ||
      typeof IntersectionObserver === "undefined" ||
      !props.onLoadMore ||
      !props.canLoadMore ||
      props.loadingMore ||
      props.loadMoreError
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            props.onLoadMore?.();
            break;
          }
        }
      },
      {
        rootMargin: "200px",
      },
    );

    observer.observe(trigger);

    onCleanup(() => {
      observer.disconnect();
    });
  });

  return (
    <section class="pm-all-markets">
      <section class="pm-all-markets__section">
        <div class="pm-all-markets__head">
          <h1 class="pm-all-markets__title">{props.title ?? "All markets"}</h1>
        </div>

        <Show
          when={!props.loading}
          fallback={
            <div class="pm-all-markets__grid">
              <For each={Array.from({ length: 12 })}>{() => <CompactCardSkeleton />}</For>
            </div>
          }
        >
          <Show
            when={!props.error}
            fallback={
              <div class="pm-home__state">
                <p class="pm-home__state-title">Unable to load markets</p>
                <p class="pm-home__state-copy">{props.error}</p>
                <Show when={props.onRetry}>
                  <button class="pm-button pm-button--primary" onClick={() => props.onRetry?.()}>
                    Retry
                  </button>
                </Show>
              </div>
            }
          >
            <div class="pm-all-markets__grid">
              <For each={props.cards}>
                {(card, index) => (
                  <CompactMarketCard
                    card={card}
                    eagerData={index() < EAGER_CARD_DATA_COUNT}
                    eagerImage={index() < EAGER_CARD_IMAGE_COUNT}
                  />
                )}
              </For>
              <Show when={props.loadingMore}>
                <For each={Array.from({ length: 3 })}>{() => <CompactCardSkeleton />}</For>
              </Show>
            </div>

            <Show when={props.loadMoreError}>
              <div class="pm-all-markets__load-state">
                <p class="pm-home__state-copy">{props.loadMoreError}</p>
                <Show when={props.onLoadMore}>
                  <button
                    type="button"
                    class="pm-button pm-button--primary"
                    onClick={() => props.onLoadMore?.()}
                  >
                    Try again
                  </button>
                </Show>
              </div>
            </Show>

            <Show when={props.canLoadMore || props.loadingMore}>
              <div
                ref={element => {
                  loadTriggerRef = element;
                }}
                class="pm-all-markets__load-trigger"
                aria-hidden="true"
              />
            </Show>
          </Show>
        </Show>
      </section>
    </section>
  );
}
