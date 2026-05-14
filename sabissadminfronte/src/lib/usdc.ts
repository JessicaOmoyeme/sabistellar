const USDC_BASE_UNITS_PER_DOLLAR = 1_000_000n;

function normalizeUsdcDollarInput(value: string) {
  const trimmedValue = value.trim();

  if (trimmedValue.length === 0) {
    return "";
  }

  const withoutCurrencySymbol = trimmedValue.startsWith("$")
    ? trimmedValue.slice(1).trim()
    : trimmedValue;
  const normalizedValue = withoutCurrencySymbol.replaceAll(",", "");

  return normalizedValue.startsWith(".") ? `0${normalizedValue}` : normalizedValue;
}

export function parseUsdcDollarsToBaseUnits(
  value: string,
  label: string,
  options: { allowZero?: boolean } = {},
) {
  const normalizedValue = normalizeUsdcDollarInput(value);

  if (!normalizedValue) {
    throw new Error(`${label} is required.`);
  }

  if (!/^\d+(\.\d{0,6})?$/.test(normalizedValue)) {
    throw new Error(`${label} must be a dollar amount with up to 6 decimal places.`);
  }

  const [wholeUnits, fractionalUnits = ""] = normalizedValue.split(".");
  const baseUnits =
    BigInt(wholeUnits) * USDC_BASE_UNITS_PER_DOLLAR +
    BigInt(fractionalUnits.padEnd(6, "0") || "0");

  if (baseUnits === 0n && !options.allowZero) {
    throw new Error(`${label} must be greater than zero.`);
  }

  return baseUnits.toString();
}
