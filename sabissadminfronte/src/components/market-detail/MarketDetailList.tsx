import { For, Show } from "solid-js";

import type { EventMarketListItem } from "./types.ts";

interface MarketDetailListProps {
  canEditMarkets?: boolean;
  markets: EventMarketListItem[];
  onEditMarket?: (market: EventMarketListItem) => void;
  selectedOutcomeIndex: number;
  onSelectMarket: (marketSlug: string) => void;
  onSelectOutcome: (marketSlug: string, outcomeIndex: number) => void;
}

export default function MarketDetailList(props: MarketDetailListProps) {
  return (
    <section class="pm-event-list">
      <For each={props.markets}>
        {market => (
          <article
            classList={{
              "pm-event-list__item": true,
              "pm-event-list__item--selected": market.isSelected,
            }}
          >
            <div class="pm-event-list__copy">
              <button
                type="button"
                class="pm-event-list__title-link"
                onClick={() => props.onSelectMarket(market.slug)}
              >
                <p class="pm-event-list__label">{market.label}</p>
              </button>
              <p class="pm-event-list__meta">{market.meta}</p>
            </div>

            <p class="pm-event-list__metric">{market.primaryMetric}</p>

            <div class="pm-event-list__actions">
              <For each={market.actionQuotes.slice(0, 2)}>
                {quote => (
                  <button
                    type="button"
                    classList={{
                      "pm-event-list__action": true,
                      "pm-event-list__action--yes": quote.outcomeIndex === 0,
                      "pm-event-list__action--no": quote.outcomeIndex !== 0,
                      "pm-event-list__action--active":
                        market.isSelected && quote.outcomeIndex === props.selectedOutcomeIndex,
                    }}
                    onClick={() => props.onSelectOutcome(market.slug, quote.outcomeIndex)}
                  >
                    <span class="pm-event-list__action-label">Buy {quote.label}</span>
                    <span>{quote.centsLabel}</span>
                  </button>
                )}
              </For>

              <Show when={props.canEditMarkets}>
                <button
                  type="button"
                  class="pm-button pm-button--ghost"
                  onClick={() => props.onEditMarket?.(market)}
                >
                  Edit
                </button>
              </Show>
            </div>
          </article>
        )}
      </For>
    </section>
  );
}
