use soroban_sdk::{contractclient, Address, BytesN, Env, Vec};

#[contractclient(name = "CtfClient")]
pub trait ICtf {
    fn init(env: Env, admin: Address);
    fn transfer_admin(env: Env, new_admin: Address);
    fn pause(env: Env);
    fn unpause(env: Env);
    fn is_paused(env: Env) -> bool;
    fn set_exchange_contract(env: Env, exchange_contract: Address);
    fn get_exchange_contract(env: Env) -> Option<Address>;
    fn set_liquidity_manager_contract(env: Env, liquidity_manager_contract: Address);
    fn get_liquidity_manager_contract(env: Env) -> Option<Address>;
    fn set_market_contract(env: Env, market_contract: Address);
    fn get_market_contract(env: Env) -> Option<Address>;
    fn prepare_condition(
        env: Env,
        oracle: Address,
        question_id: BytesN<32>,
        outcome_slot_count: u32,
    );
    fn report_payouts(env: Env, oracle: Address, question_id: BytesN<32>, payouts: Vec<u32>);
    fn report_payouts_by_condition(env: Env, condition_id: BytesN<32>, payouts: Vec<u32>);
    fn split_position(
        env: Env,
        user: Address,
        collateral_token: Address,
        parent_collection_id: BytesN<32>,
        condition_id: BytesN<32>,
        partition: Vec<u32>,
        amount: u128,
    );
    fn merge_positions(
        env: Env,
        user: Address,
        collateral_token: Address,
        parent_collection_id: BytesN<32>,
        condition_id: BytesN<32>,
        partition: Vec<u32>,
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
    fn redeem_positions(
        env: Env,
        user: Address,
        collateral_token: Address,
        parent_collection_id: BytesN<32>,
        condition_id: BytesN<32>,
        index_sets: Vec<u32>,
    );
    fn get_position_balance(env: Env, user: Address, position_id: BytesN<32>) -> u128;
    fn get_position_supply(env: Env, position_id: BytesN<32>) -> u128;
    fn transfer_position(
        env: Env,
        from: Address,
        to: Address,
        position_id: BytesN<32>,
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
    fn mint_position(env: Env, user: Address, position_id: BytesN<32>, amount: u128);
    fn burn_position(env: Env, user: Address, position_id: BytesN<32>, amount: u128);
    fn get_condition_id(
        env: Env,
        oracle: Address,
        question_id: BytesN<32>,
        outcome_slot_count: u32,
    ) -> BytesN<32>;
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
}
