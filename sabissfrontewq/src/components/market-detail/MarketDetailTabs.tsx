import { createMemo, createSignal, For, Show } from "solid-js";

import { formatLongDate } from "./format.ts";
import type { EventMarketListItem } from "./types.ts";

type DetailTab = "rules" | "context" | "resolution";

interface MarketDetailTabsProps {
  rules: string;
  context: string | null;
  resolutionSources: string[];
  resolution: EventDetailTabsResolution | null;
  market: EventMarketListItem;
}

interface EventDetailTabsResolution {
  status: string;
  proposed_winning_outcome: number;
  final_winning_outcome: number | null;
  dispute_deadline: string;
  notes: string | null;
}

function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

export default function MarketDetailTabs(props: MarketDetailTabsProps) {
  const [activeTab, setActiveTab] = createSignal<DetailTab>("rules");
  const winningOutcomeLabel = createMemo(() => {
    const resolution = props.resolution;

    if (!resolution) {
      return null;
    }

    const outcomeIndex = resolution.final_winning_outcome ?? resolution.proposed_winning_outcome;
    return props.market.quotes[outcomeIndex]?.label ?? `Outcome ${outcomeIndex + 1}`;
  });

  return (
    <section class="pm-detail-tabs">
      <div class="pm-detail-tabs__nav" role="tablist" aria-label="Market information">
        <button
          type="button"
          classList={{
            "pm-detail-tabs__trigger": true,
            "pm-detail-tabs__trigger--active": activeTab() === "rules",
          }}
          onClick={() => setActiveTab("rules")}
        >
          Rules
        </button>
        <button
          type="button"
          classList={{
            "pm-detail-tabs__trigger": true,
            "pm-detail-tabs__trigger--active": activeTab() === "context",
          }}
          onClick={() => setActiveTab("context")}
        >
          Market Context
        </button>
        <button
          type="button"
          classList={{
            "pm-detail-tabs__trigger": true,
            "pm-detail-tabs__trigger--active": activeTab() === "resolution",
          }}
          onClick={() => setActiveTab("resolution")}
        >
          Resolution
        </button>
      </div>

      <div class="pm-detail-tabs__panel">
        <Show when={activeTab() === "rules"}>
          <div class="pm-detail-tabs__copy">{props.rules}</div>
        </Show>

        <Show when={activeTab() === "context"}>
          <div class="pm-detail-tabs__copy">
            {props.context ?? "No additional context has been published for this market yet."}
          </div>
        </Show>

        <Show when={activeTab() === "resolution"}>
          <div class="pm-detail-tabs__stack">
            <Show
              when={props.resolution}
              fallback={
                <p class="pm-detail-tabs__copy">
                  No resolution activity has been recorded for this market yet.
                </p>
              }
            >
              <div class="pm-detail-tabs__resolution">
                <div class="pm-detail-tabs__resolution-item">
                  <span class="pm-detail-tabs__resolution-label">Status</span>
                  <strong>{props.resolution?.status}</strong>
                </div>
                <div class="pm-detail-tabs__resolution-item">
                  <span class="pm-detail-tabs__resolution-label">Leading outcome</span>
                  <strong>{winningOutcomeLabel()}</strong>
                </div>
                <div class="pm-detail-tabs__resolution-item">
                  <span class="pm-detail-tabs__resolution-label">Dispute deadline</span>
                  <strong>{formatLongDate(props.resolution?.dispute_deadline ?? null)}</strong>
                </div>
              </div>

              <Show when={props.resolution?.notes}>
                <p class="pm-detail-tabs__copy">{props.resolution?.notes}</p>
              </Show>
            </Show>

            <Show when={props.resolutionSources.length > 0}>
              <div class="pm-detail-tabs__sources">
                <p class="pm-detail-tabs__sources-title">Resolution sources</p>
                <ul>
                  <For each={props.resolutionSources}>
                    {source => (
                      <li>
                        <Show
                          when={isUrl(source)}
                          fallback={<span class="pm-detail-tabs__source-text">{source}</span>}
                        >
                          <a
                            href={source}
                            class="pm-detail-tabs__source-link"
                            target="_blank"
                            rel="noreferrer"
                          >
                            {source}
                          </a>
                        </Show>
                      </li>
                    )}
                  </For>
                </ul>
              </div>
            </Show>
          </div>
        </Show>
      </div>
    </section>
  );
}
