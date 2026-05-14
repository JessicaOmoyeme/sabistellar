# Soroban Deployment Notes

Do not commit live secret keys or seed phrases.

## Current Testnet Deployment

- `MOCK_USDC_ID=CCQSXQ6RF6TRVAQPMIHOHXYZRMCC7EKH5ZEVR2JPPCPS4BCJ4ISLHUND`
- `SABI_CTF_ID=CAKCJAHZA3QISC53J7L74GFOQNHEW5CAXZGV3A7RPG2PM2M33G6HD4YI`
- `SABI_MARKET_ID=CBNZZNIMQKGKEHBQLZVCIM3O44R2QIHKKKAIPV5GMTB3LUUDC57WC6DB`
- `SABI_EXCHANGE_ID=CA325CBNOJC6DWPPLEB43GIQWNFKDRVTCZRNRRH4MCV4VIH7LPXTMN2X`

## Deployment Output Files

Use `deployments/<network>-modular.env` for non-secret values such as:
- `MOCK_USDC_ID`
- `SABI_CTF_ID`
- `SABI_MARKET_ID`
- `SABI_EXCHANGE_ID`
- `ADMIN`
- `OPERATOR`
- `FEE_RECIPIENT`

## Useful Commands

Build:

```bash
stellar contract build --package mock_usdc
stellar contract build --package sabi-ctf
stellar contract build --package sabi-market
stellar contract build --package sabi-exchange
```

Run checks:

```bash
cargo check -p sabi-ctf -p sabi-market -p sabi-exchange -p mock_usdc
```

Deploy and initialize:

```bash
./scripts/deploy_modular_mvp.sh
```

Create and seed a binary market:

```bash
./scripts/bootstrap_modular_market.sh
```

Read exchange config without sending a transaction:

```bash
stellar contract invoke \
  --network testnet \
  --source-account my-wallet \
  --id CA325CBNOJC6DWPPLEB43GIQWNFKDRVTCZRNRRH4MCV4VIH7LPXTMN2X \
  --send no \
  -- \
  get_collateral_token
```


deputy radar stone empty connect width pair shop cliff filter void student future junior doll raccoon bus silly cabin autumn panther diagram world silent