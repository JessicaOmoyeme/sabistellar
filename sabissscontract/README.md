# Sabi Soroban Contracts

Soroban MVP prediction-market contracts split into standalone modules:
- `mock_usdc`
- `sabi_ctf`
- `sabi_market`
- `sabi_exchange`
- `sabi_liquidity_manager`
- `sabi_neg_risk`

## Architecture

- `mock_usdc`: test collateral token for localnet and testnet workflows
- `sabi_ctf`: conditional tokens ledger, split, merge, redeem, position math
- `sabi_market`: market creation, event mapping, resolution, metadata
- `sabi_exchange`: operator-settled order execution and matching, plus fixed-price inventory trading for liquidity-first markets
- `sabi_liquidity_manager`: per-provider pool accounting for posted YES/NO inventory and claimable exit collateral
- `sabi_neg_risk`: grouped-event adapter that converts NO exposure into YES inventory across sibling markets

Each contract has its own storage and contract address.

## Contract Flow

1. Deploy `mock_usdc`
2. Deploy `sabi_ctf`
3. Deploy `sabi_market` and initialize it with the `sabi_ctf` contract address
4. Deploy `sabi_exchange` and initialize it with:
   - `sabi_ctf` address
   - `sabi_market` address
   - `mock_usdc` address
   - operator
   - fee recipient
5. Deploy `sabi_liquidity_manager`, initialize it with the exchange + market + ctf + collateral addresses, then set it on `sabi_exchange`
6. Deploy `sabi_neg_risk` and initialize it with the market + ctf + collateral addresses

Runtime flow:
- `sabi_market.create_*` creates market state and prepares the condition in `sabi_ctf`
- `sabi_ctf.split_position` mints YES/NO or multi-outcome positions
- `sabi_exchange` reads market state from `sabi_market` and moves position balances in `sabi_ctf`
- optional liquidity-first flow: set YES/NO prices on `sabi_exchange`, deposit inventory into the exchange, and fund exit collateral before users call `buy_outcome` / `sell_outcome`
- `sabi_market.resolve_market` reports payouts into `sabi_ctf`
- staged resolution flow is also supported through `propose_resolution`, `dispute_resolution`, and `finalize_resolution`
- `sabi_ctf.redeem_positions` redeems winning claims
- grouped neg-risk events can hold YES inventory inside `sabi_neg_risk` and convert NO exposure into a YES basket across sibling binary markets

## Build

```bash
cargo fmt
cargo check -p sabi-ctf -p sabi-market -p sabi-exchange
cargo check -p sabi-liquidity-manager -p sabi-neg-risk
stellar contract build --package mock_usdc
stellar contract build --package sabi-ctf
stellar contract build --package sabi-market
stellar contract build --package sabi-exchange
stellar contract build --package sabi-liquidity-manager
stellar contract build --package sabi-neg-risk
```

## Deploy

```bash
NETWORK=testnet \
SOURCE=my-wallet \
ADMIN=G... \
OPERATOR=G... \
FEE_RECIPIENT=G... \
./scripts/deploy_modular_mvp.sh
```

That script writes deployment ids to `deployments/<network>-modular.env`.

## Create And Seed A Market

```bash
NETWORK=testnet \
SOURCE=my-wallet \
SABI_MARKET_ID=C... \
SABI_CTF_ID=C... \
MOCK_USDC_ID=C... \
SABI_EXCHANGE_ID=C... \
MAKER=G... \
ORACLE=G... \
QUESTION_ID_HEX=1111111111111111111111111111111111111111111111111111111111111111 \
END_TIME=2000000000 \
SEED_AMOUNT=10000000 \
./scripts/bootstrap_modular_market.sh
```

Optional fixed-price seeding in the same script:

```bash
NETWORK=testnet \
SOURCE=my-wallet \
SABI_MARKET_ID=C... \
SABI_CTF_ID=C... \
MOCK_USDC_ID=C... \
SABI_EXCHANGE_ID=C... \
MAKER=G... \
ORACLE=G... \
QUESTION_ID_HEX=1111111111111111111111111111111111111111111111111111111111111111 \
END_TIME=2000000000 \
SEED_AMOUNT=10000000 \
YES_PRICE_BPS=6200 \
NO_PRICE_BPS=3800 \
EXIT_COLLATERAL_AMOUNT=5000000 \
./scripts/bootstrap_modular_market.sh
```

When `EXIT_COLLATERAL_AMOUNT` is set, the bootstrap script now mints `SEED_AMOUNT + EXIT_COLLATERAL_AMOUNT` to the maker so the wallet can both split the initial complete set and fund exit liquidity on `sabi_exchange`.

## Notes

- `sabi_core` has been removed from this repo
- auth is per-contract, not shared through one monolith
- `admin` and `operator` can still be the same address for MVP deployment
- fixed-price exchange actions that pull USDC use allowance-based flows, so the wallet funding `deposit_collateral` or `buy_outcome` must approve `sabi_exchange` first
