import { For, Show } from "solid-js";

import type { EventDetailViewModel } from "./types.ts";
import { BookmarkIcon, LinkIcon, ShareIcon } from "./icons.tsx";

interface MarketDetailHeaderProps {
  adminActionError?: string | null;
  adminEventActionPending?: boolean;
  canAddMarketToEvent?: boolean;
  data: EventDetailViewModel;
  onAddMarketToEvent?: () => void;
  onBootstrapEventLiquidity?: () => void;
  onEditSelectedMarket?: () => void;
  onSelectMarket: (marketSlug: string) => void;
}

export default function MarketDetailHeader(props: MarketDetailHeaderProps) {
  const fallbackLetter = () => props.data.eventTitle.trim().charAt(0).toUpperCase() || "M";

  return (
    <div class="pm-event-header">
      <div class="pm-event-header__bar">
        <div class="pm-event-header__copy">
          <div class="pm-event-header__art">
            <Show
              when={props.data.eventImageUrl}
              fallback={<span class="pm-event-header__art-fallback">{fallbackLetter()}</span>}
            >
              <img
                src={props.data.eventImageUrl ?? ""}
                alt={`${props.data.eventTitle} icon`}
                loading="lazy"
                decoding="async"
              />
            </Show>
          </div>

          <div class="pm-event-header__text">
            <p class="pm-event-header__kicker">
              {props.data.categoryLabel}
              <Show when={props.data.subcategoryLabel}>
                <span> · {props.data.subcategoryLabel}</span>
              </Show>
            </p>
            <h1 class="pm-event-header__title">{props.data.eventTitle}</h1>
            <p class="pm-event-header__meta">
              {props.data.marketCount} markets · {props.data.selectedMarket.headerMeta}
            </p>
          </div>
        </div>

        <div class="pm-event-header__actions" aria-label="Event actions">
          <Show when={props.canAddMarketToEvent}>
            <button
              type="button"
              class="pm-button pm-button--ghost pm-event-header__admin-action"
              onClick={() => props.onEditSelectedMarket?.()}
            >
              Edit selected market
            </button>

            <button
              type="button"
              class="pm-button pm-button--ghost pm-event-header__admin-action"
              disabled={props.adminEventActionPending}
              onClick={() => props.onBootstrapEventLiquidity?.()}
            >
              {props.adminEventActionPending ? "Opening..." : "Bootstrap event"}
            </button>

            <button
              type="button"
              class="pm-button pm-button--ghost pm-event-header__admin-action"
              disabled={props.adminEventActionPending}
              onClick={() => props.onAddMarketToEvent?.()}
            >
              {props.adminEventActionPending ? "Opening..." : "Add market to event"}
            </button>
          </Show>

          <button type="button" class="pm-event-icon-button" aria-label="Share market">
            <ShareIcon />
          </button>
          <button type="button" class="pm-event-icon-button" aria-label="Copy market link">
            <LinkIcon />
          </button>
          <button type="button" class="pm-event-icon-button" aria-label="Add to favorites">
            <BookmarkIcon />
          </button>
        </div>
      </div>

      <div class="pm-event-header__tabs" role="tablist" aria-label="Markets in this event">
        <For each={props.data.marketTabs}>
          {tab => (
            <button
              type="button"
              classList={{
                "pm-event-header__tab": true,
                "pm-event-header__tab--active": tab.isSelected,
              }}
              onClick={() => props.onSelectMarket(tab.marketSlug)}
            >
              {tab.label}
            </button>
          )}
        </For>
      </div>

      <Show when={props.adminActionError}>
        {message => <p class="pm-event-header__admin-feedback">{message()}</p>}
      </Show>
    </div>
  );
}
