import { Show, createSignal } from "solid-js";

import {
  disputeAdminMarketResolution,
  emergencyResolveAdminMarket,
  finalizeAdminMarketResolution,
  proposeAdminMarketResolution,
  type DisputeMarketResolutionRequest,
  type EmergencyMarketResolutionRequest,
  type MarketResolutionWorkflowResponse,
  type ProposeMarketResolutionRequest,
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

function readOptionalText(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();

  return value ? value : undefined;
}

function readRequiredInteger(formData: FormData, key: string, label: string) {
  const rawValue = String(formData.get(key) ?? "").trim();

  if (!rawValue) {
    throw new Error(`${label} is required.`);
  }

  const parsed = Number(rawValue);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a whole number starting at 0.`);
  }

  return parsed;
}

function formatTimestamp(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function buildProposeResolutionSubmission(formData: FormData) {
  const marketId = readRequiredText(formData, "market_id", "Market ID");
  const winningOutcome = readRequiredInteger(formData, "winning_outcome", "Winning outcome");
  const notes = readOptionalText(formData, "notes");

  return {
    marketId,
    payload: {
      resolution: {
        winning_outcome: winningOutcome,
        ...(notes ? { notes } : {}),
      },
    } satisfies ProposeMarketResolutionRequest,
  };
}

function buildDisputeResolutionSubmission(formData: FormData) {
  const marketId = readRequiredText(formData, "market_id", "Market ID");
  const reason = readRequiredText(formData, "reason", "Dispute reason");

  return {
    marketId,
    payload: {
      resolution: {
        reason,
      },
    } satisfies DisputeMarketResolutionRequest,
  };
}

function buildFinalizeResolutionSubmission(formData: FormData) {
  return {
    marketId: readRequiredText(formData, "market_id", "Market ID"),
  };
}

function buildEmergencyResolutionSubmission(formData: FormData) {
  const marketId = readRequiredText(formData, "market_id", "Market ID");
  const winningOutcome = readRequiredInteger(formData, "winning_outcome", "Winning outcome");
  const reason = readRequiredText(formData, "reason", "Emergency reason");

  return {
    marketId,
    payload: {
      resolution: {
        winning_outcome: winningOutcome,
        reason,
      },
    } satisfies EmergencyMarketResolutionRequest,
  };
}

function ResolutionResult(props: {
  title: string;
  response: MarketResolutionWorkflowResponse;
}) {
  return (
    <section class="pm-market-result">
      <div class="pm-market-result__header">
        <div>
          <p class="pm-market-result__eyebrow">{props.title}</p>
          <h3 class="pm-market-result__title">{props.response.market.slug}</h3>
        </div>
        <span class="pm-market-result__badge">{props.response.resolution.status}</span>
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
          <span class="pm-market-result__label">Trading status</span>
          <span class="pm-market-result__value">{props.response.market.trading_status}</span>
        </div>
        <div>
          <span class="pm-market-result__label">Proposed outcome</span>
          <span class="pm-market-result__value">
            {props.response.resolution.proposed_winning_outcome}
          </span>
        </div>
        <div>
          <span class="pm-market-result__label">Final outcome</span>
          <span class="pm-market-result__value">
            {props.response.resolution.final_winning_outcome ?? "Pending"}
          </span>
        </div>
        <div>
          <span class="pm-market-result__label">Dispute deadline</span>
          <span class="pm-market-result__value">
            {formatTimestamp(props.response.resolution.dispute_deadline)}
          </span>
        </div>
        <div class="pm-market-result__detail--full">
          <span class="pm-market-result__label">Notes</span>
          <span class="pm-market-result__value">{props.response.resolution.notes ?? "None"}</span>
        </div>
        <div class="pm-market-result__detail--full">
          <span class="pm-market-result__label">Dispute reason</span>
          <span class="pm-market-result__value">
            {props.response.resolution.dispute_reason ?? "None"}
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

export default function AdminMarketResolutionManager() {
  const proposeTask = useAsyncTask(
    (marketId: string, payload: ProposeMarketResolutionRequest) =>
      proposeAdminMarketResolution(marketId, payload),
  );
  const disputeTask = useAsyncTask(
    (marketId: string, payload: DisputeMarketResolutionRequest) =>
      disputeAdminMarketResolution(marketId, payload),
  );
  const finalizeTask = useAsyncTask((marketId: string) => finalizeAdminMarketResolution(marketId));
  const emergencyTask = useAsyncTask(
    (marketId: string, payload: EmergencyMarketResolutionRequest) =>
      emergencyResolveAdminMarket(marketId, payload),
  );

  const [proposeError, setProposeError] = createSignal<string | null>(null);
  const [disputeError, setDisputeError] = createSignal<string | null>(null);
  const [finalizeError, setFinalizeError] = createSignal<string | null>(null);
  const [emergencyError, setEmergencyError] = createSignal<string | null>(null);

  async function handleProposeSubmit(event: SubmitEvent) {
    event.preventDefault();

    const form = event.currentTarget as HTMLFormElement;

    setProposeError(null);

    try {
      const { marketId, payload } = buildProposeResolutionSubmission(new FormData(form));
      await proposeTask.run(marketId, payload);
    } catch (error) {
      setProposeError(getErrorMessage(error));
    }
  }

  async function handleDisputeSubmit(event: SubmitEvent) {
    event.preventDefault();

    const form = event.currentTarget as HTMLFormElement;

    setDisputeError(null);

    try {
      const { marketId, payload } = buildDisputeResolutionSubmission(new FormData(form));
      await disputeTask.run(marketId, payload);
    } catch (error) {
      setDisputeError(getErrorMessage(error));
    }
  }

  async function handleFinalizeSubmit(event: SubmitEvent) {
    event.preventDefault();

    const form = event.currentTarget as HTMLFormElement;

    setFinalizeError(null);

    try {
      const { marketId } = buildFinalizeResolutionSubmission(new FormData(form));
      await finalizeTask.run(marketId);
    } catch (error) {
      setFinalizeError(getErrorMessage(error));
    }
  }

  async function handleEmergencySubmit(event: SubmitEvent) {
    event.preventDefault();

    const form = event.currentTarget as HTMLFormElement;

    setEmergencyError(null);

    try {
      const { marketId, payload } = buildEmergencyResolutionSubmission(new FormData(form));
      await emergencyTask.run(marketId, payload);
    } catch (error) {
      setEmergencyError(getErrorMessage(error));
    }
  }

  return (
    <div class="pm-tool-stack">
      <div class="pm-market-grid">
        <section class="pm-market-card">
          <div class="pm-market-card__header">
            <div>
              <p class="pm-market-card__eyebrow">
                POST /admin/markets/{'{market_id}'}/resolution/propose
              </p>
              <h2 class="pm-market-card__title">Propose resolution</h2>
            </div>
            <span class="pm-market-card__hint">Starts workflow</span>
          </div>

          <p class="pm-market-card__copy">
            Propose the winning outcome after the market has ended. The backend pauses the market
            and opens the dispute window immediately.
          </p>

          <form class="pm-market-form" onSubmit={handleProposeSubmit}>
            <div class="pm-market-fields">
              <label class="pm-field pm-field--full">
                <span class="pm-field__label">Market ID</span>
                <input class="pm-field__input" name="market_id" type="text" required />
              </label>

              <label class="pm-field">
                <span class="pm-field__label">Winning outcome</span>
                <input
                  class="pm-field__input"
                  name="winning_outcome"
                  type="number"
                  min="0"
                  step="1"
                  required
                />
              </label>

              <label class="pm-field pm-field--full">
                <span class="pm-field__label">Notes</span>
                <textarea class="pm-field__textarea" name="notes" rows="3" />
              </label>
            </div>

            <div class="pm-market-actions">
              <button
                class="pm-button pm-button--primary"
                type="submit"
                disabled={proposeTask.pending()}
              >
                {proposeTask.pending() ? "Proposing..." : "Propose resolution"}
              </button>
            </div>

            <Show when={proposeError()}>
              {message => <p class="pm-market-feedback pm-market-feedback--error">{message()}</p>}
            </Show>
          </form>

          <Show when={proposeTask.data()}>
            {response => <ResolutionResult title="Proposed" response={response()} />}
          </Show>
        </section>

        <section class="pm-market-card">
          <div class="pm-market-card__header">
            <div>
              <p class="pm-market-card__eyebrow">
                POST /admin/markets/{'{market_id}'}/resolution/dispute
              </p>
              <h2 class="pm-market-card__title">Dispute resolution</h2>
            </div>
            <span class="pm-market-card__hint">During window</span>
          </div>

          <p class="pm-market-card__copy">
            Dispute a proposed resolution before the dispute deadline expires. This only works when
            the market already has an active proposal.
          </p>

          <form class="pm-market-form" onSubmit={handleDisputeSubmit}>
            <div class="pm-market-fields">
              <label class="pm-field pm-field--full">
                <span class="pm-field__label">Market ID</span>
                <input class="pm-field__input" name="market_id" type="text" required />
              </label>

              <label class="pm-field pm-field--full">
                <span class="pm-field__label">Dispute reason</span>
                <textarea class="pm-field__textarea" name="reason" rows="4" required />
              </label>
            </div>

            <div class="pm-market-actions">
              <button
                class="pm-button pm-button--primary"
                type="submit"
                disabled={disputeTask.pending()}
              >
                {disputeTask.pending() ? "Submitting..." : "Dispute resolution"}
              </button>
            </div>

            <Show when={disputeError()}>
              {message => <p class="pm-market-feedback pm-market-feedback--error">{message()}</p>}
            </Show>
          </form>

          <Show when={disputeTask.data()}>
            {response => <ResolutionResult title="Disputed" response={response()} />}
          </Show>
        </section>

        <section class="pm-market-card">
          <div class="pm-market-card__header">
            <div>
              <p class="pm-market-card__eyebrow">
                POST /admin/markets/{'{market_id}'}/resolution/finalize
              </p>
              <h2 class="pm-market-card__title">Finalize resolution</h2>
            </div>
            <span class="pm-market-card__hint">After window</span>
          </div>

          <p class="pm-market-card__copy">
            Finalize a proposed resolution once the dispute window has elapsed. Disputed
            resolutions cannot be finalized here.
          </p>

          <form class="pm-market-form" onSubmit={handleFinalizeSubmit}>
            <div class="pm-market-fields">
              <label class="pm-field pm-field--full">
                <span class="pm-field__label">Market ID</span>
                <input class="pm-field__input" name="market_id" type="text" required />
              </label>
            </div>

            <div class="pm-market-actions">
              <button
                class="pm-button pm-button--primary"
                type="submit"
                disabled={finalizeTask.pending()}
              >
                {finalizeTask.pending() ? "Finalizing..." : "Finalize resolution"}
              </button>
            </div>

            <Show when={finalizeError()}>
              {message => <p class="pm-market-feedback pm-market-feedback--error">{message()}</p>}
            </Show>
          </form>

          <Show when={finalizeTask.data()}>
            {response => <ResolutionResult title="Finalized" response={response()} />}
          </Show>
        </section>

        <section class="pm-market-card">
          <div class="pm-market-card__header">
            <div>
              <p class="pm-market-card__eyebrow">
                POST /admin/markets/{'{market_id}'}/resolution/emergency
              </p>
              <h2 class="pm-market-card__title">Emergency resolve</h2>
            </div>
            <span class="pm-market-card__hint">Immediate resolve</span>
          </div>

          <p class="pm-market-card__copy">
            Resolve a closed market immediately without waiting for the normal dispute window. This
            sets the market trading status to resolved at once.
          </p>

          <form class="pm-market-form" onSubmit={handleEmergencySubmit}>
            <div class="pm-market-fields">
              <label class="pm-field pm-field--full">
                <span class="pm-field__label">Market ID</span>
                <input class="pm-field__input" name="market_id" type="text" required />
              </label>

              <label class="pm-field">
                <span class="pm-field__label">Winning outcome</span>
                <input
                  class="pm-field__input"
                  name="winning_outcome"
                  type="number"
                  min="0"
                  step="1"
                  required
                />
              </label>

              <label class="pm-field pm-field--full">
                <span class="pm-field__label">Emergency reason</span>
                <textarea class="pm-field__textarea" name="reason" rows="4" required />
              </label>
            </div>

            <div class="pm-market-actions">
              <button
                class="pm-button pm-button--primary"
                type="submit"
                disabled={emergencyTask.pending()}
              >
                {emergencyTask.pending() ? "Resolving..." : "Emergency resolve"}
              </button>
            </div>

            <Show when={emergencyError()}>
              {message => <p class="pm-market-feedback pm-market-feedback--error">{message()}</p>}
            </Show>
          </form>

          <Show when={emergencyTask.data()}>
            {response => <ResolutionResult title="Emergency resolved" response={response()} />}
          </Show>
        </section>
      </div>
    </div>
  );
}
