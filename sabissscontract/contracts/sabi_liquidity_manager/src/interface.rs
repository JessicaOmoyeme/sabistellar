use crate::storage::{LiquidityPosition, LiquidityTotals};
use soroban_sdk::{contractclient, Address, BytesN, Env};

#[contractclient(name = "LiquidityManagerClient")]
pub trait ILiquidityManager {
    fn init(
        env: Env,
        admin: Address,
        exchange: Address,
        market_contract: Address,
        ctf_contract: Address,
        collateral_token: Address,
    );
    fn transfer_admin(env: Env, new_admin: Address);
    fn pause(env: Env);
    fn unpause(env: Env);
    fn is_paused(env: Env) -> bool;
    fn split_position(
        env: Env,
        provider: Address,
        condition_id: BytesN<32>,
        amount: u128,
    ) -> (u128, u128);
    fn add_liquidity(
        env: Env,
        provider: Address,
        condition_id: BytesN<32>,
        yes_amount: u128,
        no_amount: u128,
    );
    fn split_and_add_liquidity(env: Env, provider: Address, condition_id: BytesN<32>, amount: u128);
    fn deposit_inventory(
        env: Env,
        provider: Address,
        condition_id: BytesN<32>,
        yes_amount: u128,
        no_amount: u128,
    );
    fn deposit_collateral(env: Env, provider: Address, condition_id: BytesN<32>, amount: u128);
    fn remove_liquidity(
        env: Env,
        provider: Address,
        condition_id: BytesN<32>,
        yes_amount: u128,
        no_amount: u128,
    );
    fn withdraw_inventory(
        env: Env,
        provider: Address,
        condition_id: BytesN<32>,
        yes_amount: u128,
        no_amount: u128,
        recipient: Address,
    );
    fn withdraw_collateral(
        env: Env,
        provider: Address,
        condition_id: BytesN<32>,
        amount: u128,
        recipient: Address,
    );
    fn merge_positions(
        env: Env,
        provider: Address,
        condition_id: BytesN<32>,
        amount: u128,
    ) -> u128;
    fn remove_and_merge_liquidity(
        env: Env,
        provider: Address,
        condition_id: BytesN<32>,
        amount: u128,
    ) -> u128;
    fn record_trade(
        env: Env,
        condition_id: BytesN<32>,
        outcome_index: u32,
        token_amount: u128,
        collateral_amount: u128,
        maker_sold_inventory: bool,
    );
    fn get_liquidity_position(env: Env, condition_id: BytesN<32>, provider: Address) -> LiquidityPosition;
    fn get_position(env: Env, condition_id: BytesN<32>, provider: Address) -> LiquidityPosition;
    fn get_total_liquidity(env: Env, condition_id: BytesN<32>) -> (u128, u128);
    fn get_market_liquidity(env: Env, condition_id: BytesN<32>) -> LiquidityTotals;
    fn get_event_liquidity(env: Env, event_id: BytesN<32>) -> LiquidityTotals;
}
