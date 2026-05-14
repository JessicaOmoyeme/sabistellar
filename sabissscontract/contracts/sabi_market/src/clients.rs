use soroban_sdk::{contractclient, Address, BytesN, Env, Vec};

#[contractclient(name = "CtfClient")]
pub trait ICtfClient {
    fn prepare_condition(
        env: Env,
        oracle: Address,
        question_id: BytesN<32>,
        outcome_slot_count: u32,
    );
    fn report_payouts(env: Env, oracle: Address, question_id: BytesN<32>, payouts: Vec<u32>);
    fn report_payouts_by_condition(env: Env, condition_id: BytesN<32>, payouts: Vec<u32>);
    fn get_condition_id(
        env: Env,
        oracle: Address,
        question_id: BytesN<32>,
        outcome_slot_count: u32,
    ) -> BytesN<32>;
}
