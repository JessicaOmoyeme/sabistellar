import { For, Show } from "solid-js";

export interface KeyValueItem {
  label: string;
  value: string;
  mono?: boolean;
}

interface KeyValueListProps {
  title: string;
  items: readonly KeyValueItem[];
  emptyCopy?: string;
  wide?: boolean;
}

export default function KeyValueList(props: KeyValueListProps) {
  return (
    <section
      classList={{
        "pm-detail__card": true,
        "pm-detail__card--wide": Boolean(props.wide),
      }}
    >
      <h2 class="pm-detail__card-title">{props.title}</h2>

      <Show
        when={props.items.length > 0}
        fallback={
          <p class="pm-detail__card-copy">
            {props.emptyCopy ?? "No data has been published for this section yet."}
          </p>
        }
      >
        <dl class="pm-browser__key-list">
          <For each={props.items}>
            {item => (
              <div class="pm-browser__key-row">
                <dt class="pm-browser__key-label">{item.label}</dt>
                <dd
                  classList={{
                    "pm-browser__key-value": true,
                    "pm-browser__key-value--mono": Boolean(item.mono),
                  }}
                >
                  {item.value}
                </dd>
              </div>
            )}
          </For>
        </dl>
      </Show>
    </section>
  );
}
