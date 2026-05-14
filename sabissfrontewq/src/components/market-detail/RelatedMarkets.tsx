import { A } from "@solidjs/router";
import { For, Show } from "solid-js";

import type { PublicMarketCardResponse } from "~/lib/market/types.ts";
import { formatSlugLabel } from "~/lib/market/view.ts";
import { buildMarketHref, resolveMarketLabel } from "./format.ts";

interface RelatedMarketsProps {
  markets: PublicMarketCardResponse[];
}

export default function RelatedMarkets(props: RelatedMarketsProps) {
  return (
    <section class="pm-event-card">
      <div class="pm-event-card__header">
        <h2 class="pm-event-card__title">Related markets</h2>
      </div>

      <Show
        when={props.markets.length > 0}
        fallback={
          <p class="pm-event-card__copy">No related markets are available for this event yet.</p>
        }
      >
        <div class="pm-related-grid">
          <For each={props.markets}>
            {market => (
              <A
                href={buildMarketHref(market.event.slug, market.slug)}
                class="pm-related-grid__card"
              >
                <p class="pm-related-grid__eyebrow">{formatSlugLabel(market.event.category_slug)}</p>
                <p class="pm-related-grid__title">{market.event.title}</p>
                <p class="pm-related-grid__meta">
                  {resolveMarketLabel(market.label, market.question, market.end_time)}
                </p>
              </A>
            )}
          </For>
        </div>
      </Show>
    </section>
  );
}
