use soroban_sdk::{contractclient, contracttype, Address, BytesN, Env};

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
    fn get_position_balance(env: Env, user: Address, position_id: BytesN<32>) -> u128;
    fn transfer_position(
        env: Env,
        from: Address,
        to: Address,
        position_id: BytesN<32>,
        amount: u128,
    );
    fn transfer_position_lm(
        env: Env,
        from: Address,
        to: Address,
        position_id: BytesN<32>,
        amount: u128,
    );
    fn mint_position(env: Env, user: Address, position_id: BytesN<32>, amount: u128);
    fn burn_position(env: Env, user: Address, position_id: BytesN<32>, amount: u128);
    fn merge_positions(
        env: Env,
        user: Address,
        collateral_token: Address,
        parent_collection_id: BytesN<32>,
        condition_id: BytesN<32>,
        partition: soroban_sdk::Vec<u32>,
        amount: u128,
    );
}

#[contractclient(name = "MarketClient")]
pub trait IMarketClient {
    fn get_market(env: Env, condition_id: BytesN<32>) -> MarketView;
    fn get_event(env: Env, event_id: BytesN<32>) -> MarketEventView;
    fn get_event_markets(env: Env, event_id: BytesN<32>) -> soroban_sdk::Vec<BytesN<32>>;
    fn get_market_event(env: Env, condition_id: BytesN<32>) -> BytesN<32>;
    fn market_exists(env: Env, condition_id: BytesN<32>) -> bool;
    fn event_exists(env: Env, event_id: BytesN<32>) -> bool;
}

#[contractclient(name = "LiquidityManagerClient")]
pub trait ILiquidityManagerClient {
    fn record_trade(
        env: Env,
        condition_id: BytesN<32>,
        outcome_index: u32,
        token_amount: u128,
        collateral_amount: u128,
        maker_sold_inventory: bool,
    );
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

#[derive(Clone, PartialEq, Debug)]
#[contracttype]
pub enum MarketType {
    Binary,
    MultiOutcome,
    NegRisk,
}

#[derive(Clone, Debug)]
#[contracttype]
pub struct MarketEventView {
    pub group_id: BytesN<32>,
    pub series_id: BytesN<32>,
    pub neg_risk: bool,
    pub exists: bool,
    pub market_count: u32,
    pub created_at: u64,
}
