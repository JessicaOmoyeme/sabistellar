import { A } from "@solidjs/router";
import { For, Show } from "solid-js";

export interface SummaryTileItem {
  id?: string;
  href?: string;
  kicker?: string;
  title: string;
  meta: string;
}

interface SummaryTileGridProps {
  items: readonly SummaryTileItem[];
}

function SummaryTile(props: SummaryTileItem) {
  return (
    <>
      <Show when={props.kicker}>
        <p class="pm-browser__summary-kicker">{props.kicker}</p>
      </Show>
      <h2 class="pm-browser__summary-title">{props.title}</h2>
      <p class="pm-browser__summary-meta">{props.meta}</p>
    </>
  );
}

export default function SummaryTileGrid(props: SummaryTileGridProps) {
  return (
    <div class="pm-browser__summary-grid">
      <For each={props.items}>
        {item => (
          <Show
            when={item.href}
            fallback={
              <article id={item.id} class="pm-browser__summary-card">
                <SummaryTile {...item} />
              </article>
            }
          >
            <A id={item.id} href={item.href!} class="pm-browser__summary-card">
              <SummaryTile {...item} />
            </A>
          </Show>
        )}
      </For>
    </div>
  );
}
