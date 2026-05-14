import { Show, createEffect, createSignal, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";

import {
  faucetClient,
  formatUsdcBaseUnits,
  parseUsdcAmountInput,
} from "../lib/faucet/index.ts";

interface DepositWalletLike {
  wallet_address: string;
  chain_id: number | null;
  account_kind?: string | null;
}

interface DepositUserLike {
  wallet: DepositWalletLike | null;
}

interface DepositModalProps {
  open: boolean;
  user: DepositUserLike | null;
  onClose: () => void;
  onBalanceRefresh?: () => Promise<void> | void;
}

interface FaucetReceipt {
  displayAmount: string;
  txHash: string;
  requestedAt: string;
}

type FeedbackTone = "success" | "error";
const BALANCE_CONFIRMATION_ATTEMPTS = 8;
const BALANCE_CONFIRMATION_DELAY_MS = 1_250;

function CloseIcon() {
  return (
    <svg viewBox="0 0 13 13" aria-hidden="true">
      <path
        d="M1.5 1.5 11.5 11.5"
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-width="1.5"
      />
      <path
        d="M11.5 1.5 1.5 11.5"
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-width="1.5"
      />
    </svg>
  );
}

function formatUsdBalance(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function getChainLabel(wallet: DepositWalletLike | null | undefined): string {
  const accountKind = wallet?.account_kind?.trim().toLowerCase();
  const walletAddress = wallet?.wallet_address?.trim().toUpperCase();
  const chainId = wallet?.chain_id;

  if (
    accountKind?.includes("stellar") ||
    (typeof walletAddress === "string" &&
      walletAddress.startsWith("G") &&
      walletAddress.length >= 32)
  ) {
    return "Stellar";
  }

  if (chainId === 10143) {
    return "Monad";
  }

  if (typeof chainId === "number") {
    return `Chain ${chainId}`;
  }

  return "Stellar";
}

function formatRequestedAt(value: string): string {
  const parsed = Date.parse(value);

  if (Number.isNaN(parsed)) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(parsed));
}

function delay(ms: number) {
  return new Promise<void>(resolve => {
    window.setTimeout(resolve, ms);
  });
}

export default function DepositModal(props: DepositModalProps) {
  const [amountInput, setAmountInput] = createSignal("");
  const [isSubmitting, setIsSubmitting] = createSignal(false);
  const [isLoadingBalance, setIsLoadingBalance] = createSignal(false);
  const [balanceLoadFailed, setBalanceLoadFailed] = createSignal(false);
  const [feedbackMessage, setFeedbackMessage] = createSignal<string | null>(null);
  const [feedbackTone, setFeedbackTone] = createSignal<FeedbackTone>("success");
  const [receipt, setReceipt] = createSignal<FaucetReceipt | null>(null);
  const [queriedBalanceUsd, setQueriedBalanceUsd] = createSignal<number | null>(null);
  let balanceRequestId = 0;
  let balanceConfirmationRequestId = 0;

  createEffect(() => {
    if (!props.open || typeof document === "undefined") {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
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
    if (!props.open) {
      return;
    }

    setAmountInput("");
    setIsSubmitting(false);
    setIsLoadingBalance(false);
    setBalanceLoadFailed(false);
    setFeedbackMessage(null);
    setFeedbackTone("success");
    setReceipt(null);
  });

  const recipientAddress = () => props.user?.wallet?.wallet_address?.trim() ?? "";
  const chainLabel = () => getChainLabel(props.user?.wallet);
  const hasRecipientAddress = () => recipientAddress().length > 0;
  const canSubmit = () =>
    hasRecipientAddress() && amountInput().trim().length > 0 && !isSubmitting();
  const balanceLabel = () =>
    isLoadingBalance()
      ? "Loading..."
      : balanceLoadFailed()
        ? "Unavailable"
        : formatUsdBalance(queriedBalanceUsd() ?? 0);

  const normalizeBalanceUsd = (rawBalance: string) => {
    const normalizedBalance = formatUsdcBaseUnits(rawBalance);
    const balanceUsd = Number(normalizedBalance);

    return Number.isFinite(balanceUsd) ? balanceUsd : 0;
  };

  const refreshBalance = async (address: string) => {
    const requestId = ++balanceRequestId;
    setIsLoadingBalance(true);
    setBalanceLoadFailed(false);

    try {
      const response = await faucetClient.fetchUsdcBalance(address);
      const balanceUsd = normalizeBalanceUsd(response.balance);

      if (requestId === balanceRequestId) {
        setQueriedBalanceUsd(balanceUsd);
        setBalanceLoadFailed(false);
      }
    } catch {
      if (requestId === balanceRequestId) {
        setQueriedBalanceUsd(null);
        setBalanceLoadFailed(true);
      }
    } finally {
      if (requestId === balanceRequestId) {
        setIsLoadingBalance(false);
      }
    }
  };

  createEffect(() => {
    if (!props.open) {
      setIsLoadingBalance(false);
      return;
    }

    const currentRecipientAddress = recipientAddress();

    if (currentRecipientAddress.length === 0) {
      setQueriedBalanceUsd(null);
      setIsLoadingBalance(false);
      setBalanceLoadFailed(false);
      return;
    }

    void refreshBalance(currentRecipientAddress);
  });

  const confirmBalanceUpdate = async (
    address: string,
    expectedMinimumBalanceUsd: number | null,
  ) => {
    const confirmationRequestId = ++balanceConfirmationRequestId;

    for (let attempt = 0; attempt < BALANCE_CONFIRMATION_ATTEMPTS; attempt += 1) {
      if (attempt > 0) {
        await delay(BALANCE_CONFIRMATION_DELAY_MS);
      }

      try {
        const response = await faucetClient.fetchUsdcBalance(address);
        const balanceUsd = normalizeBalanceUsd(response.balance);

        if (confirmationRequestId !== balanceConfirmationRequestId) {
          return;
        }

        setQueriedBalanceUsd(balanceUsd);
        setBalanceLoadFailed(false);
        void props.onBalanceRefresh?.();

        if (expectedMinimumBalanceUsd === null || balanceUsd >= expectedMinimumBalanceUsd) {
          return;
        }
      } catch {
        if (confirmationRequestId !== balanceConfirmationRequestId) {
          return;
        }
      }
    }

    if (confirmationRequestId === balanceConfirmationRequestId) {
      void refreshBalance(address);
      void props.onBalanceRefresh?.();
    }
  };

  const handleSubmit = async (event: SubmitEvent) => {
    event.preventDefault();
    setFeedbackMessage(null);
    setReceipt(null);

    if (!hasRecipientAddress()) {
      setFeedbackTone("error");
      setFeedbackMessage("No wallet address is available for this account.");
      return;
    }

    let parsedAmount: ReturnType<typeof parseUsdcAmountInput>;

    try {
      parsedAmount = parseUsdcAmountInput(amountInput());
    } catch (error) {
      setFeedbackTone("error");
      setFeedbackMessage(error instanceof Error ? error.message : "Amount is invalid.");
      return;
    }

    setIsSubmitting(true);

    try {
      const previousBalanceUsd = queriedBalanceUsd() ?? 0;
      const response = await faucetClient.requestUsdc({
        address: recipientAddress(),
        amount: parsedAmount.baseUnits,
      });
      const displayAmount = formatUsdcBaseUnits(response.amount);
      const creditedUsd = Number(displayAmount);
      const expectedBalanceUsd = Number.isFinite(creditedUsd)
        ? previousBalanceUsd + creditedUsd
        : null;

      setFeedbackTone("success");
      setFeedbackMessage(`Sent ${displayAmount} USDC to your ${chainLabel()} wallet.`);
      setReceipt({
        displayAmount,
        txHash: response.tx_hash,
        requestedAt: response.requested_at,
      });
      if (Number.isFinite(creditedUsd)) {
        setQueriedBalanceUsd(current => (current ?? 0) + creditedUsd);
      }
      props.onBalanceRefresh?.();
      void confirmBalanceUpdate(recipientAddress(), expectedBalanceUsd);
      setAmountInput("");
    } catch (error) {
      setFeedbackTone("error");
      setFeedbackMessage(
        error instanceof Error ? error.message : "Unable to request faucet USDC.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Show when={props.open}>
      <Portal>
        <div class="pm-deposit-modal__overlay" onClick={props.onClose}>
          <section
            class="pm-deposit-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pm-deposit-modal-title"
            onClick={event => event.stopPropagation()}
          >
            <div class="pm-deposit-modal__frame">
              <div class="pm-deposit-modal__header">
                <div class="pm-deposit-modal__header-slot" />

                <div class="pm-deposit-modal__header-copy">
                  <h2 class="pm-deposit-modal__title" id="pm-deposit-modal-title">
                    Transfer Crypto
                  </h2>
                  <p class="pm-deposit-modal__subtitle">
                    Sabimarket Balance: {balanceLabel()}
                  </p>
                </div>

                <div class="pm-deposit-modal__header-slot pm-deposit-modal__header-slot--end">
                  <button
                    class="pm-deposit-modal__icon-button"
                    type="button"
                    aria-label="Close"
                    onClick={props.onClose}
                  >
                    <CloseIcon />
                  </button>
                </div>
              </div>

              <div class="pm-deposit-transfer">
                <div class="pm-deposit-transfer__details">
                  <div class="pm-deposit-transfer__field">
                    <div class="pm-deposit-transfer__label">Supported token</div>
                    <div class="pm-deposit-transfer__value">USDC</div>
                  </div>

                  <div class="pm-deposit-transfer__field">
                    <div class="pm-deposit-transfer__label">Supported chain</div>
                    <div class="pm-deposit-transfer__value">
                      <span
                        class={`pm-chain-pill${
                          chainLabel() === "Stellar"
                            ? " pm-chain-pill--stellar"
                            : chainLabel() === "Monad"
                              ? " pm-chain-pill--monad"
                              : ""
                        }`}
                      >
                        {chainLabel()}
                      </span>
                    </div>
                  </div>
                </div>

                <form
                  class="pm-deposit-transfer__address-card"
                  onSubmit={event => void handleSubmit(event)}
                >
                  <div class="pm-deposit-transfer__address-header">
                    <div>
                      <label class="pm-deposit-transfer__label" for="pm-deposit-transfer-amount">
                        Amount
                      </label>
                      <div class="pm-deposit-transfer__hint">
                        Enter how much USDC you want. The request is sent directly to your{" "}
                        {chainLabel()} wallet.
                      </div>
                    </div>
                  </div>

                  <div class="pm-deposit-transfer__input-shell">
                    <input
                      id="pm-deposit-transfer-amount"
                      class="pm-deposit-transfer__input"
                      type="text"
                      inputmode="decimal"
                      autocomplete="off"
                      placeholder="10"
                      value={amountInput()}
                      onInput={event => setAmountInput(event.currentTarget.value)}
                    />
                    <span class="pm-deposit-transfer__input-token">USDC</span>
                  </div>

                  <button
                    class={`pm-deposit-transfer__submit${
                      feedbackTone() === "success" && receipt()
                        ? " pm-deposit-transfer__submit--success"
                        : ""
                    }`}
                    type="submit"
                    disabled={!canSubmit()}
                  >
                    {isSubmitting() ? "Requesting..." : "Request USDC"}
                  </button>
                </form>

                <div class="pm-deposit-transfer__address-card">
                  <div class="pm-deposit-transfer__address-header">
                    <div>
                      <div class="pm-deposit-transfer__label">Recipient wallet</div>
                      <div class="pm-deposit-transfer__hint">
                        Faucet USDC is sent to the wallet linked to your Sabimarket account.
                      </div>
                    </div>
                  </div>

                  <Show
                    when={hasRecipientAddress()}
                    fallback={
                      <div class="pm-deposit-transfer__empty">
                        No wallet address is available for this account.
                      </div>
                    }
                  >
                    <div class="pm-deposit-transfer__address-box">
                      <code class="pm-deposit-transfer__address">{recipientAddress()}</code>
                    </div>
                  </Show>
                </div>

                <Show when={feedbackMessage()}>
                  {message => (
                    <p
                      class={`pm-deposit-transfer__feedback${
                        feedbackTone() === "error"
                          ? " pm-deposit-transfer__feedback--error"
                          : " pm-deposit-transfer__feedback--success"
                      }`}
                    >
                      {message()}
                    </p>
                  )}
                </Show>

                <Show when={receipt()}>
                  {currentReceipt => (
                    <div class="pm-deposit-transfer__status-card">
                      <div class="pm-deposit-transfer__status-row">
                        <span class="pm-deposit-transfer__label">Requested</span>
                        <strong class="pm-deposit-transfer__status-value">
                          {currentReceipt().displayAmount} USDC
                        </strong>
                      </div>

                      <div class="pm-deposit-transfer__status-row">
                        <span class="pm-deposit-transfer__label">Submitted</span>
                        <span class="pm-deposit-transfer__status-value">
                          {formatRequestedAt(currentReceipt().requestedAt)}
                        </span>
                      </div>

                      <div class="pm-deposit-transfer__status-row pm-deposit-transfer__status-row--stacked">
                        <span class="pm-deposit-transfer__label">Transaction hash</span>
                        <code class="pm-deposit-transfer__status-hash">
                          {currentReceipt().txHash}
                        </code>
                      </div>
                    </div>
                  )}
                </Show>

                <p class="pm-deposit-transfer__footer-note">
                  Faucet requests usually settle in under a minute after submission on{" "}
                  {chainLabel()}.
                </p>

                <Show when={balanceLoadFailed()}>
                  <p class="pm-deposit-transfer__feedback pm-deposit-transfer__feedback--error">
                    Unable to load the current on-chain USDC balance for this wallet.
                  </p>
                </Show>
              </div>
            </div>
          </section>
        </div>
      </Portal>
    </Show>
  );
}
