import { For } from "solid-js";

import type { EventFactItem } from "./types.ts";

interface MarketDetailFactsProps {
  facts: EventFactItem[];
}

export default function MarketDetailFacts(props: MarketDetailFactsProps) {
  return (
    <div class="pm-event-facts">
      <For each={props.facts}>
        {fact => (
          <article class="pm-event-facts__card">
            <p class="pm-event-facts__label">{fact.label}</p>
            <p
              classList={{
                "pm-event-facts__value": true,
                "pm-event-facts__value--mono": Boolean(fact.mono),
              }}
            >
              {fact.value}
            </p>
          </article>
        )}
      </For>
    </div>
  );
}
