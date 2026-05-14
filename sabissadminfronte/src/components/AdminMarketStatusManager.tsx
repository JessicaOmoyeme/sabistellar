import { Show, createMemo, createSignal } from "solid-js";

import {
  pauseAdminMarket,
  unpauseAdminMarket,
  type MarketTradingStatusResponse,
} from "~/lib/api/admin";
import { getErrorMessage } from "~/lib/api/core";
import { useAsyncTask } from "~/lib/hooks/useAsyncTask";

function readRequiredText(formData: FormData, key: string, label: string) {
  const value = String(formData.get(key) ?? "").trim();

  if (!value) {
    throw new Error(`${label} is required.`);
  }

  return value;
}

function formatTimestamp(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function MarketTradingStatusResult(props: {
  title: string;
  response: MarketTradingStatusResponse;
}) {
  return (
    <section class="pm-market-result">
      <div class="pm-market-result__header">
        <div>
          <p class="pm-market-result__eyebrow">{props.title}</p>
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
          <span class="pm-market-result__label">Question ID</span>
          <span class="pm-market-result__value">{props.response.market.question_id}</span>
        </div>
        <div>
          <span class="pm-market-result__label">Publication</span>
          <span class="pm-market-result__value">{props.response.market.publication_status}</span>
        </div>
        <div>
          <span class="pm-market-result__label">Condition ID</span>
          <span class="pm-market-result__value">
            {props.response.market.condition_id ?? "Not published"}
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

export default function AdminMarketStatusManager() {
  const pauseTask = useAsyncTask((marketId: string) => pauseAdminMarket(marketId));
  const unpauseTask = useAsyncTask((marketId: string) => unpauseAdminMarket(marketId));
  const [error, setError] = createSignal<string | null>(null);
  const [result, setResult] = createSignal<MarketTradingStatusResponse | null>(null);
  const [resultTitle, setResultTitle] = createSignal<string | null>(null);
  const currentResult = createMemo(() => {
    const response = result();
    const title = resultTitle();

    if (!response || !title) {
      return null;
    }

    return {
      response,
      title,
    };
  });

  function isPending() {
    return pauseTask.pending() || unpauseTask.pending();
  }

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    const form = event.currentTarget as HTMLFormElement;
    const submitter = event.submitter as HTMLButtonElement | null;
    const action = submitter?.dataset.action;

    setError(null);

    try {
      const marketId = readRequiredText(new FormData(form), "market_id", "Market ID");

      if (action === "pause") {
        const response = await pauseTask.run(marketId);
        setResultTitle("Paused");
        setResult(response);
        return;
      }

      if (action === "unpause") {
        const response = await unpauseTask.run(marketId);
        setResultTitle("Unpaused");
        setResult(response);
        return;
      }

      throw new Error("Choose pause or unpause.");
    } catch (taskError) {
      setError(getErrorMessage(taskError));
    }
  }

  return (
    <section class="pm-market-card pm-market-card--wide">
      <div class="pm-market-card__header">
        <div>
          <p class="pm-market-card__eyebrow">
            POST /admin/markets/{'{market_id}'}/pause | /unpause
          </p>
          <h2 class="pm-market-card__title">Change trading status</h2>
        </div>
        <span class="pm-market-card__hint">Trading state</span>
      </div>

      <p class="pm-market-card__copy">
        Pause or resume a market without editing its metadata. Published markets trigger the
        on-chain status update. Resolved markets and markets with an active resolution workflow
        cannot be paused or unpaused.
      </p>

      <form class="pm-market-form" onSubmit={handleSubmit}>
        <div class="pm-market-fields">
          <label class="pm-field pm-field--full">
            <span class="pm-field__label">Market ID</span>
            <input class="pm-field__input" name="market_id" type="text" required />
          </label>
        </div>

        <div class="pm-market-actions pm-market-actions--group">
          <button
            class="pm-button pm-button--primary"
            type="submit"
            data-action="pause"
            disabled={isPending()}
          >
            {pauseTask.pending() ? "Pausing..." : "Pause market"}
          </button>

          <button
            class="pm-button pm-button--ghost"
            type="submit"
            data-action="unpause"
            disabled={isPending()}
          >
            {unpauseTask.pending() ? "Unpausing..." : "Unpause market"}
          </button>
        </div>

        <Show when={error()}>{message => <p class="pm-market-feedback pm-market-feedback--error">{message()}</p>}</Show>
      </form>

      <Show when={currentResult()}>
        {value => <MarketTradingStatusResult title={value().title} response={value().response} />}
      </Show>
    </section>
  );
}
