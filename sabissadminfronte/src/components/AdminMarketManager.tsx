import { Show, createSignal } from "solid-js";

import {
  createAdminMarket,
  updateAdminMarket,
  type CreateMarketRequest,
  type CreateMarketResponse,
  type UpdateMarketRequest,
  type UpdateMarketResponse,
} from "~/lib/api/admin";
import { getErrorMessage } from "~/lib/api/core";
import { useAsyncTask } from "~/lib/hooks/useAsyncTask";

import AdminImageUrlField from "./AdminImageUrlField";

interface AdminMarketManagerProps {
  mode: "create" | "update";
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

function readOptionalInteger(formData: FormData, key: string, label: string) {
  const value = String(formData.get(key) ?? "").trim();

  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a whole number.`);
  }

  return parsed;
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

function buildUpdateMarketSubmission(formData: FormData) {
  const marketId = readRequiredText(formData, "market_id", "Market ID");
  const market: UpdateMarketRequest["market"] = {
    ...(readOptionalText(formData, "slug") ? { slug: readOptionalText(formData, "slug")! } : {}),
    ...(readOptionalText(formData, "label")
      ? { label: readOptionalText(formData, "label")! }
      : {}),
    ...(readOptionalText(formData, "question")
      ? { question: readOptionalText(formData, "question")! }
      : {}),
    ...(readDateTimeValue(formData, "end_time", "End time")
      ? { end_time: readDateTimeValue(formData, "end_time", "End time")! }
      : {}),
    ...(readOptionalInteger(formData, "sort_order", "Sort order") !== undefined
      ? { sort_order: readOptionalInteger(formData, "sort_order", "Sort order")! }
      : {}),
    ...(readStringList(formData, "outcomes")
      ? { outcomes: readStringList(formData, "outcomes")! }
      : {}),
    ...(readOptionalText(formData, "oracle_address")
      ? { oracle_address: readOptionalText(formData, "oracle_address")! }
      : {}),
  };

  if (Object.keys(market).length === 0) {
    throw new Error("Enter at least one field to update.");
  }

  return {
    marketId,
    payload: {
      market,
    } satisfies UpdateMarketRequest,
  };
}

function formatTimestamp(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function MarketMutationResult(props: {
  title: string;
  response: CreateMarketResponse | UpdateMarketResponse;
  timestampLabel: string;
  timestamp: string;
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
        <div class="pm-market-result__detail--full">
          <span class="pm-market-result__label">{props.timestampLabel}</span>
          <span class="pm-market-result__value">{formatTimestamp(props.timestamp)}</span>
        </div>
      </div>
    </section>
  );
}

export default function AdminMarketManager(props: AdminMarketManagerProps) {
  const createTask = useAsyncTask((payload: CreateMarketRequest) => createAdminMarket(payload));
  const updateTask = useAsyncTask((marketId: string, payload: UpdateMarketRequest) =>
    updateAdminMarket(marketId, payload),
  );
  const [createError, setCreateError] = createSignal<string | null>(null);
  const [updateError, setUpdateError] = createSignal<string | null>(null);

  async function handleCreateSubmit(event: SubmitEvent) {
    event.preventDefault();

    const form = event.currentTarget as HTMLFormElement;

    setCreateError(null);

    try {
      const payload = buildCreateMarketPayload(new FormData(form));
      await createTask.run(payload);
      form.reset();
    } catch (error) {
      setCreateError(getErrorMessage(error));
    }
  }

  async function handleUpdateSubmit(event: SubmitEvent) {
    event.preventDefault();

    const form = event.currentTarget as HTMLFormElement;

    setUpdateError(null);

    try {
      const { marketId, payload } = buildUpdateMarketSubmission(new FormData(form));
      await updateTask.run(marketId, payload);
    } catch (error) {
      setUpdateError(getErrorMessage(error));
    }
  }

  return (
    <div class="pm-tool-stack">
      <Show
        when={props.mode === "create"}
        fallback={
          <section class="pm-market-card pm-market-card--wide">
            <div class="pm-market-card__header">
              <div>
                <p class="pm-market-card__eyebrow">PATCH /admin/markets/{'{market_id}'}</p>
                <h2 class="pm-market-card__title">Update draft market</h2>
              </div>
              <span class="pm-market-card__hint">Draft only</span>
            </div>

            <p class="pm-market-card__copy">
              This patches an existing draft market. If the market was created through the
              standalone path, the backend also keeps its wrapper event identifiers in sync.
            </p>

            <form class="pm-market-form" onSubmit={handleUpdateSubmit}>
              <div class="pm-market-fields">
                <label class="pm-field pm-field--full">
                  <span class="pm-field__label">Market ID</span>
                  <input class="pm-field__input" name="market_id" type="text" required />
                </label>

                <label class="pm-field">
                  <span class="pm-field__label">Label</span>
                  <input class="pm-field__input" name="label" type="text" />
                </label>

                <label class="pm-field">
                  <span class="pm-field__label">Slug</span>
                  <input class="pm-field__input" name="slug" type="text" />
                </label>

                <label class="pm-field pm-field--full">
                  <span class="pm-field__label">Question</span>
                  <textarea class="pm-field__textarea" name="question" rows="3" />
                </label>

                <label class="pm-field">
                  <span class="pm-field__label">End time</span>
                  <input class="pm-field__input" name="end_time" type="datetime-local" />
                </label>

                <label class="pm-field">
                  <span class="pm-field__label">Sort order</span>
                  <input class="pm-field__input" name="sort_order" type="number" step="1" />
                </label>

                <label class="pm-field">
                  <span class="pm-field__label">Oracle address</span>
                  <input
                    class="pm-field__input"
                    name="oracle_address"
                    type="text"
                    placeholder="0x..."
                  />
                </label>

                <label class="pm-field pm-field--full">
                  <span class="pm-field__label">Outcomes</span>
                  <textarea
                    class="pm-field__textarea"
                    name="outcomes"
                    rows="3"
                    placeholder={"Yes\nNo"}
                  />
                </label>
              </div>

              <div class="pm-market-actions">
                <button class="pm-button pm-button--primary" type="submit" disabled={updateTask.pending()}>
                  {updateTask.pending() ? "Updating..." : "Update draft market"}
                </button>
              </div>

              <Show when={updateError()}>
                {message => <p class="pm-market-feedback pm-market-feedback--error">{message()}</p>}
              </Show>
            </form>

            <Show when={updateTask.data()}>
              {response => (
                <MarketMutationResult
                  title="Updated"
                  response={response()}
                  timestampLabel="Updated"
                  timestamp={response().updated_at}
                />
              )}
            </Show>
          </section>
        }
      >
        <section class="pm-market-card pm-market-card--wide">
          <div class="pm-market-card__header">
            <div>
              <p class="pm-market-card__eyebrow">POST /admin/markets</p>
              <h2 class="pm-market-card__title">Create standalone market</h2>
            </div>
            <span class="pm-market-card__hint">One request</span>
          </div>

          <p class="pm-market-card__copy">
            This path creates one wrapper event and one binary market together. Use the multi-market
            event flow when several markets should live under the same event.
          </p>

          <form class="pm-market-form" onSubmit={handleCreateSubmit}>
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
                <input
                  class="pm-field__input"
                  name="oracle_address"
                  type="text"
                  placeholder="0x..."
                  required
                />
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
                <textarea
                  class="pm-field__textarea"
                  name="summary"
                  rows="3"
                  placeholder="Short market summary"
                />
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
                <span class="pm-field__label">Outcomes</span>
                <textarea
                  class="pm-field__textarea"
                  name="outcomes"
                  rows="3"
                  placeholder={"Yes\nNo"}
                />
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
              <button class="pm-button pm-button--primary" type="submit" disabled={createTask.pending()}>
                {createTask.pending() ? "Creating..." : "Create standalone market"}
              </button>
            </div>

            <Show when={createError()}>
              {message => <p class="pm-market-feedback pm-market-feedback--error">{message()}</p>}
            </Show>
          </form>

          <Show when={createTask.data()}>
            {response => (
              <MarketMutationResult
                title="Created"
                response={response()}
                timestampLabel="Created"
                timestamp={response().created_at}
              />
            )}
          </Show>
        </section>
      </Show>
    </div>
  );
}
