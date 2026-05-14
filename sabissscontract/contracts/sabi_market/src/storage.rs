use soroban_sdk::{contracttype, Address, BytesN};

#[derive(Clone, PartialEq, Debug)]
#[contracttype]
pub enum MarketType {
    Binary,
    MultiOutcome,
    NegRisk,
}

#[derive(Clone, PartialEq, Debug)]
#[contracttype]
pub enum MarketStatus {
    Open,
    Closed,
    Resolved,
    Paused,
}

#[derive(Clone, Debug)]
#[contracttype]
pub struct Market {
    pub question_id: BytesN<32>,
    pub condition_id: BytesN<32>,
    pub end_time: u64,
    pub oracle: Address,
    pub market_type: MarketType,
    pub outcome_count: u32,
    pub status: MarketStatus,
    pub resolved: bool,
    pub winning_outcome: u32,
}

#[derive(Clone, Debug)]
#[contracttype]
pub struct MarketEvent {
    pub group_id: BytesN<32>,
    pub series_id: BytesN<32>,
    pub neg_risk: bool,
    pub exists: bool,
    pub market_count: u32,
    pub created_at: u64,
}

#[derive(Clone, Debug)]
#[contracttype]
pub struct ResolutionProposal {
    pub proposer: Address,
    pub winning_outcome: u32,
    pub proposed_at: u64,
    pub dispute_deadline: u64,
    pub disputed: bool,
    pub finalized: bool,
}

#[derive(Clone)]
#[contracttype]
pub enum MarketDataKey {
    Market(BytesN<32>),
    Event(BytesN<32>),
    EventMarkets(BytesN<32>),
    MarketToEvent(BytesN<32>),
    MarketMetadata(BytesN<32>),
    ResolutionProposal(BytesN<32>),
    ResolutionDisputeWindow,
}
