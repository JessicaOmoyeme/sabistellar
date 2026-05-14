# SabiStellar

SabiStellar is an open-source prediction market stack built on Stellar and Soroban. The repository combines modular smart contracts, a Rust backend, a public trading interface, and an admin console for creating, publishing, operating, and resolving markets.

This repo is intended to grow into reusable public infrastructure for builders on Stellar, not just a single app. The goal is to make it easier to launch credible market-based products with open contracts, transparent backend flows, and reference frontends that other teams can study, fork, and improve.

## Why this project matters

Prediction markets need more than one contract. They need issuance logic, trading, liquidity management, resolution workflows, operator tooling, wallet onboarding, indexing, and user interfaces that make the system usable in practice.

SabiStellar focuses on that full stack:

- open Soroban contracts for market primitives
- a backend that exposes market, order, liquidity, auth, comment, faucet, and admin APIs
- a public client for discovery, trading, and portfolio views
- an admin client for event creation, publishing, liquidity bootstrapping, and resolution handling
- smart-wallet support to improve onboarding for non-technical users

For an open-source funding application such as a Drips grant, the case for support is straightforward: this repo is building reusable market infrastructure for the Stellar ecosystem, and the work benefits more than a single deployment because the components are modular, documented, and meant to be maintained in public.

## What is implemented today

### Onchain contracts

The Soroban workspace in `sabissscontract/` currently contains:

- `mock_usdc`: test collateral token for local and testnet workflows
- `sabi_ctf`: conditional token framework for split, merge, and redeem flows
- `sabi_market`: market and event state, metadata, and resolution hooks
- `sabi_exchange`: order execution, operator settlement, and fixed-price inventory trading
- `sabi_liquidity_manager`: provider accounting for inventory and collateral positions
- `sabi_neg_risk`: grouped-event adapter for neg-risk market structures
- `sabi_wallet`: smart wallet contract
- `sabi_wallet_factory`: wallet deployment factory for managed wallet onboarding

### Backend services

The Rust backend in `sabissbackend/` exposes:

- wallet challenge and wallet-connect authentication
- Google sign-in support
- managed smart-wallet profile creation
- public market discovery endpoints for events, categories, tags, home feeds, search, and market detail
- authenticated trading endpoints for buy, sell, split, and merge flows
- order creation, cancellation, matching, fills, positions, and portfolio endpoints
- liquidity deposit, removal, and withdrawal flows
- public comments plus authenticated replies and likes
- admin-only market creation, updates, publication, liquidity bootstrap, pricing, pause/unpause, and resolution workflows
- image upload endpoints for admin media operations
- contract configuration and mock USDC faucet endpoints

### Frontend applications

The repository includes two SolidStart apps:

- `sabissfrontewq/`: the public client for browsing events and markets, viewing liquidity and activity, searching markets, accessing a portfolio, and interacting with backend trading flows
- `sabissadminfronte/`: the admin and operator console for creating and managing events and markets, publishing content, configuring liquidity, and handling resolution operations

## Architecture

At a high level, the stack works like this:

1. Soroban contracts define the market, exchange, liquidity, wallet, and conditional token primitives.
2. The Rust backend stores read-side state in Postgres, serves public and authenticated APIs, manages admin workflows, and coordinates wallet/auth integrations.
3. The public frontend consumes those APIs for market browsing, trading UX, portfolio views, comments, and wallet interactions.
4. The admin frontend consumes protected APIs for publishing markets, operating liquidity, and resolving outcomes.

This separation is deliberate. It keeps the contracts focused on settlement logic while allowing the backend and UI layers to evolve independently around indexing, moderation, onboarding, and operator tooling.

## Why this fits open-source grant support

The strongest reason to fund this repository is that it is building shared infrastructure for a new category of Stellar applications.

Support for this repo would directly help:

- harden the Soroban contracts and expand test coverage
- improve documentation so other developers can deploy and extend the stack
- strengthen wallet onboarding and account abstraction flows
- improve market operations tooling for admins and maintainers
- ship more complete deployment scripts, environment examples, and contributor guidance
- maintain the codebase in public as a reusable reference implementation

In short: the value is not only the end product, but the open, maintainable building blocks it creates for the ecosystem.

## Repository layout

| Path | Purpose |
| --- | --- |
| `sabissscontract/` | Soroban smart contracts, deployment scripts, and contract docs |
| `sabissbackend/` | Rust backend using Axum, SQLx, and Postgres |
| `sabissfrontewq/` | Public SolidStart frontend |
| `sabissadminfronte/` | Admin SolidStart frontend |

## Local development

### Prerequisites

- Node.js 22+
- npm or pnpm
- Rust toolchain
- Soroban CLI / Stellar CLI
- PostgreSQL

### Backend environment

The backend reads configuration from environment variables at startup. The most important required values are:

- `DATABASE_URL`
- `JWT_SECRET`
- `NETWORK`
- `SOURCE`
- `ADMIN`
- `OPERATOR`
- `FEE_RECIPIENT`
- `RPC_URL`
- `MOCK_USDC_ID`
- `SABI_CTF_ID`
- `SABI_MARKET_ID`
- `SABI_EXCHANGE_ID`
- `SABI_LIQUIDITY_MANAGER_ID`
- `SABI_NEG_RISK_ID`

Depending on the features you want to use, you may also need:

- `STELLAR_AA_SPONSOR_ADDRESS`
- `SABI_WALLET_FACTORY_ID`
- `GOOGLE_CLIENT_ID`
- Filebase / IPFS upload credentials
- `CORS_ALLOWED_ORIGINS`

By default, the backend CORS configuration already allows local frontend origins such as `http://localhost:3000`, `http://localhost:5173`, and `http://localhost:5174`.

### Start the backend

```bash
cd sabissbackend
cargo run
```

### Start the public frontend

```bash
cd sabissfrontewq
npm install
npm run dev
```

Set `VITE_API_BASE_URL` if your backend is not running on `http://localhost:8080`.

### Start the admin frontend

```bash
cd sabissadminfronte
npm install
npm run dev
```

## Contracts workflow

The contract workspace already includes deployment and bootstrap scripts for testnet flows.

Build contracts:

```bash
cd sabissscontract
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

The contract package also includes:

- `scripts/deploy_modular_mvp.sh`
- `scripts/bootstrap_modular_market.sh`
- `scripts/deploy_wallet_factory.sh`

## Testing

Backend:

```bash
cd sabissbackend
cargo test
```

Public frontend:

```bash
cd sabissfrontewq
npm install
npm test
```

Admin frontend:

```bash
cd sabissadminfronte
npm install
npm test
```

## Current status

This is an active work-in-progress repository with a meaningful amount of end-to-end functionality already in place. It is best described today as an open MVP and reference implementation rather than a finished production system.

That is exactly why maintenance and grant support matter: the core pieces exist, the architecture is already modular, and continued work can turn this into a durable public resource for Stellar builders.

## Contribution direction

The most valuable next improvements are:

- better deployment and environment templates
- deeper contract and integration testing
- improved docs for contributors and operators
- clearer local dev setup for the full stack
- production hardening for wallet, liquidity, and resolution flows

If you are reviewing this repository for funding or ecosystem support, the main point is simple: SabiStellar is building open prediction market infrastructure on Stellar, and the code here is structured to be maintained, extended, and reused by others.
