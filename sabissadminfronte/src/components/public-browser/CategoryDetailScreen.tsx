import { createMemo, createSignal, onMount, Show } from "solid-js";

import { groupMarketsByEvent, marketClient, type CategoryDetailResponse } from "~/lib/market/index.ts";
import FactGrid from "./FactGrid.tsx";
import GroupedMarketCardGrid from "./GroupedMarketCardGrid.tsx";
import PublicPageLayout from "./PublicPageLayout.tsx";
import PublicState from "./PublicState.tsx";

type ScreenStatus = "loading" | "ready" | "error";

interface CategoryDetailScreenProps {
  slug: string;
}

export default function CategoryDetailScreen(props: CategoryDetailScreenProps) {
  const [status, setStatus] = createSignal<ScreenStatus>("loading");
  const [error, setError] = createSignal<string | null>(null);
  const [data, setData] = createSignal<CategoryDetailResponse | null>(null);

  const groupedMarkets = createMemo(() => groupMarketsByEvent(data()?.markets ?? []));

  const loadCategory = async () => {
    setStatus("loading");
    setError(null);

    try {
      const response = await marketClient.fetchCategory(props.slug);
      setData(response);
      setStatus("ready");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to load category.");
      setStatus("error");
    }
  };

  onMount(() => {
    void loadCategory();
  });

  const category = () => data()?.category;

  return (
    <PublicPageLayout
      title={category()?.label ?? "Category"}
      kicker="Category feed"
      heading={category()?.label ?? "Loading category"}
      summary={
        category()
          ? `${category()!.market_count} published markets across ${category()!.event_count} events.`
          : "Loading category details."
      }
    >
      <Show
        when={status() === "ready" && data()}
        fallback={
          <PublicState
            title={status() === "loading" ? "Loading category" : "Unable to load category"}
            copy={
              status() === "loading"
                ? "Fetching the category feed."
                : error() ?? "Please try again."
            }
            actionLabel={status() === "error" ? "Retry" : undefined}
            onAction={
              status() === "error"
                ? () => {
                    void loadCategory();
                  }
                : undefined
            }
          />
        }
      >
        <FactGrid
          facts={[
            {
              label: "Markets",
              value: String(category()?.market_count ?? 0),
            },
            {
              label: "Events",
              value: String(category()?.event_count ?? 0),
            },
            {
              label: "Featured",
              value: String(category()?.featured_event_count ?? 0),
            },
            {
              label: "Breaking",
              value: String(category()?.breaking_event_count ?? 0),
            },
          ]}
        />

        <section class="pm-home__section">
          <div class="pm-home__section-head">
            <div>
              <p class="pm-home__section-kicker">Published markets</p>
              <h2 class="pm-home__section-title">Category markets</h2>
            </div>
          </div>

          <Show
            when={groupedMarkets().length > 0}
            fallback={
              <PublicState
                title="No markets yet"
                copy="This category exists, but no published markets were returned for it yet."
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
