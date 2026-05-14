use crate::storage::NegRiskEventConfig;
use soroban_sdk::{contractclient, Address, BytesN, Env, Vec};

#[contractclient(name = "NegRiskClient")]
pub trait INegRisk {
    fn init(
        env: Env,
        admin: Address,
        market_contract: Address,
        ctf_contract: Address,
        collateral_token: Address,
    );
    fn transfer_admin(env: Env, new_admin: Address);
    fn pause(env: Env);
    fn unpause(env: Env);
    fn is_paused(env: Env) -> bool;
    fn register_neg_risk_event(env: Env, event_id: BytesN<32>, other_market: BytesN<32>);
    fn set_other_market(env: Env, event_id: BytesN<32>, other_market: BytesN<32>);
    fn set_placeholder_market(env: Env, condition_id: BytesN<32>, is_placeholder: bool);
    fn deposit_yes_inventory(env: Env, provider: Address, condition_id: BytesN<32>, amount: u128);
    fn withdraw_yes_inventory(env: Env, condition_id: BytesN<32>, amount: u128, recipient: Address);
    fn preview_no_to_yes_set(
        env: Env,
        source_condition_id: BytesN<32>,
        amount: u128,
    ) -> (BytesN<32>, Vec<BytesN<32>>, Vec<BytesN<32>>, Vec<u128>);
    fn convert_no_to_yes_set(
        env: Env,
        user: Address,
        source_condition_id: BytesN<32>,
        amount: u128,
    );
    fn get_event_config(env: Env, event_id: BytesN<32>) -> NegRiskEventConfig;
    fn is_neg_risk_market(env: Env, condition_id: BytesN<32>) -> bool;
    fn is_placeholder_market(env: Env, condition_id: BytesN<32>) -> bool;
    fn get_yes_inventory(env: Env, condition_id: BytesN<32>) -> u128;
}
