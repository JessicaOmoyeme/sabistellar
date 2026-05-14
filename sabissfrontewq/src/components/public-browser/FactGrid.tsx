import { For } from "solid-js";

export interface PublicFactItem {
  label: string;
  value: string;
  mono?: boolean;
}

interface FactGridProps {
  facts: readonly PublicFactItem[];
}

export default function FactGrid(props: FactGridProps) {
  return (
    <div class="pm-detail__facts">
      <For each={props.facts}>
        {fact => (
          <article class="pm-detail__fact-card">
            <p class="pm-detail__fact-label">{fact.label}</p>
            <p
              classList={{
                "pm-detail__fact-value": true,
                "pm-detail__fact-value--mono": Boolean(fact.mono),
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
