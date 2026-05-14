import { createEffect, createMemo, createSignal, For, Show } from "solid-js";

import { readStoredAuthSession } from "~/lib/auth/session.ts";
import {
  ApiError,
  executePreparedMarketTransactions,
  marketClient,
  resolveTradeWallet,
  type MarketTradeExecutionResponse,
} from "~/lib/market/index.ts";
import {
  resolveBuyUsdcTradeAmount,
  normalizeSellTradeAmount,
} from "~/lib/market/amount.ts";
import { readStoredWalletPreference } from "~/lib/wallet.ts";
import TradeConfirmationModal from "../TradeConfirmationModal.tsx";
import "../TradeConfirmationModal.css";

import type { EventMarketListItem } from "./types.ts";

interface MarketTradePanelProps {
  market: EventMarketListItem;
  question: string;
  selectedOutcomeIndex: number;
  onSelectOutcome: (outcomeIndex: number) => void;
}

const quickAmounts = ["1", "5", "10", "100"];
type TradeMode = "buy" | "sell";

function formatTradePrice(price: number): string {
  if (!Number.isFinite(price) || price <= 0) {
    return "--";
  }

  return `${Math.round(price * 100)}c`;
}

function getTradeErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "code" in error) {
    const errorCode = (error as { code?: unknown }).code;

    if (errorCode === 4001) {
      return "Request rejected in your wallet.";
    }

    if (errorCode === -32002) {
      return "Open your wallet to continue the pending request.";
    }
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Unable to submit this trade.";
}

export default function MarketTradePanel(props: MarketTradePanelProps) {
  const [mode, setMode] = createSignal<TradeMode>("buy");
  const [amount, setAmount] = createSignal("0");
  const [isSubmitting, setSubmitting] = createSignal(false);
  const [statusMessage, setStatusMessage] = createSignal<string | null>(null);
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);
  const [result, setResult] = createSignal<MarketTradeExecutionResponse | null>(null);
  const [transactionHashes, setTransactionHashes] = createSignal<string[]>([]);
  const [showConfirmationModal, setShowConfirmationModal] = createSignal(false);
  const selectedQuote = createMemo(
    () => props.market.quotes[props.selectedOutcomeIndex] ?? props.market.quotes[0],
  );
  const submitLabel = createMemo(() => {
    const actionLabel = mode() === "buy" ? "Buy" : "Sell";
    const outcomeLabel = selectedQuote()?.label ?? "Outcome";

    if (isSubmitting()) {
      return mode() === "buy" ? "Submitting buy..." : "Submitting sell...";
    }

    return `${actionLabel} ${outcomeLabel}`;
  });
  const latestTransactionHash = createMemo(
    () => transactionHashes()[transactionHashes().length - 1] ?? result()?.tx_hash ?? null,
  );
  const buyAmountResolution = createMemo(() =>
    mode() === "buy" ? resolveBuyUsdcTradeAmount(amount()) : null,
  );
  const formattedPrice = createMemo(() => {
    const price = selectedQuote()?.price;
    if (!Number.isFinite(price) || price <= 0) {
      return "--";
    }
    return `${Math.round(price * 100)}c`;
  });

  createEffect(() => {
    props.market.slug;
    setMode("buy");
    setAmount("0");
    setStatusMessage(null);
    setErrorMessage(null);
    setResult(null);
    setTransactionHashes([]);
    setShowConfirmationModal(false);
  });

  const handleSubmit = async () => {
    if (isSubmitting()) {
      return;
    }

    const session = readStoredAuthSession();

    if (!session?.token) {
      setStatusMessage(null);
      setErrorMessage("Sign in to place a trade.");

      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("sabi:open-auth-modal"));
      }

      return;
    }

    const buyAmount = buyAmountResolution();
    const normalizedAmount =
      mode() === "buy"
        ? buyAmount?.normalizedAmount ?? null
        : normalizeSellTradeAmount(amount());

    if (!normalizedAmount) {
      setStatusMessage(null);
      setErrorMessage(
        mode() === "buy"
          ? buyAmount?.errorMessage ?? "Enter a valid USDC amount to buy."
          : "Enter a valid token amount to sell.",
      );
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setResult(null);
    setTransactionHashes([]);
    setStatusMessage(mode() === "buy" ? "Submitting buy..." : "Submitting sell...");
    setShowConfirmationModal(true);

    try {
      const response =
        mode() === "buy"
          ? await marketClient.buyMarket(session.token, props.market.id, {
              trade: {
                outcome_index: props.selectedOutcomeIndex,
                usdc_amount: normalizedAmount,
              },
            })
          : await marketClient.sellMarket(session.token, props.market.id, {
              trade: {
                outcome_index: props.selectedOutcomeIndex,
                token_amount: normalizedAmount,
              },
            });

      if (response.execution_mode === "smart_account") {
        setResult(response);
        setStatusMessage("Trade submitted successfully.");
        return;
      }

      if (response.execution_mode !== "external_wallet") {
        throw new Error(`Unsupported execution mode: ${response.execution_mode}`);
      }

      const preparedTransactions = response.prepared_transactions ?? [];

      if (preparedTransactions.length === 0) {
        throw new Error("Backend returned no transactions for the connected wallet.");
      }

      const preferredWallet = readStoredWalletPreference();
      const wallet = await resolveTradeWallet(
        response.wallet_address,
        preferredWallet?.walletKind,
      );

      if (!wallet) {
        throw new Error(
          "Reconnect the same external wallet you used for sign-in before trading.",
        );
      }

      setStatusMessage(
        preparedTransactions[0]?.kind === "approval"
          ? "Confirm the approval and trade in your wallet."
          : "Confirm the trade in your wallet.",
      );

      const hashes = await executePreparedMarketTransactions({
        wallet,
        walletAddress: response.wallet_address,
        chainId: session.user.wallet?.chain_id,
        preparedTransactions,
      });

      setResult(response);
      setTransactionHashes(hashes);
      setStatusMessage(
        hashes.length > 1
          ? "Transactions sent from your wallet."
          : "Transaction sent from your wallet.",
      );
    } catch (error) {
      setStatusMessage(null);
      setErrorMessage(getTradeErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <aside class="pm-trade-panel">
      <div class="pm-trade-panel__market">
        <p class="pm-trade-panel__label">{props.market.label}</p>
        <p class="pm-trade-panel__headline">
          {selectedQuote()?.label ?? "Quote"} {selectedQuote()?.centsLabel ?? "--"}
        </p>
        <p class="pm-trade-panel__subcopy">{props.question}</p>
      </div>

      <div class="pm-trade-panel__mode">
        <button
          type="button"
          class="pm-trade-panel__mode-tab"
          classList={{ "pm-trade-panel__mode-tab--active": mode() === "buy" }}
          onClick={() => setMode("buy")}
        >
          Buy
        </button>
        <button
          type="button"
          class="pm-trade-panel__mode-tab"
          classList={{ "pm-trade-panel__mode-tab--active": mode() === "sell" }}
          onClick={() => setMode("sell")}
        >
          Sell
        </button>
      </div>

      <div class="pm-trade-panel__quote-grid">
        <For each={props.market.quotes.slice(0, 2)}>
          {quote => (
            <button
              type="button"
              classList={{
                "pm-trade-panel__quote": true,
                "pm-trade-panel__quote--yes": quote.outcomeIndex === 0,
                "pm-trade-panel__quote--no": quote.outcomeIndex !== 0,
                "pm-trade-panel__quote--selected":
                  quote.outcomeIndex === props.selectedOutcomeIndex,
              }}
              onClick={() => props.onSelectOutcome(quote.outcomeIndex)}
            >
              <span>{quote.label}</span>
              <strong>{quote.centsLabel}</strong>
            </button>
          )}
        </For>
      </div>

      <label class="pm-trade-panel__amount">
        <span class="pm-trade-panel__amount-label">
          {mode() === "buy" ? "Amount" : "Shares"}
        </span>
        <div class="pm-trade-panel__amount-box">
          <Show when={mode() === "buy"}>
            <span class="pm-trade-panel__amount-currency">$</span>
          </Show>
          <input
            type="text"
            inputmode="decimal"
            value={amount()}
            onInput={event => setAmount(event.currentTarget.value)}
            aria-label="Trade amount"
          />
        </div>
      </label>

      <Show when={mode() === "buy" && buyAmountResolution()?.hintMessage}>
        <p class="pm-trade-panel__hint">{buyAmountResolution()!.hintMessage}</p>
      </Show>

      <Show when={mode() === "buy"}>
        <div class="pm-trade-panel__quick-picks">
          <For each={quickAmounts}>
            {value => (
              <button type="button" onClick={() => setAmount(value)}>
                +${value}
              </button>
            )}
          </For>
        </div>
      </Show>

      <button
        type="button"
        class="pm-button pm-button--primary pm-trade-panel__submit"
        disabled={isSubmitting()}
        onClick={() => void handleSubmit()}
      >
        {submitLabel()}
      </button>

      <Show when={statusMessage()}>
        <p class="pm-trade-panel__feedback">{statusMessage()}</p>
      </Show>

      <Show when={errorMessage()}>
        <p class="pm-trade-panel__feedback pm-trade-panel__feedback--error">
          {errorMessage()}
        </p>
      </Show>

      <Show when={result()}>
        <div class="pm-trade-panel__summary">
          <p>
            {result()!.action} {result()!.outcome_label} at {formatTradePrice(result()!.price)}
          </p>
          <p>
            {result()!.execution_mode === "smart_account"
              ? "Backend submitted the trade."
              : "Wallet prepared and sent the trade client-side."}
          </p>
          <Show when={latestTransactionHash()}>
            <p class="pm-trade-panel__hash">{latestTransactionHash()}</p>
          </Show>
        </div>
      </Show>

      <Show when={transactionHashes().length > 1}>
        <div class="pm-trade-panel__tx-list">
          <For each={transactionHashes()}>
            {(hash, index) => (
              <p class="pm-trade-panel__hash">
                Tx {index() + 1}: {hash}
              </p>
            )}
          </For>
        </div>
      </Show>

      <p class="pm-trade-panel__footnote">
        <Show
          when={result()?.execution_mode === "external_wallet"}
          fallback="Orderbook-based quotes are shown when liquidity is available for this market."
        >
          External-wallet trades are sent by the connected wallet. Backend trade stats are not
          marked yet on this path.
        </Show>
      </p>

      <TradeConfirmationModal
        isOpen={showConfirmationModal()}
        isLoading={isSubmitting()}
        mode={mode()}
        outcomeLabel={selectedQuote()?.label ?? "Outcome"}
        amount={amount()}
        price={formattedPrice()}
        transactionHashes={transactionHashes()}
        tradeResult={result()}
        errorMessage={errorMessage()}
        statusMessage={statusMessage()}
        onClose={() => {
          setShowConfirmationModal(false);
          setErrorMessage(null);
          setStatusMessage(null);
          setAmount("0");
        }}
      />
    </aside>
  );
}
