import { createEffect, createMemo, createSignal, Show } from "solid-js";

import {
  groupMarketsByEvent,
  marketClient,
  type MarketListResponse,
} from "~/lib/market/index.ts";
import FactGrid from "./FactGrid.tsx";
import GroupedMarketCardGrid from "./GroupedMarketCardGrid.tsx";
import PublicPageLayout from "./PublicPageLayout.tsx";
import PublicState from "./PublicState.tsx";

type ScreenStatus = "idle" | "loading" | "ready" | "error";
const SEARCH_PAGE_LIMIT = 24;
const MIN_SEARCH_LENGTH = 2;

interface MarketSearchScreenProps {
  query?: string;
}

function normalizeSearchQuery(value?: string): string {
  return value?.trim() ?? "";
}

export default function MarketSearchScreen(props: MarketSearchScreenProps) {
  const [status, setStatus] = createSignal<ScreenStatus>("idle");
  const [error, setError] = createSignal<string | null>(null);
  const [data, setData] = createSignal<MarketListResponse | null>(null);
  let requestVersion = 0;

  const query = createMemo(() => normalizeSearchQuery(props.query));
  const groupedMarkets = createMemo(() => groupMarketsByEvent(data()?.markets ?? []));
  const eventCount = createMemo(() => groupedMarkets().length);
  const hasQuery = createMemo(() => query().length > 0);
  const hasValidQuery = createMemo(() => query().length >= MIN_SEARCH_LENGTH);

  const loadSearch = async () => {
    const currentQuery = query();

    if (currentQuery.length === 0 || currentQuery.length < MIN_SEARCH_LENGTH) {
      setStatus("idle");
      setError(null);
      setData(null);
      return;
    }

    const version = ++requestVersion;
    setStatus("loading");
    setError(null);

    try {
      const response = await marketClient.searchMarkets({
        q: currentQuery,
        limit: SEARCH_PAGE_LIMIT,
      });

      if (version !== requestVersion) {
        return;
      }

      setData(response);
      setStatus("ready");
    } catch (caughtError) {
      if (version !== requestVersion) {
        return;
      }

      setData(null);
      setError(caughtError instanceof Error ? caughtError.message : "Unable to search markets.");
      setStatus("error");
    }
  };

  createEffect(() => {
    query();
    void loadSearch();
  });

  return (
    <PublicPageLayout
      title={hasQuery() ? `Search: ${query()}` : "Search"}
      kicker="Public search"
      heading={hasQuery() ? `Search results for "${query()}"` : "Search Sabimarket"}
      summary={
        hasQuery()
          ? "Browse published markets and events that match your search."
          : "Search by market question, event title, category, or topic."
      }
    >
      <Show
        when={status() === "ready" && data()}
        fallback={
          <PublicState
            title={
              !hasQuery()
                ? "Search markets"
                : !hasValidQuery()
                  ? "Keep typing"
                  : status() === "loading"
                    ? "Searching markets"
                    : "Unable to search markets"
            }
            copy={
              !hasQuery()
                ? "Enter at least 2 characters in the search bar above to find published markets."
                : !hasValidQuery()
                  ? "Search terms must be at least 2 characters long."
                  : status() === "loading"
                    ? `Looking for markets matching "${query()}".`
                    : error() ?? "Please try again."
            }
            actionLabel={status() === "error" ? "Retry" : undefined}
            onAction={
              status() === "error"
                ? () => {
                    void loadSearch();
                  }
                : undefined
            }
          />
        }
      >
        <FactGrid
          facts={[
            {
              label: "Query",
              value: query(),
            },
            {
              label: "Markets",
              value: String(data()?.markets.length ?? 0),
            },
            {
              label: "Events",
              value: String(eventCount()),
            },
            {
              label: "Limit",
              value: String(data()?.limit ?? SEARCH_PAGE_LIMIT),
            },
          ]}
        />

        <section class="pm-home__section">
          <div class="pm-home__section-head">
            <div>
              <p class="pm-home__section-kicker">Published markets</p>
              <h2 class="pm-home__section-title">Search matches</h2>
            </div>
          </div>

          <Show
            when={groupedMarkets().length > 0}
            fallback={
              <PublicState
                title="No markets found"
                copy={`No published markets matched "${query()}".`}
              />
            }
          >
            <GroupedMarketCardGrid cards={groupedMarkets()} marketLimit={6} />
          </Show>
        </section>
      </Show>
    </PublicPageLayout>
  );
}
