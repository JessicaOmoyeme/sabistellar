import { A } from "@solidjs/router";
import { For, Show } from "solid-js";

import { formatSlugLabel } from "~/lib/market/view.ts";

interface MarketResourceLinksProps {
  eventId: string | null;
  marketId: string;
  conditionId: string | null;
  categorySlug: string;
  tagSlugs: readonly string[];
}

export default function MarketResourceLinks(props: MarketResourceLinksProps) {
  return (
    <section class="pm-detail__card pm-detail__card--wide">
      <h2 class="pm-detail__card-title">Public resource links</h2>
      <div class="pm-browser__link-grid">
        <Show when={props.eventId}>
          <A class="pm-detail__list-link" href={`/events/${encodeURIComponent(props.eventId ?? "")}`}>
            <span>Event resource</span>
            <span>{props.eventId}</span>
          </A>
        </Show>

        <A class="pm-detail__list-link" href={`/markets/${encodeURIComponent(props.marketId)}`}>
          <span>Market resource</span>
          <span>{props.marketId}</span>
        </A>

        <Show when={props.conditionId}>
          <A
            class="pm-detail__list-link"
            href={`/markets/by-condition/${encodeURIComponent(props.conditionId ?? "")}`}
          >
            <span>Condition lookup</span>
            <span>{props.conditionId}</span>
          </A>
        </Show>

        <A
          class="pm-detail__list-link"
          href={`/categories/${encodeURIComponent(props.categorySlug)}`}
        >
          <span>Category feed</span>
          <span>{formatSlugLabel(props.categorySlug)}</span>
        </A>
      </div>

      <Show when={props.tagSlugs.length > 0}>
        <div class="pm-browser__pill-row">
          <For each={props.tagSlugs}>
            {slug => (
              <A class="pm-browser__pill" href={`/tags#${encodeURIComponent(slug)}`}>
                {formatSlugLabel(slug)}
              </A>
            )}
          </For>
        </div>
      </Show>
    </section>
  );
}
