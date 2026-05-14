#!/usr/bin/env bash
set -euo pipefail

: "${NETWORK:?set NETWORK}"
: "${SOURCE:?set SOURCE}"
: "${SABI_MARKET_ID:?set SABI_MARKET_ID}"
: "${SABI_CTF_ID:?set SABI_CTF_ID}"
: "${MOCK_USDC_ID:?set MOCK_USDC_ID}"
: "${SABI_LIQUIDITY_MANAGER_ID:=}"
: "${MAKER:?set MAKER}"
: "${ORACLE:?set ORACLE}"
: "${QUESTION_ID_HEX:?set QUESTION_ID_HEX}"
: "${END_TIME:?set END_TIME}"
: "${SEED_AMOUNT:?set SEED_AMOUNT}"

EMPTY_COLLECTION="$(printf '0%.0s' {1..64})"
EXIT_COLLATERAL_AMOUNT="${EXIT_COLLATERAL_AMOUNT:-0}"
TOTAL_MINT_AMOUNT="$SEED_AMOUNT"

if [[ "$EXIT_COLLATERAL_AMOUNT" != "0" ]]; then
  TOTAL_MINT_AMOUNT="$((SEED_AMOUNT + EXIT_COLLATERAL_AMOUNT))"
fi

if [[ -n "${SABI_EXCHANGE_ID:-}" && -n "${MIN_TRADE_AMOUNT:-}" ]]; then
  stellar contract invoke \
    --network "$NETWORK" \
    --source-account "$SOURCE" \
    --id "$SABI_EXCHANGE_ID" \
    -- \
    set_min_trade_amount \
    --amount "$MIN_TRADE_AMOUNT" >/dev/null
fi

if [[ -n "${SABI_EXCHANGE_ID:-}" && -n "${MAX_TRADE_AMOUNT:-}" ]]; then
  stellar contract invoke \
    --network "$NETWORK" \
    --source-account "$SOURCE" \
    --id "$SABI_EXCHANGE_ID" \
    -- \
    set_max_trade_amount \
    --amount "$MAX_TRADE_AMOUNT" >/dev/null
fi

stellar contract invoke \
  --network "$NETWORK" \
  --source-account "$SOURCE" \
  --id "$MOCK_USDC_ID" \
  -- \
  mint \
  --to "$MAKER" \
  --amount "$TOTAL_MINT_AMOUNT" >/dev/null

CONDITION_ID="$(
  stellar contract invoke \
    --network "$NETWORK" \
    --source-account "$SOURCE" \
    --id "$SABI_MARKET_ID" \
    -- \
    create_binary_market \
    --question-id "$QUESTION_ID_HEX" \
    --end-time "$END_TIME" \
    --oracle "$ORACLE"
)"

if [[ -n "${SABI_EXCHANGE_ID:-}" && -n "${YES_PRICE_BPS:-}" && -n "${NO_PRICE_BPS:-}" ]]; then
  stellar contract invoke \
    --network "$NETWORK" \
    --source-account "$SOURCE" \
    --id "$SABI_EXCHANGE_ID" \
    -- \
    set_price \
    --condition-id "$CONDITION_ID" \
    --outcome-index 0 \
    --price-bps "$YES_PRICE_BPS" >/dev/null

  stellar contract invoke \
    --network "$NETWORK" \
    --source-account "$SOURCE" \
    --id "$SABI_EXCHANGE_ID" \
    -- \
    set_price \
    --condition-id "$CONDITION_ID" \
    --outcome-index 1 \
    --price-bps "$NO_PRICE_BPS" >/dev/null

  if [[ -n "$SABI_LIQUIDITY_MANAGER_ID" ]]; then
    stellar contract invoke \
      --network "$NETWORK" \
      --source-account "$SOURCE" \
      --id "$SABI_LIQUIDITY_MANAGER_ID" \
      -- \
      split_position \
      --provider "$MAKER" \
      --condition-id "$CONDITION_ID" \
      --amount "$SEED_AMOUNT" >/dev/null

    stellar contract invoke \
      --network "$NETWORK" \
      --source-account "$SOURCE" \
      --id "$SABI_LIQUIDITY_MANAGER_ID" \
      -- \
      add_liquidity \
      --provider "$MAKER" \
      --condition-id "$CONDITION_ID" \
      --yes-amount "$SEED_AMOUNT" \
      --no-amount "$SEED_AMOUNT" >/dev/null
  else
    stellar contract invoke \
      --network "$NETWORK" \
      --source-account "$SOURCE" \
      --id "$SABI_CTF_ID" \
      -- \
      split_position \
      --user "$MAKER" \
      --collateral-token "$MOCK_USDC_ID" \
      --parent-collection-id "$EMPTY_COLLECTION" \
      --condition-id "$CONDITION_ID" \
      --partition "[1,2]" \
      --amount "$SEED_AMOUNT" >/dev/null

    stellar contract invoke \
      --network "$NETWORK" \
      --source-account "$SOURCE" \
      --id "$SABI_EXCHANGE_ID" \
      -- \
      deposit_inventory \
      --provider "$MAKER" \
      --condition-id "$CONDITION_ID" \
      --outcome-index 0 \
      --amount "$SEED_AMOUNT" >/dev/null

    stellar contract invoke \
      --network "$NETWORK" \
      --source-account "$SOURCE" \
      --id "$SABI_EXCHANGE_ID" \
      -- \
      deposit_inventory \
      --provider "$MAKER" \
      --condition-id "$CONDITION_ID" \
      --outcome-index 1 \
      --amount "$SEED_AMOUNT" >/dev/null
  fi

  if [[ "$EXIT_COLLATERAL_AMOUNT" != "0" ]]; then
    if [[ -n "$SABI_LIQUIDITY_MANAGER_ID" ]]; then
      stellar contract invoke \
        --network "$NETWORK" \
        --source-account "$SOURCE" \
        --id "$SABI_LIQUIDITY_MANAGER_ID" \
        -- \
        deposit_collateral \
        --provider "$MAKER" \
        --condition-id "$CONDITION_ID" \
        --amount "$EXIT_COLLATERAL_AMOUNT" >/dev/null
    else
      stellar contract invoke \
        --network "$NETWORK" \
        --source-account "$SOURCE" \
        --id "$MOCK_USDC_ID" \
        -- \
        approve \
        --from "$MAKER" \
        --spender "$SABI_EXCHANGE_ID" \
        --amount "$EXIT_COLLATERAL_AMOUNT" \
        --expiration-ledger 0 >/dev/null

      stellar contract invoke \
        --network "$NETWORK" \
        --source-account "$SOURCE" \
        --id "$SABI_EXCHANGE_ID" \
        -- \
        deposit_collateral \
        --provider "$MAKER" \
        --amount "$EXIT_COLLATERAL_AMOUNT" >/dev/null
    fi
  fi
else
  stellar contract invoke \
    --network "$NETWORK" \
    --source-account "$SOURCE" \
    --id "$SABI_CTF_ID" \
    -- \
    split_position \
    --user "$MAKER" \
    --collateral-token "$MOCK_USDC_ID" \
    --parent-collection-id "$EMPTY_COLLECTION" \
    --condition-id "$CONDITION_ID" \
    --partition "[1,2]" \
    --amount "$SEED_AMOUNT" >/dev/null
fi

echo "Market created and seeded."
echo "Condition ID: $CONDITION_ID"
