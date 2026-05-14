import { Title } from "@solidjs/meta";
import { createEffect, createMemo, createSignal, Match, sharedConfig, Switch, untrack } from "solid-js";

import Navbar from "~/components/Navbar";
import {
  hydrateEventDetailView,
  loadEventDetailView,
  replaceCachedMarketComments,
  readProjectedEventDetailView,
} from "./data.ts";
import { buildEventHref } from "./format.ts";
import MarketDetailPage from "./MarketDetailPage.tsx";
import "./market-detail.css";
import type { EventDetailViewModel } from "./types.ts";

interface MarketDetailScreenProps {
  eventSlug: string;
}

type DetailLoadStatus = "loading" | "ready" | "error";

export default function MarketDetailScreen(props: MarketDetailScreenProps) {
  const canUseProjectedInitialView =
    typeof window !== "undefined" && sharedConfig.done === true;
  const initialProjectedView =
    canUseProjectedInitialView ? readProjectedEventDetailView(props.eventSlug) : null;
  const [status, setStatus] = createSignal<DetailLoadStatus>(
    initialProjectedView ? "ready" : "loading",
  );
  const [error, setError] = createSignal<string | null>(null);
  const [data, setData] = createSignal<EventDetailViewModel | null>(initialProjectedView);
  const [selectedMarketSlug, setSelectedMarketSlug] = createSignal<string | undefined>(undefined);
  const [selectedOutcomeIndex, setSelectedOutcomeIndex] = createSignal(0);
  const effectiveOutcomeIndex = createMemo(() => {
    const quoteCount = data()?.selectedMarket.quotes.length ?? 0;

    if (quoteCount <= 1) {
      return 0;
    }

    return Math.min(selectedOutcomeIndex(), quoteCount - 1);
  });
  let requestVersion = 0;

  const loadDetail = async () => {
    const version = ++requestVersion;
    setError(null);
    const requestedMarketSlug = untrack(selectedMarketSlug);
    const preserveCurrentView = untrack(() => {
      const currentData = data();
      return currentData !== null && currentData.eventSlug === props.eventSlug;
    });
    const projectedView = untrack(() =>
      readProjectedEventDetailView(props.eventSlug, requestedMarketSlug),
    );

    if (projectedView) {
      setData(projectedView);
      setStatus("ready");
    } else if (!preserveCurrentView) {
      setStatus("loading");
    }

    try {
      let hasHydratedPreview = false;
      const publishHydratedPreview = (view: EventDetailViewModel) => {
        if (version !== requestVersion) {
          return;
        }

        hasHydratedPreview = true;
        setData(view);
        setStatus("ready");
      };
      const hydratedViewPromise = hydrateEventDetailView(props.eventSlug, requestedMarketSlug, {
        onMarketPricesReady: publishHydratedPreview,
        onLiquidityReady: publishHydratedPreview,
        onCommentsReady: publishHydratedPreview,
      });
      const shellView = await loadEventDetailView(props.eventSlug, requestedMarketSlug);

      if (version !== requestVersion) {
        return;
      }

      if (!hasHydratedPreview) {
        setData(shellView);
        setStatus("ready");
      }

      const hydratedView = await hydratedViewPromise;

      if (version !== requestVersion) {
        return;
      }

      setData(hydratedView);
    } catch (caughtError) {
      if (version !== requestVersion) {
        return;
      }

      const message =
        caughtError instanceof Error ? caughtError.message : "Unable to load market detail.";
      setError(message);

      if (!preserveCurrentView && !projectedView) {
        setStatus("error");
      }
    }
  };

  createEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const cleanHref = buildEventHref(props.eventSlug);

    if (window.location.pathname === cleanHref && window.location.search.length > 0) {
      window.history.replaceState(window.history.state, "", cleanHref);
    }
  });

  let lastEventSlug = props.eventSlug;

  createEffect(() => {
    const eventSlug = props.eventSlug;

    if (eventSlug !== lastEventSlug) {
      lastEventSlug = eventSlug;
      setSelectedMarketSlug(undefined);
      setSelectedOutcomeIndex(0);
    }

    selectedMarketSlug();
    void loadDetail();
  });

  const selectMarket = (marketSlug: string) => {
    if (data()?.selectedMarket.slug === marketSlug) {
      return;
    }

    setSelectedMarketSlug(marketSlug);
    setSelectedOutcomeIndex(0);
  };

  const selectOutcome = (marketSlug: string, outcomeIndex: number) => {
    if (data()?.selectedMarket.slug !== marketSlug) {
      setSelectedMarketSlug(marketSlug);
    }

    setSelectedOutcomeIndex(outcomeIndex);
  };
  const updateComments = (marketId: string, comments: EventDetailViewModel["comments"]) => {
    replaceCachedMarketComments(props.eventSlug, marketId, comments);
    setData(currentData => {
      if (!currentData || currentData.selectedMarketId !== marketId) {
        return currentData;
      }

      return {
        ...currentData,
        comments,
      };
    });
  };

  return (
    <div class="pm-page">
      <Title>{data()?.eventTitle ?? "Market detail"}</Title>
      <Navbar />

      <main class="pm-event-page">
        <Switch>
          <Match when={status() === "ready" && data()}>
            <MarketDetailPage
              data={data()!}
              selectedOutcomeIndex={effectiveOutcomeIndex()}
              onSelectMarket={selectMarket}
              onSelectOutcome={selectOutcome}
              onCommentsChange={updateComments}
            />
          </Match>

          <Match when={status() === "error"}>
            <section class="pm-home__state">
              <h1 class="pm-home__state-title">Unable to load this market</h1>
              <p class="pm-home__state-copy">{error() ?? "Please try again."}</p>
              <button type="button" class="pm-button pm-button--primary" onClick={loadDetail}>
                Retry
              </button>
            </section>
          </Match>

          <Match when={true}>
            <section class="pm-home__state">
              <h1 class="pm-home__state-title">Loading market</h1>
              <p class="pm-home__state-copy">Pulling event details.</p>
            </section>
          </Match>
        </Switch>
      </main>
    </div>
  );
}
