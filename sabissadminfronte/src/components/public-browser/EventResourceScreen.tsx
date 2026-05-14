import { A } from "@solidjs/router";
import { For, Show, createMemo, createSignal, onMount } from "solid-js";

import { marketClient, formatSlugLabel, type EventDetailResponse } from "~/lib/market/index.ts";
import { formatLongDate } from "~/components/market-detail/format.ts";
import FactGrid from "./FactGrid.tsx";
import KeyValueList from "./KeyValueList.tsx";
import PublicPageLayout from "./PublicPageLayout.tsx";
import PublicState from "./PublicState.tsx";

type ScreenStatus = "loading" | "ready" | "error";

interface EventResourceScreenProps {
  eventId: string;
}

function composeEventCopy(detail: EventDetailResponse | null): string | null {
  if (!detail) {
    return null;
  }

  const parts = [
    detail.event.summary,
    detail.event.context,
    detail.event.additional_context,
  ]
    .map(value => value?.trim() ?? "")
    .filter(Boolean);

  return parts.length > 0 ? parts.join("\n\n") : null;
}

export default function EventResourceScreen(props: EventResourceScreenProps) {
  const [status, setStatus] = createSignal<ScreenStatus>("loading");
  const [error, setError] = createSignal<string | null>(null);
  const [data, setData] = createSignal<EventDetailResponse | null>(null);

  const eventCopy = createMemo(() => composeEventCopy(data()));

  const loadEvent = async () => {
    setStatus("loading");
    setError(null);

    try {
      const response = await marketClient.fetchEvent(props.eventId);
      setData(response);
      setStatus("ready");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to load event.");
      setStatus("error");
    }
  };

  onMount(() => {
    void loadEvent();
  });

  return (
    <PublicPageLayout
      title={data()?.event.title ?? "Event"}
      kicker="Event resource"
      heading={data()?.event.title ?? "Loading event"}
      summary={eventCopy() ?? "Loading public event metadata."}
      actions={
        <Show when={data()}>
          <div class="pm-browser__button-row">
            <A class="pm-button pm-button--primary" href={`/event/${encodeURIComponent(data()!.event.slug)}`}>
              Open canonical event
            </A>
            <A
              class="pm-button pm-button--ghost"
              href={`/categories/${encodeURIComponent(data()!.event.category_slug)}`}
            >
              View category
            </A>
          </div>
        </Show>
      }
    >
      <Show
        when={status() === "ready" && data()}
        fallback={
          <PublicState
            title={status() === "loading" ? "Loading event" : "Unable to load event"}
            copy={status() === "loading" ? "Fetching the event resource." : error() ?? "Please try again."}
            actionLabel={status() === "error" ? "Retry" : undefined}
            onAction={
              status() === "error"
                ? () => {
                    void loadEvent();
                  }
                : undefined
            }
          />
        }
      >
        <FactGrid
          facts={[
            {
              label: "Markets",
              value: String(data()?.markets_count ?? 0),
            },
            {
              label: "Category",
              value: formatSlugLabel(data()?.event.category_slug ?? ""),
            },
            {
              label: "Starts",
              value: formatLongDate(data()?.event.starts_at ?? null),
            },
            {
              label: "Sort Date",
              value: formatLongDate(data()?.event.sort_at ?? null),
            },
          ]}
        />

        <div class="pm-detail__grid">
          <section class="pm-detail__card pm-detail__card--wide">
            <h2 class="pm-detail__card-title">Rules</h2>
            <p class="pm-detail__card-copy">
              {data()?.event.rules.trim() || "No written rules were published for this event yet."}
            </p>
          </section>

          <KeyValueList
            title="Publication"
            items={[
              {
                label: "Publication status",
                value: data()?.event.publication_status ?? "Unknown",
              },
              {
                label: "Featured",
                value: data()?.event.featured ? "Yes" : "No",
              },
              {
                label: "Breaking",
                value: data()?.event.breaking ? "Yes" : "No",
              },
              {
                label: "Visible",
                value: data()?.event.visible ? "Yes" : "No",
              },
              {
                label: "Searchable",
                value: data()?.event.searchable ? "Yes" : "No",
              },
              {
                label: "Hide resolved by default",
                value: data()?.event.hide_resolved_by_default ? "Yes" : "No",
              },
            ]}
          />

          <KeyValueList
            title="On-chain"
            items={[
              {
                label: "Event ID",
                value: data()?.on_chain.event_id ?? "Unavailable",
                mono: true,
              },
              {
                label: "Group ID",
                value: data()?.on_chain.group_id ?? "Unavailable",
                mono: true,
              },
              {
                label: "Series ID",
                value: data()?.on_chain.series_id ?? "Unavailable",
                mono: true,
              },
              {
                label: "Negative risk",
                value: data()?.on_chain.neg_risk ? "Yes" : "No",
              },
              {
                label: "Transaction",
                value: data()?.on_chain.tx_hash ?? "Unavailable",
                mono: true,
              },
            ]}
          />

          <section class="pm-detail__card">
            <h2 class="pm-detail__card-title">Tags</h2>
            <Show
              when={(data()?.event.tag_slugs.length ?? 0) > 0}
              fallback={<p class="pm-detail__card-copy">No tags were published for this event.</p>}
            >
              <div class="pm-browser__pill-row">
                <For each={data()?.event.tag_slugs ?? []}>
                  {slug => (
                    <A class="pm-browser__pill" href={`/tags#${encodeURIComponent(slug)}`}>
                      {formatSlugLabel(slug)}
                    </A>
                  )}
                </For>
              </div>
            </Show>
          </section>

          <section class="pm-detail__card">
            <h2 class="pm-detail__card-title">Resolution sources</h2>
            <Show
              when={(data()?.event.resolution_sources.length ?? 0) > 0}
              fallback={
                <p class="pm-detail__card-copy">
                  No resolution sources were published for this event yet.
                </p>
              }
            >
              <ul class="pm-browser__source-list">
                <For each={data()?.event.resolution_sources ?? []}>
                  {source => (
                    <li>
                      <a href={source} target="_blank" rel="noreferrer">
                        {source}
                      </a>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </section>
        </div>
      </Show>
    </PublicPageLayout>
  );
}
