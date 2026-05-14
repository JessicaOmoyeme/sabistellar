import { createMemo, createSignal, onMount, Show } from "solid-js";

import { marketClient, type TagSummaryResponse } from "~/lib/market/index.ts";
import PublicPageLayout from "./PublicPageLayout.tsx";
import PublicState from "./PublicState.tsx";
import SummaryTileGrid from "./SummaryTileGrid.tsx";

type ScreenStatus = "loading" | "ready" | "error";

export default function TagDirectoryScreen() {
  const [status, setStatus] = createSignal<ScreenStatus>("loading");
  const [error, setError] = createSignal<string | null>(null);
  const [tags, setTags] = createSignal<TagSummaryResponse[]>([]);

  const tiles = createMemo(() =>
    [...tags()]
      .sort((left, right) => {
        if (left.market_count !== right.market_count) {
          return right.market_count - left.market_count;
        }

        return left.label.localeCompare(right.label);
      })
      .map(tag => ({
        id: tag.slug,
        href: `/tags#${encodeURIComponent(tag.slug)}`,
        kicker: `${tag.market_count} markets`,
        title: tag.label,
        meta: `${tag.event_count} events`,
      })),
  );

  const loadTags = async () => {
    setStatus("loading");
    setError(null);

    try {
      const response = await marketClient.listTags();
      setTags(response.tags);
      setStatus("ready");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to load tags.");
      setStatus("error");
    }
  };

  onMount(() => {
    void loadTags();
  });

  return (
    <PublicPageLayout
      title="Tags"
      kicker="Public endpoint"
      heading="Tags"
      summary="The public tag directory is useful for discovery and for linking out from category, event, and market detail pages."
    >
      <Show
        when={status() === "ready"}
        fallback={
          <PublicState
            title={status() === "loading" ? "Loading tags" : "Unable to load tags"}
            copy={
              status() === "loading" ? "Fetching the public tag summaries." : error() ?? "Please try again."
            }
            actionLabel={status() === "error" ? "Retry" : undefined}
            onAction={
              status() === "error"
                ? () => {
                    void loadTags();
                  }
                : undefined
            }
          />
        }
      >
        <section class="pm-home__section">
          <div class="pm-home__section-head">
            <div>
              <p class="pm-home__section-kicker">Directory</p>
              <h2 class="pm-home__section-title">All tags</h2>
            </div>
          </div>
          <SummaryTileGrid items={tiles()} />
        </section>
      </Show>
    </PublicPageLayout>
  );
}
