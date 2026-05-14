use crate::storage::{Market, MarketEvent, ResolutionProposal};
use soroban_sdk::{contractclient, Address, BytesN, Env, Vec};

#[contractclient(name = "MarketClient")]
pub trait IMarket {
    fn init(env: Env, admin: Address, ctf_contract: Address);
    fn transfer_admin(env: Env, new_admin: Address);
    fn pause(env: Env);
    fn unpause(env: Env);
    fn is_paused(env: Env) -> bool;
    fn get_ctf_contract(env: Env) -> Address;
    fn create_event(
        env: Env,
        event_id: BytesN<32>,
        group_id: BytesN<32>,
        series_id: BytesN<32>,
        neg_risk: bool,
    );
    fn create_binary_market(
        env: Env,
        question_id: BytesN<32>,
        end_time: u64,
        oracle: Address,
    ) -> BytesN<32>;
    fn create_binary_market_for_event(
        env: Env,
        event_id: BytesN<32>,
        question_id: BytesN<32>,
        end_time: u64,
        oracle: Address,
    ) -> BytesN<32>;
    fn create_multi_outcome_market(
        env: Env,
        question_id: BytesN<32>,
        end_time: u64,
        oracle: Address,
        outcome_count: u32,
    ) -> BytesN<32>;
    fn create_neg_risk_market(
        env: Env,
        question_id: BytesN<32>,
        end_time: u64,
        oracle: Address,
        outcome_count: u32,
    ) -> BytesN<32>;
    fn market_exists(env: Env, condition_id: BytesN<32>) -> bool;
    fn event_exists(env: Env, event_id: BytesN<32>) -> bool;
    fn pause_market(env: Env, condition_id: BytesN<32>);
    fn unpause_market(env: Env, condition_id: BytesN<32>);
    fn propose_resolution(
        env: Env,
        resolver: Address,
        condition_id: BytesN<32>,
        winning_outcome: u32,
    );
    fn dispute_resolution(env: Env, disputer: Address, condition_id: BytesN<32>);
    fn finalize_resolution(env: Env, condition_id: BytesN<32>);
    fn resolve_market(env: Env, oracle: Address, condition_id: BytesN<32>, winning_outcome: u32);
    fn get_resolution_proposal(env: Env, condition_id: BytesN<32>) -> Option<ResolutionProposal>;
    fn get_resolution_dispute_window(env: Env) -> u64;
    fn set_resolution_dispute_window(env: Env, window: u64);
    fn is_market_resolved(env: Env, condition_id: BytesN<32>) -> bool;
    fn has_market_ended(env: Env, condition_id: BytesN<32>) -> bool;
    fn get_market(env: Env, condition_id: BytesN<32>) -> Market;
    fn get_markets(env: Env, condition_ids: Vec<BytesN<32>>) -> Vec<Market>;
    fn get_event(env: Env, event_id: BytesN<32>) -> MarketEvent;
    fn get_event_markets(env: Env, event_id: BytesN<32>) -> Vec<BytesN<32>>;
    fn get_market_event(env: Env, condition_id: BytesN<32>) -> BytesN<32>;
    fn set_market_metadata(env: Env, condition_id: BytesN<32>, metadata_hash: BytesN<32>);
    fn get_market_metadata(env: Env, condition_id: BytesN<32>) -> BytesN<32>;
}
