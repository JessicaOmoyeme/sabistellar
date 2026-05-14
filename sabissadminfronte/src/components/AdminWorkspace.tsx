import { For, Show, createEffect, createSignal, onCleanup } from "solid-js";

import type { AdminMeResponse } from "~/lib/api/admin";
import AdminMarketCreationModal, {
  type MarketCreationModalType,
} from "./AdminMarketCreationModal";

type AdminDrawerView = "menu" | "create_market";
type MarketCreationType =
  | "single_binary"
  | "multi_market_event"
  | "ladder_market"
  | "neg_risk_pair";

interface AdminWorkspaceProps {
  profile: AdminMeResponse;
  open: boolean;
  onClose: () => void;
}

const marketCreationTypes: Array<{
  id: MarketCreationType;
  title: string;
  copy: string;
  available: boolean;
}> = [
  {
    id: "single_binary",
    title: "Single binary market",
    copy: "One standalone Yes/No market with its own setup flow.",
    available: true,
  },
  {
    id: "multi_market_event",
    title: "Multi-market event",
    copy: "Create an event shell first, then add sibling markets under it.",
    available: true,
  },
  {
    id: "ladder_market",
    title: "Ladder market",
    copy: "Generate threshold-based sibling markets from one ladder definition.",
    available: true,
  },
  {
    id: "neg_risk_pair",
    title: "Neg-risk pair",
    copy: "Pair-aware setup flow for linked markets. Add after the core redesign lands.",
    available: false,
  },
];

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

function ArrowLeftIcon() {
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

export default function AdminWorkspace(props: AdminWorkspaceProps) {
  const [activeView, setActiveView] = createSignal<AdminDrawerView>("menu");
  const [activeModalType, setActiveModalType] = createSignal<MarketCreationModalType | null>(null);

  createEffect(() => {
    if (!props.open) {
      setActiveModalType(null);
      return;
    }

    setActiveView("menu");

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (activeModalType()) {
          setActiveModalType(null);
          return;
        }

        props.onClose();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    window.addEventListener("keydown", handleKeyDown);

    onCleanup(() => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    });
  });

  const profile = () => props.profile;

  return (
    <Show when={props.open}>
      <div class="pm-admin-drawer__overlay" aria-hidden="true" onClick={props.onClose} />

      <aside
        class="pm-admin-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Admin drawer"
      >
        <header class="pm-admin-drawer__header">
          <div>
            <p class="pm-admin-drawer__eyebrow">Admin</p>
            <h2 class="pm-admin-drawer__title">
              {activeView() === "menu" ? "Control panel" : "Create market"}
            </h2>
            <p class="pm-admin-drawer__copy">
              {activeView() === "menu"
                ? "Use the drawer as the new home for admin actions. Start with market creation."
                : "Pick the market flow first. The dedicated creation surface comes next in the redesign."}
            </p>
          </div>

          <button
            class="pm-admin-drawer__close"
            type="button"
            aria-label="Close admin drawer"
            onClick={props.onClose}
          >
            <CloseIcon />
          </button>
        </header>

        <div class="pm-admin-drawer__identity">
          <span class="pm-market-chip">Monad #{profile().monad_chain_id}</span>
          <span class="pm-market-chip">
            {profile().user.wallet?.wallet_address ?? "Admin session"}
          </span>
        </div>

        <Show
          when={activeView() === "menu"}
          fallback={
            <div class="pm-admin-drawer__stack">
              <button
                class="pm-admin-drawer__back"
                type="button"
                onClick={() => {
                  setActiveView("menu");
                }}
              >
                <ArrowLeftIcon />
                <span>Back</span>
              </button>

              <div class="pm-admin-drawer__type-grid">
                <For each={marketCreationTypes}>
                  {item => (
                    <button
                      class={`pm-admin-drawer__type-card${
                        activeModalType() === item.id ? " pm-admin-drawer__type-card--active" : ""
                      }${item.available ? "" : " pm-admin-drawer__type-card--disabled"}`}
                      type="button"
                      disabled={!item.available}
                      onClick={() => {
                        if (!item.available || item.id === "neg_risk_pair") {
                          return;
                        }

                        setActiveModalType(item.id);
                      }}
                    >
                      <div class="pm-admin-drawer__type-card-header">
                        <span class="pm-admin-drawer__type-card-title">{item.title}</span>
                        <span class="pm-admin-drawer__type-card-badge">
                          {item.available ? "Ready" : "Later"}
                        </span>
                      </div>
                      <span class="pm-admin-drawer__type-card-copy">{item.copy}</span>
                    </button>
                  )}
                </For>
              </div>
            </div>
          }
        >
          <div class="pm-admin-drawer__stack">
            <button
              class="pm-admin-drawer__action pm-admin-drawer__action--primary"
              type="button"
              onClick={() => setActiveView("create_market")}
            >
              <span class="pm-admin-drawer__action-title">Create market</span>
              <span class="pm-admin-drawer__action-copy">
                Choose a market type first, then branch into the right creation flow.
              </span>
            </button>

            <div class="pm-admin-drawer__group">
              <p class="pm-admin-drawer__group-label">Next</p>

              <button class="pm-admin-drawer__action" type="button" disabled>
                <span class="pm-admin-drawer__action-title">Manage markets</span>
                <span class="pm-admin-drawer__action-copy">
                  Market controls return here after the create flow lands.
                </span>
              </button>

              <button class="pm-admin-drawer__action" type="button" disabled>
                <span class="pm-admin-drawer__action-title">Resolution</span>
                <span class="pm-admin-drawer__action-copy">
                  Resolution tools will be added back into this drawer structure later.
                </span>
              </button>
            </div>
          </div>
        </Show>
      </aside>

      <Show when={activeModalType()}>
        {type => (
          <AdminMarketCreationModal
            type={type()}
            onBack={() => setActiveModalType(null)}
            onClose={() => setActiveModalType(null)}
          />
        )}
      </Show>
    </Show>
  );
}
