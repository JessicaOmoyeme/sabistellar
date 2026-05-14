import { For, Show, createSignal, onMount } from "solid-js";

import {
  listAdminEvents,
  createAdminEvent,
  createAdminEventMarkets,
  createAdminEventMarketLadder,
  createAdminMarket,
  publishAdminEventMarkets,
  publishAdminEventShell,
  type AdminPublicationStatusFilter,
  type CreateEventMarketLadderRequest,
  type CreateEventMarketsRequest,
  type CreateEventMarketsResponse,
  type CreateEventRequest,
  type CreateEventResponse,
  type EventDetailResponse,
  type EventMarketsResponse,
  type CreateMarketRequest,
  type CreateMarketResponse,
} from "~/lib/api/admin";
import { getErrorMessage } from "~/lib/api/core";
import { useAsyncTask } from "~/lib/hooks/useAsyncTask";

import AdminImageUrlField from "./AdminImageUrlField";

export type MarketCreationModalType = "single_binary" | "multi_market_event" | "ladder_market";
export type MultiMarketEventStep =
  | "event_shell"
  | "manual_markets"
  | "ladder_markets"
  | "publish_event"
  | "publish_markets";

export interface MarketCreationModalInitialEvent {
  id: string;
  slug: string | null;
  publicationStatus?: string | null;
  step?: MultiMarketEventStep;
}

interface AdminMarketCreationModalProps {
  type: MarketCreationModalType;
  initialEvent?: MarketCreationModalInitialEvent;
  onBack: () => void;
  onClose: () => void;
}

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

interface StoredActiveEvent {
  id: string;
  slug: string | null;
  publication_status: string | null;
}

const ACTIVE_MULTI_MARKET_EVENT_STORAGE_KEY = "pm-admin-active-multi-market-event";

let nextEventMarketDraftId = 0;

function createEventMarketDraft(): EventMarketDraft {
  nextEventMarketDraftId += 1;

  return {
    id: `modal-event-market-draft-${nextEventMarketDraftId}`,
    label: "",
    slug: "",
    question: "",
    end_time: "",
    oracle_address: "",
    outcomes: "Yes\nNo",
    sort_order: "",
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

function readStringList(formData: FormData, key: string) {
  const rawValue = String(formData.get(key) ?? "");

  const values = rawValue
    .split(/\r?\n|,/)
    .map(value => value.trim())
    .filter(Boolean);

  return values.length > 0 ? values : undefined;
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

function buildCreateMarketPayload(formData: FormData): CreateMarketRequest {
  const market: CreateMarketRequest["market"] = {
    title: readRequiredText(formData, "title", "Title"),
    slug: readRequiredText(formData, "slug", "Slug"),
    category_slug: readRequiredText(formData, "category_slug", "Category slug"),
    rules: readRequiredText(formData, "rules", "Rules"),
    end_time: readDateTimeValue(formData, "end_time", "End time", {
      required: true,
    })!,
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
    ...(readDateTimeValue(formData, "sort_at", "Sort at")
      ? { sort_at: readDateTimeValue(formData, "sort_at", "Sort at")! }
      : {}),
    ...(readStringList(formData, "outcomes")
      ? { outcomes: readStringList(formData, "outcomes")! }
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

  const chain: CreateMarketRequest["chain"] = {
    oracle_address: readRequiredText(formData, "oracle_address", "Oracle address"),
    ...(formData.get("neg_risk") ? { neg_risk: true } : {}),
  };

  return {
    market,
    chain,
    ...(formData.get("publish_now") ? { publish: { mode: "publish" as const } } : {}),
  };
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

function formatTimestamp(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function readStoredActiveEvent(): StoredActiveEvent | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(ACTIVE_MULTI_MARKET_EVENT_STORAGE_KEY);

    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as {
      id?: unknown;
      slug?: unknown;
    };

    if (typeof parsed.id !== "string" || !parsed.id.trim()) {
      return null;
    }

    return {
      id: parsed.id.trim(),
      slug: typeof parsed.slug === "string" && parsed.slug.trim() ? parsed.slug.trim() : null,
      publication_status:
        typeof parsed.publication_status === "string" && parsed.publication_status.trim()
          ? parsed.publication_status.trim()
          : null,
    };
  } catch {
    return null;
  }
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

function getModalMeta(type: MarketCreationModalType) {
  switch (type) {
    case "single_binary":
      return {
        eyebrow: "Create",
        title: "Single Binary Market",
        copy: "Create one standalone Yes/No market. This form uses the existing image upload endpoint for the market image field.",
      };
    case "multi_market_event":
      return {
        eyebrow: "Create",
        title: "Multi-Market Event",
        copy: "Create the parent event shell first, then continue inside this modal with manual child markets or ladder generation.",
      };
    case "ladder_market":
      return {
        eyebrow: "Create",
        title: "Ladder Market",
        copy: "Generate threshold-based sibling markets under an existing event shell. Start with the event ID you want to attach them to.",
      };
  }
}

function CreatedMarketResult(props: { response: CreateMarketResponse }) {
  return (
    <section class="pm-market-result">
      <div class="pm-market-result__header">
        <div>
          <p class="pm-market-result__eyebrow">Created</p>
          <h3 class="pm-market-result__title">{props.response.market.slug}</h3>
        </div>
        <span class="pm-market-result__badge">{props.response.market.publication_status}</span>
      </div>

      <div class="pm-market-result__grid">
        <div>
          <span class="pm-market-result__label">Market ID</span>
          <span class="pm-market-result__value">{props.response.market.id}</span>
        </div>
        <div>
          <span class="pm-market-result__label">Wrapper event</span>
          <span class="pm-market-result__value">{props.response.event.slug}</span>
        </div>
        <div>
          <span class="pm-market-result__label">Question ID</span>
          <span class="pm-market-result__value">{props.response.market.question_id}</span>
        </div>
        <div>
          <span class="pm-market-result__label">Created</span>
          <span class="pm-market-result__value">{formatTimestamp(props.response.created_at)}</span>
        </div>
      </div>
    </section>
  );
}

function CreatedEventResult(props: { response: CreateEventResponse }) {
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

function LadderResult(props: { response: CreateEventMarketsResponse }) {
  return (
    <section class="pm-market-result">
      <div class="pm-market-result__header">
        <div>
          <p class="pm-market-result__eyebrow">Generated</p>
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
          <span class="pm-market-result__label">Market slugs</span>
          <span class="pm-market-result__value">
            {props.response.markets.map(market => market.slug).join(", ")}
          </span>
        </div>
      </div>
    </section>
  );
}

function ChildMarketsResult(props: { response: CreateEventMarketsResponse }) {
  return (
    <section class="pm-market-result">
      <div class="pm-market-result__header">
        <div>
          <p class="pm-market-result__eyebrow">Child Markets Added</p>
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
          <span class="pm-market-result__label">Market slugs</span>
          <span class="pm-market-result__value">
            {props.response.markets.map(market => market.slug).join(", ")}
          </span>
        </div>
      </div>
    </section>
  );
}

function PublishedEventResult(props: { response: EventDetailResponse }) {
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
          <span class="pm-market-result__value">
            {props.response.on_chain.tx_hash ?? "Already published"}
          </span>
        </div>
      </div>
    </section>
  );
}

function PublishedChildMarketsResult(props: { response: EventMarketsResponse }) {
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

export default function AdminMarketCreationModal(props: AdminMarketCreationModalProps) {
  const listEventsTask = useAsyncTask((query: { publication_status?: AdminPublicationStatusFilter }) =>
    listAdminEvents(query),
  );
  const createMarketTask = useAsyncTask((payload: CreateMarketRequest) => createAdminMarket(payload));
  const createEventTask = useAsyncTask((payload: CreateEventRequest) => createAdminEvent(payload));
  const createEventMarketsTask = useAsyncTask(
    (eventId: string, payload: CreateEventMarketsRequest) =>
      createAdminEventMarkets(eventId, payload),
  );
  const publishEventTask = useAsyncTask((eventId: string) => publishAdminEventShell(eventId));
  const publishEventMarketsTask = useAsyncTask((eventId: string) =>
    publishAdminEventMarkets(eventId),
  );
  const createLadderTask = useAsyncTask(
    (eventId: string, payload: CreateEventMarketLadderRequest) =>
      createAdminEventMarketLadder(eventId, payload),
  );
  const [marketError, setMarketError] = createSignal<string | null>(null);
  const [eventError, setEventError] = createSignal<string | null>(null);
  const [eventMarketsError, setEventMarketsError] = createSignal<string | null>(null);
  const [publishEventError, setPublishEventError] = createSignal<string | null>(null);
  const [publishEventMarketsError, setPublishEventMarketsError] = createSignal<string | null>(null);
  const [ladderError, setLadderError] = createSignal<string | null>(null);
  const [recoveryError, setRecoveryError] = createSignal<string | null>(null);
  const [recoveryFilter, setRecoveryFilter] = createSignal<AdminPublicationStatusFilter>("draft");
  const [multiMarketEventStep, setMultiMarketEventStep] =
    createSignal<MultiMarketEventStep>("event_shell");
  const [createdEventId, setCreatedEventId] = createSignal("");
  const [createdEventSlug, setCreatedEventSlug] = createSignal<string | null>(null);
  const [createdEventPublicationStatus, setCreatedEventPublicationStatus] = createSignal<
    string | null
  >(null);
  const [rememberedEvent, setRememberedEvent] = createSignal<StoredActiveEvent | null>(null);
  const [publishChildMarketsNow, setPublishChildMarketsNow] = createSignal(false);
  const [eventMarketsDrafts, setEventMarketsDrafts] = createSignal<EventMarketDraft[]>([
    createEventMarketDraft(),
  ]);
  const modalMeta = () => getModalMeta(props.type);
  const eventIsPublished = () => createdEventPublicationStatus() === "published";

  function rememberActiveEvent(
    eventId: string,
    slug: string | null,
    publicationStatus: string | null,
  ) {
    const normalizedEventId = eventId.trim();

    if (!normalizedEventId) {
      return;
    }

    const nextValue = {
      id: normalizedEventId,
      slug: slug?.trim() ? slug.trim() : null,
      publication_status: publicationStatus?.trim() ? publicationStatus.trim() : null,
    } satisfies StoredActiveEvent;

    setRememberedEvent(nextValue);

    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      ACTIVE_MULTI_MARKET_EVENT_STORAGE_KEY,
      JSON.stringify(nextValue),
    );
  }

  function clearRememberedEvent() {
    setRememberedEvent(null);

    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.removeItem(ACTIVE_MULTI_MARKET_EVENT_STORAGE_KEY);
  }

  function resumeEvent(
    eventId: string,
    slug: string | null,
    publicationStatus: string | null,
    step: MultiMarketEventStep = "manual_markets",
  ) {
    setCreatedEventId(eventId);
    setCreatedEventSlug(slug);
    setCreatedEventPublicationStatus(publicationStatus);
    setMultiMarketEventStep(step);
    rememberActiveEvent(eventId, slug, publicationStatus);
  }

  async function handleRefreshRecoveryList(filter = recoveryFilter()) {
    setRecoveryError(null);

    try {
      await listEventsTask.run({
        publication_status: filter,
      });
    } catch (error) {
      setRecoveryError(getErrorMessage(error));
    }
  }

  onMount(() => {
    if (props.type !== "multi_market_event") {
      return;
    }

    setRememberedEvent(readStoredActiveEvent());

    if (props.initialEvent) {
      resumeEvent(
        props.initialEvent.id,
        props.initialEvent.slug,
        props.initialEvent.publicationStatus ?? null,
        props.initialEvent.step ?? "manual_markets",
      );
    }

    void handleRefreshRecoveryList();
  });

  async function handleCreateMarketSubmit(event: SubmitEvent) {
    event.preventDefault();

    const form = event.currentTarget as HTMLFormElement;
    setMarketError(null);

    try {
      const payload = buildCreateMarketPayload(new FormData(form));
      await createMarketTask.run(payload);
      form.reset();
    } catch (error) {
      setMarketError(getErrorMessage(error));
    }
  }

  async function handleCreateEventSubmit(event: SubmitEvent) {
    event.preventDefault();

    const form = event.currentTarget as HTMLFormElement;
    setEventError(null);

    try {
      const payload = buildCreateEventPayload(new FormData(form));
      const response = await createEventTask.run(payload);
      resumeEvent(response.id, response.event.slug, response.event.publication_status);
      form.reset();
    } catch (error) {
      setEventError(getErrorMessage(error));
    }
  }

  async function handleCreateEventMarketsSubmit(event: SubmitEvent) {
    event.preventDefault();

    setEventMarketsError(null);

    try {
      if (publishChildMarketsNow() && !eventIsPublished()) {
        throw new Error("Publish the event shell first before publishing child markets.");
      }

      const { eventId, payload } = buildCreateEventMarketsSubmission(
        createdEventId(),
        publishChildMarketsNow(),
        eventMarketsDrafts(),
      );
      const response = await createEventMarketsTask.run(eventId, payload);
      rememberActiveEvent(
        response.event_id,
        response.event_slug,
        createdEventPublicationStatus(),
      );
      setEventMarketsDrafts([createEventMarketDraft()]);

      if (!publishChildMarketsNow()) {
        setMultiMarketEventStep(eventIsPublished() ? "publish_markets" : "publish_event");
      }
    } catch (error) {
      setEventMarketsError(getErrorMessage(error));
    }
  }

  async function handlePublishEventSubmit(event: SubmitEvent) {
    event.preventDefault();

    setPublishEventError(null);

    try {
      const response = await publishEventTask.run(createdEventId().trim());
      setCreatedEventSlug(response.event.slug);
      setCreatedEventPublicationStatus(response.event.publication_status);
      rememberActiveEvent(createdEventId(), response.event.slug, response.event.publication_status);
      setMultiMarketEventStep("publish_markets");
    } catch (error) {
      setPublishEventError(getErrorMessage(error));
    }
  }

  async function handlePublishEventMarketsSubmit(event: SubmitEvent) {
    event.preventDefault();

    setPublishEventMarketsError(null);

    try {
      const response = await publishEventMarketsTask.run(createdEventId().trim());
      setCreatedEventSlug(response.event.slug);
      setCreatedEventPublicationStatus(response.event.publication_status);
      rememberActiveEvent(createdEventId(), response.event.slug, response.event.publication_status);
    } catch (error) {
      setPublishEventMarketsError(getErrorMessage(error));
    }
  }

  async function handleCreateLadderSubmit(event: SubmitEvent) {
    event.preventDefault();

    const form = event.currentTarget as HTMLFormElement;
    setLadderError(null);

    try {
      const formData = new FormData(form);
      const publishNow = Boolean(formData.get("publish_now"));

      if (props.type === "multi_market_event" && createdEventId() && publishNow && !eventIsPublished()) {
        throw new Error("Publish the event shell first before publishing ladder markets.");
      }

      const { eventId, payload } = buildCreateEventMarketLadderSubmission(formData);
      const response = await createLadderTask.run(eventId, payload);
      rememberActiveEvent(
        response.event_id,
        response.event_slug,
        createdEventPublicationStatus(),
      );

      if (props.type === "multi_market_event" && !publishNow) {
        setMultiMarketEventStep(eventIsPublished() ? "publish_markets" : "publish_event");
      }
    } catch (error) {
      setLadderError(getErrorMessage(error));
    }
  }

  return (
    <>
      <div class="pm-admin-create-modal__overlay" aria-hidden="true" onClick={props.onClose} />

      <section class="pm-admin-create-modal" role="dialog" aria-modal="true" aria-label={modalMeta().title}>
        <header class="pm-admin-create-modal__header">
          <div class="pm-admin-create-modal__header-copy">
            <p class="pm-admin-create-modal__eyebrow">{modalMeta().eyebrow}</p>
            <h2 class="pm-admin-create-modal__title">{modalMeta().title}</h2>
            <p class="pm-admin-create-modal__copy">{modalMeta().copy}</p>
          </div>

          <div class="pm-admin-create-modal__header-actions">
            <button class="pm-admin-create-modal__secondary" type="button" onClick={props.onBack}>
              <BackIcon />
              <span>Back</span>
            </button>
            <button class="pm-admin-create-modal__close" type="button" onClick={props.onClose} aria-label="Close creation modal">
              <CloseIcon />
            </button>
          </div>
        </header>

        <div class="pm-admin-create-modal__body">
          <Show when={props.type === "single_binary"}>
            <div class="pm-admin-create-modal__panel">
              <form class="pm-market-form" onSubmit={handleCreateMarketSubmit}>
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
                    <span class="pm-field__label">Oracle address</span>
                    <input class="pm-field__input" name="oracle_address" type="text" placeholder="0x..." required />
                  </label>

                  <label class="pm-field">
                    <span class="pm-field__label">End time</span>
                    <input class="pm-field__input" name="end_time" type="datetime-local" required />
                  </label>

                  <label class="pm-field">
                    <span class="pm-field__label">Sort at</span>
                    <input class="pm-field__input" name="sort_at" type="datetime-local" />
                  </label>

                  <AdminImageUrlField name="image_url" scope="markets" />

                  <label class="pm-field pm-field--full">
                    <span class="pm-field__label">Summary</span>
                    <textarea class="pm-field__textarea" name="summary" rows="3" placeholder="Short market summary" />
                  </label>

                  <label class="pm-field pm-field--full">
                    <span class="pm-field__label">Tag slugs</span>
                    <textarea class="pm-field__textarea" name="tag_slugs" rows="3" placeholder={"crypto\nmacro"} />
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
                    <span class="pm-field__label">Outcomes</span>
                    <textarea class="pm-field__textarea" name="outcomes" rows="3" placeholder={"Yes\nNo"} />
                  </label>

                  <label class="pm-field pm-field--full">
                    <span class="pm-field__label">Resolution sources</span>
                    <textarea class="pm-field__textarea" name="resolution_sources" rows="3" placeholder={"https://source.one\nhttps://source.two"} />
                  </label>

                  <label class="pm-field">
                    <span class="pm-field__label">Resolution timezone</span>
                    <input class="pm-field__input" name="resolution_timezone" type="text" placeholder="UTC" />
                  </label>

                  <label class="pm-checkbox">
                    <input name="neg_risk" type="checkbox" />
                    <span>Neg-risk market</span>
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
                    <span>Publish immediately</span>
                  </label>
                </div>

                <div class="pm-market-actions">
                  <button class="pm-button pm-button--primary" type="submit" disabled={createMarketTask.pending()}>
                    {createMarketTask.pending() ? "Creating..." : "Create single binary market"}
                  </button>
                </div>

                <Show when={marketError()}>
                  {message => <p class="pm-market-feedback pm-market-feedback--error">{message()}</p>}
                </Show>
              </form>

              <Show when={createMarketTask.data()}>
                {response => <CreatedMarketResult response={response()} />}
              </Show>
            </div>
          </Show>

          <Show when={props.type === "multi_market_event"}>
            <div class="pm-admin-create-modal__panel">
              <Show when={!createdEventId()}>
                <section class="pm-admin-create-modal__panel">
                  <section class="pm-admin-create-modal__context">
                    <p class="pm-admin-create-modal__context-label">Continue existing event</p>
                    <h3 class="pm-admin-create-modal__context-title">Resume child-market work</h3>
                    <p class="pm-admin-create-modal__context-copy">
                      Reopen a draft or published event here, then continue adding child markets or
                      ladder markets without recreating the shell.
                    </p>
                  </section>

                  <Show when={rememberedEvent()}>
                    {eventState => (
                      <section class="pm-admin-create-modal__resume">
                        <div class="pm-market-actions pm-market-actions--split">
                          <button
                            class="pm-button pm-button--primary"
                            type="button"
                            onClick={() =>
                              resumeEvent(
                                eventState().id,
                                eventState().slug,
                                eventState().publication_status,
                                "manual_markets",
                              )
                            }
                          >
                            Continue {eventState().slug ?? "last active event"}
                          </button>

                          <button
                            class="pm-button pm-button--ghost"
                            type="button"
                            onClick={clearRememberedEvent}
                          >
                            Clear saved event
                          </button>
                        </div>

                        <p class="pm-market-feedback">
                          Saved admin event ID: {eventState().id}
                        </p>
                      </section>
                    )}
                  </Show>

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

                    <button
                      class="pm-button pm-button--ghost"
                      type="button"
                      disabled={listEventsTask.pending()}
                      onClick={() => void handleRefreshRecoveryList()}
                    >
                      {listEventsTask.pending() ? "Refreshing..." : "Refresh events"}
                    </button>
                  </div>

                  <Show when={recoveryError()}>
                    {message => (
                      <p class="pm-market-feedback pm-market-feedback--error">{message()}</p>
                    )}
                  </Show>

                  <Show
                    when={(listEventsTask.data()?.events.length ?? 0) > 0}
                    fallback={
                      <Show
                        when={!recoveryError()}
                        fallback={<p class="pm-market-feedback">Event recovery is unavailable.</p>}
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
                              rememberedEvent()?.id === item.id ? " pm-recovery-card--active" : ""
                            }`}
                            type="button"
                            onClick={() =>
                              resumeEvent(
                                item.id,
                                item.slug,
                                item.publication_status,
                                "manual_markets",
                              )
                            }
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
                </section>
              </Show>

              <Show when={createdEventId()}>
                <div class="pm-admin-create-modal__subnav">
                  <button
                    class={`pm-filter-group__button${
                      multiMarketEventStep() === "event_shell" ? " pm-filter-group__button--active" : ""
                    }`}
                    type="button"
                    onClick={() => setMultiMarketEventStep("event_shell")}
                  >
                    Event shell
                  </button>
                  <button
                    class={`pm-filter-group__button${
                      multiMarketEventStep() === "manual_markets" ? " pm-filter-group__button--active" : ""
                    }`}
                    type="button"
                    onClick={() => setMultiMarketEventStep("manual_markets")}
                  >
                    Child markets
                  </button>
                  <button
                    class={`pm-filter-group__button${
                      multiMarketEventStep() === "ladder_markets" ? " pm-filter-group__button--active" : ""
                    }`}
                    type="button"
                    onClick={() => setMultiMarketEventStep("ladder_markets")}
                  >
                    Ladder markets
                  </button>
                  <button
                    class={`pm-filter-group__button${
                      multiMarketEventStep() === "publish_event" ? " pm-filter-group__button--active" : ""
                    }`}
                    type="button"
                    onClick={() => setMultiMarketEventStep("publish_event")}
                  >
                    Publish event
                  </button>
                  <button
                    class={`pm-filter-group__button${
                      multiMarketEventStep() === "publish_markets" ? " pm-filter-group__button--active" : ""
                    }`}
                    type="button"
                    onClick={() => setMultiMarketEventStep("publish_markets")}
                  >
                    Publish markets
                  </button>
                </div>
              </Show>

              <Show when={multiMarketEventStep() === "event_shell"}>
                <div class="pm-admin-create-modal__panel">
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

                    <Show when={eventError()}>
                      {message => (
                        <p class="pm-market-feedback pm-market-feedback--error">{message()}</p>
                      )}
                    </Show>
                  </form>

                  <Show when={createEventTask.data()}>
                    {response => (
                      <>
                        <CreatedEventResult response={response()} />
                        <section class="pm-admin-create-modal__followup">
                          <div>
                            <p class="pm-admin-create-modal__followup-label">
                              Continue with child markets
                            </p>
                            <h3 class="pm-admin-create-modal__followup-title">
                              {createdEventSlug() ?? response().event.slug}
                            </h3>
                            <p class="pm-admin-create-modal__followup-copy">
                              Event shell created. Add child markets manually or switch to ladder
                              generation using admin event ID `{createdEventId()}`.
                            </p>
                          </div>

                          <div class="pm-market-actions pm-market-actions--group">
                            <button
                              class="pm-button pm-button--primary"
                              type="button"
                              onClick={() => setMultiMarketEventStep("manual_markets")}
                            >
                              Add child markets
                            </button>
                            <button
                              class="pm-button pm-button--ghost"
                              type="button"
                              onClick={() => setMultiMarketEventStep("ladder_markets")}
                            >
                              Generate ladder markets
                            </button>
                          </div>
                        </section>
                      </>
                    )}
                  </Show>
                </div>
              </Show>

              <Show when={multiMarketEventStep() === "manual_markets" && createdEventId()}>
                <div class="pm-admin-create-modal__panel">
                  <section class="pm-admin-create-modal__context">
                    <p class="pm-admin-create-modal__context-label">Active event</p>
                    <h3 class="pm-admin-create-modal__context-title">
                      {createdEventSlug() ?? "Event selected"}
                    </h3>
                    <p class="pm-admin-create-modal__context-copy">
                      Add child markets here. They will be attached to admin event ID
                      ` {createdEventId()} `. Use the Event shell tab if you need to review the
                      creation response again.
                    </p>

                    <div class="pm-market-actions pm-market-actions--group">
                      <span class="pm-market-chip">
                        {createdEventPublicationStatus() ?? "draft"}
                      </span>

                      <Show when={!eventIsPublished()}>
                        <button
                          class="pm-button pm-button--ghost"
                          type="button"
                          onClick={() => setMultiMarketEventStep("publish_event")}
                        >
                          Publish event shell first
                        </button>
                      </Show>

                      <Show when={eventIsPublished()}>
                        <button
                          class="pm-button pm-button--ghost"
                          type="button"
                          onClick={() => setMultiMarketEventStep("publish_markets")}
                        >
                          Go to publish markets
                        </button>
                      </Show>
                    </div>
                  </section>

                  <form class="pm-market-form" onSubmit={handleCreateEventMarketsSubmit}>
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
                                onClick={() =>
                                  setEventMarketsDrafts(current =>
                                    current.length === 1
                                      ? current
                                      : current.filter(item => item.id !== draft.id),
                                  )
                                }
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
                                    setEventMarketsDrafts(current =>
                                      current.map(item =>
                                        item.id === draft.id
                                          ? { ...item, label: event.currentTarget.value }
                                          : item,
                                      ),
                                    )
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
                                    setEventMarketsDrafts(current =>
                                      current.map(item =>
                                        item.id === draft.id
                                          ? { ...item, slug: event.currentTarget.value }
                                          : item,
                                      ),
                                    )
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
                                    setEventMarketsDrafts(current =>
                                      current.map(item =>
                                        item.id === draft.id
                                          ? { ...item, question: event.currentTarget.value }
                                          : item,
                                      ),
                                    )
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
                                    setEventMarketsDrafts(current =>
                                      current.map(item =>
                                        item.id === draft.id
                                          ? { ...item, end_time: event.currentTarget.value }
                                          : item,
                                      ),
                                    )
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
                                    setEventMarketsDrafts(current =>
                                      current.map(item =>
                                        item.id === draft.id
                                          ? { ...item, oracle_address: event.currentTarget.value }
                                          : item,
                                      ),
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
                                    setEventMarketsDrafts(current =>
                                      current.map(item =>
                                        item.id === draft.id
                                          ? { ...item, sort_order: event.currentTarget.value }
                                          : item,
                                      ),
                                    )
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
                                    setEventMarketsDrafts(current =>
                                      current.map(item =>
                                        item.id === draft.id
                                          ? { ...item, outcomes: event.currentTarget.value }
                                          : item,
                                      ),
                                    )
                                  }
                                />
                              </label>
                            </div>
                          </section>
                        )}
                      </For>
                    </div>

                    <div class="pm-market-actions pm-market-actions--split">
                      <button
                        class="pm-button pm-button--ghost"
                        type="button"
                        onClick={() =>
                          setEventMarketsDrafts(current => [...current, createEventMarketDraft()])
                        }
                      >
                        Add another market
                      </button>

                      <button
                        class="pm-button pm-button--primary"
                        type="submit"
                        disabled={createEventMarketsTask.pending()}
                      >
                        {createEventMarketsTask.pending() ? "Creating..." : "Add child markets"}
                      </button>
                    </div>

                    <label class="pm-checkbox">
                      <input
                        type="checkbox"
                        checked={publishChildMarketsNow()}
                        disabled={!eventIsPublished()}
                        onChange={event => setPublishChildMarketsNow(event.currentTarget.checked)}
                      />
                      <span>Publish these child markets immediately</span>
                    </label>

                    <Show when={!eventIsPublished()}>
                      <p class="pm-market-feedback">
                        The event shell is still draft. Publish the event first, then come back if
                        you want create + publish in one request.
                      </p>
                    </Show>

                    <Show when={eventMarketsError()}>
                      {message => (
                        <p class="pm-market-feedback pm-market-feedback--error">{message()}</p>
                      )}
                    </Show>
                  </form>

                  <Show when={createEventMarketsTask.data()}>
                    {response => <ChildMarketsResult response={response()} />}
                  </Show>
                </div>
              </Show>

              <Show when={multiMarketEventStep() === "ladder_markets" && createdEventId()}>
                <div class="pm-admin-create-modal__panel">
                  <section class="pm-admin-create-modal__context">
                    <p class="pm-admin-create-modal__context-label">Active event</p>
                    <h3 class="pm-admin-create-modal__context-title">
                      {createdEventSlug() ?? "Event selected"}
                    </h3>
                    <p class="pm-admin-create-modal__context-copy">
                      Ladder markets created here will be attached to admin event ID
                      ` {createdEventId()} `.
                    </p>

                    <div class="pm-market-actions pm-market-actions--group">
                      <span class="pm-market-chip">
                        {createdEventPublicationStatus() ?? "draft"}
                      </span>

                      <Show when={!eventIsPublished()}>
                        <button
                          class="pm-button pm-button--ghost"
                          type="button"
                          onClick={() => setMultiMarketEventStep("publish_event")}
                        >
                          Publish event shell first
                        </button>
                      </Show>

                      <Show when={eventIsPublished()}>
                        <button
                          class="pm-button pm-button--ghost"
                          type="button"
                          onClick={() => setMultiMarketEventStep("publish_markets")}
                        >
                          Go to publish markets
                        </button>
                      </Show>
                    </div>
                  </section>

                  <form class="pm-market-form" onSubmit={handleCreateLadderSubmit}>
                    <div class="pm-market-fields">
                      <label class="pm-field pm-field--full">
                        <span class="pm-field__label">Event ID</span>
                        <input
                          class="pm-field__input"
                          name="event_id"
                          type="text"
                          value={createdEventId()}
                          readOnly
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
                        The backend generates sequential sort order, uses Yes/No outcomes, and builds
                        labels from the threshold lists.
                      </p>

                      <label class="pm-checkbox pm-field--full">
                        <input name="publish_now" type="checkbox" disabled={!eventIsPublished()} />
                        <span>Publish these ladder markets immediately</span>
                      </label>

                      <Show when={!eventIsPublished()}>
                        <p class="pm-market-feedback pm-field--full">
                          The event shell is still draft. Publish the event first, then return here
                          if you want generation + publish in one request.
                        </p>
                      </Show>
                    </div>

                    <div class="pm-market-actions">
                      <button
                        class="pm-button pm-button--primary"
                        type="submit"
                        disabled={createLadderTask.pending()}
                      >
                        {createLadderTask.pending() ? "Generating..." : "Generate ladder markets"}
                      </button>
                    </div>

                    <Show when={ladderError()}>
                      {message => (
                        <p class="pm-market-feedback pm-market-feedback--error">{message()}</p>
                      )}
                    </Show>
                  </form>

                  <Show when={createLadderTask.data()}>
                    {response => <LadderResult response={response()} />}
                  </Show>
                </div>
              </Show>

              <Show when={multiMarketEventStep() === "publish_event" && createdEventId()}>
                <div class="pm-admin-create-modal__panel">
                  <section class="pm-admin-create-modal__context">
                    <p class="pm-admin-create-modal__context-label">Publish event shell</p>
                    <h3 class="pm-admin-create-modal__context-title">
                      {createdEventSlug() ?? "Event selected"}
                    </h3>
                    <p class="pm-admin-create-modal__context-copy">
                      Publish the parent event first. After that, draft child markets can be batch
                      published in the next step.
                    </p>
                  </section>

                  <form class="pm-market-form" onSubmit={handlePublishEventSubmit}>
                    <div class="pm-market-fields">
                      <label class="pm-field pm-field--full">
                        <span class="pm-field__label">Event ID</span>
                        <input
                          class="pm-field__input"
                          name="event_id"
                          type="text"
                          value={createdEventId()}
                          readOnly
                          required
                        />
                      </label>
                    </div>

                    <div class="pm-market-actions pm-market-actions--split">
                      <button
                        class="pm-button pm-button--primary"
                        type="submit"
                        disabled={publishEventTask.pending()}
                      >
                        {publishEventTask.pending() ? "Publishing..." : "Publish event shell"}
                      </button>

                      <button
                        class="pm-button pm-button--ghost"
                        type="button"
                        onClick={() => setMultiMarketEventStep("publish_markets")}
                      >
                        Go to publish markets
                      </button>
                    </div>

                    <Show when={publishEventError()}>
                      {message => (
                        <p class="pm-market-feedback pm-market-feedback--error">{message()}</p>
                      )}
                    </Show>
                  </form>

                  <Show when={publishEventTask.data()}>
                    {response => <PublishedEventResult response={response()} />}
                  </Show>
                </div>
              </Show>

              <Show when={multiMarketEventStep() === "publish_markets" && createdEventId()}>
                <div class="pm-admin-create-modal__panel">
                  <section class="pm-admin-create-modal__context">
                    <p class="pm-admin-create-modal__context-label">Publish child markets</p>
                    <h3 class="pm-admin-create-modal__context-title">
                      {createdEventSlug() ?? "Event selected"}
                    </h3>
                    <p class="pm-admin-create-modal__context-copy">
                      Batch publish all draft child markets under this event and fill their
                      condition IDs. The parent event must already be published.
                    </p>
                  </section>

                  <Show when={!eventIsPublished()}>
                    <p class="pm-market-feedback">
                      This event is still draft. Publish the event shell first, then return here to
                      publish the child markets.
                    </p>
                  </Show>

                  <form class="pm-market-form" onSubmit={handlePublishEventMarketsSubmit}>
                    <div class="pm-market-fields">
                      <label class="pm-field pm-field--full">
                        <span class="pm-field__label">Event ID</span>
                        <input
                          class="pm-field__input"
                          name="event_id"
                          type="text"
                          value={createdEventId()}
                          readOnly
                          required
                        />
                      </label>
                    </div>

                    <div class="pm-market-actions pm-market-actions--split">
                      <button
                        class="pm-button pm-button--primary"
                        type="submit"
                        disabled={publishEventMarketsTask.pending() || !eventIsPublished()}
                      >
                        {publishEventMarketsTask.pending()
                          ? "Publishing..."
                          : "Publish child markets"}
                      </button>

                      <button
                        class="pm-button pm-button--ghost"
                        type="button"
                        onClick={() => setMultiMarketEventStep("manual_markets")}
                      >
                        Back to child markets
                      </button>
                    </div>

                    <Show when={publishEventMarketsError()}>
                      {message => (
                        <p class="pm-market-feedback pm-market-feedback--error">{message()}</p>
                      )}
                    </Show>
                  </form>

                  <Show when={publishEventMarketsTask.data()}>
                    {response => <PublishedChildMarketsResult response={response()} />}
                  </Show>
                </div>
              </Show>
            </div>
          </Show>

          <Show when={props.type === "ladder_market"}>
            <div class="pm-admin-create-modal__panel">
              <form class="pm-market-form" onSubmit={handleCreateLadderSubmit}>
                <div class="pm-market-fields">
                  <label class="pm-field pm-field--full">
                    <span class="pm-field__label">Event ID</span>
                    <input class="pm-field__input" name="event_id" type="text" required />
                  </label>

                  <label class="pm-field">
                    <span class="pm-field__label">Underlying</span>
                    <input class="pm-field__input" name="underlying" type="text" placeholder="BTC" required />
                  </label>

                  <label class="pm-field">
                    <span class="pm-field__label">Deadline label</span>
                    <input class="pm-field__input" name="deadline_label" type="text" placeholder="April 10 close" required />
                  </label>

                  <label class="pm-field">
                    <span class="pm-field__label">End time</span>
                    <input class="pm-field__input" name="end_time" type="datetime-local" required />
                  </label>

                  <label class="pm-field">
                    <span class="pm-field__label">Oracle address</span>
                    <input class="pm-field__input" name="oracle_address" type="text" placeholder="0x..." required />
                  </label>

                  <label class="pm-field">
                    <span class="pm-field__label">Unit symbol</span>
                    <input class="pm-field__input" name="unit_symbol" type="text" placeholder="$" />
                  </label>

                  <label class="pm-field pm-field--full">
                    <span class="pm-field__label">Up thresholds</span>
                    <textarea class="pm-field__textarea" name="up_thresholds" rows="4" placeholder={"85000\n90000"} />
                  </label>

                  <label class="pm-field pm-field--full">
                    <span class="pm-field__label">Down thresholds</span>
                    <textarea class="pm-field__textarea" name="down_thresholds" rows="4" placeholder={"75000\n70000"} />
                  </label>

                  <p class="pm-market-feedback pm-field--full">
                    The event shell must already exist. Use the multi-market event flow first if you
                    still need an admin event ID.
                  </p>

                  <p class="pm-market-feedback pm-field--full">
                    The backend generates sequential sort order, uses Yes/No outcomes, and builds
                    labels from the threshold lists.
                  </p>

                  <label class="pm-checkbox pm-field--full">
                    <input name="publish_now" type="checkbox" />
                    <span>Publish these ladder markets immediately</span>
                  </label>
                </div>

                <div class="pm-market-actions">
                  <button class="pm-button pm-button--primary" type="submit" disabled={createLadderTask.pending()}>
                    {createLadderTask.pending() ? "Generating..." : "Generate ladder markets"}
                  </button>
                </div>

                <Show when={ladderError()}>
                  {message => <p class="pm-market-feedback pm-market-feedback--error">{message()}</p>}
                </Show>
              </form>

              <Show when={createLadderTask.data()}>
                {response => <LadderResult response={response()} />}
              </Show>
            </div>
          </Show>
        </div>
      </section>
    </>
  );
}
