import { For, Show } from "solid-js";

import type { MarketActivityItemResponse } from "~/lib/market/types.ts";
import { describeActivityType, formatRelativeTime } from "./format.ts";

interface ActivityFeedProps {
  items: MarketActivityItemResponse[];
}

export default function ActivityFeed(props: ActivityFeedProps) {
  return (
    <section class="pm-event-card">
      <div class="pm-event-card__header">
        <h2 class="pm-event-card__title">Activity</h2>
      </div>

      <Show
        when={props.items.length > 0}
        fallback={
          <p class="pm-event-card__copy">
            No public activity has been recorded for this market yet.
          </p>
        }
      >
        <div class="pm-activity-feed">
          <For each={props.items}>
            {item => (
              <article class="pm-activity-feed__item">
                <span class="pm-activity-feed__dot" aria-hidden="true" />
                <div class="pm-activity-feed__copy">
                  <p class="pm-activity-feed__title">{describeActivityType(item.activity_type)}</p>
                  <p class="pm-activity-feed__meta">{formatRelativeTime(item.occurred_at)}</p>
                  <p class="pm-activity-feed__detail">
                    {item.details?.trim() || "Recorded market activity."}
                  </p>
                </div>
              </article>
            )}
          </For>
        </div>
      </Show>
    </section>
  );
}
