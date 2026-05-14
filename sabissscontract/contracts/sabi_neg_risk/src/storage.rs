use soroban_sdk::{contracttype, Address, BytesN};

#[derive(Clone, Debug)]
#[contracttype]
pub struct NegRiskEventConfig {
    pub registered: bool,
    pub has_other: bool,
    pub other_market: BytesN<32>,
}

#[derive(Clone)]
#[contracttype]
pub enum NegRiskDataKey {
    MarketContract,
    CtfContract,
    CollateralToken,
    EventConfig(BytesN<32>),
    PlaceholderMarket(BytesN<32>),
    YesInventory(BytesN<32>),
    _Unused(Address),
}
