#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

: "${NETWORK:?set NETWORK}"
: "${SOURCE:?set SOURCE}"
: "${ADMIN:?set ADMIN}"
: "${OPERATOR:?set OPERATOR}"
: "${FEE_RECIPIENT:?set FEE_RECIPIENT}"

WASM_DIR="${WASM_DIR:-target/wasm32v1-none/release}"
USDC_ALIAS="${USDC_ALIAS:-mock-usdc}"
CTF_ALIAS="${CTF_ALIAS:-sabi-ctf}"
MARKET_ALIAS="${MARKET_ALIAS:-sabi-market}"
EXCHANGE_ALIAS="${EXCHANGE_ALIAS:-sabi-exchange}"
WALLET_ALIAS="${WALLET_ALIAS:-sabi-wallet}"
WALLET_FACTORY_ALIAS="${WALLET_FACTORY_ALIAS:-sabi-wallet-factory}"
LIQUIDITY_ALIAS="${LIQUIDITY_ALIAS:-sabi-liquidity-manager}"
NEG_RISK_ALIAS="${NEG_RISK_ALIAS:-sabi-neg-risk}"
OUTPUT_FILE="${OUTPUT_FILE:-deployments/${NETWORK}-modular.env}"

mkdir -p "$(dirname "$OUTPUT_FILE")"

echo "Building contracts..."
stellar contract build --package mock_usdc
stellar contract build --package sabi-ctf
stellar contract build --package sabi-market
stellar contract build --package sabi-exchange
stellar contract build --package sabi-wallet
stellar contract build --package sabi-wallet-factory
stellar contract build --package sabi-liquidity-manager
stellar contract build --package sabi-neg-risk

echo "Deploying Mock USDC..."
USDC_ID="$(
  stellar contract deploy \
    --network "$NETWORK" \
    --source-account "$SOURCE" \
    --wasm "$WASM_DIR/mock_usdc.wasm" \
    --alias "$USDC_ALIAS"
)"

echo "Initializing Mock USDC..."
stellar contract invoke \
  --network "$NETWORK" \
  --source-account "$SOURCE" \
  --id "$USDC_ID" \
  -- \
  initialize \
  --admin "$ADMIN" >/dev/null

echo "Deploying SabiCTF..."
CTF_ID="$(
  stellar contract deploy \
    --network "$NETWORK" \
    --source-account "$SOURCE" \
    --wasm "$WASM_DIR/sabi_ctf.wasm" \
    --alias "$CTF_ALIAS"
)"

echo "Initializing SabiCTF..."
stellar contract invoke \
  --network "$NETWORK" \
  --source-account "$SOURCE" \
  --id "$CTF_ID" \
  -- \
  init \
  --admin "$ADMIN" >/dev/null

echo "Deploying SabiMarket..."
MARKET_ID="$(
  stellar contract deploy \
    --network "$NETWORK" \
    --source-account "$SOURCE" \
    --wasm "$WASM_DIR/sabi_market.wasm" \
    --alias "$MARKET_ALIAS"
)"

echo "Initializing SabiMarket..."
stellar contract invoke \
  --network "$NETWORK" \
  --source-account "$SOURCE" \
  --id "$MARKET_ID" \
  -- \
  init \
  --admin "$ADMIN" \
  --ctf-contract "$CTF_ID" >/dev/null

echo "Authorizing SabiMarket in SabiCTF..."
stellar contract invoke \
  --network "$NETWORK" \
  --source-account "$SOURCE" \
  --id "$CTF_ID" \
  -- \
  set_market_contract \
  --market-contract "$MARKET_ID" >/dev/null

echo "Deploying SabiExchange..."
EXCHANGE_ID="$(
  stellar contract deploy \
    --network "$NETWORK" \
    --source-account "$SOURCE" \
    --wasm "$WASM_DIR/sabi_exchange.wasm" \
    --alias "$EXCHANGE_ALIAS"
)"

echo "Initializing SabiExchange..."
stellar contract invoke \
  --network "$NETWORK" \
  --source-account "$SOURCE" \
  --id "$EXCHANGE_ID" \
  -- \
  init \
  --admin "$ADMIN" \
  --operator "$OPERATOR" \
  --ctf-contract "$CTF_ID" \
  --market-contract "$MARKET_ID" \
  --collateral-token "$USDC_ID" \
  --fee-recipient "$FEE_RECIPIENT" >/dev/null

echo "Authorizing SabiExchange in SabiCTF..."
stellar contract invoke \
  --network "$NETWORK" \
  --source-account "$SOURCE" \
  --id "$CTF_ID" \
  -- \
  set_exchange_contract \
  --exchange-contract "$EXCHANGE_ID" >/dev/null

echo "Installing SabiWallet WASM..."
WALLET_WASM_HASH="$(
  stellar contract install \
    --network "$NETWORK" \
    --source-account "$SOURCE" \
    --wasm "$WASM_DIR/sabi_wallet.wasm"
)"

echo "Deploying SabiWalletFactory..."
WALLET_FACTORY_ID="$(
  stellar contract deploy \
    --network "$NETWORK" \
    --source-account "$SOURCE" \
    --wasm "$WASM_DIR/sabi_wallet_factory.wasm" \
    --alias "$WALLET_FACTORY_ALIAS"
)"

echo "Initializing SabiWalletFactory..."
stellar contract invoke \
  --network "$NETWORK" \
  --source-account "$SOURCE" \
  --id "$WALLET_FACTORY_ID" \
  -- \
  init \
  --admin "$ADMIN" \
  --wallet-wasm-hash "$WALLET_WASM_HASH" >/dev/null

echo "Deploying SabiLiquidityManager..."
LIQUIDITY_ID="$(
  stellar contract deploy \
    --network "$NETWORK" \
    --source-account "$SOURCE" \
    --wasm "$WASM_DIR/sabi_liquidity_manager.wasm" \
    --alias "$LIQUIDITY_ALIAS"
)"

echo "Initializing SabiLiquidityManager..."
stellar contract invoke \
  --network "$NETWORK" \
  --source-account "$SOURCE" \
  --id "$LIQUIDITY_ID" \
  -- \
  init \
  --admin "$ADMIN" \
  --exchange "$EXCHANGE_ID" \
  --market-contract "$MARKET_ID" \
  --ctf-contract "$CTF_ID" \
  --collateral-token "$USDC_ID" >/dev/null

echo "Configuring SabiLiquidityManager on SabiExchange..."
stellar contract invoke \
  --network "$NETWORK" \
  --source-account "$SOURCE" \
  --id "$EXCHANGE_ID" \
  -- \
  set_liquidity_manager \
  --liquidity-manager "$LIQUIDITY_ID" >/dev/null

MAX_TRADE_AMOUNT="${MAX_TRADE_AMOUNT:-1000000000000000}"
echo "Setting SabiExchange max trade amount to $MAX_TRADE_AMOUNT..."
stellar contract invoke \
  --network "$NETWORK" \
  --source-account "$SOURCE" \
  --id "$EXCHANGE_ID" \
  -- \
  set_max_trade_amount \
  --amount "$MAX_TRADE_AMOUNT" >/dev/null

echo "Authorizing SabiLiquidityManager in SabiCTF..."
stellar contract invoke \
  --network "$NETWORK" \
  --source-account "$SOURCE" \
  --id "$CTF_ID" \
  -- \
  set_liquidity_manager_contract \
  --liquidity-manager-contract "$LIQUIDITY_ID" >/dev/null

echo "Deploying SabiNegRisk..."
NEG_RISK_ID="$(
  stellar contract deploy \
    --network "$NETWORK" \
    --source-account "$SOURCE" \
    --wasm "$WASM_DIR/sabi_neg_risk.wasm" \
    --alias "$NEG_RISK_ALIAS"
)"

echo "Initializing SabiNegRisk..."
stellar contract invoke \
  --network "$NETWORK" \
  --source-account "$SOURCE" \
  --id "$NEG_RISK_ID" \
  -- \
  init \
  --admin "$ADMIN" \
  --market-contract "$MARKET_ID" \
  --ctf-contract "$CTF_ID" \
  --collateral-token "$USDC_ID" >/dev/null

cat >"$OUTPUT_FILE" <<EOF
NETWORK=$NETWORK
SOURCE=$SOURCE
ADMIN=$ADMIN
OPERATOR=$OPERATOR
FEE_RECIPIENT=$FEE_RECIPIENT
MOCK_USDC_ID=$USDC_ID
SABI_WALLET_WASM_HASH=$WALLET_WASM_HASH
SABI_WALLET_FACTORY_ID=$WALLET_FACTORY_ID
SABI_CTF_ID=$CTF_ID
SABI_MARKET_ID=$MARKET_ID
SABI_EXCHANGE_ID=$EXCHANGE_ID
SABI_LIQUIDITY_MANAGER_ID=$LIQUIDITY_ID
SABI_NEG_RISK_ID=$NEG_RISK_ID
EOF

echo "Deployment complete."
echo "Mock USDC:     $USDC_ID"
echo "SabiWalletWasm:$WALLET_WASM_HASH"
echo "SabiWalletFac: $WALLET_FACTORY_ID"
echo "SabiCTF:       $CTF_ID"
echo "SabiMarket:    $MARKET_ID"
echo "SabiExchange:  $EXCHANGE_ID"
echo "SabiLiquidity: $LIQUIDITY_ID"
echo "SabiNegRisk:   $NEG_RISK_ID"
echo "Wrote $OUTPUT_FILE"
