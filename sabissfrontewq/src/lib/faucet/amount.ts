const USDC_DECIMALS = 6;

export interface ParsedUsdcAmountInput {
  baseUnits: string;
  displayAmount: string;
}

export function parseUsdcAmountInput(raw: string): ParsedUsdcAmountInput {
  const trimmed = raw.trim();

  if (trimmed.length === 0) {
    throw new Error("Amount is required.");
  }

  const normalized = trimmed.startsWith(".") ? `0${trimmed}` : trimmed;

  if (!/^\d+(?:\.\d{0,6})?$/.test(normalized)) {
    throw new Error("Amount must be a valid USDC value with up to 6 decimals.");
  }

  const [wholeRaw, fractionalRaw = ""] = normalized.split(".");
  const whole = wholeRaw.replace(/^0+(?=\d)/, "") || "0";
  const fractional = fractionalRaw.padEnd(USDC_DECIMALS, "0");
  const baseUnits = `${whole}${fractional}`.replace(/^0+/, "") || "0";

  if (baseUnits === "0") {
    throw new Error("Amount must be greater than zero.");
  }

  const trimmedFractional = fractional.replace(/0+$/, "");

  return {
    baseUnits,
    displayAmount: trimmedFractional ? `${whole}.${trimmedFractional}` : whole,
  };
}

export function formatUsdcBaseUnits(raw: string): string {
  const trimmed = raw.trim();

  if (!/^\d+$/.test(trimmed)) {
    return raw;
  }

  const normalized = trimmed.replace(/^0+/, "") || "0";

  if (normalized.length <= USDC_DECIMALS) {
    const fractional = normalized.padStart(USDC_DECIMALS, "0").replace(/0+$/, "");
    return fractional.length > 0 ? `0.${fractional}` : "0";
  }

  const splitIndex = normalized.length - USDC_DECIMALS;
  const whole = normalized.slice(0, splitIndex);
  const fractional = normalized.slice(splitIndex).replace(/0+$/, "");

  return fractional.length > 0 ? `${whole}.${fractional}` : whole;
}
