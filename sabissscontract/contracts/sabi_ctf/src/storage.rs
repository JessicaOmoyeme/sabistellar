use soroban_sdk::{contracttype, Address, BytesN, Vec};

#[derive(Clone)]
#[contracttype]
pub struct Condition {
    pub oracle: Address,
    pub outcome_slot_count: u32,
    pub payout_numerators: Vec<u32>,
    pub payout_denominator: u32,
}

#[derive(Clone)]
#[contracttype]
pub enum CtfDataKey {
    Condition(BytesN<32>),
    PositionSupply(BytesN<32>),
    PositionBalance(Address, BytesN<32>),
}
