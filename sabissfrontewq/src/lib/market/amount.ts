import { formatUsdcBaseUnits, parseUsdcAmountInput } from "../faucet/amount.ts";

const BUY_TRADE_MIN_USDC_BASE_UNITS = 500000n;
const BUY_TRADE_MAX_USDC_BASE_UNITS = 10000000000n;
const BUY_TRADE_RANGE_LABEL = "0.5 to 10000 USDC";

export interface BuyUsdcTradeAmountResolution {
  normalizedAmount: string | null;
  errorMessage: string | null;
  hintMessage: string | null;
}

function formatBaseUnitHint(raw: string): string | null {
  const trimmed = raw.trim();

  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  const parsedBaseUnits = BigInt(trimmed);

  if (
    parsedBaseUnits < BUY_TRADE_MIN_USDC_BASE_UNITS ||
    parsedBaseUnits > BUY_TRADE_MAX_USDC_BASE_UNITS
  ) {
    return null;
  }

  const displayAmount = formatUsdcBaseUnits(trimmed);

  return `This field expects normal USDC. If you meant base units, ${trimmed} = ${displayAmount} USDC.`;
}

export function resolveBuyUsdcTradeAmount(value: string): BuyUsdcTradeAmountResolution {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return {
      normalizedAmount: null,
      errorMessage: "Enter a valid USDC amount to buy.",
      hintMessage: null,
    };
  }

  const baseUnitHint = formatBaseUnitHint(trimmed);

  try {
    const normalizedAmount = parseUsdcAmountInput(trimmed).baseUnits;
    const parsedNormalizedAmount = BigInt(normalizedAmount);

    if (
      parsedNormalizedAmount < BUY_TRADE_MIN_USDC_BASE_UNITS ||
      parsedNormalizedAmount > BUY_TRADE_MAX_USDC_BASE_UNITS
    ) {
      return {
        normalizedAmount: null,
        errorMessage: baseUnitHint ?? `Enter between ${BUY_TRADE_RANGE_LABEL}.`,
        hintMessage: baseUnitHint,
      };
    }

    return {
      normalizedAmount,
      errorMessage: null,
      hintMessage: baseUnitHint,
    };
  } catch {
    return {
      normalizedAmount: null,
      errorMessage: baseUnitHint ?? "Enter a valid USDC amount to buy.",
      hintMessage: baseUnitHint,
    };
  }
}

export function normalizeBuyUsdcTradeAmount(value: string): string | null {
  return resolveBuyUsdcTradeAmount(value).normalizedAmount;
}

export function normalizeSellTradeAmount(value: string): string | null {
  try {
    return parseUsdcAmountInput(value).baseUnits;
  } catch {
    return null;
  }
}
