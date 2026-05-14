import { Title } from "@solidjs/meta";
import { createEffect, createMemo, createSignal, onMount } from "solid-js";

import Navbar from "~/components/Navbar";
import PublicMarketSections from "~/components/PublicMarketSections";
import {
  groupEventCardsWithMarkets,
  marketClient,
  type PublicEventCardResponse,
} from "~/lib/market/index.ts";

type HomeLoadStatus = "loading" | "ready" | "error";
const EVENT_CARD_PAGE_SIZE = 12;
const HOME_FEED_STORAGE_KEY = "pm-home-feed/v3";
const LEGACY_HOME_FEED_STORAGE_KEY = "pm-home-feed/v2";

interface HomeFeedState {
  events: PublicEventCardResponse[];
  nextOffset: number;
  hasMore: boolean;
}

let cachedFeed: HomeFeedState | null = null;
let inflightFeedRequest: Promise<HomeFeedState> | null = null;
let inflightFeedDrain: Promise<void> | null = null;

async function fetchEventPage(offset: number): Promise<HomeFeedState> {
  const response = await marketClient.listEvents({
    include_markets: true,
    limit: EVENT_CARD_PAGE_SIZE,
    offset,
  });

  return {
    events: response.events,
    nextOffset: offset + response.events.length,
    hasMore: response.events.length === EVENT_CARD_PAGE_SIZE,
  };
}

async function loadInitialFeed(): Promise<HomeFeedState> {
  if (cachedFeed) {
    return cachedFeed;
  }

  if (inflightFeedRequest) {
    return inflightFeedRequest;
  }

  inflightFeedRequest = fetchEventPage(0)
    .then(feed => {
      cachedFeed = feed;
      return feed;
    })
    .finally(() => {
      inflightFeedRequest = null;
    });

  return inflightFeedRequest;
}

async function drainRemainingFeedPages(onUpdate?: (feed: HomeFeedState) => void): Promise<void> {
  if (inflightFeedDrain) {
    return inflightFeedDrain;
  }

  inflightFeedDrain = (async () => {
    let currentFeed = cachedFeed;

    while (currentFeed?.hasMore) {
      const nextPage = await fetchEventPage(currentFeed.nextOffset);
      currentFeed = mergeFeedPage(currentFeed, nextPage);
      cachedFeed = currentFeed;
      writeFeedToStorage(currentFeed);
      onUpdate?.(currentFeed);
    }
  })().finally(() => {
    inflightFeedDrain = null;
  });

  return inflightFeedDrain;
}

function mergeFeedPage(currentFeed: HomeFeedState, nextPage: HomeFeedState): HomeFeedState {
  const seenEventSlugs = new Set(currentFeed.events.map(event => event.slug));
  const mergedEvents = [...currentFeed.events];

  for (const event of nextPage.events) {
    if (seenEventSlugs.has(event.slug)) {
      continue;
    }

    seenEventSlugs.add(event.slug);
    mergedEvents.push(event);
  }

  return {
    events: mergedEvents,
    nextOffset: nextPage.nextOffset,
    hasMore: nextPage.hasMore,
  };
}

function reconcileInitialFeed(
  currentFeed: HomeFeedState,
  refreshedInitialFeed: HomeFeedState,
): HomeFeedState {
  if (currentFeed.nextOffset <= refreshedInitialFeed.nextOffset) {
    return refreshedInitialFeed;
  }

  const refreshedEventSlugs = new Set(refreshedInitialFeed.events.map(event => event.slug));

  return {
    events: [
      ...refreshedInitialFeed.events,
      ...currentFeed.events.filter(event => !refreshedEventSlugs.has(event.slug)),
    ],
    nextOffset: currentFeed.nextOffset,
    hasMore: currentFeed.hasMore,
  };
}

function resetFeedCache() {
  cachedFeed = null;
  inflightFeedRequest = null;

  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(HOME_FEED_STORAGE_KEY);
    window.sessionStorage.removeItem(LEGACY_HOME_FEED_STORAGE_KEY);
  }
}

function isHomeFeedState(value: unknown): value is HomeFeedState {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<HomeFeedState>;

  return (
    Array.isArray(candidate.events) &&
    typeof candidate.nextOffset === "number" &&
    typeof candidate.hasMore === "boolean"
  );
}

function readFeedFromStorage(): HomeFeedState | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(HOME_FEED_STORAGE_KEY);

    if (!raw) {
      window.sessionStorage.removeItem(LEGACY_HOME_FEED_STORAGE_KEY);
      return null;
    }

    const parsed = JSON.parse(raw) as unknown;

    if (isHomeFeedState(parsed)) {
      return parsed;
    }

    return null;
  } catch {
    return null;
  }
}

function writeFeedToStorage(feed: HomeFeedState) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(HOME_FEED_STORAGE_KEY, JSON.stringify(feed));
  } catch {
    // Ignore storage write failures and keep the in-memory cache.
  }
}

export default function Home() {
  const [status, setStatus] = createSignal<HomeLoadStatus>("loading");
  const [error, setError] = createSignal<string | null>(null);
  const [eventCards, setEventCards] = createSignal<PublicEventCardResponse[]>([]);
  const [nextOffset, setNextOffset] = createSignal(0);
  const [hasMore, setHasMore] = createSignal(true);
  const [loadingMore, setLoadingMore] = createSignal(false);
  const [loadMoreError, setLoadMoreError] = createSignal<string | null>(null);
  const cards = createMemo(() => groupEventCardsWithMarkets(eventCards()));

  const applyFeed = (feed: HomeFeedState) => {
    cachedFeed = feed;
    writeFeedToStorage(feed);
    setEventCards(feed.events);
    setNextOffset(feed.nextOffset);
    setHasMore(feed.hasMore);
  };

  const loadSections = async (background = false) => {
    if (!background) {
      setStatus("loading");
    }

    setError(null);
    setLoadMoreError(null);

    try {
      const initialFeed = await loadInitialFeed();

      if (background && eventCards().length > 0) {
        applyFeed(
          reconcileInitialFeed(
            {
              events: eventCards(),
              nextOffset: nextOffset(),
              hasMore: hasMore(),
            },
            initialFeed,
          ),
        );
      } else {
        applyFeed(initialFeed);
      }

      setStatus("ready");
      void drainRemainingFeedPages(feed => {
        applyFeed(feed);
      }).then(() => {
        if (cachedFeed) {
          applyFeed(cachedFeed);
        }
      });
    } catch (caughtError) {
      if (background && eventCards().length > 0) {
        return;
      }

      const message =
        caughtError instanceof Error ? caughtError.message : "Unable to load market data.";
      setError(message);
      setStatus("error");
    }
  };

  const loadMoreSections = async () => {
    if (status() !== "ready" || loadingMore() || !hasMore() || inflightFeedDrain) {
      return;
    }

    setLoadingMore(true);
    setLoadMoreError(null);

    try {
      const currentFeed = {
        events: eventCards(),
        nextOffset: nextOffset(),
        hasMore: hasMore(),
      };
      const nextPage = await fetchEventPage(currentFeed.nextOffset);
      applyFeed(mergeFeedPage(currentFeed, nextPage));
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : "Unable to load more markets.";
      setLoadMoreError(message);
    } finally {
      setLoadingMore(false);
    }
  };

  onMount(() => {
    const warmFeed = cachedFeed ?? readFeedFromStorage();

    if (warmFeed) {
      applyFeed(warmFeed);
      setStatus("ready");
      setError(null);
      cachedFeed = null;
      inflightFeedRequest = null;
      void loadSections(true);
      return;
    }

    void loadSections();
  });

  return (
    <div class="pm-page">
      <Title>Sabimarket</Title>
      <Navbar />
      <main>
        <PublicMarketSections
          cards={cards()}
          loading={status() === "loading"}
          error={status() === "error" ? error() : null}
          canLoadMore={hasMore()}
          loadingMore={loadingMore()}
          loadMoreError={loadMoreError()}
          onLoadMore={() => {
            void loadMoreSections();
          }}
          onRetry={() => {
            resetFeedCache();
            void loadSections();
          }}
        />
      </main>
    </div>
  );
}
