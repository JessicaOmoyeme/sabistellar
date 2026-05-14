import { For, Show } from "solid-js";

import type { MarketLiquidityResponse } from "~/lib/market/types.ts";

interface MarketLiquidityCardProps {
  liquidity: MarketLiquidityResponse | null;
}

function formatLiquidityValue(value: string): string {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return value;
  }

  const maximumFractionDigits = Math.abs(parsed) >= 100 ? 0 : 2;

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
  }).format(parsed);
}

export default function MarketLiquidityCard(props: MarketLiquidityCardProps) {
  return (
    <section class="pm-event-card pm-market-liquidity">
      <div class="pm-event-card__header">
        <div>
          <h2 class="pm-event-card__title">Liquidity</h2>
          <Show when={props.liquidity?.source}>
            <p class="pm-market-liquidity__meta">Source: {props.liquidity?.source}</p>
          </Show>
        </div>
      </div>

      <Show
        when={props.liquidity}
        fallback={
          <p class="pm-event-card__copy">
            No liquidity data has been published for this market yet.
          </p>
        }
      >
        <div class="pm-market-liquidity__section">
          <p class="pm-market-liquidity__section-title">Available by outcome</p>
          <div class="pm-market-liquidity__outcomes">
            <For each={props.liquidity?.exchange_outcomes ?? []}>
              {outcome => (
                <div class="pm-market-liquidity__row">
                  <span class="pm-market-liquidity__label">{outcome.outcome_label}</span>
                  <strong class="pm-market-liquidity__value">
                    {formatLiquidityValue(outcome.available)}
                  </strong>
                </div>
              )}
            </For>
          </div>
        </div>

        <div class="pm-market-liquidity__section">
          <p class="pm-market-liquidity__section-title">Pool totals</p>
          <div class="pm-market-liquidity__pool-grid">
            <article class="pm-market-liquidity__pool-item">
              <span class="pm-market-liquidity__label">Idle yes</span>
              <strong class="pm-market-liquidity__value">
                {formatLiquidityValue(props.liquidity?.pool.idle_yes_total ?? "0")}
              </strong>
            </article>
            <article class="pm-market-liquidity__pool-item">
              <span class="pm-market-liquidity__label">Idle no</span>
              <strong class="pm-market-liquidity__value">
                {formatLiquidityValue(props.liquidity?.pool.idle_no_total ?? "0")}
              </strong>
            </article>
            <article class="pm-market-liquidity__pool-item">
              <span class="pm-market-liquidity__label">Posted yes</span>
              <strong class="pm-market-liquidity__value">
                {formatLiquidityValue(props.liquidity?.pool.posted_yes_total ?? "0")}
              </strong>
            </article>
            <article class="pm-market-liquidity__pool-item">
              <span class="pm-market-liquidity__label">Posted no</span>
              <strong class="pm-market-liquidity__value">
                {formatLiquidityValue(props.liquidity?.pool.posted_no_total ?? "0")}
              </strong>
            </article>
            <article class="pm-market-liquidity__pool-item">
              <span class="pm-market-liquidity__label">Claimable collateral</span>
              <strong class="pm-market-liquidity__value">
                {formatLiquidityValue(props.liquidity?.pool.claimable_collateral_total ?? "0")}
              </strong>
            </article>
          </div>
        </div>
      </Show>
    </section>
  );
}
