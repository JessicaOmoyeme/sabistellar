import { For, Show, createEffect, createSignal, onCleanup } from "solid-js";

import type { EventDetailViewModel } from "./types.ts";
import { ShareIcon } from "./icons.tsx";

interface MarketDetailHeaderProps {
  data: EventDetailViewModel;
  onSelectMarket: (marketSlug: string) => void;
}

const SHARE_FEEDBACK_TIMEOUT_MS = 1800;

export default function MarketDetailHeader(props: MarketDetailHeaderProps) {
  const [isShareMenuOpen, setShareMenuOpen] = createSignal(false);
  const [shareStatus, setShareStatus] = createSignal<"idle" | "success" | "error">("idle");
  let shareMenuRef: HTMLDivElement | undefined;
  let shareResetTimer: number | undefined;
  const fallbackLetter = () => props.data.eventTitle.trim().charAt(0).toUpperCase() || "M";
  const shareText = () => props.data.selectedMarketQuestion.trim() || props.data.eventTitle;
  const shareUrl = () =>
    typeof window === "undefined"
      ? props.data.selectedMarket.href
      : window.location.href;
  const shareLabel = () => {
    if (shareStatus() === "success") {
      return "Market link copied";
    }

    if (shareStatus() === "error") {
      return "Unable to share market";
    }

    return "Share market";
  };

  const shareStatusMessage = () => {
    if (shareStatus() === "success") {
      return "Market link copied.";
    }

    if (shareStatus() === "error") {
      return "Unable to share market.";
    }

    return "";
  };

  const shareTargets = () => {
    const encodedUrl = encodeURIComponent(shareUrl());
    const encodedText = encodeURIComponent(shareText());

    return [
      {
        label: "X",
        href: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
      },
      {
        label: "Telegram",
        href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
      },
      {
        label: "WhatsApp",
        href: `https://wa.me/?text=${encodeURIComponent(`${shareText()} ${shareUrl()}`)}`,
      },
      {
        label: "LinkedIn",
        href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      },
    ] as const;
  };

  const resetShareStatus = () => {
    if (typeof window === "undefined") {
      return;
    }

    if (shareResetTimer !== undefined) {
      window.clearTimeout(shareResetTimer);
    }

    shareResetTimer = window.setTimeout(() => {
      setShareStatus("idle");
      shareResetTimer = undefined;
    }, SHARE_FEEDBACK_TIMEOUT_MS);
  };

  const copyMarketLink = async () => {
    if (typeof window === "undefined" || typeof navigator === "undefined") {
      return;
    }

    if (typeof navigator.clipboard?.writeText !== "function") {
      setShareStatus("error");
      resetShareStatus();
      return;
    }

    try {
      await navigator.clipboard.writeText(shareUrl());
      setShareStatus("success");
      setShareMenuOpen(false);
    } catch {
      setShareStatus("error");
    }

    resetShareStatus();
  };

  createEffect(() => {
    props.data.selectedMarket.slug;
    setShareMenuOpen(false);
    setShareStatus("idle");
  });

  if (typeof window !== "undefined") {
    const handleWindowPointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (!(target instanceof Node) || !shareMenuRef?.contains(target)) {
        setShareMenuOpen(false);
      }
    };

    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShareMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", handleWindowPointerDown);
    window.addEventListener("keydown", handleWindowKeyDown);

    onCleanup(() => {
      window.removeEventListener("pointerdown", handleWindowPointerDown);
      window.removeEventListener("keydown", handleWindowKeyDown);
    });
  }

  onCleanup(() => {
    if (shareResetTimer !== undefined && typeof window !== "undefined") {
      window.clearTimeout(shareResetTimer);
    }
  });

  return (
    <div class="pm-event-header">
      <div class="pm-event-header__bar">
        <div class="pm-event-header__copy">
          <div class="pm-event-header__art">
            <Show
              when={props.data.eventImageUrl}
              fallback={<span class="pm-event-header__art-fallback">{fallbackLetter()}</span>}
            >
              <img
                src={props.data.eventImageUrl ?? ""}
                alt={`${props.data.eventTitle} icon`}
                loading="lazy"
                decoding="async"
              />
            </Show>
          </div>

          <div class="pm-event-header__text">
            <p class="pm-event-header__kicker">
              {props.data.categoryLabel}
              <Show when={props.data.subcategoryLabel}>
                <span> · {props.data.subcategoryLabel}</span>
              </Show>
            </p>
            <h1 class="pm-event-header__title">{props.data.eventTitle}</h1>
          </div>
        </div>

        <div class="pm-event-header__actions" aria-label="Event actions">
          <div class="pm-event-share" ref={shareMenuRef}>
            <button
              type="button"
              classList={{
                "pm-event-icon-button": true,
                "pm-event-icon-button--active": isShareMenuOpen() || shareStatus() === "success",
                "pm-event-icon-button--error": shareStatus() === "error",
              }}
              aria-label={shareLabel()}
              aria-expanded={isShareMenuOpen()}
              aria-haspopup="menu"
              title={shareLabel()}
              onClick={() => setShareMenuOpen(open => !open)}
            >
              <ShareIcon />
            </button>

            <Show when={isShareMenuOpen()}>
              <div class="pm-event-share__menu" role="menu" aria-label="Share market">
                <button
                  type="button"
                  class="pm-event-share__item"
                  role="menuitem"
                  onClick={() => void copyMarketLink()}
                >
                  Copy link
                </button>

                <For each={shareTargets()}>
                  {target => (
                    <a
                      class="pm-event-share__item"
                      role="menuitem"
                      href={target.href}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => setShareMenuOpen(false)}
                    >
                      Share on {target.label}
                    </a>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </div>
      </div>

      <span class="pm-event-header__share-status" aria-live="polite">
        {shareStatusMessage()}
      </span>

      <div class="pm-event-header__tabs" role="tablist" aria-label="Markets in this event">
        <For each={props.data.marketTabs}>
          {tab => (
            <button
              type="button"
              classList={{
                "pm-event-header__tab": true,
                "pm-event-header__tab--active": tab.isSelected,
              }}
              onClick={() => props.onSelectMarket(tab.marketSlug)}
            >
              {tab.label}
            </button>
          )}
        </For>
      </div>

      <p class="pm-event-header__meta">
        {props.data.selectedMarket.meta}
        <Show when={props.data.marketCount > 1}>
          <span> · {props.data.marketCount} markets</span>
        </Show>
      </p>
    </div>
  );
}
