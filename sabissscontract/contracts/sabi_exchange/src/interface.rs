use crate::storage::{Order, OrderStatus};
use soroban_sdk::{contractclient, Address, Bytes, BytesN, Env, Vec};

#[contractclient(name = "ExchangeClient")]
pub trait IExchange {
    fn init(
        env: Env,
        admin: Address,
        operator: Address,
        ctf_contract: Address,
        market_contract: Address,
        collateral_token: Address,
        fee_recipient: Address,
    );
    fn transfer_admin(env: Env, new_admin: Address);
    fn set_operator(env: Env, operator: Address);
    fn get_operator(env: Env) -> Address;
    fn pause(env: Env);
    fn unpause(env: Env);
    fn is_paused(env: Env) -> bool;
    fn set_collateral_token(env: Env, collateral_token: Address);
    fn get_collateral_token(env: Env) -> Address;
    fn set_fee_recipient(env: Env, fee_recipient: Address);
    fn get_fee_recipient(env: Env) -> Address;
    fn set_liquidity_manager(env: Env, liquidity_manager: Address);
    fn get_liquidity_manager(env: Env) -> Option<Address>;
    fn set_price(env: Env, condition_id: BytesN<32>, outcome_index: u32, price_bps: u32);
    fn get_price(env: Env, condition_id: BytesN<32>, outcome_index: u32) -> u32;
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
    fn withdraw_inventory(
        env: Env,
        condition_id: BytesN<32>,
        outcome_index: u32,
        amount: u128,
        recipient: Address,
    );
    fn deposit_collateral(env: Env, provider: Address, amount: u128);
    fn deposit_collateral_lm(env: Env, provider: Address, amount: u128);
    fn withdraw_collateral(env: Env, amount: u128, recipient: Address);
    fn buy_outcome(
        env: Env,
        buyer: Address,
        condition_id: BytesN<32>,
        outcome_index: u32,
        usdc_amount: u128,
    ) -> u128;
    fn sell_outcome(
        env: Env,
        seller: Address,
        condition_id: BytesN<32>,
        outcome_index: u32,
        token_amount: u128,
    ) -> u128;
    fn get_available_liquidity(env: Env, condition_id: BytesN<32>, outcome_index: u32) -> u128;
    fn get_collateral_balance(env: Env) -> u128;
    fn release_inventory(
        env: Env,
        condition_id: BytesN<32>,
        outcome_index: u32,
        amount: u128,
        recipient: Address,
    );
    fn release_pool_collateral(env: Env, amount: u128, recipient: Address);
    fn set_min_trade_amount(env: Env, amount: u128);
    fn set_max_trade_amount(env: Env, amount: u128);
    fn get_min_trade_amount(env: Env) -> u128;
    fn get_max_trade_amount(env: Env) -> u128;
    fn fill_order(env: Env, order: Order, signature: Bytes, fill_amount: u128);
    fn match_orders(
        env: Env,
        taker_order: Order,
        taker_signature: Bytes,
        maker_orders: Vec<Order>,
        maker_signatures: Vec<Bytes>,
        taker_fill_amount: u128,
        maker_fill_amounts: Vec<u128>,
    );
    fn match_complementary_orders(
        env: Env,
        left_order: Order,
        left_signature: Bytes,
        right_order: Order,
        right_signature: Bytes,
        left_fill_amount: u128,
        right_fill_amount: u128,
    );
    fn cancel_order_by_nonce(env: Env, maker: Address, nonce: u64);
    fn get_filled_amount(env: Env, maker: Address, nonce: u64) -> u128;
    fn is_order_cancelled(env: Env, maker: Address, nonce: u64) -> bool;
    fn get_order_status(env: Env, order: Order) -> OrderStatus;
}
