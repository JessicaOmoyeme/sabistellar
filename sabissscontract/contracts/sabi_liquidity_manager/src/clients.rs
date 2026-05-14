use soroban_sdk::{contractclient, contracttype, Address, BytesN, Env, Vec};

#[contractclient(name = "ExchangeClient")]
pub trait IExchangeClient {
    fn deposit_inventory(
        env: Env,
        provider: Address,
        condition_id: BytesN<32>,
        outcome_index: u32,
        amount: u128,
    );
    fn deposit_inventory_lm(
        env: Env,
        provider: Address,
        condition_id: BytesN<32>,
        outcome_index: u32,
        amount: u128,
    );
    fn deposit_collateral(env: Env, provider: Address, amount: u128);
    fn deposit_collateral_lm(env: Env, provider: Address, amount: u128);
    fn release_inventory(
        env: Env,
        condition_id: BytesN<32>,
        outcome_index: u32,
        amount: u128,
        recipient: Address,
    );
    fn release_pool_collateral(env: Env, amount: u128, recipient: Address);
}

#[contractclient(name = "MarketClient")]
pub trait IMarketClient {
    fn get_market(env: Env, condition_id: BytesN<32>) -> MarketView;
    fn get_market_event(env: Env, condition_id: BytesN<32>) -> BytesN<32>;
}

#[contractclient(name = "CtfClient")]
pub trait ICtfClient {
    fn get_collection_id(
        env: Env,
        parent_collection_id: BytesN<32>,
        condition_id: BytesN<32>,
        index_set: u32,
    ) -> BytesN<32>;
    fn get_position_id(
        env: Env,
        collateral_token: Address,
        collection_id: BytesN<32>,
    ) -> BytesN<32>;
    fn split_position(
        env: Env,
        user: Address,
        collateral_token: Address,
        parent_collection_id: BytesN<32>,
        condition_id: BytesN<32>,
        partition: Vec<u32>,
        amount: u128,
    );
    fn split_position_lm(
        env: Env,
        user: Address,
        collateral_token: Address,
        parent_collection_id: BytesN<32>,
        condition_id: BytesN<32>,
        partition: Vec<u32>,
        amount: u128,
    );
    fn transfer_position_lm(
        env: Env,
        from: Address,
        to: Address,
        position_id: BytesN<32>,
        amount: u128,
    );
    fn merge_positions_lm(
        env: Env,
        holder: Address,
        recipient: Address,
        collateral_token: Address,
        parent_collection_id: BytesN<32>,
        condition_id: BytesN<32>,
        partition: Vec<u32>,
        amount: u128,
    );
}

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
pub struct MarketView {
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
