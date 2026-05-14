#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

: "${NETWORK:?set NETWORK}"
: "${SOURCE:?set SOURCE}"
: "${ADMIN:?set ADMIN}"

WASM_DIR="${WASM_DIR:-target/wasm32v1-none/release}"
WALLET_FACTORY_ALIAS="${WALLET_FACTORY_ALIAS:-sabi-wallet-factory}"
OUTPUT_FILE="${OUTPUT_FILE:-deployments/${NETWORK}-wallet-factory.env}"

mkdir -p "$(dirname "$OUTPUT_FILE")"

echo "Building wallet contracts..."
stellar contract build --package sabi-wallet
stellar contract build --package sabi-wallet-factory

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

cat >"$OUTPUT_FILE" <<EOF
NETWORK=$NETWORK
SOURCE=$SOURCE
ADMIN=$ADMIN
SABI_WALLET_WASM_HASH=$WALLET_WASM_HASH
SABI_WALLET_FACTORY_ID=$WALLET_FACTORY_ID
EOF

echo "Wallet factory deployment complete."
echo "SabiWalletWasm: $WALLET_WASM_HASH"
echo "SabiWalletFac:  $WALLET_FACTORY_ID"
echo "Wrote $OUTPUT_FILE"
