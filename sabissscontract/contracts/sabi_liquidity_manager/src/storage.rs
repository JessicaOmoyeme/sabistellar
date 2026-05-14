use soroban_sdk::{contracttype, Address, BytesN};

#[derive(Clone, Debug)]
#[contracttype]
pub struct LiquidityPosition {
    pub yes_amount: u128,
    pub no_amount: u128,
    pub idle_yes_amount: u128,
    pub idle_no_amount: u128,
    pub collateral_amount: u128,
    pub claimable_collateral_amount: u128,
    pub timestamp: u64,
    pub active: bool,
}

#[derive(Clone, Debug)]
#[contracttype]
pub struct LiquidityTotals {
    pub idle_yes_total: u128,
    pub idle_no_total: u128,
    pub posted_yes_total: u128,
    pub posted_no_total: u128,
    pub claimable_collateral_total: u128,
}

#[derive(Clone)]
#[contracttype]
pub enum LiquidityDataKey {
    Exchange,
    MarketContract,
    CtfContract,
    CollateralToken,
    Position(BytesN<32>, Address),
    MarketTotals(BytesN<32>),
    EventTotals(BytesN<32>),
    MarketProviders(BytesN<32>),
    ProviderIndex(BytesN<32>, Address),
}
