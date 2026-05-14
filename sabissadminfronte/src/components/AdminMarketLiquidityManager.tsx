import { Show, createSignal } from "solid-js";

import {
  bootstrapAdminMarketLiquidity,
  setAdminMarketPrices,
  type BootstrapMarketLiquidityRequest,
  type MarketLiquidityBootstrapResponse,
  type MarketPricesResponse,
  type SetMarketPricesRequest,
} from "~/lib/api/admin";
import { getErrorMessage } from "~/lib/api/core";
import { useAsyncTask } from "~/lib/hooks/useAsyncTask";
import { parseUsdcDollarsToBaseUnits } from "~/lib/usdc";

const ADMIN_CASH_BALANCE_REFRESH_EVENT = "sabi:admin-cash-balance-refresh";

function readRequiredText(formData: FormData, key: string, label: string) {
  const value = String(formData.get(key) ?? "").trim();

  if (!value) {
    throw new Error(`${label} is required.`);
  }

  return value;
}

function readRequiredBps(formData: FormData, key: string, label: string) {
  const value = readRequiredText(formData, key, label);
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0 || parsed >= 10000) {
    throw new Error(`${label} must be a whole number between 1 and 9999.`);
  }

  return parsed;
}

function validateBinaryPricePair(yesBps: number, noBps: number, label: string) {
  if (yesBps + noBps !== 10000) {
    throw new Error(`${label} must total exactly 10000 bps.`);
  }
}

function buildSetMarketPricesSubmission(formData: FormData) {
  const marketId = readRequiredText(formData, "market_id", "Market ID");
  const yesBps = readRequiredBps(formData, "yes_bps", "Yes price bps");
  const noBps = readRequiredBps(formData, "no_bps", "No price bps");

  validateBinaryPricePair(yesBps, noBps, "Prices");

  return {
    marketId,
    payload: {
      prices: {
        yes_bps: yesBps,
        no_bps: noBps,
      },
    } satisfies SetMarketPricesRequest,
  };
}

function buildBootstrapMarketLiquiditySubmission(formData: FormData) {
  const marketId = readRequiredText(formData, "market_id", "Market ID");
  const yesBps = readRequiredBps(formData, "yes_bps", "Yes price bps");
  const noBps = readRequiredBps(formData, "no_bps", "No price bps");
  const inventoryUsdcAmount = parseUsdcDollarsToBaseUnits(
    readRequiredText(formData, "inventory_usdc_amount", "Inventory USDC amount"),
    "Inventory USDC amount",
  );
  const exitCollateralUsdcAmount = parseUsdcDollarsToBaseUnits(
    readRequiredText(formData, "exit_collateral_usdc_amount", "Exit collateral USDC amount"),
    "Exit collateral USDC amount",
    { allowZero: true },
  );

  validateBinaryPricePair(yesBps, noBps, "Bootstrap prices");

  return {
    marketId,
    payload: {
      liquidity: {
        yes_bps: yesBps,
        no_bps: noBps,
        inventory_usdc_amount: inventoryUsdcAmount,
        exit_collateral_usdc_amount: exitCollateralUsdcAmount,
      },
    } satisfies BootstrapMarketLiquidityRequest,
  };
}

function formatTimestamp(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function MarketPricesResult(props: { response: MarketPricesResponse }) {
  return (
    <section class="pm-market-result">
      <div class="pm-market-result__header">
        <div>
          <p class="pm-market-result__eyebrow">Prices Set</p>
          <h3 class="pm-market-result__title">{props.response.market.slug}</h3>
        </div>
        <span class="pm-market-result__badge">{props.response.market.publication_status}</span>
      </div>

      <div class="pm-market-result__grid">
        <div>
          <span class="pm-market-result__label">Wrapper event</span>
          <span class="pm-market-result__value">{props.response.event.slug}</span>
        </div>
        <div>
          <span class="pm-market-result__label">Market ID</span>
          <span class="pm-market-result__value">{props.response.market.id}</span>
        </div>
        <div>
          <span class="pm-market-result__label">Yes bps</span>
          <span class="pm-market-result__value">{props.response.prices.yes_bps}</span>
        </div>
        <div>
          <span class="pm-market-result__label">No bps</span>
          <span class="pm-market-result__value">{props.response.prices.no_bps}</span>
        </div>
        <div class="pm-market-result__detail--full">
          <span class="pm-market-result__label">Yes price tx</span>
          <span class="pm-market-result__value">{props.response.prices.tx_hashes.yes_price}</span>
        </div>
        <div class="pm-market-result__detail--full">
          <span class="pm-market-result__label">No price tx</span>
          <span class="pm-market-result__value">{props.response.prices.tx_hashes.no_price}</span>
        </div>
        <div class="pm-market-result__detail--full">
          <span class="pm-market-result__label">Updated</span>
          <span class="pm-market-result__value">{formatTimestamp(props.response.updated_at)}</span>
        </div>
      </div>
    </section>
  );
}

function MarketLiquidityBootstrapResult(props: { response: MarketLiquidityBootstrapResponse }) {
  const availableOutcomes = props.response.liquidity.exchange_outcomes
    .map(outcome => `${outcome.outcome_label}: ${outcome.available}`)
    .join(", ");

  return (
    <section class="pm-market-result">
      <div class="pm-market-result__header">
        <div>
          <p class="pm-market-result__eyebrow">Liquidity Bootstrapped</p>
          <h3 class="pm-market-result__title">{props.response.market.slug}</h3>
        </div>
        <span class="pm-market-result__badge">{props.response.market.trading_status}</span>
      </div>

      <div class="pm-market-result__grid">
        <div>
          <span class="pm-market-result__label">Wrapper event</span>
          <span class="pm-market-result__value">{props.response.event.slug}</span>
        </div>
        <div>
          <span class="pm-market-result__label">Market ID</span>
          <span class="pm-market-result__value">{props.response.market.id}</span>
        </div>
        <div>
          <span class="pm-market-result__label">Yes bps</span>
          <span class="pm-market-result__value">{props.response.bootstrap.yes_bps}</span>
        </div>
        <div>
          <span class="pm-market-result__label">No bps</span>
          <span class="pm-market-result__value">{props.response.bootstrap.no_bps}</span>
        </div>
        <div>
          <span class="pm-market-result__label">Inventory USDC</span>
          <span class="pm-market-result__value">
            {props.response.bootstrap.inventory_usdc_amount}
          </span>
        </div>
        <div>
          <span class="pm-market-result__label">Exit collateral USDC</span>
          <span class="pm-market-result__value">
            {props.response.bootstrap.exit_collateral_usdc_amount}
          </span>
        </div>
        <div class="pm-market-result__detail--full">
          <span class="pm-market-result__label">Available exchange outcomes</span>
          <span class="pm-market-result__value">{availableOutcomes}</span>
        </div>
        <div>
          <span class="pm-market-result__label">Idle yes total</span>
          <span class="pm-market-result__value">
            {props.response.liquidity.pool.idle_yes_total}
          </span>
        </div>
        <div>
          <span class="pm-market-result__label">Idle no total</span>
          <span class="pm-market-result__value">
            {props.response.liquidity.pool.idle_no_total}
          </span>
        </div>
        <div>
          <span class="pm-market-result__label">Posted yes total</span>
          <span class="pm-market-result__value">
            {props.response.liquidity.pool.posted_yes_total}
          </span>
        </div>
        <div>
          <span class="pm-market-result__label">Posted no total</span>
          <span class="pm-market-result__value">
            {props.response.liquidity.pool.posted_no_total}
          </span>
        </div>
        <div class="pm-market-result__detail--full">
          <span class="pm-market-result__label">Claimable collateral total</span>
          <span class="pm-market-result__value">
            {props.response.liquidity.pool.claimable_collateral_total}
          </span>
        </div>
        <div class="pm-market-result__detail--full">
          <span class="pm-market-result__label">Yes price tx</span>
          <span class="pm-market-result__value">
            {props.response.bootstrap.tx_hashes.yes_price}
          </span>
        </div>
        <div class="pm-market-result__detail--full">
          <span class="pm-market-result__label">No price tx</span>
          <span class="pm-market-result__value">{props.response.bootstrap.tx_hashes.no_price}</span>
        </div>
        <div class="pm-market-result__detail--full">
          <span class="pm-market-result__label">Split and add liquidity tx</span>
          <span class="pm-market-result__value">
            {props.response.bootstrap.tx_hashes.split_and_add_liquidity}
          </span>
        </div>
        <div class="pm-market-result__detail--full">
          <span class="pm-market-result__label">Deposit collateral tx</span>
          <span class="pm-market-result__value">
            {props.response.bootstrap.tx_hashes.deposit_collateral ?? "None"}
          </span>
        </div>
        <div class="pm-market-result__detail--full">
          <span class="pm-market-result__label">Updated</span>
          <span class="pm-market-result__value">{formatTimestamp(props.response.updated_at)}</span>
        </div>
      </div>
    </section>
  );
}

export default function AdminMarketLiquidityManager() {
  const setPricesTask = useAsyncTask((marketId: string, payload: SetMarketPricesRequest) =>
    setAdminMarketPrices(marketId, payload),
  );
  const bootstrapLiquidityTask = useAsyncTask(
    (marketId: string, payload: BootstrapMarketLiquidityRequest) =>
      bootstrapAdminMarketLiquidity(marketId, payload),
  );

  const [setPricesError, setSetPricesError] = createSignal<string | null>(null);
  const [bootstrapLiquidityError, setBootstrapLiquidityError] = createSignal<string | null>(null);

  async function handleSetPricesSubmit(event: SubmitEvent) {
    event.preventDefault();

    const form = event.currentTarget as HTMLFormElement;

    setSetPricesError(null);

    try {
      const { marketId, payload } = buildSetMarketPricesSubmission(new FormData(form));
      await setPricesTask.run(marketId, payload);
    } catch (error) {
      setSetPricesError(getErrorMessage(error));
    }
  }

  async function handleBootstrapLiquiditySubmit(event: SubmitEvent) {
    event.preventDefault();

    const form = event.currentTarget as HTMLFormElement;

    setBootstrapLiquidityError(null);

    try {
      const { marketId, payload } = buildBootstrapMarketLiquiditySubmission(new FormData(form));
      await bootstrapLiquidityTask.run(marketId, payload);
      window.dispatchEvent(new Event(ADMIN_CASH_BALANCE_REFRESH_EVENT));
    } catch (error) {
      setBootstrapLiquidityError(getErrorMessage(error));
    }
  }

  return (
    <div class="pm-market-grid">
      <section class="pm-market-card">
        <div class="pm-market-card__header">
          <div>
            <p class="pm-market-card__eyebrow">POST /admin/markets/{'{market_id}'}/prices</p>
            <h2 class="pm-market-card__title">Set market prices</h2>
          </div>
          <span class="pm-market-card__hint">1-9999 bps each</span>
        </div>

        <p class="pm-market-card__copy">
          Set the initial Yes and No prices for one published binary market. The two price fields
          must sum to exactly 10000 basis points, and neither side can be 0 or 10000.
        </p>

        <form class="pm-market-form" onSubmit={handleSetPricesSubmit}>
          <div class="pm-market-fields">
            <label class="pm-field pm-field--full">
              <span class="pm-field__label">Market ID</span>
              <input class="pm-field__input" name="market_id" type="text" required />
            </label>

            <label class="pm-field">
              <span class="pm-field__label">Yes price bps</span>
              <input
                class="pm-field__input"
                name="yes_bps"
                type="number"
                min="1"
                max="9999"
                step="1"
                placeholder="120"
                required
              />
            </label>

            <label class="pm-field">
              <span class="pm-field__label">No price bps</span>
              <input
                class="pm-field__input"
                name="no_bps"
                type="number"
                min="1"
                max="9999"
                step="1"
                placeholder="9880"
                required
              />
            </label>
          </div>

          <div class="pm-market-actions">
            <button
              class="pm-button pm-button--primary"
              type="submit"
              disabled={setPricesTask.pending()}
            >
              {setPricesTask.pending() ? "Setting prices..." : "Set market prices"}
            </button>
          </div>

          <Show when={setPricesError()}>
            {message => <p class="pm-market-feedback pm-market-feedback--error">{message()}</p>}
          </Show>
        </form>

        <Show when={setPricesTask.data()}>
          {response => <MarketPricesResult response={response()} />}
        </Show>
      </section>

      <section class="pm-market-card">
        <div class="pm-market-card__header">
          <div>
            <p class="pm-market-card__eyebrow">
              POST /admin/markets/{'{market_id}'}/liquidity/bootstrap
            </p>
            <h2 class="pm-market-card__title">Bootstrap market liquidity</h2>
          </div>
          <span class="pm-market-card__hint">Published market</span>
        </div>

        <p class="pm-market-card__copy">
          Seed one published binary market with initial prices and inventory. Use the same 10000
          bps price split here that you want reflected on-chain. Enter USDC amounts in dollars and
          the request body will be converted to raw 6-decimal base units.
        </p>

        <form class="pm-market-form" onSubmit={handleBootstrapLiquiditySubmit}>
          <div class="pm-market-fields">
            <label class="pm-field pm-field--full">
              <span class="pm-field__label">Market ID</span>
              <input class="pm-field__input" name="market_id" type="text" required />
            </label>

            <label class="pm-field">
              <span class="pm-field__label">Yes price bps</span>
              <input
                class="pm-field__input"
                name="yes_bps"
                type="number"
                min="1"
                max="9999"
                step="1"
                placeholder="120"
                required
              />
            </label>

            <label class="pm-field">
              <span class="pm-field__label">No price bps</span>
              <input
                class="pm-field__input"
                name="no_bps"
                type="number"
                min="1"
                max="9999"
                step="1"
                placeholder="9880"
                required
              />
            </label>

            <label class="pm-field">
              <span class="pm-field__label">Inventory USDC amount (dollars)</span>
              <input
                class="pm-field__input"
                name="inventory_usdc_amount"
                type="text"
                inputmode="decimal"
                placeholder="1500"
                required
              />
            </label>

            <label class="pm-field">
              <span class="pm-field__label">Exit collateral USDC amount (dollars)</span>
              <input
                class="pm-field__input"
                name="exit_collateral_usdc_amount"
                type="text"
                inputmode="decimal"
                placeholder="0"
                required
              />
            </label>
          </div>

          <p class="pm-market-feedback">
            Example: entering `1500` sends `1500000000` base units.
          </p>

          <div class="pm-market-actions">
            <button
              class="pm-button pm-button--primary"
              type="submit"
              disabled={bootstrapLiquidityTask.pending()}
            >
              {bootstrapLiquidityTask.pending() ? "Bootstrapping..." : "Bootstrap liquidity"}
            </button>
          </div>

          <Show when={bootstrapLiquidityError()}>
            {message => <p class="pm-market-feedback pm-market-feedback--error">{message()}</p>}
          </Show>
        </form>

        <Show when={bootstrapLiquidityTask.data()}>
          {response => <MarketLiquidityBootstrapResult response={response()} />}
        </Show>
      </section>
    </div>
  );
}
