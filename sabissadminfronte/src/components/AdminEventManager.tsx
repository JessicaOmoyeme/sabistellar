import { For, Show, createSignal, onMount } from "solid-js";

import {
  bootstrapAdminEventLiquidity,
  getAdminEvent,
  getAdminEventMarkets,
  listAdminEvents,
  createAdminEvent,
  createAdminEventMarketLadder,
  createAdminEventMarkets,
  publishAdminEventMarkets,
  publishAdminEventShell,
  registerAdminNegRiskEvent,
  type AdminPublicationStatusFilter,
  type BootstrapEventLiquidityRequest,
  type CreateEventMarketLadderRequest,
  type CreateEventMarketsRequest,
  type CreateEventMarketsResponse,
  type CreateEventRequest,
  type CreateEventResponse,
  type EventLiquidityBootstrapResponse,
  type EventDetailResponse,
  type EventMarketsResponse,
  type NegRiskRegistrationResponse,
  type RegisterNegRiskEventRequest,
} from "~/lib/api/admin";
import { getErrorMessage } from "~/lib/api/core";
import { useAsyncTask } from "~/lib/hooks/useAsyncTask";
import { parseUsdcDollarsToBaseUnits } from "~/lib/usdc";

import AdminImageUrlField from "./AdminImageUrlField";

const ADMIN_CASH_BALANCE_REFRESH_EVENT = "sabi:admin-cash-balance-refresh";

interface EventMarketDraft {
  id: string;
  label: string;
  slug: string;
  question: string;
  end_time: string;
  oracle_address: string;
  outcomes: string;
  sort_order: string;
}

interface EventLiquidityDraft {
  id: string;
  market_id: string;
  yes_bps: string;
  no_bps: string;
  inventory_usdc_amount: string;
  exit_collateral_usdc_amount: string;
}

type EventWorkflowStep =
  | "recover_draft"
  | "event_shell"
  | "manual_markets"
  | "ladder_markets"
  | "publish_event"
  | "publish_markets"
  | "liquidity_bootstrap"
  | "neg_risk";

const eventWorkflowSteps: Array<{
  id: EventWorkflowStep;
  step: string;
  title: string;
  copy: string;
}> = [
  {
    id: "recover_draft",
    step: "00",
    title: "Recover Draft",
    copy: "Reload a draft or published event after refresh.",
  },
  {
    id: "event_shell",
    step: "01",
    title: "Event Shell",
    copy: "Create the parent event and capture the admin event ID.",
  },
  {
    id: "manual_markets",
    step: "02A",
    title: "Manual Markets",
    copy: "Add sibling markets one by one under the active event.",
  },
  {
    id: "ladder_markets",
    step: "02B",
    title: "Ladder Markets",
    copy: "Generate sibling markets from threshold ladders.",
  },
  {
    id: "publish_event",
    step: "03",
    title: "Publish Event",
    copy: "Publish the parent event shell on-chain.",
  },
  {
    id: "publish_markets",
    step: "04",
    title: "Publish Markets",
    copy: "Publish draft child markets and fill condition IDs.",
  },
  {
    id: "liquidity_bootstrap",
    step: "05",
    title: "Liquidity Bootstrap",
    copy: "Optionally batch-bootstrap sibling market liquidity under the published event.",
  },
  {
    id: "neg_risk",
    step: "06",
    title: "Neg-Risk",
    copy: "Register neg-risk after the event and markets are published.",
  },
];

let nextEventMarketDraftId = 0;

function createEventMarketDraft(): EventMarketDraft {
  nextEventMarketDraftId += 1;

  return {
    id: `event-market-draft-${nextEventMarketDraftId}`,
    label: "",
    slug: "",
    question: "",
    end_time: "",
    oracle_address: "",
    outcomes: "Yes\nNo",
    sort_order: "",
  };
}

function createEventLiquidityDraft(): EventLiquidityDraft {
  nextEventMarketDraftId += 1;

  return {
    id: `event-liquidity-draft-${nextEventMarketDraftId}`,
    market_id: "",
    yes_bps: "",
    no_bps: "",
    inventory_usdc_amount: "",
    exit_collateral_usdc_amount: "",
  };
}

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

function readDateTimeValue(
  formData: FormData,
  key: string,
  label: string,
  options: { required?: boolean } = {},
) {
  const value = String(formData.get(key) ?? "").trim();

  if (!value) {
    if (options.required) {
      throw new Error(`${label} is required.`);
    }

    return undefined;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label} must be a valid date and time.`);
  }

  return parsed.toISOString();
}

function readStringList(formData: FormData, key: string) {
  const rawValue = String(formData.get(key) ?? "");

  const values = rawValue
    .split(/\r?\n|,/)
    .map(value => value.trim())
    .filter(Boolean);

  return values.length > 0 ? values : undefined;
}

function buildCreateEventPayload(formData: FormData): CreateEventRequest {
  const event: CreateEventRequest["event"] = {
    title: readRequiredText(formData, "title", "Title"),
    slug: readRequiredText(formData, "slug", "Slug"),
    category_slug: readRequiredText(formData, "category_slug", "Category slug"),
    rules: readRequiredText(formData, "rules", "Rules"),
    ...(readOptionalText(formData, "subcategory_slug")
      ? { subcategory_slug: readOptionalText(formData, "subcategory_slug")! }
      : {}),
    ...(readStringList(formData, "tag_slugs")
      ? { tag_slugs: readStringList(formData, "tag_slugs")! }
      : {}),
    ...(readOptionalText(formData, "image_url")
      ? { image_url: readOptionalText(formData, "image_url")! }
      : {}),
    ...(readOptionalText(formData, "summary")
      ? { summary: readOptionalText(formData, "summary")! }
      : {}),
    ...(readOptionalText(formData, "context")
      ? { context: readOptionalText(formData, "context")! }
      : {}),
    ...(readOptionalText(formData, "additional_context")
      ? { additional_context: readOptionalText(formData, "additional_context")! }
      : {}),
    ...(readDateTimeValue(formData, "starts_at", "Starts at")
      ? { starts_at: readDateTimeValue(formData, "starts_at", "Starts at")! }
      : {}),
    ...(readDateTimeValue(formData, "sort_at", "Sort at")
      ? { sort_at: readDateTimeValue(formData, "sort_at", "Sort at")! }
      : {}),
    ...(readStringList(formData, "resolution_sources")
      ? { resolution_sources: readStringList(formData, "resolution_sources")! }
      : {}),
    ...(readOptionalText(formData, "resolution_timezone")
      ? { resolution_timezone: readOptionalText(formData, "resolution_timezone")! }
      : {}),
    featured: Boolean(formData.get("featured")),
    breaking: Boolean(formData.get("breaking")),
    searchable: Boolean(formData.get("searchable")),
    visible: Boolean(formData.get("visible")),
    hide_resolved_by_default: Boolean(formData.get("hide_resolved_by_default")),
  };

  const chain: CreateEventRequest["chain"] = {
    group_key: readRequiredText(formData, "group_key", "Group key"),
    series_key: readRequiredText(formData, "series_key", "Series key"),
    ...(formData.get("neg_risk") ? { neg_risk: true } : {}),
  };

  return {
    event,
    chain,
    ...(formData.get("publish_now") ? { publish: { mode: "publish" as const } } : {}),
  };
}

function buildEventMarketsPayload(
  drafts: EventMarketDraft[],
): CreateEventMarketsRequest["markets"] {
  if (drafts.length === 0) {
    throw new Error("Add at least one market.");
  }

  return drafts.map((draft, index) => {
    const label = draft.label.trim();
    const slug = draft.slug.trim();
    const question = draft.question.trim();
    const endTimeRaw = draft.end_time.trim();
    const oracleAddress = draft.oracle_address.trim();

    if (!label) {
      throw new Error(`Market ${index + 1}: label is required.`);
    }

    if (!slug) {
      throw new Error(`Market ${index + 1}: slug is required.`);
    }

    if (!question) {
      throw new Error(`Market ${index + 1}: question is required.`);
    }

    if (!endTimeRaw) {
      throw new Error(`Market ${index + 1}: end time is required.`);
    }

    if (!oracleAddress) {
      throw new Error(`Market ${index + 1}: oracle address is required.`);
    }

    const endTime = new Date(endTimeRaw);

    if (Number.isNaN(endTime.getTime())) {
      throw new Error(`Market ${index + 1}: end time must be valid.`);
    }

    const outcomes = draft.outcomes
      .split(/\r?\n|,/)
      .map(value => value.trim())
      .filter(Boolean);

    const rawSortOrder = draft.sort_order.trim();
    let sortOrder: number | undefined;

    if (rawSortOrder) {
      const parsed = Number.parseInt(rawSortOrder, 10);

      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`Market ${index + 1}: sort order must be a positive whole number.`);
      }

      sortOrder = parsed;
    }

    return {
      label,
      slug,
      question,
      end_time: endTime.toISOString(),
      oracle_address: oracleAddress,
      ...(outcomes.length > 0 ? { outcomes } : {}),
      ...(sortOrder !== undefined ? { sort_order: sortOrder } : {}),
    };
  });
}

function buildCreateEventMarketsSubmission(
  eventId: string,
  publishNow: boolean,
  drafts: EventMarketDraft[],
) {
  const normalizedEventId = eventId.trim();

  if (!normalizedEventId) {
    throw new Error("Event ID is required.");
  }

  return {
    eventId: normalizedEventId,
    payload: {
      markets: buildEventMarketsPayload(drafts),
      ...(publishNow ? { publish: { mode: "publish" as const } } : {}),
    } satisfies CreateEventMarketsRequest,
  };
}

function buildCreateEventMarketLadderSubmission(formData: FormData) {
  const eventId = readRequiredText(formData, "event_id", "Event ID");
  const underlying = readRequiredText(formData, "underlying", "Underlying");
  const deadlineLabel = readRequiredText(formData, "deadline_label", "Deadline label");
  const endTime = readDateTimeValue(formData, "end_time", "End time", {
    required: true,
  });
  const oracleAddress = readRequiredText(formData, "oracle_address", "Oracle address");
  const unitSymbol = readOptionalText(formData, "unit_symbol");
  const upThresholds = readStringList(formData, "up_thresholds");
  const downThresholds = readStringList(formData, "down_thresholds");

  if (!upThresholds && !downThresholds) {
    throw new Error("Add at least one up or down threshold.");
  }

  return {
    eventId,
    payload: {
      template: {
        underlying,
        deadline_label: deadlineLabel,
        end_time: endTime!,
        oracle_address: oracleAddress,
        ...(unitSymbol ? { unit_symbol: unitSymbol } : {}),
        ...(upThresholds ? { up_thresholds: upThresholds } : {}),
        ...(downThresholds ? { down_thresholds: downThresholds } : {}),
      },
      ...(formData.get("publish_now") ? { publish: { mode: "publish" as const } } : {}),
    } satisfies CreateEventMarketLadderRequest,
  };
}

function buildRegisterNegRiskSubmission(formData: FormData) {
  const eventId = readRequiredText(formData, "event_id", "Event ID");
  const otherMarketId = readOptionalText(formData, "other_market_id");

  return {
    eventId,
    payload: {
      neg_risk: {
        other_market_id: otherMarketId ?? null,
      },
    } satisfies RegisterNegRiskEventRequest,
  };
}

function buildEventLiquidityBootstrapSubmission(
  eventId: string,
  drafts: EventLiquidityDraft[],
) {
  const normalizedEventId = eventId.trim();

  if (!normalizedEventId) {
    throw new Error("Event ID is required.");
  }

  if (drafts.length === 0) {
    throw new Error("Add at least one market bootstrap config.");
  }

  return {
    eventId: normalizedEventId,
    payload: {
      liquidity: {
        markets: drafts.map((draft, index) => {
          const marketId = draft.market_id.trim();
          const inventoryUsdcAmount = parseUsdcDollarsToBaseUnits(
            draft.inventory_usdc_amount,
            `Bootstrap row ${index + 1}: inventory USDC amount`,
          );
          const exitCollateralUsdcAmount = parseUsdcDollarsToBaseUnits(
            draft.exit_collateral_usdc_amount,
            `Bootstrap row ${index + 1}: exit collateral USDC amount`,
            { allowZero: true },
          );

          if (!marketId) {
            throw new Error(`Bootstrap row ${index + 1}: market ID is required.`);
          }

          const yesBps = readRequiredInteger(
            draft.yes_bps,
            `Bootstrap row ${index + 1}: yes price bps`,
            { min: 1, max: 9999 },
          );
          const noBps = readRequiredInteger(
            draft.no_bps,
            `Bootstrap row ${index + 1}: no price bps`,
            { min: 1, max: 9999 },
          );

          validateBinaryPricePair(yesBps, noBps, `Bootstrap row ${index + 1} prices`);

          return {
            market_id: marketId,
            yes_bps: yesBps,
            no_bps: noBps,
            inventory_usdc_amount: inventoryUsdcAmount,
            exit_collateral_usdc_amount: exitCollateralUsdcAmount,
          };
        }),
      },
    } satisfies BootstrapEventLiquidityRequest,
  };
}

function formatTimestamp(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function EventCreateResult(props: { response: CreateEventResponse }) {
  return (
    <section class="pm-market-result">
      <div class="pm-market-result__header">
        <div>
          <p class="pm-market-result__eyebrow">Created</p>
          <h3 class="pm-market-result__title">{props.response.event.slug}</h3>
        </div>
        <span class="pm-market-result__badge">{props.response.event.publication_status}</span>
      </div>

      <div class="pm-market-result__grid">
        <div>
          <span class="pm-market-result__label">Admin event ID</span>
          <span class="pm-market-result__value">{props.response.id}</span>
        </div>
        <div>
          <span class="pm-market-result__label">Created</span>
          <span class="pm-market-result__value">{formatTimestamp(props.response.created_at)}</span>
        </div>
        <div>
          <span class="pm-market-result__label">Group ID</span>
          <span class="pm-market-result__value">{props.response.on_chain.group_id}</span>
        </div>
        <div>
          <span class="pm-market-result__label">Series ID</span>
          <span class="pm-market-result__value">{props.response.on_chain.series_id}</span>
        </div>
      </div>
    </section>
  );
}

function EventMarketsResult(props: { response: CreateEventMarketsResponse }) {
  return (
    <section class="pm-market-result">
      <div class="pm-market-result__header">
        <div>
          <p class="pm-market-result__eyebrow">Markets Added</p>
          <h3 class="pm-market-result__title">{props.response.event_slug}</h3>
        </div>
        <span class="pm-market-result__badge">{props.response.markets.length} markets</span>
      </div>

      <div class="pm-market-result__grid">
        <div>
          <span class="pm-market-result__label">Admin event ID</span>
          <span class="pm-market-result__value">{props.response.event_id}</span>
        </div>
        <div>
          <span class="pm-market-result__label">Count</span>
          <span class="pm-market-result__value">{props.response.markets.length}</span>
        </div>
        <div class="pm-market-result__detail--full">
          <span class="pm-market-result__label">Market Slugs</span>
          <span class="pm-market-result__value">
            {props.response.markets.map(market => market.slug).join(", ")}
          </span>
        </div>
      </div>
    </section>
  );
}

function EventPublishResult(props: { response: EventDetailResponse }) {
  return (
    <section class="pm-market-result">
      <div class="pm-market-result__header">
        <div>
          <p class="pm-market-result__eyebrow">Event Published</p>
          <h3 class="pm-market-result__title">{props.response.event.slug}</h3>
        </div>
        <span class="pm-market-result__badge">{props.response.event.publication_status}</span>
      </div>

      <div class="pm-market-result__grid">
        <div>
          <span class="pm-market-result__label">Markets count</span>
          <span class="pm-market-result__value">{props.response.markets_count}</span>
        </div>
        <div>
          <span class="pm-market-result__label">On-chain event ID</span>
          <span class="pm-market-result__value">{props.response.on_chain.event_id}</span>
        </div>
        <div>
          <span class="pm-market-result__label">Group ID</span>
          <span class="pm-market-result__value">{props.response.on_chain.group_id}</span>
        </div>
        <div>
          <span class="pm-market-result__label">Tx hash</span>
          <span class="pm-market-result__value">{props.response.on_chain.tx_hash ?? "Already published"}</span>
        </div>
      </div>
    </section>
  );
}

function EventPublishMarketsResult(props: { response: EventMarketsResponse }) {
  return (
    <section class="pm-market-result">
      <div class="pm-market-result__header">
        <div>
          <p class="pm-market-result__eyebrow">Markets Published</p>
          <h3 class="pm-market-result__title">{props.response.event.slug}</h3>
        </div>
        <span class="pm-market-result__badge">{props.response.markets.length} markets</span>
      </div>

      <div class="pm-market-result__grid">
        <div>
          <span class="pm-market-result__label">Publication</span>
          <span class="pm-market-result__value">{props.response.event.publication_status}</span>
        </div>
        <div>
          <span class="pm-market-result__label">Published markets</span>
          <span class="pm-market-result__value">{props.response.markets.length}</span>
        </div>
        <div class="pm-market-result__detail--full">
          <span class="pm-market-result__label">Condition IDs</span>
          <span class="pm-market-result__value">
            {props.response.markets
              .map(market => `${market.slug}: ${market.condition_id ?? "pending"}`)
              .join(", ")}
          </span>
        </div>
      </div>
    </section>
  );
}

function NegRiskResult(props: { response: NegRiskRegistrationResponse }) {
  return (
    <section class="pm-market-result">
      <div class="pm-market-result__header">
        <div>
          <p class="pm-market-result__eyebrow">Neg-Risk Registered</p>
          <h3 class="pm-market-result__title">{props.response.event.slug}</h3>
        </div>
        <span class="pm-market-result__badge">
          {props.response.neg_risk.registered ? "registered" : "pending"}
        </span>
      </div>

      <div class="pm-market-result__grid">
        <div>
          <span class="pm-market-result__label">Other market ID</span>
          <span class="pm-market-result__value">
            {props.response.neg_risk.other_market_id ?? "None"}
          </span>
        </div>
        <div>
          <span class="pm-market-result__label">Registered</span>
          <span class="pm-market-result__value">
            {formatTimestamp(props.response.neg_risk.registered_at)}
          </span>
        </div>
        <div>
          <span class="pm-market-result__label">Has other</span>
          <span class="pm-market-result__value">
            {props.response.neg_risk.has_other ? "true" : "false"}
          </span>
        </div>
        <div>
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

function getWorkflowStepMeta(step: EventWorkflowStep) {
  return eventWorkflowSteps.find(item => item.id === step) ?? eventWorkflowSteps[0]!;
}

function getRecommendedEventStep(
  detail: EventDetailResponse,
  markets: EventMarketsResponse,
): EventWorkflowStep {
  if (detail.event.publication_status !== "published") {
    return markets.markets.length > 0 ? "publish_event" : "manual_markets";
  }

  if (markets.markets.some(market => market.publication_status !== "published")) {
    return "publish_markets";
  }

  return "liquidity_bootstrap";
}

function RecoverySelectionResult(props: {
  eventId: string;
  detail: EventDetailResponse;
  markets: EventMarketsResponse;
  onContinue: (step: EventWorkflowStep) => void;
}) {
  const recommendedStep = getRecommendedEventStep(props.detail, props.markets);
  const draftMarketsCount = props.markets.markets.filter(
    market => market.publication_status !== "published",
  ).length;
  const publishedMarketsCount = props.markets.markets.length - draftMarketsCount;

  return (
    <section class="pm-market-result">
      <div class="pm-market-result__header">
        <div>
          <p class="pm-market-result__eyebrow">Recovered</p>
          <h3 class="pm-market-result__title">{props.detail.event.slug}</h3>
        </div>
        <span class="pm-market-result__badge">{props.detail.event.publication_status}</span>
      </div>

      <div class="pm-market-result__grid">
        <div>
          <span class="pm-market-result__label">Admin event ID</span>
          <span class="pm-market-result__value">{props.eventId}</span>
        </div>
        <div>
          <span class="pm-market-result__label">Markets count</span>
          <span class="pm-market-result__value">{props.detail.markets_count}</span>
        </div>
        <div>
          <span class="pm-market-result__label">Draft markets</span>
          <span class="pm-market-result__value">{draftMarketsCount}</span>
        </div>
        <div>
          <span class="pm-market-result__label">Published markets</span>
          <span class="pm-market-result__value">{publishedMarketsCount}</span>
        </div>
        <div class="pm-market-result__detail--full">
          <span class="pm-market-result__label">Market slugs</span>
          <span class="pm-market-result__value">
            {props.markets.markets.map(market => market.slug).join(", ") || "No child markets yet"}
          </span>
        </div>
      </div>

      <div class="pm-market-actions pm-market-actions--group">
        <button
          class="pm-button pm-button--primary"
          type="button"
          onClick={() => props.onContinue(recommendedStep)}
        >
          Continue To {getWorkflowStepMeta(recommendedStep).title}
        </button>
      </div>
    </section>
  );
}

export default function AdminEventManager() {
  const listEventsTask = useAsyncTask((query: { publication_status?: AdminPublicationStatusFilter }) =>
    listAdminEvents(query),
  );
  const getEventTask = useAsyncTask((eventId: string) => getAdminEvent(eventId));
  const getEventMarketsTask = useAsyncTask(
    (eventId: string, query?: { publication_status?: AdminPublicationStatusFilter }) =>
      getAdminEventMarkets(eventId, query),
  );
  const createEventTask = useAsyncTask((payload: CreateEventRequest) => createAdminEvent(payload));
  const publishEventShellTask = useAsyncTask((eventId: string) => publishAdminEventShell(eventId));
  const createEventMarketsTask = useAsyncTask(
    (eventId: string, payload: CreateEventMarketsRequest) =>
      createAdminEventMarkets(eventId, payload),
  );
  const publishEventMarketsTask = useAsyncTask((eventId: string) =>
    publishAdminEventMarkets(eventId),
  );
  const createEventMarketLadderTask = useAsyncTask(
    (eventId: string, payload: CreateEventMarketLadderRequest) =>
      createAdminEventMarketLadder(eventId, payload),
  );
  const bootstrapEventLiquidityTask = useAsyncTask(
    (eventId: string, payload: BootstrapEventLiquidityRequest) =>
      bootstrapAdminEventLiquidity(eventId, payload),
  );
  const registerNegRiskTask = useAsyncTask(
    (eventId: string, payload: RegisterNegRiskEventRequest) =>
      registerAdminNegRiskEvent(eventId, payload),
  );

  const [createEventError, setCreateEventError] = createSignal<string | null>(null);
  const [recoverDraftError, setRecoverDraftError] = createSignal<string | null>(null);
  const [recoverSelectionError, setRecoverSelectionError] = createSignal<string | null>(null);
  const [publishEventShellError, setPublishEventShellError] = createSignal<string | null>(null);
  const [createEventMarketsError, setCreateEventMarketsError] = createSignal<string | null>(null);
  const [publishEventMarketsError, setPublishEventMarketsError] = createSignal<string | null>(null);
  const [createEventMarketLadderError, setCreateEventMarketLadderError] = createSignal<
    string | null
  >(null);
  const [bootstrapEventLiquidityError, setBootstrapEventLiquidityError] = createSignal<
    string | null
  >(null);
  const [registerNegRiskError, setRegisterNegRiskError] = createSignal<string | null>(null);
  const [activeStep, setActiveStep] = createSignal<EventWorkflowStep>("recover_draft");
  const [recoveryFilter, setRecoveryFilter] = createSignal<AdminPublicationStatusFilter>("draft");
  const [activeEventId, setActiveEventId] = createSignal("");
  const [recoveredEventId, setRecoveredEventId] = createSignal<string | null>(null);
  const [activeEventSlugState, setActiveEventSlugState] = createSignal<string | null>(null);
  const [activeEventPublicationStatusState, setActiveEventPublicationStatusState] = createSignal<
    string | null
  >(null);
  const [copyEventIdFeedback, setCopyEventIdFeedback] = createSignal<string | null>(null);
  const [publishEventMarketsNow, setPublishEventMarketsNow] = createSignal(false);
  const [eventMarketsDrafts, setEventMarketsDrafts] = createSignal<EventMarketDraft[]>([
    createEventMarketDraft(),
  ]);
  const [eventLiquidityDrafts, setEventLiquidityDrafts] = createSignal<EventLiquidityDraft[]>([
    createEventLiquidityDraft(),
  ]);

  function activeEventSlug() {
    return activeEventSlugState();
  }

  function activeEventPublicationStatus() {
    return activeEventPublicationStatusState();
  }

  async function handleCopyActiveEventId() {
    const eventId = activeEventId().trim();

    if (!eventId) {
      return;
    }

    try {
      if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
        setCopyEventIdFeedback("Copy is not available in this browser.");
        return;
      }

      await navigator.clipboard.writeText(eventId);
      setCopyEventIdFeedback("Copied.");
      window.setTimeout(() => setCopyEventIdFeedback(null), 1800);
    } catch {
      setCopyEventIdFeedback("Could not copy the event ID.");
    }
  }

  async function handleRefreshRecoveryList(filter = recoveryFilter()) {
    setRecoverDraftError(null);

    try {
      await listEventsTask.run({
        publication_status: filter,
      });
    } catch (error) {
      setRecoverDraftError(getErrorMessage(error));
    }
  }

  async function handleSelectRecoveredEvent(eventId: string) {
    setRecoverSelectionError(null);

    try {
      const [detail] = await Promise.all([
        getEventTask.run(eventId),
        getEventMarketsTask.run(eventId, {
          publication_status: "all",
        }),
      ]);
      setActiveEventId(eventId);
      setRecoveredEventId(eventId);
      setActiveEventSlugState(detail.event.slug);
      setActiveEventPublicationStatusState(detail.event.publication_status);
      setActiveStep("recover_draft");
    } catch (error) {
      setRecoverSelectionError(getErrorMessage(error));
    }
  }

  onMount(() => {
    void handleRefreshRecoveryList();
  });

  async function handleCreateEventSubmit(event: SubmitEvent) {
    event.preventDefault();

    const form = event.currentTarget as HTMLFormElement;

    setCreateEventError(null);

    try {
      const payload = buildCreateEventPayload(new FormData(form));
      const response = await createEventTask.run(payload);
      setActiveEventId(response.id);
      setRecoveredEventId(null);
      setActiveEventSlugState(response.event.slug);
      setActiveEventPublicationStatusState(response.event.publication_status);
      setActiveStep("manual_markets");
      form.reset();
    } catch (error) {
      setCreateEventError(getErrorMessage(error));
    }
  }

  async function handlePublishEventShellSubmit(event: SubmitEvent) {
    event.preventDefault();

    const form = event.currentTarget as HTMLFormElement;

    setPublishEventShellError(null);

    try {
      const eventId = readRequiredText(new FormData(form), "event_id", "Event ID");
      const response = await publishEventShellTask.run(eventId);
      setActiveEventId(eventId);
      setRecoveredEventId(null);
      setActiveEventSlugState(response.event.slug);
      setActiveEventPublicationStatusState(response.event.publication_status);
      setActiveStep("publish_markets");
    } catch (error) {
      setPublishEventShellError(getErrorMessage(error));
    }
  }

  async function handleCreateEventMarketsSubmit(event: SubmitEvent) {
    event.preventDefault();

    setCreateEventMarketsError(null);

    try {
      const { eventId, payload } = buildCreateEventMarketsSubmission(
        activeEventId(),
        publishEventMarketsNow(),
        eventMarketsDrafts(),
      );
      const response = await createEventMarketsTask.run(eventId, payload);
      const currentStatus = activeEventPublicationStatus();
      setActiveEventId(response.event_id);
      setRecoveredEventId(null);
      setActiveEventSlugState(response.event_slug);
      setActiveStep(
        publishEventMarketsNow()
          ? "liquidity_bootstrap"
          : currentStatus === "published"
            ? "publish_markets"
            : "publish_event",
      );
      setEventMarketsDrafts([createEventMarketDraft()]);
    } catch (error) {
      setCreateEventMarketsError(getErrorMessage(error));
    }
  }

  async function handlePublishEventMarketsSubmit(event: SubmitEvent) {
    event.preventDefault();

    const form = event.currentTarget as HTMLFormElement;

    setPublishEventMarketsError(null);

    try {
      const eventId = readRequiredText(new FormData(form), "event_id", "Event ID");
      const response = await publishEventMarketsTask.run(eventId);
      setActiveEventId(eventId);
      setRecoveredEventId(null);
      setActiveEventSlugState(response.event.slug);
      setActiveEventPublicationStatusState(response.event.publication_status);
      setActiveStep("liquidity_bootstrap");
    } catch (error) {
      setPublishEventMarketsError(getErrorMessage(error));
    }
  }

  async function handleCreateEventMarketLadderSubmit(event: SubmitEvent) {
    event.preventDefault();

    const form = event.currentTarget as HTMLFormElement;

    setCreateEventMarketLadderError(null);

    try {
      const formData = new FormData(form);
      const publishNow = Boolean(formData.get("publish_now"));
      const { eventId, payload } = buildCreateEventMarketLadderSubmission(formData);
      const response = await createEventMarketLadderTask.run(eventId, payload);
      const currentStatus = activeEventPublicationStatus();
      setActiveEventId(response.event_id);
      setRecoveredEventId(null);
      setActiveEventSlugState(response.event_slug);
      setActiveStep(
        publishNow
          ? "liquidity_bootstrap"
          : currentStatus === "published"
            ? "publish_markets"
            : "publish_event",
      );
      form.reset();
    } catch (error) {
      setCreateEventMarketLadderError(getErrorMessage(error));
    }
  }

  async function handleBootstrapEventLiquiditySubmit(event: SubmitEvent) {
    event.preventDefault();

    setBootstrapEventLiquidityError(null);

    try {
      const { eventId, payload } = buildEventLiquidityBootstrapSubmission(
        activeEventId(),
        eventLiquidityDrafts(),
      );
      const response = await bootstrapEventLiquidityTask.run(eventId, payload);
      window.dispatchEvent(new Event(ADMIN_CASH_BALANCE_REFRESH_EVENT));
      setActiveEventId(eventId);
      setRecoveredEventId(null);
      setActiveEventSlugState(response.event.slug);
      setActiveEventPublicationStatusState(response.event.publication_status);
      setEventLiquidityDrafts([createEventLiquidityDraft()]);
    } catch (error) {
      setBootstrapEventLiquidityError(getErrorMessage(error));
    }
  }

  async function handleRegisterNegRiskSubmit(event: SubmitEvent) {
    event.preventDefault();

    const form = event.currentTarget as HTMLFormElement;

    setRegisterNegRiskError(null);

    try {
      const { eventId, payload } = buildRegisterNegRiskSubmission(new FormData(form));
      const response = await registerNegRiskTask.run(eventId, payload);
      setRecoveredEventId(null);
      setActiveEventSlugState(response.event.slug);
      setActiveEventPublicationStatusState(response.event.publication_status);
      setActiveStep("neg_risk");
    } catch (error) {
      setRegisterNegRiskError(getErrorMessage(error));
    }
  }

  function addEventMarketDraft() {
    setEventMarketsDrafts(current => [...current, createEventMarketDraft()]);
  }

  function removeEventMarketDraft(id: string) {
    setEventMarketsDrafts(current => {
      if (current.length === 1) {
        return current;
      }

      return current.filter(draft => draft.id !== id);
    });
  }

  function updateEventMarketDraft(
    id: string,
    field: Exclude<keyof EventMarketDraft, "id">,
    value: string,
  ) {
    setEventMarketsDrafts(current =>
      current.map(draft => (draft.id === id ? { ...draft, [field]: value } : draft)),
    );
  }

  function addEventLiquidityDraft() {
    setEventLiquidityDrafts(current => [...current, createEventLiquidityDraft()]);
  }

  function removeEventLiquidityDraft(id: string) {
    setEventLiquidityDrafts(current => {
      if (current.length === 1) {
        return current;
      }

      return current.filter(draft => draft.id !== id);
    });
  }

  function updateEventLiquidityDraft(
    id: string,
    field: Exclude<keyof EventLiquidityDraft, "id">,
    value: string,
  ) {
    setEventLiquidityDrafts(current =>
      current.map(draft => (draft.id === id ? { ...draft, [field]: value } : draft)),
    );
  }

  return (
    <div class="pm-tool-stack">
      <Show when={activeEventId()}>
        {eventId => (
          <section class="pm-market-session">
            <div>
              <p class="pm-market-session__eyebrow">Active Event</p>
              <h2 class="pm-market-session__title">{activeEventSlug() ?? "Event selected"}</h2>
              <p class="pm-market-session__meta">
                Admin event ID (UUID): <span class="pm-market-session__value">{eventId()}</span>
              </p>
              <p class="pm-market-session__meta">
                This UUID is auto-filled into the create, publish, liquidity, and neg-risk steps
                below.
              </p>
              <Show when={copyEventIdFeedback()}>
                {message => <p class="pm-market-session__meta">{message()}</p>}
              </Show>
            </div>

            <div class="pm-market-session__chips">
              <Show when={activeEventPublicationStatus()}>
                {status => <span class="pm-market-chip">{status()}</span>}
              </Show>
              <button class="pm-button pm-button--ghost" type="button" onClick={handleCopyActiveEventId}>
                Copy event ID
              </button>
            </div>
          </section>
        )}
      </Show>

      <section class="pm-workflow-nav">
        <For each={eventWorkflowSteps}>
          {item => (
            <button
              class={`pm-workflow-nav__item${
                activeStep() === item.id ? " pm-workflow-nav__item--active" : ""
              }`}
              type="button"
              onClick={() => setActiveStep(item.id)}
            >
              <span class="pm-workflow-nav__step">{item.step}</span>
              <span class="pm-workflow-nav__title">{item.title}</span>
              <span class="pm-workflow-nav__copy">{item.copy}</span>
            </button>
          )}
        </For>
      </section>

      <Show when={activeStep() === "recover_draft"}>
        <section class="pm-market-card pm-market-card--wide">
          <div class="pm-market-card__header">
            <div>
              <p class="pm-market-card__eyebrow">Step 00 • GET /admin/events</p>
              <h2 class="pm-market-card__title">Recover Draft Event</h2>
            </div>
            <span class="pm-market-card__hint">After refresh</span>
          </div>

          <p class="pm-market-card__copy">
            Reload a draft or published event, restore its admin UUID, inspect its child markets,
            and continue from the correct publish step without hunting through old responses.
          </p>

          <div class="pm-recovery-toolbar">
            <div class="pm-filter-group">
              <For each={(["draft", "published", "all"] as const)}>
                {filter => (
                  <button
                    class={`pm-filter-group__button${
                      recoveryFilter() === filter ? " pm-filter-group__button--active" : ""
                    }`}
                    type="button"
                    onClick={() => {
                      setRecoveryFilter(filter);
                      void handleRefreshRecoveryList(filter);
                    }}
                  >
                    {filter}
                  </button>
                )}
              </For>
            </div>

            <div class="pm-market-actions pm-market-actions--group">
              <button
                class="pm-button pm-button--ghost"
                type="button"
                disabled={listEventsTask.pending()}
                onClick={() => void handleRefreshRecoveryList()}
              >
                {listEventsTask.pending() ? "Refreshing..." : "Refresh list"}
              </button>

              <button
                class="pm-button pm-button--ghost"
                type="button"
                onClick={() => setActiveStep("event_shell")}
              >
                Create new event
              </button>
            </div>
          </div>

          <Show when={recoverDraftError()}>
            {message => <p class="pm-market-feedback pm-market-feedback--error">{message()}</p>}
          </Show>

          <Show
            when={(listEventsTask.data()?.events.length ?? 0) > 0}
            fallback={
              <Show
                when={!recoverDraftError()}
                fallback={<p class="pm-market-feedback">Admin event recovery is unavailable.</p>}
              >
                <p class="pm-market-feedback">
                  {listEventsTask.pending()
                    ? "Loading admin events..."
                    : "No admin events matched this filter."}
                </p>
              </Show>
            }
          >
            <div class="pm-recovery-list">
              <For each={listEventsTask.data()?.events ?? []}>
                {item => (
                  <button
                    class={`pm-recovery-card${
                      activeEventId() === item.id ? " pm-recovery-card--active" : ""
                    }`}
                    type="button"
                    onClick={() => void handleSelectRecoveredEvent(item.id)}
                  >
                    <div class="pm-recovery-card__header">
                      <div>
                        <p class="pm-market-card__eyebrow">{item.publication_status}</p>
                        <h3 class="pm-market-repeater__title">{item.slug}</h3>
                      </div>
                      <span class="pm-market-card__hint">{item.market_count} markets</span>
                    </div>

                    <p class="pm-recovery-card__meta">UUID: {item.id}</p>
                    <p class="pm-recovery-card__meta">
                      {item.title} • {item.category_slug}
                    </p>
                    <p class="pm-recovery-card__meta">
                      Created {formatTimestamp(item.created_at)}
                    </p>
                  </button>
                )}
              </For>
            </div>
          </Show>

          <Show when={recoverSelectionError()}>
            {message => <p class="pm-market-feedback pm-market-feedback--error">{message()}</p>}
          </Show>

          <Show
            when={
              recoveredEventId() &&
              recoveredEventId() === activeEventId() &&
              getEventTask.data() &&
              getEventMarketsTask.data()
            }
          >
            {() => (
              <RecoverySelectionResult
                eventId={activeEventId()}
                detail={getEventTask.data()!}
                markets={getEventMarketsTask.data()!}
                onContinue={step => setActiveStep(step)}
              />
            )}
          </Show>
        </section>
      </Show>

      <Show when={activeStep() === "event_shell"}>
      <section class="pm-market-card pm-market-card--wide">
        <div class="pm-market-card__header">
          <div>
            <p class="pm-market-card__eyebrow">Step 1 • POST /admin/events</p>
            <h2 class="pm-market-card__title">Create event shell</h2>
          </div>
          <span class="pm-market-card__hint">Event first</span>
        </div>

        <p class="pm-market-card__copy">
          This creates the parent event only. Child markets are added in the next step either
          manually through `/admin/events/{'{event_id}'}/markets` or by template through
          `/admin/events/{'{event_id}'}/markets/ladders`.
        </p>

        <form class="pm-market-form" onSubmit={handleCreateEventSubmit}>
          <div class="pm-market-fields">
            <label class="pm-field">
              <span class="pm-field__label">Title</span>
              <input class="pm-field__input" name="title" type="text" required />
            </label>

            <label class="pm-field">
              <span class="pm-field__label">Slug</span>
              <input class="pm-field__input" name="slug" type="text" required />
            </label>

            <label class="pm-field">
              <span class="pm-field__label">Category slug</span>
              <input class="pm-field__input" name="category_slug" type="text" required />
            </label>

            <label class="pm-field">
              <span class="pm-field__label">Subcategory slug</span>
              <input class="pm-field__input" name="subcategory_slug" type="text" />
            </label>

            <label class="pm-field">
              <span class="pm-field__label">Starts at</span>
              <input class="pm-field__input" name="starts_at" type="datetime-local" />
            </label>

            <label class="pm-field">
              <span class="pm-field__label">Sort at</span>
              <input class="pm-field__input" name="sort_at" type="datetime-local" />
            </label>

            <label class="pm-field">
              <span class="pm-field__label">Group key</span>
              <input class="pm-field__input" name="group_key" type="text" required />
            </label>

            <label class="pm-field">
              <span class="pm-field__label">Series key</span>
              <input class="pm-field__input" name="series_key" type="text" required />
            </label>

            <AdminImageUrlField name="image_url" scope="events" />

            <label class="pm-checkbox">
              <input name="neg_risk" type="checkbox" />
              <span>Neg-risk event</span>
            </label>

            <label class="pm-field pm-field--full">
              <span class="pm-field__label">Summary</span>
              <textarea class="pm-field__textarea" name="summary" rows="3" />
            </label>

            <label class="pm-field pm-field--full">
              <span class="pm-field__label">Tag slugs</span>
              <textarea
                class="pm-field__textarea"
                name="tag_slugs"
                rows="3"
                placeholder={"crypto\nmacro"}
              />
            </label>

            <label class="pm-field pm-field--full">
              <span class="pm-field__label">Context</span>
              <textarea class="pm-field__textarea" name="context" rows="4" />
            </label>

            <label class="pm-field pm-field--full">
              <span class="pm-field__label">Additional context</span>
              <textarea class="pm-field__textarea" name="additional_context" rows="4" />
            </label>

            <label class="pm-field pm-field--full">
              <span class="pm-field__label">Rules</span>
              <textarea class="pm-field__textarea" name="rules" rows="5" required />
            </label>

            <label class="pm-field pm-field--full">
              <span class="pm-field__label">Resolution sources</span>
              <textarea
                class="pm-field__textarea"
                name="resolution_sources"
                rows="3"
                placeholder={"https://source.one\nhttps://source.two"}
              />
            </label>

            <label class="pm-field">
              <span class="pm-field__label">Resolution timezone</span>
              <input
                class="pm-field__input"
                name="resolution_timezone"
                type="text"
                placeholder="UTC"
              />
            </label>

            <label class="pm-checkbox">
              <input name="featured" type="checkbox" />
              <span>Featured</span>
            </label>

            <label class="pm-checkbox">
              <input name="breaking" type="checkbox" />
              <span>Breaking</span>
            </label>

            <label class="pm-checkbox">
              <input name="searchable" type="checkbox" checked />
              <span>Searchable</span>
            </label>

            <label class="pm-checkbox">
              <input name="visible" type="checkbox" checked />
              <span>Visible</span>
            </label>

            <label class="pm-checkbox pm-field--full">
              <input name="hide_resolved_by_default" type="checkbox" />
              <span>Hide resolved by default</span>
            </label>

            <label class="pm-checkbox pm-field--full">
              <input name="publish_now" type="checkbox" />
              <span>Publish event immediately</span>
            </label>
          </div>

          <div class="pm-market-actions">
            <button
              class="pm-button pm-button--primary"
              type="submit"
              disabled={createEventTask.pending()}
            >
              {createEventTask.pending() ? "Creating..." : "Create event shell"}
            </button>
          </div>

          <Show when={createEventError()}>
            {message => <p class="pm-market-feedback pm-market-feedback--error">{message()}</p>}
          </Show>
        </form>

        <Show when={createEventTask.data()}>
          {response => <EventCreateResult response={response()} />}
        </Show>
      </section>
      </Show>

      <Show when={activeStep() === "manual_markets"}>
      <section class="pm-market-card pm-market-card--wide">
        <div class="pm-market-card__header">
          <div>
            <p class="pm-market-card__eyebrow">
              Step 2A • POST /admin/events/{'{event_id}'}/markets
            </p>
            <h2 class="pm-market-card__title">Add sibling markets manually</h2>
          </div>
          <span class="pm-market-card__hint">Custom batch</span>
        </div>

        <p class="pm-market-card__copy">
          Use this when each child market needs its own label, slug, question, or oracle settings.
          If you publish here, the parent event must already be published.
        </p>

        <form class="pm-market-form" onSubmit={handleCreateEventMarketsSubmit}>
          <div class="pm-market-fields">
            <label class="pm-field pm-field--full">
              <span class="pm-field__label">Event ID</span>
              <input
                class="pm-field__input"
                name="event_id"
                type="text"
                value={activeEventId()}
                onInput={event => setActiveEventId(event.currentTarget.value)}
                required
              />
            </label>
          </div>

          <div class="pm-market-repeater">
            <For each={eventMarketsDrafts()}>
              {(draft, index) => (
                <section class="pm-market-repeater__card">
                  <div class="pm-market-repeater__header">
                    <div>
                      <p class="pm-market-card__eyebrow">Market {index() + 1}</p>
                      <h3 class="pm-market-repeater__title">
                        {draft.label.trim() || `Untitled market ${index() + 1}`}
                      </h3>
                    </div>

                    <button
                      class="pm-button pm-button--ghost"
                      type="button"
                      disabled={eventMarketsDrafts().length === 1}
                      onClick={() => removeEventMarketDraft(draft.id)}
                    >
                      Remove
                    </button>
                  </div>

                  <div class="pm-market-fields">
                    <label class="pm-field">
                      <span class="pm-field__label">Label</span>
                      <input
                        class="pm-field__input"
                        type="text"
                        value={draft.label}
                        onInput={event =>
                          updateEventMarketDraft(draft.id, "label", event.currentTarget.value)
                        }
                        required
                      />
                    </label>

                    <label class="pm-field">
                      <span class="pm-field__label">Slug</span>
                      <input
                        class="pm-field__input"
                        type="text"
                        value={draft.slug}
                        onInput={event =>
                          updateEventMarketDraft(draft.id, "slug", event.currentTarget.value)
                        }
                        required
                      />
                    </label>

                    <label class="pm-field pm-field--full">
                      <span class="pm-field__label">Question</span>
                      <textarea
                        class="pm-field__textarea"
                        rows="3"
                        value={draft.question}
                        onInput={event =>
                          updateEventMarketDraft(draft.id, "question", event.currentTarget.value)
                        }
                        required
                      />
                    </label>

                    <label class="pm-field">
                      <span class="pm-field__label">End time</span>
                      <input
                        class="pm-field__input"
                        type="datetime-local"
                        value={draft.end_time}
                        onInput={event =>
                          updateEventMarketDraft(draft.id, "end_time", event.currentTarget.value)
                        }
                        required
                      />
                    </label>

                    <label class="pm-field">
                      <span class="pm-field__label">Oracle address</span>
                      <input
                        class="pm-field__input"
                        type="text"
                        placeholder="0x..."
                        value={draft.oracle_address}
                        onInput={event =>
                          updateEventMarketDraft(
                            draft.id,
                            "oracle_address",
                            event.currentTarget.value,
                          )
                        }
                        required
                      />
                    </label>

                    <label class="pm-field">
                      <span class="pm-field__label">Sort order</span>
                      <input
                        class="pm-field__input"
                        type="number"
                        step="1"
                        placeholder={`${index() + 1}`}
                        value={draft.sort_order}
                        onInput={event =>
                          updateEventMarketDraft(draft.id, "sort_order", event.currentTarget.value)
                        }
                      />
                    </label>

                    <label class="pm-field pm-field--full">
                      <span class="pm-field__label">Outcomes</span>
                      <textarea
                        class="pm-field__textarea"
                        rows="3"
                        value={draft.outcomes}
                        onInput={event =>
                          updateEventMarketDraft(draft.id, "outcomes", event.currentTarget.value)
                        }
                      />
                    </label>
                  </div>
                </section>
              )}
            </For>
          </div>

          <div class="pm-market-actions pm-market-actions--split">
            <button class="pm-button pm-button--ghost" type="button" onClick={addEventMarketDraft}>
              Add another market
            </button>

            <button
              class="pm-button pm-button--primary"
              type="submit"
              disabled={createEventMarketsTask.pending()}
            >
              {createEventMarketsTask.pending() ? "Creating..." : "Add event markets"}
            </button>
          </div>

          <label class="pm-checkbox">
            <input
              type="checkbox"
              checked={publishEventMarketsNow()}
              onChange={event => setPublishEventMarketsNow(event.currentTarget.checked)}
            />
            <span>Publish these markets immediately</span>
          </label>

          <Show when={createEventMarketsError()}>
            {message => (
              <p class="pm-market-feedback pm-market-feedback--error">{message()}</p>
            )}
          </Show>
        </form>

        <Show when={createEventMarketsTask.data()}>
          {response => <EventMarketsResult response={response()} />}
        </Show>
      </section>
      </Show>

      <Show when={activeStep() === "ladder_markets"}>
      <section class="pm-market-card pm-market-card--wide">
        <div class="pm-market-card__header">
          <div>
            <p class="pm-market-card__eyebrow">
              Step 2B • POST /admin/events/{'{event_id}'}/markets/ladders
            </p>
            <h2 class="pm-market-card__title">Generate ladder markets</h2>
          </div>
          <span class="pm-market-card__hint">Template batch</span>
        </div>

        <p class="pm-market-card__copy">
          This endpoint generates sibling Yes/No markets from threshold lists, then inserts them
          under the same event. Use it for price ladders instead of hand-writing every market.
        </p>

        <form class="pm-market-form" onSubmit={handleCreateEventMarketLadderSubmit}>
          <div class="pm-market-fields">
            <label class="pm-field pm-field--full">
              <span class="pm-field__label">Event ID</span>
              <input
                class="pm-field__input"
                name="event_id"
                type="text"
                value={activeEventId()}
                onInput={event => setActiveEventId(event.currentTarget.value)}
                required
              />
            </label>

            <label class="pm-field">
              <span class="pm-field__label">Underlying</span>
              <input
                class="pm-field__input"
                name="underlying"
                type="text"
                placeholder="BTC"
                required
              />
            </label>

            <label class="pm-field">
              <span class="pm-field__label">Deadline label</span>
              <input
                class="pm-field__input"
                name="deadline_label"
                type="text"
                placeholder="April 10 close"
                required
              />
            </label>

            <label class="pm-field">
              <span class="pm-field__label">End time</span>
              <input class="pm-field__input" name="end_time" type="datetime-local" required />
            </label>

            <label class="pm-field">
              <span class="pm-field__label">Oracle address</span>
              <input
                class="pm-field__input"
                name="oracle_address"
                type="text"
                placeholder="0x..."
                required
              />
            </label>

            <label class="pm-field">
              <span class="pm-field__label">Unit symbol</span>
              <input class="pm-field__input" name="unit_symbol" type="text" placeholder="$" />
            </label>

            <label class="pm-field pm-field--full">
              <span class="pm-field__label">Up thresholds</span>
              <textarea
                class="pm-field__textarea"
                name="up_thresholds"
                rows="4"
                placeholder={"85000\n90000"}
              />
            </label>

            <label class="pm-field pm-field--full">
              <span class="pm-field__label">Down thresholds</span>
              <textarea
                class="pm-field__textarea"
                name="down_thresholds"
                rows="4"
                placeholder={"75000\n70000"}
              />
            </label>

            <p class="pm-market-feedback pm-field--full">
              The backend generates sequential sort order, uses Yes/No outcomes, and builds labels
              like `↑ $85000` or `↓ $70000` from these threshold lists.
            </p>

            <label class="pm-checkbox pm-field--full">
              <input name="publish_now" type="checkbox" />
              <span>Publish these ladder markets immediately</span>
            </label>
          </div>

          <div class="pm-market-actions">
            <button
              class="pm-button pm-button--primary"
              type="submit"
              disabled={createEventMarketLadderTask.pending()}
            >
              {createEventMarketLadderTask.pending() ? "Generating..." : "Generate ladder markets"}
            </button>
          </div>

          <Show when={createEventMarketLadderError()}>
            {message => (
              <p class="pm-market-feedback pm-market-feedback--error">{message()}</p>
            )}
          </Show>
        </form>

        <Show when={createEventMarketLadderTask.data()}>
          {response => <EventMarketsResult response={response()} />}
        </Show>
      </section>
      </Show>

      <Show when={activeStep() === "publish_event"}>
      <section class="pm-market-card">
        <div class="pm-market-card__header">
          <div>
            <p class="pm-market-card__eyebrow">Step 3 • POST /admin/events/{'{event_id}'}/publish</p>
            <h2 class="pm-market-card__title">Publish event shell</h2>
          </div>
          <span class="pm-market-card__hint">On-chain event</span>
        </div>

        <p class="pm-market-card__copy">
          Publish the parent event first. This endpoint is idempotent, so calling it again on an
          already-published event just returns the current published event state.
        </p>

        <form class="pm-market-form" onSubmit={handlePublishEventShellSubmit}>
          <div class="pm-market-fields">
            <label class="pm-field pm-field--full">
              <span class="pm-field__label">Event ID</span>
              <input
                class="pm-field__input"
                name="event_id"
                type="text"
                value={activeEventId()}
                onInput={event => setActiveEventId(event.currentTarget.value)}
                required
              />
            </label>
          </div>

          <div class="pm-market-actions">
            <button
              class="pm-button pm-button--primary"
              type="submit"
              disabled={publishEventShellTask.pending()}
            >
              {publishEventShellTask.pending() ? "Publishing..." : "Publish event shell"}
            </button>
          </div>

          <Show when={publishEventShellError()}>
            {message => <p class="pm-market-feedback pm-market-feedback--error">{message()}</p>}
          </Show>
        </form>

        <Show when={publishEventShellTask.data()}>
          {response => <EventPublishResult response={response()} />}
        </Show>
      </section>
      </Show>

      <Show when={activeStep() === "publish_markets"}>
      <section class="pm-market-card pm-market-card--wide">
        <div class="pm-market-card__header">
          <div>
            <p class="pm-market-card__eyebrow">
              Step 4 • POST /admin/events/{'{event_id}'}/markets/publish
            </p>
            <h2 class="pm-market-card__title">Publish child markets</h2>
          </div>
          <span class="pm-market-card__hint">Batch publish</span>
        </div>

        <p class="pm-market-card__copy">
          This publishes all draft child markets under the event and fills their `condition_id`
          values. The parent event must already be published, and any ended draft market will block
          the batch.
        </p>

        <form class="pm-market-form" onSubmit={handlePublishEventMarketsSubmit}>
          <div class="pm-market-fields">
            <label class="pm-field pm-field--full">
              <span class="pm-field__label">Event ID</span>
              <input
                class="pm-field__input"
                name="event_id"
                type="text"
                value={activeEventId()}
                onInput={event => setActiveEventId(event.currentTarget.value)}
                required
              />
            </label>
          </div>

          <div class="pm-market-actions">
            <button
              class="pm-button pm-button--primary"
              type="submit"
              disabled={publishEventMarketsTask.pending()}
            >
              {publishEventMarketsTask.pending() ? "Publishing..." : "Publish child markets"}
            </button>
          </div>

          <Show when={publishEventMarketsError()}>
            {message => <p class="pm-market-feedback pm-market-feedback--error">{message()}</p>}
          </Show>
        </form>

        <Show when={publishEventMarketsTask.data()}>
          {response => <EventPublishMarketsResult response={response()} />}
        </Show>
      </section>
      </Show>

      <Show when={activeStep() === "liquidity_bootstrap"}>
      <section class="pm-market-card pm-market-card--wide">
        <div class="pm-market-card__header">
          <div>
            <p class="pm-market-card__eyebrow">
              Step 5 • POST /admin/events/{'{event_id}'}/liquidity/bootstrap
            </p>
            <h2 class="pm-market-card__title">Bootstrap event liquidity</h2>
          </div>
          <span class="pm-market-card__hint">Optional batch</span>
        </div>

        <p class="pm-market-card__copy">
          Optionally bootstrap liquidity across published child markets in one request. Each row
          targets one child market and must use a Yes/No price split that totals 10000 bps. USDC
          amounts are entered in dollars and converted to raw 6-decimal base units before the
          request is sent.
        </p>

        <form class="pm-market-form" onSubmit={handleBootstrapEventLiquiditySubmit}>
          <div class="pm-market-fields">
            <label class="pm-field pm-field--full">
              <span class="pm-field__label">Event ID</span>
              <input
                class="pm-field__input"
                name="event_id"
                type="text"
                value={activeEventId()}
                onInput={event => setActiveEventId(event.currentTarget.value)}
                required
              />
            </label>
          </div>

          <div class="pm-market-repeater">
            <For each={eventLiquidityDrafts()}>
              {(draft, index) => (
                <section class="pm-market-repeater__card">
                  <div class="pm-market-repeater__header">
                    <div>
                      <p class="pm-market-card__eyebrow">Bootstrap {index() + 1}</p>
                      <h3 class="pm-market-repeater__title">
                        {draft.market_id.trim() || `Child market ${index() + 1}`}
                      </h3>
                    </div>

                    <button
                      class="pm-button pm-button--ghost"
                      type="button"
                      disabled={eventLiquidityDrafts().length === 1}
                      onClick={() => removeEventLiquidityDraft(draft.id)}
                    >
                      Remove
                    </button>
                  </div>

                  <div class="pm-market-fields">
                    <label class="pm-field pm-field--full">
                      <span class="pm-field__label">Market ID</span>
                      <input
                        class="pm-field__input"
                        type="text"
                        value={draft.market_id}
                        onInput={event =>
                          updateEventLiquidityDraft(draft.id, "market_id", event.currentTarget.value)
                        }
                        required
                      />
                    </label>

                    <label class="pm-field">
                      <span class="pm-field__label">Yes price bps</span>
                      <input
                        class="pm-field__input"
                        type="number"
                        min="1"
                        max="9999"
                        step="1"
                        placeholder="120"
                        value={draft.yes_bps}
                        onInput={event =>
                          updateEventLiquidityDraft(draft.id, "yes_bps", event.currentTarget.value)
                        }
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
                        placeholder="9880"
                        value={draft.no_bps}
                        onInput={event =>
                          updateEventLiquidityDraft(draft.id, "no_bps", event.currentTarget.value)
                        }
                        required
                      />
                    </label>

                    <label class="pm-field">
                      <span class="pm-field__label">Inventory USDC amount (dollars)</span>
                      <input
                        class="pm-field__input"
                        type="text"
                        inputmode="decimal"
                        placeholder="1500"
                        value={draft.inventory_usdc_amount}
                        onInput={event =>
                          updateEventLiquidityDraft(
                            draft.id,
                            "inventory_usdc_amount",
                            event.currentTarget.value,
                          )
                        }
                        required
                      />
                    </label>

                    <label class="pm-field">
                      <span class="pm-field__label">Exit collateral USDC amount (dollars)</span>
                      <input
                        class="pm-field__input"
                        type="text"
                        inputmode="decimal"
                        placeholder="0"
                        value={draft.exit_collateral_usdc_amount}
                        onInput={event =>
                          updateEventLiquidityDraft(
                            draft.id,
                            "exit_collateral_usdc_amount",
                            event.currentTarget.value,
                          )
                        }
                        required
                      />
                    </label>
                  </div>
                </section>
              )}
            </For>
          </div>

          <p class="pm-market-feedback">
            Example: entering `1500` sends `1500000000` base units.
          </p>

          <div class="pm-market-actions pm-market-actions--split">
            <button class="pm-button pm-button--ghost" type="button" onClick={addEventLiquidityDraft}>
              Add another market
            </button>

            <button
              class="pm-button pm-button--primary"
              type="submit"
              disabled={bootstrapEventLiquidityTask.pending()}
            >
              {bootstrapEventLiquidityTask.pending()
                ? "Bootstrapping..."
                : "Bootstrap event liquidity"}
            </button>
          </div>

          <Show when={bootstrapEventLiquidityError()}>
            {message => (
              <p class="pm-market-feedback pm-market-feedback--error">{message()}</p>
            )}
          </Show>
        </form>

        <Show when={bootstrapEventLiquidityTask.data()}>
          {response => <EventLiquidityBootstrapResult response={response()} />}
        </Show>
      </section>
      </Show>

      <Show when={activeStep() === "neg_risk"}>
      <section class="pm-market-card">
        <div class="pm-market-card__header">
          <div>
            <p class="pm-market-card__eyebrow">
              Step 6 • POST /admin/events/{'{event_id}'}/neg-risk/register
            </p>
            <h2 class="pm-market-card__title">Register neg-risk</h2>
          </div>
          <span class="pm-market-card__hint">Published only</span>
        </div>

        <p class="pm-market-card__copy">
          This only works when the event is marked neg-risk, already published, and has at least
          two child markets.
        </p>

        <form class="pm-market-form" onSubmit={handleRegisterNegRiskSubmit}>
          <div class="pm-market-fields">
            <label class="pm-field pm-field--full">
              <span class="pm-field__label">Event ID</span>
              <input
                class="pm-field__input"
                name="event_id"
                type="text"
                value={activeEventId()}
                onInput={event => setActiveEventId(event.currentTarget.value)}
                required
              />
            </label>

            <label class="pm-field pm-field--full">
              <span class="pm-field__label">Other market ID</span>
              <input
                class="pm-field__input"
                name="other_market_id"
                type="text"
                placeholder="Optional paired market ID"
              />
            </label>
          </div>

          <div class="pm-market-actions">
            <button
              class="pm-button pm-button--primary"
              type="submit"
              disabled={registerNegRiskTask.pending()}
            >
              {registerNegRiskTask.pending() ? "Registering..." : "Register neg-risk"}
            </button>
          </div>

          <Show when={registerNegRiskError()}>
            {message => <p class="pm-market-feedback pm-market-feedback--error">{message()}</p>}
          </Show>
        </form>

        <Show when={registerNegRiskTask.data()}>
          {response => <NegRiskResult response={response()} />}
        </Show>
      </section>
      </Show>
    </div>
  );
}
