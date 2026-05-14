import { Title } from "@solidjs/meta";
import {
  createEffect,
  createMemo,
  createSignal,
  Match,
  sharedConfig,
  Show,
  Switch,
  untrack,
} from "solid-js";

import AdminMarketCreationModal, {
  type MarketCreationModalInitialEvent,
} from "~/components/AdminMarketCreationModal";
import AdminMarketOperationsModal, {
  type AdminMarketOperationsTab,
} from "~/components/AdminMarketOperationsModal";
import AdminNavbar from "~/components/AdminNavbar";
import AdminWorkspace from "~/components/AdminWorkspace";
import { listAdminEvents } from "~/lib/api/admin";
import { getErrorMessage } from "~/lib/api/core";
import { useAdminAuth } from "~/lib/admin-auth-context";
import { useAsyncTask } from "~/lib/hooks/useAsyncTask";
import {
  hydrateEventDetailView,
  loadEventDetailView,
  readProjectedEventDetailView,
} from "./data.ts";
import { buildEventHref } from "./format.ts";
import MarketDetailPage from "./MarketDetailPage.tsx";
import "./market-detail.css";
import type { EventDetailViewModel, EventMarketListItem } from "./types.ts";

interface MarketDetailScreenProps {
  eventSlug: string;
}

type DetailLoadStatus = "loading" | "ready" | "error";
const ADMIN_EVENT_LOOKUP_LIMIT = 100;
const ADMIN_EVENT_LOOKUP_MAX_PAGES = 12;

async function findAdminEventBySlug(eventSlug: string): Promise<MarketCreationModalInitialEvent> {
  const normalizedSlug = eventSlug.trim();

  if (!normalizedSlug) {
    throw new Error("Event slug is required to continue the admin market flow.");
  }

  for (let pageIndex = 0; pageIndex < ADMIN_EVENT_LOOKUP_MAX_PAGES; pageIndex += 1) {
    const offset = pageIndex * ADMIN_EVENT_LOOKUP_LIMIT;
    const response = await listAdminEvents({
      publication_status: "all",
      limit: ADMIN_EVENT_LOOKUP_LIMIT,
      offset,
    });
    const match = response.events.find(event => event.slug === normalizedSlug);

    if (match) {
      return {
        id: match.id,
        slug: match.slug,
        publicationStatus: match.publication_status,
        step: "manual_markets",
      };
    }

    if (response.events.length < ADMIN_EVENT_LOOKUP_LIMIT) {
      break;
    }
  }

  throw new Error(
    "Could not find the admin event for this page. Open Create market -> Multi-market event and recover it from the event list.",
  );
}

export default function MarketDetailScreen(props: MarketDetailScreenProps) {
  const auth = useAdminAuth();
  const canUseProjectedInitialView =
    typeof window !== "undefined" && sharedConfig.done === true;
  const initialProjectedView =
    canUseProjectedInitialView ? readProjectedEventDetailView(props.eventSlug) : null;
  const profile = createMemo(() => auth.profile());
  const [status, setStatus] = createSignal<DetailLoadStatus>(
    initialProjectedView ? "ready" : "loading",
  );
  const [adminDrawerOpen, setAdminDrawerOpen] = createSignal(false);
  const [adminMarketModalOpen, setAdminMarketModalOpen] = createSignal(false);
  const [adminMarketOperationsModalOpen, setAdminMarketOperationsModalOpen] = createSignal(false);
  const [adminMarketOperationsInitialTab, setAdminMarketOperationsInitialTab] =
    createSignal<AdminMarketOperationsTab>("set_prices");
  const [adminMarketOperationsMarketSlug, setAdminMarketOperationsMarketSlug] = createSignal<
    string | null
  >(null);
  const [adminMarketModalEvent, setAdminMarketModalEvent] =
    createSignal<MarketCreationModalInitialEvent | null>(null);
  const [adminMarketActionError, setAdminMarketActionError] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [data, setData] = createSignal<EventDetailViewModel | null>(initialProjectedView);
  const [selectedMarketSlug, setSelectedMarketSlug] = createSignal<string | undefined>(undefined);
  const [selectedOutcomeIndex, setSelectedOutcomeIndex] = createSignal(0);
  const resolveAdminEventTask = useAsyncTask((eventSlug: string) => findAdminEventBySlug(eventSlug));
  const effectiveOutcomeIndex = createMemo(() => {
    const quoteCount = data()?.selectedMarket.quotes.length ?? 0;

    if (quoteCount <= 1) {
      return 0;
    }

    return Math.min(selectedOutcomeIndex(), quoteCount - 1);
  });
  const activeAdminMarket = createMemo<EventMarketListItem | null>(() => {
    const currentData = data();
    const marketSlug = adminMarketOperationsMarketSlug();

    if (!currentData) {
      return null;
    }

    if (!marketSlug) {
      return currentData.selectedMarket;
    }

    return currentData.marketList.find(market => market.slug === marketSlug) ?? currentData.selectedMarket;
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
      setAdminDrawerOpen(false);
      setAdminMarketModalOpen(false);
      setAdminMarketOperationsModalOpen(false);
      setAdminMarketOperationsMarketSlug(null);
      setAdminMarketModalEvent(null);
      setAdminMarketActionError(null);
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

  const openAddMarketToEvent = async () => {
    const currentData = data();

    if (!currentData) {
      return;
    }

    setAdminMarketActionError(null);

    try {
      const initialEvent =
        adminMarketModalEvent()?.slug === currentData.eventSlug
          ? adminMarketModalEvent()!
          : await resolveAdminEventTask.run(currentData.eventSlug);
      setAdminMarketModalEvent(initialEvent);
      setAdminMarketModalOpen(true);
    } catch (caughtError) {
      setAdminMarketActionError(getErrorMessage(caughtError));
    }
  };

  const openMarketOperationsModal = async (
    initialTab: AdminMarketOperationsTab,
    marketSlug?: string,
  ) => {
    const currentData = data();

    if (!currentData) {
      return;
    }

    setAdminMarketActionError(null);
    setAdminMarketOperationsInitialTab(initialTab);
    setAdminMarketOperationsMarketSlug(marketSlug ?? currentData.selectedMarket.slug);

    if (initialTab === "bootstrap_event") {
      try {
        const initialEvent =
          adminMarketModalEvent()?.slug === currentData.eventSlug
            ? adminMarketModalEvent()!
            : await resolveAdminEventTask.run(currentData.eventSlug);
        setAdminMarketModalEvent(initialEvent);
      } catch (caughtError) {
        setAdminMarketActionError(getErrorMessage(caughtError));
        return;
      }
    }

    setAdminMarketOperationsModalOpen(true);
  };

  return (
    <div class="pm-page">
      <Title>{data()?.eventTitle ?? "Market detail"}</Title>
      <AdminNavbar
        adminDrawerOpen={adminDrawerOpen()}
        onToggleAdminDrawer={() => setAdminDrawerOpen(open => !open)}
      />

      <main class="pm-event-page">
        <Switch>
          <Match when={status() === "ready" && data()}>
            <MarketDetailPage
              adminActionError={adminMarketActionError()}
              adminEventActionPending={resolveAdminEventTask.pending()}
              canAddMarketToEvent={Boolean(profile())}
              data={data()!}
              onAddMarketToEvent={() => {
                void openAddMarketToEvent();
              }}
              onBootstrapEventLiquidity={() => {
                void openMarketOperationsModal("bootstrap_event");
              }}
              onEditMarket={market => {
                void openMarketOperationsModal("set_prices", market.slug);
              }}
              onEditSelectedMarket={() => {
                void openMarketOperationsModal("set_prices", data()?.selectedMarket.slug);
              }}
              selectedOutcomeIndex={effectiveOutcomeIndex()}
              onSelectMarket={selectMarket}
              onSelectOutcome={selectOutcome}
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

      <Show when={profile()}>
        {currentProfile => (
          <>
            <AdminWorkspace
              profile={currentProfile()}
              open={adminDrawerOpen()}
              onClose={() => setAdminDrawerOpen(false)}
            />

            <Show when={adminMarketModalOpen() && adminMarketModalEvent()}>
              {initialEvent => (
                <AdminMarketCreationModal
                  type="multi_market_event"
                  initialEvent={initialEvent()}
                  onBack={() => setAdminMarketModalOpen(false)}
                  onClose={() => setAdminMarketModalOpen(false)}
                />
              )}
            </Show>

            <Show when={adminMarketOperationsModalOpen() && data() && activeAdminMarket()}>
              {currentData => (
                <AdminMarketOperationsModal
                  eventAdminId={
                    adminMarketModalEvent()?.slug === currentData().eventSlug
                      ? adminMarketModalEvent()?.id ?? null
                      : null
                  }
                  eventSlug={currentData().eventSlug}
                  eventTitle={currentData().eventTitle}
                  initialTab={adminMarketOperationsInitialTab()}
                  market={activeAdminMarket()!}
                  markets={currentData().marketList}
                  onApplied={() => {
                    void loadDetail();
                  }}
                  onBack={() => {
                    setAdminMarketOperationsModalOpen(false);
                    setAdminMarketOperationsMarketSlug(null);
                  }}
                  onClose={() => {
                    setAdminMarketOperationsModalOpen(false);
                    setAdminMarketOperationsMarketSlug(null);
                  }}
                />
              )}
            </Show>
          </>
        )}
      </Show>
    </div>
  );
}
