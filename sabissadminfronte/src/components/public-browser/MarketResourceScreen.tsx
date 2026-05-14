import { A } from "@solidjs/router";
import { For, Show, createMemo, createSignal, createEffect } from "solid-js";

import {
  formatLongDate,
  formatProbabilityFromBps,
  formatStatusLabel,
} from "~/components/market-detail/format.ts";
import {
  formatSlugLabel,
  marketClient,
  type MarketDetailResponse,
  type MarketLiquidityResponse,
  type MarketOutcomesResponse,
  type MarketQuoteResponse,
  type MarketResolutionReadResponse,
} from "~/lib/market/index.ts";
import FactGrid from "./FactGrid.tsx";
import KeyValueList from "./KeyValueList.tsx";
import PublicPageLayout from "./PublicPageLayout.tsx";
import PublicState from "./PublicState.tsx";

type ScreenStatus = "loading" | "ready" | "error";

interface MarketResourceScreenProps {
  marketId?: string;
  conditionId?: string;
}

async function readOptional<T>(request: Promise<T>): Promise<T | null> {
  try {
    return await request;
  } catch {
    return null;
  }
}

function buildWinningLabel(
  outcomes: MarketOutcomesResponse | null,
  resolution: MarketResolutionReadResponse | null,
): string {
  const state = resolution?.resolution;

  if (!state) {
    return "Unresolved";
  }

  const outcomeIndex = state.final_winning_outcome ?? state.proposed_winning_outcome;
  const label = outcomes?.outcomes.find(outcome => outcome.index === outcomeIndex)?.label;

  return label ?? `Outcome ${outcomeIndex + 1}`;
}

function buildTargetKey(props: MarketResourceScreenProps): string {
  return props.marketId ? `market:${props.marketId}` : `condition:${props.conditionId ?? ""}`;
}

export default function MarketResourceScreen(props: MarketResourceScreenProps) {
  const [status, setStatus] = createSignal<ScreenStatus>("loading");
  const [error, setError] = createSignal<string | null>(null);
  const [detail, setDetail] = createSignal<MarketDetailResponse | null>(null);
  const [liquidity, setLiquidity] = createSignal<MarketLiquidityResponse | null>(null);
  const [resolution, setResolution] = createSignal<MarketResolutionReadResponse | null>(null);
  const [outcomes, setOutcomes] = createSignal<MarketOutcomesResponse | null>(null);
  const [quote, setQuote] = createSignal<MarketQuoteResponse | null>(null);
  let requestVersion = 0;

  const formatQuotePrice = (bps: number | null | undefined): string =>
    formatProbabilityFromBps(bps) ?? "Unavailable";

  const title = createMemo(() => {
    const market = detail()?.market;

    if (!market) {
      return "Market";
    }

    return market.question.trim() || market.label.trim() || "Market";
  });

  const loadResource = async () => {
    const version = ++requestVersion;
    setStatus("loading");
    setError(null);
    setDetail(null);
    setLiquidity(null);
    setResolution(null);
    setOutcomes(null);
    setQuote(null);

    try {
      const baseDetail = props.marketId
        ? await marketClient.fetchMarket(props.marketId)
        : await marketClient.fetchMarketByCondition(props.conditionId ?? "");

      if (version !== requestVersion) {
        return;
      }

      setDetail(baseDetail);

      const [liquidityResponse, resolutionResponse, outcomesResponse, quoteResponse] = await Promise.all([
        readOptional(marketClient.fetchMarketLiquidity(baseDetail.market.id)),
        readOptional(marketClient.fetchMarketResolution(baseDetail.market.id)),
        readOptional(marketClient.fetchMarketOutcomes(baseDetail.market.id)),
        readOptional(marketClient.fetchMarketQuote(baseDetail.market.id)),
      ]);

      if (version !== requestVersion) {
        return;
      }

      setLiquidity(liquidityResponse);
      setResolution(resolutionResponse);
      setOutcomes(outcomesResponse);
      setQuote(quoteResponse);
      setStatus("ready");
    } catch (caughtError) {
      if (version !== requestVersion) {
        return;
      }

      setError(caughtError instanceof Error ? caughtError.message : "Unable to load market.");
      setStatus("error");
    }
  };

  createEffect(() => {
    buildTargetKey(props);
    void loadResource();
  });

  return (
    <PublicPageLayout
      title={title()}
      kicker={props.marketId ? "Market resource" : "Condition lookup"}
      heading={title()}
      summary={detail()?.event.title ?? "Loading market resource."}
      actions={
        <Show when={detail()}>
          <div class="pm-browser__button-row">
            <A class="pm-button pm-button--primary" href={`/event/${encodeURIComponent(detail()!.event.slug)}`}>
              Open canonical event
            </A>
            <A
              class="pm-button pm-button--ghost"
              href={`/events/${encodeURIComponent(detail()!.on_chain.event_id)}`}
            >
              Event resource
            </A>
          </div>
        </Show>
      }
    >
      <Show
        when={status() === "ready" && detail()}
        fallback={
          <PublicState
            title={status() === "loading" ? "Loading market" : "Unable to load market"}
            copy={status() === "loading" ? "Fetching the market resource." : error() ?? "Please try again."}
            actionLabel={status() === "error" ? "Retry" : undefined}
            onAction={
              status() === "error"
                ? () => {
                    void loadResource();
                  }
                : undefined
            }
          />
        }
      >
        <FactGrid
          facts={[
            {
              label: "Status",
              value: formatStatusLabel(detail()?.market.trading_status ?? ""),
            },
            {
              label: "Yes price",
              value: formatQuotePrice(quote()?.buy_yes_bps ?? detail()?.market.current_prices?.yes_bps),
            },
            {
              label: "Type",
              value: formatSlugLabel(detail()?.market.market_type ?? ""),
            },
            {
              label: "Ends",
              value: formatLongDate(detail()?.market.end_time ?? null),
            },
            {
              label: "Category",
              value: formatSlugLabel(detail()?.event.category_slug ?? ""),
            },
          ]}
        />

        <div class="pm-detail__grid">
          <section class="pm-detail__card">
            <h2 class="pm-detail__card-title">Outcomes</h2>
            <Show
              when={(outcomes()?.outcomes.length ?? 0) > 0}
              fallback={<p class="pm-detail__card-copy">No structured outcomes were returned.</p>}
            >
              <div class="pm-detail__outcomes">
                <For each={outcomes()?.outcomes ?? []}>
                  {outcome => (
                    <div
                      classList={{
                        "pm-detail__outcome": true,
                        "pm-detail__outcome--selected": Boolean(outcome.is_winning),
                      }}
                    >
                      <span>{outcome.label}</span>
                      <span>{outcome.is_winning ? "Winning" : "Open"}</span>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </section>

          <KeyValueList
            title="Quote endpoint"
            items={[
              {
                label: "Buy yes",
                value: formatQuotePrice(quote()?.buy_yes_bps),
              },
              {
                label: "Buy no",
                value: formatQuotePrice(quote()?.buy_no_bps),
              },
              {
                label: "Sell yes",
                value: formatQuotePrice(quote()?.sell_yes_bps),
              },
              {
                label: "Sell no",
                value: formatQuotePrice(quote()?.sell_no_bps),
              },
              {
                label: "Last trade yes",
                value: formatQuotePrice(quote()?.last_trade_yes_bps),
              },
              {
                label: "Spread",
                value:
                  typeof quote()?.spread_bps === "number"
                    ? `${quote()!.spread_bps} bps`
                    : "Unavailable",
              },
              {
                label: "As of",
                value: formatLongDate(quote()?.as_of ?? null),
              },
              {
                label: "Source",
                value: quote()?.source ?? "Unavailable",
              },
            ]}
            emptyCopy="No quote data was returned for this market."
          />

          <KeyValueList
            title="Resolution endpoint"
            items={[
              {
                label: "Status",
                value: resolution()?.resolution?.status ?? "Unresolved",
              },
              {
                label: "Winning outcome",
                value: buildWinningLabel(outcomes(), resolution()),
              },
              {
                label: "Dispute deadline",
                value: formatLongDate(resolution()?.resolution?.dispute_deadline ?? null),
              },
              {
                label: "Notes",
                value: resolution()?.resolution?.notes ?? "None",
              },
            ]}
          />

          <KeyValueList
            title="Liquidity pool"
            items={[
              {
                label: "Idle yes",
                value: liquidity()?.pool.idle_yes_total ?? "Unavailable",
                mono: true,
              },
              {
                label: "Idle no",
                value: liquidity()?.pool.idle_no_total ?? "Unavailable",
                mono: true,
              },
              {
                label: "Posted yes",
                value: liquidity()?.pool.posted_yes_total ?? "Unavailable",
                mono: true,
              },
              {
                label: "Posted no",
                value: liquidity()?.pool.posted_no_total ?? "Unavailable",
                mono: true,
              },
              {
                label: "Claimable collateral",
                value: liquidity()?.pool.claimable_collateral_total ?? "Unavailable",
                mono: true,
              },
            ]}
          />

          <KeyValueList
            title="Exchange liquidity"
            items={(liquidity()?.exchange_outcomes ?? []).map(outcome => ({
              label: outcome.outcome_label,
              value: outcome.available,
              mono: true,
            }))}
            emptyCopy="No exchange liquidity data was returned for this market."
          />

          <KeyValueList
            title="Identifiers"
            items={[
              {
                label: "Market ID",
                value: detail()?.market.id ?? "Unavailable",
                mono: true,
              },
              {
                label: "Condition ID",
                value: detail()?.market.condition_id ?? "Unavailable",
                mono: true,
              },
              {
                label: "Question ID",
                value: detail()?.market.question_id ?? "Unavailable",
                mono: true,
              },
            ]}
          />

          <section class="pm-detail__card pm-detail__card--wide">
            <h2 class="pm-detail__card-title">Sibling markets</h2>
            <Show
              when={(detail()?.sibling_markets.length ?? 0) > 0}
              fallback={
                <p class="pm-detail__card-copy">
                  This market does not have any sibling markets in the current response.
                </p>
              }
            >
              <div class="pm-detail__list">
                <For each={detail()?.sibling_markets ?? []}>
                  {market => (
                    <A class="pm-detail__list-link" href={`/markets/${encodeURIComponent(market.id)}`}>
                      <span>{market.label || market.question}</span>
                      <span>
                        {formatProbabilityFromBps(market.quote_summary?.buy_yes_bps) ??
                          formatProbabilityFromBps(market.current_prices?.yes_bps) ??
                          formatStatusLabel(market.trading_status)}
                      </span>
                    </A>
                  )}
                </For>
              </div>
            </Show>
          </section>
        </div>
      </Show>
    </PublicPageLayout>
  );
}
