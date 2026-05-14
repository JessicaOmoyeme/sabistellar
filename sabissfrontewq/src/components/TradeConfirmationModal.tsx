import { Show, createEffect, createSignal, onCleanup, type Component } from "solid-js";
import { Portal } from "solid-js/web";
import type { MarketTradeExecutionResponse } from "../lib/market/index.ts";

interface TradeConfirmationModalProps {
  isOpen: boolean;
  isLoading: boolean;
  mode: "buy" | "sell";
  outcomeLabel: string;
  amount: string;
  price: string;
  transactionHashes: string[];
  tradeResult: MarketTradeExecutionResponse | null;
  errorMessage: string | null;
  statusMessage: string | null;
  onClose: () => void;
}

function SuccessCheckmark() {
  return (
    <svg viewBox="0 0 64 64" class="pm-trade-confirmation__success-icon" aria-hidden="true">
      <circle cx="32" cy="32" r="30" fill="none" stroke="currentColor" stroke-width="2" />
      <path
        d="M18 32l8 8 20-20"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

function LoadingSpinner() {
  return (
    <svg viewBox="0 0 64 64" class="pm-trade-confirmation__loading-spinner" aria-hidden="true">
      <circle
        cx="32"
        cy="32"
        r="28"
        fill="none"
        stroke="currentColor"
        stroke-width="4"
        stroke-dasharray="87.96"
        stroke-dashoffset="0"
      />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg viewBox="0 0 64 64" class="pm-trade-confirmation__error-icon" aria-hidden="true">
      <circle cx="32" cy="32" r="30" fill="none" stroke="currentColor" stroke-width="2" />
      <line x1="20" y1="20" x2="44" y2="44" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
      <line x1="44" y1="20" x2="20" y2="44" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
    </svg>
  );
}

function copyToClipboard(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    void navigator.clipboard.writeText(text);
  }
}

function formatAddress(address: string): string {
  if (address.length <= 16) return address;
  return `${address.slice(0, 8)}...${address.slice(-8)}`;
}

const TradeConfirmationModal: Component<TradeConfirmationModalProps> = (props) => {
  const [copiedHash, setCopiedHash] = createSignal<string | null>(null);
  let closeTimer: number | undefined;

  const isSuccess = () =>
    !props.isLoading && !props.errorMessage && (props.transactionHashes.length > 0 || props.tradeResult);
  const isError = () => !!props.errorMessage && !props.isLoading;

  createEffect(() => {
    if (!props.isOpen || typeof document === "undefined") {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !props.isLoading) {
        props.onClose();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    onCleanup(() => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    });
  });

  createEffect(() => {
    if (isSuccess() && closeTimer === undefined) {
      closeTimer = window.setTimeout(() => {
        closeTimer = undefined;
        props.onClose();
      }, 4000);
    }

    return () => {
      if (closeTimer !== undefined) {
        window.clearTimeout(closeTimer);
        closeTimer = undefined;
      }
    };
  });

  createEffect(() => {
    const hash = copiedHash();
    if (hash === null) return;

    const timeout = window.setTimeout(() => {
      setCopiedHash(null);
    }, 2000);

    return () => window.clearTimeout(timeout);
  });

  return (
    <Show when={props.isOpen}>
      <Portal>
        <div class="pm-trade-confirmation__overlay" onClick={() => !props.isLoading && props.onClose()}>
          <div
            class="pm-trade-confirmation__modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pm-trade-confirmation-title"
            onClick={event => event.stopPropagation()}
          >
            <Show when={props.isLoading} fallback={null}>
              <div class="pm-trade-confirmation__content pm-trade-confirmation__content--loading">
                <div class="pm-trade-confirmation__icon-wrapper pm-trade-confirmation__icon-wrapper--loading">
                  <LoadingSpinner />
                </div>
                <h2 class="pm-trade-confirmation__title" id="pm-trade-confirmation-title">
                  Submitting Trade
                </h2>
                <p class="pm-trade-confirmation__subtitle">
                  {props.statusMessage || "Processing your trade..."}
                </p>
              </div>
            </Show>

            <Show when={isSuccess()} fallback={null}>
              <div class="pm-trade-confirmation__content pm-trade-confirmation__content--success">
                <div class="pm-trade-confirmation__icon-wrapper pm-trade-confirmation__icon-wrapper--success">
                  <SuccessCheckmark />
                </div>
                <h2 class="pm-trade-confirmation__title" id="pm-trade-confirmation-title">
                  Trade Confirmed
                </h2>

                <div class="pm-trade-confirmation__details">
                  <div class="pm-trade-confirmation__detail-row">
                    <span class="pm-trade-confirmation__detail-label">Action</span>
                    <strong class="pm-trade-confirmation__detail-value">
                      {props.mode === "buy" ? "Buy" : "Sell"} {props.outcomeLabel}
                    </strong>
                  </div>

                  <div class="pm-trade-confirmation__detail-row">
                    <span class="pm-trade-confirmation__detail-label">Amount</span>
                    <strong class="pm-trade-confirmation__detail-value">{props.amount}</strong>
                  </div>

                  <div class="pm-trade-confirmation__detail-row">
                    <span class="pm-trade-confirmation__detail-label">Price</span>
                    <strong class="pm-trade-confirmation__detail-value">{props.price}</strong>
                  </div>

                  <Show when={props.transactionHashes.length > 0}>
                    <div class="pm-trade-confirmation__detail-row pm-trade-confirmation__detail-row--stacked">
                      <span class="pm-trade-confirmation__detail-label">
                        {props.transactionHashes.length > 1 ? "Transactions" : "Transaction"}
                      </span>
                      <div class="pm-trade-confirmation__tx-list">
                        {props.transactionHashes.map((hash) => (
                          <button
                            type="button"
                            class="pm-trade-confirmation__tx-hash"
                            title="Copy transaction hash"
                            onClick={() => {
                              copyToClipboard(hash);
                              setCopiedHash(hash);
                            }}
                          >
                            <code>{formatAddress(hash)}</code>
                            <Show when={copiedHash() === hash} fallback={null}>
                              <span class="pm-trade-confirmation__tx-copy-feedback">Copied!</span>
                            </Show>
                          </button>
                        ))}
                      </div>
                    </div>
                  </Show>
                </div>

                <p class="pm-trade-confirmation__success-note">
                  Your trade has been successfully submitted to the blockchain.
                </p>

                <button
                  type="button"
                  class="pm-trade-confirmation__close-button"
                  onClick={() => props.onClose()}
                >
                  Close
                </button>
              </div>
            </Show>

            <Show when={isError()} fallback={null}>
              <div class="pm-trade-confirmation__content pm-trade-confirmation__content--error">
                <div class="pm-trade-confirmation__icon-wrapper pm-trade-confirmation__icon-wrapper--error">
                  <ErrorIcon />
                </div>
                <h2 class="pm-trade-confirmation__title" id="pm-trade-confirmation-title">
                  Trade Failed
                </h2>
                <p class="pm-trade-confirmation__error-message">{props.errorMessage}</p>

                <button
                  type="button"
                  class="pm-trade-confirmation__close-button"
                  onClick={() => props.onClose()}
                >
                  Try Again
                </button>
              </div>
            </Show>
          </div>
        </div>
      </Portal>
    </Show>
  );
};

export default TradeConfirmationModal;
