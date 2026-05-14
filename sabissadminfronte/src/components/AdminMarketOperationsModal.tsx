import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";

import {
  bootstrapAdminEventLiquidity,
  bootstrapAdminMarketLiquidity,
  setAdminMarketPrices,
  type BootstrapEventLiquidityRequest,
  type EventLiquidityBootstrapResponse,
  type MarketLiquidityBootstrapResponse,
  type MarketPricesResponse,
  type SetMarketPricesRequest,
} from "~/lib/api/admin";
import { getErrorMessage } from "~/lib/api/core";
import { useAsyncTask } from "~/lib/hooks/useAsyncTask";
import { parseUsdcDollarsToBaseUnits } from "~/lib/usdc";

import type { EventMarketListItem } from "./market-detail/types.ts";

const ADMIN_CASH_BALANCE_REFRESH_EVENT = "sabi:admin-cash-balance-refresh";

export type AdminMarketOperationsTab =
  | "set_prices"
  | "bootstrap_market"
  | "bootstrap_event";

interface AdminMarketOperationsModalProps {
  eventAdminId: string | null;
  eventSlug: string;
  eventTitle: string;
  initialTab?: AdminMarketOperationsTab;
  market: EventMarketListItem;
  markets: EventMarketListItem[];
  onApplied?: () => void | Promise<void>;
  onBack: () => void;
  onClose: () => void;
}

interface EventBootstrapDraft {
  id: string;
  market_id: string;
  label: string;
  yes_bps: string;
  no_bps: string;
  inventory_usdc_amount: string;
  exit_collateral_usdc_amount: string;
}

let nextEventBootstrapDraftId = 0;

function createEventBootstrapDraft(market: EventMarketListItem): EventBootstrapDraft {
  nextEventBootstrapDraftId += 1;

  return {
    id: `event-bootstrap-draft-${nextEventBootstrapDraftId}`,
    market_id: market.id,
    label: market.label,
    yes_bps: market.buyYesBps?.toString() ?? "",
    no_bps: market.buyNoBps?.toString() ?? "",
    inventory_usdc_amount: "",
    exit_collateral_usdc_amount: "0",
  };
}

function createEventBootstrapDrafts(markets: readonly EventMarketListItem[] | undefined) {
  return (markets ?? []).map(createEventBootstrapDraft);
}

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

function readRequiredInteger(
  value: string,
  label: string,
  options: { min?: number; max?: number } = {},
) {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`${label} is required.`);
  }

  const parsed = Number.parseInt(normalized, 10);
  const min = options.min ?? 0;
  const max = options.max;

  if (!Number.isInteger(parsed) || parsed < min || (max !== undefined && parsed > max)) {
    const bounds =
      max !== undefined ? ` between ${min} and ${max}` : min > 0 ? ` at least ${min}` : "";
    throw new Error(`${label} must be a whole number${bounds}.`);
  }

  return parsed;
}

function validateBinaryPricePair(yesBps: number, noBps: number, label: string) {
  if (yesBps + noBps !== 10000) {
    throw new Error(`${label} must total exactly 10000 bps.`);
  }
}

function buildSetPricesSubmission(formData: FormData): SetMarketPricesRequest {
  const yesBps = readRequiredBps(formData, "yes_bps", "Yes price bps");
  const noBps = readRequiredBps(formData, "no_bps", "No price bps");

  validateBinaryPricePair(yesBps, noBps, "Prices");

  return {
    prices: {
      yes_bps: yesBps,
      no_bps: noBps,
    },
  };
}

function buildBootstrapMarketSubmission(marketId: string, formData: FormData) {
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
    },
  };
}

function buildBootstrapEventSubmission(
  eventId: string,
  drafts: readonly EventBootstrapDraft[],
): BootstrapEventLiquidityRequest {
  const normalizedEventId = eventId.trim();

  if (!normalizedEventId) {
    throw new Error("Admin event ID is required for batch bootstrap.");
  }

  if (drafts.length === 0) {
    throw new Error("No markets are available for event bootstrap.");
  }

  return {
    liquidity: {
      markets: drafts.map((draft, index) => {
        const marketId = draft.market_id.trim();

        if (!marketId) {
          throw new Error(`Bootstrap row ${index + 1}: market ID is required.`);
        }

        const yesBps = readRequiredInteger(draft.yes_bps, `Bootstrap row ${index + 1}: yes price bps`, {
          min: 1,
          max: 9999,
        });
        const noBps = readRequiredInteger(draft.no_bps, `Bootstrap row ${index + 1}: no price bps`, {
          min: 1,
          max: 9999,
        });
        validateBinaryPricePair(yesBps, noBps, `Bootstrap row ${index + 1} prices`);

        return {
          market_id: marketId,
          yes_bps: yesBps,
          no_bps: noBps,
          inventory_usdc_amount: parseUsdcDollarsToBaseUnits(
            draft.inventory_usdc_amount,
            `Bootstrap row ${index + 1}: inventory USDC amount`,
          ),
          exit_collateral_usdc_amount: parseUsdcDollarsToBaseUnits(
            draft.exit_collateral_usdc_amount,
            `Bootstrap row ${index + 1}: exit collateral USDC amount`,
            { allowZero: true },
          ),
        };
      }),
    },
  };
}

function formatTimestamp(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <path
        d="M4.5 4.5L13.5 13.5"
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.5"
      />
      <path
        d="M13.5 4.5L4.5 13.5"
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.5"
      />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <path
        d="M7 4.5L2.5 9L7 13.5"
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.5"
      />
      <path
        d="M3 9H15.5"
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.5"
      />
    </svg>
  );
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

function EventLiquidityBootstrapResult(props: { response: EventLiquidityBootstrapResponse }) {
  return (
    <section class="pm-market-result">
      <div class="pm-market-result__header">
        <div>
          <p class="pm-market-result__eyebrow">Event Liquidity Bootstrapped</p>
          <h3 class="pm-market-result__title">{props.response.event.slug}</h3>
        </div>
        <span class="pm-market-result__badge">{props.response.results.length} markets</span>
      </div>

      <div class="pm-market-result__grid">
        <div>
          <span class="pm-market-result__label">Publication</span>
          <span class="pm-market-result__value">{props.response.event.publication_status}</span>
        </div>
        <div>
          <span class="pm-market-result__label">On-chain event ID</span>
          <span class="pm-market-result__value">{props.response.on_chain.event_id}</span>
        </div>
        <div class="pm-market-result__detail--full">
          <span class="pm-market-result__label">Updated</span>
          <span class="pm-market-result__value">{formatTimestamp(props.response.updated_at)}</span>
        </div>
      </div>

      <div class="pm-market-repeater">
        <For each={props.response.results}>
          {item => {
            const availableOutcomes = item.liquidity.exchange_outcomes
              .map(outcome => `${outcome.outcome_label}: ${outcome.available}`)
              .join(", ");

            return (
              <section class="pm-market-repeater__card">
                <div class="pm-market-repeater__header">
                  <div>
                    <p class="pm-market-card__eyebrow">{item.market.publication_status}</p>
                    <h3 class="pm-market-repeater__title">{item.market.slug}</h3>
                  </div>
                  <span class="pm-market-card__hint">{item.market.trading_status}</span>
                </div>

                <div class="pm-market-result__grid">
                  <div>
                    <span class="pm-market-result__label">Market ID</span>
                    <span class="pm-market-result__value">{item.market.id}</span>
                  </div>
                  <div>
                    <span class="pm-market-result__label">Condition ID</span>
                    <span class="pm-market-result__value">
                      {item.market.condition_id ?? "Pending"}
                    </span>
                  </div>
                  <div>
                    <span class="pm-market-result__label">Yes bps</span>
                    <span class="pm-market-result__value">{item.bootstrap.yes_bps}</span>
                  </div>
                  <div>
                    <span class="pm-market-result__label">No bps</span>
                    <span class="pm-market-result__value">{item.bootstrap.no_bps}</span>
                  </div>
                  <div>
                    <span class="pm-market-result__label">Inventory USDC</span>
                    <span class="pm-market-result__value">
                      {item.bootstrap.inventory_usdc_amount}
                    </span>
                  </div>
                  <div>
                    <span class="pm-market-result__label">Exit collateral USDC</span>
                    <span class="pm-market-result__value">
                      {item.bootstrap.exit_collateral_usdc_amount}
                    </span>
                  </div>
                  <div class="pm-market-result__detail--full">
                    <span class="pm-market-result__label">Available exchange outcomes</span>
                    <span class="pm-market-result__value">{availableOutcomes}</span>
                  </div>
                  <div>
                    <span class="pm-market-result__label">Idle yes total</span>
                    <span class="pm-market-result__value">{item.liquidity.pool.idle_yes_total}</span>
                  </div>
                  <div>
                    <span class="pm-market-result__label">Idle no total</span>
                    <span class="pm-market-result__value">{item.liquidity.pool.idle_no_total}</span>
                  </div>
                  <div>
                    <span class="pm-market-result__label">Posted yes total</span>
                    <span class="pm-market-result__value">
                      {item.liquidity.pool.posted_yes_total}
                    </span>
                  </div>
                  <div>
                    <span class="pm-market-result__label">Posted no total</span>
                    <span class="pm-market-result__value">
                      {item.liquidity.pool.posted_no_total}
                    </span>
                  </div>
                  <div class="pm-market-result__detail--full">
                    <span class="pm-market-result__label">Claimable collateral total</span>
                    <span class="pm-market-result__value">
                      {item.liquidity.pool.claimable_collateral_total}
                    </span>
                  </div>
                  <div class="pm-market-result__detail--full">
                    <span class="pm-market-result__label">Yes price tx</span>
                    <span class="pm-market-result__value">{item.bootstrap.tx_hashes.yes_price}</span>
                  </div>
                  <div class="pm-market-result__detail--full">
                    <span class="pm-market-result__label">No price tx</span>
                    <span class="pm-market-result__value">{item.bootstrap.tx_hashes.no_price}</span>
                  </div>
                  <div class="pm-market-result__detail--full">
                    <span class="pm-market-result__label">Split and add liquidity tx</span>
                    <span class="pm-market-result__value">
                      {item.bootstrap.tx_hashes.split_and_add_liquidity}
                    </span>
                  </div>
                  <div class="pm-market-result__detail--full">
                    <span class="pm-market-result__label">Deposit collateral tx</span>
                    <span class="pm-market-result__value">
                      {item.bootstrap.tx_hashes.deposit_collateral ?? "None"}
                    </span>
                  </div>
                </div>
              </section>
            );
          }}
        </For>
      </div>
    </section>
  );
}

export default function AdminMarketOperationsModal(props: AdminMarketOperationsModalProps) {
  const [activeTab, setActiveTab] = createSignal<AdminMarketOperationsTab>(
    props.initialTab ?? "set_prices",
  );
  const [setPricesError, setSetPricesError] = createSignal<string | null>(null);
  const [bootstrapMarketError, setBootstrapMarketError] = createSignal<string | null>(null);
  const [bootstrapEventError, setBootstrapEventError] = createSignal<string | null>(null);
  const [eventBootstrapDrafts, setEventBootstrapDrafts] = createSignal<EventBootstrapDraft[]>([]);

  const setPricesTask = useAsyncTask((marketId: string, payload: SetMarketPricesRequest) =>
    setAdminMarketPrices(marketId, payload),
  );
  const bootstrapMarketTask = useAsyncTask(
    (
      marketId: string,
      payload: Parameters<typeof bootstrapAdminMarketLiquidity>[1],
    ) => bootstrapAdminMarketLiquidity(marketId, payload),
  );
  const bootstrapEventTask = useAsyncTask(
    (eventId: string, payload: BootstrapEventLiquidityRequest) =>
      bootstrapAdminEventLiquidity(eventId, payload),
  );

  const currentBuyYes = createMemo(() => props.market.actionQuotes[0]?.centsLabel ?? "--");
  const currentBuyNo = createMemo(() => props.market.actionQuotes[1]?.centsLabel ?? "--");
  const currentBuyYesBps = createMemo(() => props.market.buyYesBps?.toString() ?? "");
  const currentBuyNoBps = createMemo(() => props.market.buyNoBps?.toString() ?? "");
  const eventMarkets = createMemo(() => props.markets ?? []);
  const canBootstrapEvent = createMemo(
    () => Boolean(props.eventAdminId?.trim()) && eventMarkets().length > 0,
  );

  createEffect(() => {
    setEventBootstrapDrafts(createEventBootstrapDrafts(eventMarkets()));
  });

  onMount(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        props.onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    onCleanup(() => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    });
  });

  function updateEventBootstrapDraft(
    draftId: string,
    field: keyof Pick<
      EventBootstrapDraft,
      "yes_bps" | "no_bps" | "inventory_usdc_amount" | "exit_collateral_usdc_amount"
    >,
    value: string,
  ) {
    setEventBootstrapDrafts(current =>
      current.map(draft => (draft.id === draftId ? { ...draft, [field]: value } : draft)),
    );
  }

  async function handleSetPricesSubmit(event: SubmitEvent) {
    event.preventDefault();

    const form = event.currentTarget as HTMLFormElement;
    setSetPricesError(null);

    try {
      const payload = buildSetPricesSubmission(new FormData(form));
      await setPricesTask.run(props.market.id, payload);
      void props.onApplied?.();
    } catch (error) {
      setSetPricesError(getErrorMessage(error));
    }
  }

  async function handleBootstrapMarketSubmit(event: SubmitEvent) {
    event.preventDefault();

    const form = event.currentTarget as HTMLFormElement;
    setBootstrapMarketError(null);

    try {
      const { marketId, payload } = buildBootstrapMarketSubmission(props.market.id, new FormData(form));
      await bootstrapMarketTask.run(marketId, payload);
      window.dispatchEvent(new Event(ADMIN_CASH_BALANCE_REFRESH_EVENT));
      void props.onApplied?.();
    } catch (error) {
      setBootstrapMarketError(getErrorMessage(error));
    }
  }

  async function handleBootstrapEventSubmit(event: SubmitEvent) {
    event.preventDefault();

    setBootstrapEventError(null);

    try {
      const eventId = props.eventAdminId?.trim();

      if (!eventId) {
        throw new Error("Resolve the admin event before running event bootstrap.");
      }

      const payload = buildBootstrapEventSubmission(eventId, eventBootstrapDrafts());
      await bootstrapEventTask.run(eventId, payload);
      window.dispatchEvent(new Event(ADMIN_CASH_BALANCE_REFRESH_EVENT));
      void props.onApplied?.();
    } catch (error) {
      setBootstrapEventError(getErrorMessage(error));
    }
  }

  return (
    <>
      <div class="pm-admin-create-modal__overlay" aria-hidden="true" onClick={props.onClose} />

      <section class="pm-admin-create-modal" role="dialog" aria-modal="true" aria-label="Market operations">
        <header class="pm-admin-create-modal__header">
          <div class="pm-admin-create-modal__header-copy">
            <p class="pm-admin-create-modal__eyebrow">Admin</p>
            <h2 class="pm-admin-create-modal__title">Market Operations</h2>
            <p class="pm-admin-create-modal__copy">
              Set prices or bootstrap liquidity for the selected market. Use the batch tab when you
              want to seed the whole event in one request.
            </p>
          </div>

          <div class="pm-admin-create-modal__header-actions">
            <button class="pm-admin-create-modal__secondary" type="button" onClick={props.onBack}>
              <BackIcon />
              <span>Back</span>
            </button>
            <button
              class="pm-admin-create-modal__close"
              type="button"
              onClick={props.onClose}
              aria-label="Close market operations modal"
            >
              <CloseIcon />
            </button>
          </div>
        </header>

        <div class="pm-admin-create-modal__body">
          <section class="pm-admin-create-modal__context">
            <p class="pm-admin-create-modal__context-label">Selected market</p>
            <h3 class="pm-admin-create-modal__context-title">{props.market.label}</h3>
            <p class="pm-admin-create-modal__context-copy">
              Event: {props.eventTitle} ({props.eventSlug})
              <br />
              Market ID: {props.market.id}
              <br />
              Current display odds: {props.market.primaryMetric} • Buy Yes {currentBuyYes()} • Buy No{" "}
              {currentBuyNo()}
            </p>
          </section>

          <div class="pm-admin-create-modal__subnav">
            <button
              class={`pm-button ${
                activeTab() === "set_prices" ? "pm-button--primary" : "pm-button--ghost"
              }`}
              type="button"
              onClick={() => setActiveTab("set_prices")}
            >
              Set prices
            </button>
            <button
              class={`pm-button ${
                activeTab() === "bootstrap_market" ? "pm-button--primary" : "pm-button--ghost"
              }`}
              type="button"
              onClick={() => setActiveTab("bootstrap_market")}
            >
              Bootstrap market
            </button>
            <button
              class={`pm-button ${
                activeTab() === "bootstrap_event" ? "pm-button--primary" : "pm-button--ghost"
              }`}
              type="button"
              disabled={!canBootstrapEvent()}
              onClick={() => setActiveTab("bootstrap_event")}
            >
              Bootstrap event
            </button>
          </div>

          <Show when={activeTab() === "set_prices"}>
            <div class="pm-admin-create-modal__panel">
              <section class="pm-market-card">
                <div class="pm-market-card__header">
                  <div>
                    <p class="pm-market-card__eyebrow">POST /admin/markets/{'{market_id}'}/prices</p>
                    <h3 class="pm-market-card__title">Set market prices</h3>
                  </div>
                  <span class="pm-market-card__hint">selected market</span>
                </div>

                <p class="pm-market-card__copy">
                  Set a Yes/No price pair for this binary market. Both inputs must be whole bps and
                  total exactly 10000.
                </p>

                <form class="pm-market-form" onSubmit={handleSetPricesSubmit}>
                  <div class="pm-market-fields">
                    <label class="pm-field">
                      <span class="pm-field__label">Yes price bps</span>
                      <input
                        class="pm-field__input"
                        name="yes_bps"
                        type="number"
                        min="1"
                        max="9999"
                        step="1"
                        placeholder="5000"
                        value={currentBuyYesBps()}
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
                        placeholder="5000"
                        value={currentBuyNoBps()}
                        required
                      />
                    </label>
                  </div>

                  <Show when={setPricesError()}>
                    {message => <p class="pm-market-feedback pm-market-feedback--error">{message()}</p>}
                  </Show>

                  <div class="pm-market-actions">
                    <button class="pm-button pm-button--primary" type="submit" disabled={setPricesTask.pending()}>
                      {setPricesTask.pending() ? "Setting prices..." : "Set prices"}
                    </button>
                  </div>
                </form>
              </section>

              <Show when={setPricesTask.data()}>
                {response => <MarketPricesResult response={response()} />}
              </Show>
            </div>
          </Show>

          <Show when={activeTab() === "bootstrap_market"}>
            <div class="pm-admin-create-modal__panel">
              <section class="pm-market-card">
                <div class="pm-market-card__header">
                  <div>
                    <p class="pm-market-card__eyebrow">
                      POST /admin/markets/{'{market_id}'}/liquidity/bootstrap
                    </p>
                    <h3 class="pm-market-card__title">Bootstrap selected market</h3>
                  </div>
                  <span class="pm-market-card__hint">one market</span>
                </div>

                <p class="pm-market-card__copy">
                  Seed inventory and collateral for this market while setting its prices in the
                  same flow. Enter USDC amounts in dollars and the request body will be converted
                  to raw 6-decimal base units.
                </p>

                <form class="pm-market-form" onSubmit={handleBootstrapMarketSubmit}>
                  <div class="pm-market-fields">
                    <label class="pm-field">
                      <span class="pm-field__label">Yes price bps</span>
                      <input
                        class="pm-field__input"
                        name="yes_bps"
                        type="number"
                        min="1"
                        max="9999"
                        step="1"
                        placeholder="5000"
                        value={currentBuyYesBps()}
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
                        placeholder="5000"
                        value={currentBuyNoBps()}
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
                        value="0"
                        required
                      />
                    </label>
                  </div>

                  <Show when={bootstrapMarketError()}>
                    {message => <p class="pm-market-feedback pm-market-feedback--error">{message()}</p>}
                  </Show>

                  <div class="pm-market-actions">
                    <button
                      class="pm-button pm-button--primary"
                      type="submit"
                      disabled={bootstrapMarketTask.pending()}
                    >
                      {bootstrapMarketTask.pending()
                        ? "Bootstrapping market..."
                        : "Bootstrap selected market"}
                    </button>
                  </div>
                </form>
              </section>

              <Show when={bootstrapMarketTask.data()}>
                {response => <MarketLiquidityBootstrapResult response={response()} />}
              </Show>
            </div>
          </Show>

          <Show when={activeTab() === "bootstrap_event"}>
            <div class="pm-admin-create-modal__panel">
              <section class="pm-market-card">
                <div class="pm-market-card__header">
                  <div>
                    <p class="pm-market-card__eyebrow">
                      POST /admin/events/{'{event_id}'}/liquidity/bootstrap
                    </p>
                    <h3 class="pm-market-card__title">Bootstrap event liquidity</h3>
                  </div>
                  <span class="pm-market-card__hint">{eventMarkets().length} markets</span>
                </div>

                <p class="pm-market-card__copy">
                  Batch bootstrap every market in this event. Each row needs its own market ID,
                  price pair, inventory amount, and exit collateral amount in dollars. The request
                  body is converted to raw USDC base units before it is sent.
                </p>

                <Show
                  when={canBootstrapEvent()}
                  fallback={
                    <p class="pm-market-feedback pm-market-feedback--error">
                      Resolve the admin event first before using batch bootstrap.
                    </p>
                  }
                >
                  <form class="pm-market-form" onSubmit={handleBootstrapEventSubmit}>
                    <div class="pm-market-repeater">
                      <For each={eventBootstrapDrafts()}>
                        {draft => (
                          <section class="pm-market-repeater__card">
                            <div class="pm-market-repeater__header">
                              <div>
                                <p class="pm-market-card__eyebrow">{draft.market_id}</p>
                                <h3 class="pm-market-repeater__title">{draft.label}</h3>
                              </div>
                            </div>

                            <div class="pm-market-fields">
                              <label class="pm-field">
                                <span class="pm-field__label">Yes price bps</span>
                                <input
                                  class="pm-field__input"
                                  type="number"
                                  min="1"
                                  max="9999"
                                  step="1"
                                  value={draft.yes_bps}
                                  onInput={event =>
                                    updateEventBootstrapDraft(
                                      draft.id,
                                      "yes_bps",
                                      event.currentTarget.value,
                                    )}
                                  required
                                />
                              </label>

                              <label class="pm-field">
                                <span class="pm-field__label">No price bps</span>
                                <input
                                  class="pm-field__input"
                                  type="number"
                                  min="1"
                                  max="9999"
                                  step="1"
                                  value={draft.no_bps}
                                  onInput={event =>
                                    updateEventBootstrapDraft(
                                      draft.id,
                                      "no_bps",
                                      event.currentTarget.value,
                                    )}
                                  required
                                />
                              </label>

                              <label class="pm-field">
                                <span class="pm-field__label">
                                  Inventory USDC amount (dollars)
                                </span>
                                <input
                                  class="pm-field__input"
                                  type="text"
                                  inputmode="decimal"
                                  value={draft.inventory_usdc_amount}
                                  onInput={event =>
                                    updateEventBootstrapDraft(
                                      draft.id,
                                      "inventory_usdc_amount",
                                      event.currentTarget.value,
                                    )}
                                  required
                                />
                              </label>

                              <label class="pm-field">
                                <span class="pm-field__label">
                                  Exit collateral USDC amount (dollars)
                                </span>
                                <input
                                  class="pm-field__input"
                                  type="text"
                                  inputmode="decimal"
                                  value={draft.exit_collateral_usdc_amount}
                                  onInput={event =>
                                    updateEventBootstrapDraft(
                                      draft.id,
                                      "exit_collateral_usdc_amount",
                                      event.currentTarget.value,
                                    )}
                                  required
                                />
                              </label>
                            </div>
                          </section>
                        )}
                      </For>
                    </div>

                    <Show when={bootstrapEventError()}>
                      {message => <p class="pm-market-feedback pm-market-feedback--error">{message()}</p>}
                    </Show>

                    <p class="pm-market-feedback">
                      Example: entering `1500` sends `1500000000` base units.
                    </p>

                    <div class="pm-market-actions">
                      <button
                        class="pm-button pm-button--primary"
                        type="submit"
                        disabled={bootstrapEventTask.pending()}
                      >
                        {bootstrapEventTask.pending() ? "Bootstrapping event..." : "Bootstrap event"}
                      </button>
                    </div>
                  </form>
                </Show>
              </section>

              <Show when={bootstrapEventTask.data()}>
                {response => <EventLiquidityBootstrapResult response={response()} />}
              </Show>
            </div>
          </Show>
        </div>
      </section>
    </>
  );
}
