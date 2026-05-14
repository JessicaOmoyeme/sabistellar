use crate::access;
use crate::clients::CtfClient;
use crate::interface::IMarket;
use crate::storage::{
    Market, MarketDataKey, MarketEvent, MarketStatus, MarketType, ResolutionProposal,
};
use soroban_sdk::{
    auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
    contract, contractimpl, vec, Address, BytesN, Env, IntoVal, Symbol, Vec,
};

const DEFAULT_RESOLUTION_DISPUTE_WINDOW: u64 = 86_400;

fn get_market_or_panic(env: &Env, condition_id: &BytesN<32>) -> Market {
    env.storage()
        .instance()
        .get(&MarketDataKey::Market(condition_id.clone()))
        .expect("Market: Market mapping does not exist")
}

fn get_event_or_panic(env: &Env, event_id: &BytesN<32>) -> MarketEvent {
    env.storage()
        .instance()
        .get(&MarketDataKey::Event(event_id.clone()))
        .expect("Market: Event mapping does not exist")
}

#[contract]
pub struct MarketContract;

impl MarketContract {
    fn ctf_client(env: &Env) -> CtfClient<'_> {
        CtfClient::new(env, &access::get_ctf_contract(env))
    }

    fn get_resolution_dispute_window_or_default(env: &Env) -> u64 {
        env.storage()
            .instance()
            .get(&MarketDataKey::ResolutionDisputeWindow)
            .unwrap_or(DEFAULT_RESOLUTION_DISPUTE_WINDOW)
    }

    fn set_market(
        env: &Env,
        question_id: BytesN<32>,
        condition_id: BytesN<32>,
        end_time: u64,
        oracle: Address,
        market_type: MarketType,
        outcome_count: u32,
    ) -> BytesN<32> {
        env.storage().instance().set(
            &MarketDataKey::Market(condition_id.clone()),
            &Market {
                question_id,
                condition_id: condition_id.clone(),
                end_time,
                oracle,
                market_type,
                outcome_count,
                status: MarketStatus::Open,
                resolved: false,
                winning_outcome: 0,
            },
        );
        condition_id
    }

    fn link_market_to_event(env: &Env, event_id: &BytesN<32>, condition_id: &BytesN<32>) {
        let mut event = get_event_or_panic(env, event_id);
        let mut event_markets: Vec<BytesN<32>> = env
            .storage()
            .instance()
            .get(&MarketDataKey::EventMarkets(event_id.clone()))
            .unwrap_or(Vec::new(env));
        event_markets.push_back(condition_id.clone());
        event.market_count = event
            .market_count
            .checked_add(1)
            .expect("Market: event market count overflow");

        env.storage().instance().set(
            &MarketDataKey::EventMarkets(event_id.clone()),
            &event_markets,
        );
        env.storage()
            .instance()
            .set(&MarketDataKey::Event(event_id.clone()), &event);
        env.storage().instance().set(
            &MarketDataKey::MarketToEvent(condition_id.clone()),
            event_id,
        );
    }

    fn require_resolution_input(market: &Market, winning_outcome: u32) {
        if winning_outcome >= market.outcome_count {
            panic!("Market: Invalid winning outcome index");
        }
    }

    fn finalize_market(env: &Env, condition_id: &BytesN<32>, winning_outcome: u32) {
        let mut market = get_market_or_panic(env, condition_id);
        if market.resolved {
            panic!("Market: Market already resolved");
        }

        Self::require_resolution_input(&market, winning_outcome);
        market.status = MarketStatus::Resolved;
        market.resolved = true;
        market.winning_outcome = winning_outcome;
        env.storage().instance().set(
            &MarketDataKey::Market(condition_id.clone()),
            &market.clone(),
        );

        let mut payouts = Vec::new(env);
        for i in 0..market.outcome_count {
            payouts.push_back(if i == winning_outcome { 1 } else { 0 });
        }

        let market_contract = env.current_contract_address();
        let ctf_contract = access::get_ctf_contract(env);
        env.authorize_as_current_contract(vec![
            env,
            InvokerContractAuthEntry::Contract(SubContractInvocation {
                context: ContractContext {
                    contract: ctf_contract.clone(),
                    fn_name: Symbol::new(env, "report_payouts_by_condition"),
                    args: vec![
                        env,
                        condition_id.clone().into_val(env),
                        payouts.clone().into_val(env),
                    ],
                },
                sub_invocations: vec![env],
            }),
        ]);
        let _ = market_contract;
        Self::ctf_client(env).report_payouts_by_condition(condition_id, &payouts);
    }
}

#[contractimpl]
impl IMarket for MarketContract {
    fn init(env: Env, admin: Address, ctf_contract: Address) {
        access::init(&env, &admin, &ctf_contract);
        env.storage().instance().set(
            &MarketDataKey::ResolutionDisputeWindow,
            &DEFAULT_RESOLUTION_DISPUTE_WINDOW,
        );
    }

    fn transfer_admin(env: Env, new_admin: Address) {
        access::transfer_admin(&env, &new_admin);
    }

    fn pause(env: Env) {
        access::pause(&env);
    }

    fn unpause(env: Env) {
        access::unpause(&env);
    }

    fn is_paused(env: Env) -> bool {
        access::is_paused(&env)
    }

    fn get_ctf_contract(env: Env) -> Address {
        access::get_ctf_contract(&env)
    }

    fn create_event(
        env: Env,
        event_id: BytesN<32>,
        group_id: BytesN<32>,
        series_id: BytesN<32>,
        neg_risk: bool,
    ) {
        access::require_admin(&env);
        access::assert_not_paused(&env);
        if env
            .storage()
            .instance()
            .has(&MarketDataKey::Event(event_id.clone()))
        {
            panic!("Market: event already exists");
        }

        env.storage().instance().set(
            &MarketDataKey::Event(event_id.clone()),
            &MarketEvent {
                group_id,
                series_id,
                neg_risk,
                exists: true,
                market_count: 0,
                created_at: env.ledger().timestamp(),
            },
        );
        env.storage().instance().set(
            &MarketDataKey::EventMarkets(event_id),
            &Vec::<BytesN<32>>::new(&env),
        );
    }

    fn create_binary_market(
        env: Env,
        question_id: BytesN<32>,
        end_time: u64,
        oracle: Address,
    ) -> BytesN<32> {
        access::require_admin(&env);
        access::assert_not_paused(&env);
        if end_time <= env.ledger().timestamp() {
            panic!("Market: end_time must be completely in the future");
        }

        let outcome_count = 2;
        let ctf = Self::ctf_client(&env);
        ctf.prepare_condition(&oracle, &question_id, &outcome_count);
        let condition_id = ctf.get_condition_id(&oracle, &question_id, &outcome_count);
        Self::set_market(
            &env,
            question_id,
            condition_id,
            end_time,
            oracle,
            MarketType::Binary,
            outcome_count,
        )
    }

    fn create_binary_market_for_event(
        env: Env,
        event_id: BytesN<32>,
        question_id: BytesN<32>,
        end_time: u64,
        oracle: Address,
    ) -> BytesN<32> {
        if !Self::event_exists(env.clone(), event_id.clone()) {
            panic!("Market: event does not exist");
        }
        let condition_id = Self::create_binary_market(env.clone(), question_id, end_time, oracle);
        Self::link_market_to_event(&env, &event_id, &condition_id);
        condition_id
    }

    fn create_multi_outcome_market(
        env: Env,
        question_id: BytesN<32>,
        end_time: u64,
        oracle: Address,
        outcome_count: u32,
    ) -> BytesN<32> {
        access::require_admin(&env);
        access::assert_not_paused(&env);
        if end_time <= env.ledger().timestamp() {
            panic!("Market: end_time must be completely in the future");
        }
        if !(3..=32).contains(&outcome_count) {
            panic!("Market: MultiOutcome must have between 3 and 32 slots");
        }

        let ctf = Self::ctf_client(&env);
        ctf.prepare_condition(&oracle, &question_id, &outcome_count);
        let condition_id = ctf.get_condition_id(&oracle, &question_id, &outcome_count);
        Self::set_market(
            &env,
            question_id,
            condition_id,
            end_time,
            oracle,
            MarketType::MultiOutcome,
            outcome_count,
        )
    }

    fn create_neg_risk_market(
        env: Env,
        question_id: BytesN<32>,
        end_time: u64,
        oracle: Address,
        outcome_count: u32,
    ) -> BytesN<32> {
        access::require_admin(&env);
        access::assert_not_paused(&env);
        if end_time <= env.ledger().timestamp() {
            panic!("Market: end_time must be completely in the future");
        }
        if !(3..=32).contains(&outcome_count) {
            panic!("Market: NegRisk must have between 3 and 32 slots");
        }

        let ctf = Self::ctf_client(&env);
        ctf.prepare_condition(&oracle, &question_id, &outcome_count);
        let condition_id = ctf.get_condition_id(&oracle, &question_id, &outcome_count);
        Self::set_market(
            &env,
            question_id,
            condition_id,
            end_time,
            oracle,
            MarketType::NegRisk,
            outcome_count,
        )
    }

    fn market_exists(env: Env, condition_id: BytesN<32>) -> bool {
        env.storage()
            .instance()
            .has(&MarketDataKey::Market(condition_id))
    }

    fn event_exists(env: Env, event_id: BytesN<32>) -> bool {
        env.storage()
            .instance()
            .has(&MarketDataKey::Event(event_id))
    }

    fn pause_market(env: Env, condition_id: BytesN<32>) {
        access::require_admin(&env);
        let mut market = get_market_or_panic(&env, &condition_id);
        if market.status == MarketStatus::Resolved {
            panic!("Market: Cannot pause resolved market");
        }
        market.status = MarketStatus::Paused;
        env.storage()
            .instance()
            .set(&MarketDataKey::Market(condition_id), &market);
    }

    fn unpause_market(env: Env, condition_id: BytesN<32>) {
        access::require_admin(&env);
        let mut market = get_market_or_panic(&env, &condition_id);
        if market.status != MarketStatus::Paused {
            panic!("Market: Market is not paused");
        }
        market.status = if market.resolved {
            MarketStatus::Resolved
        } else if env.ledger().timestamp() >= market.end_time {
            MarketStatus::Closed
        } else {
            MarketStatus::Open
        };
        env.storage()
            .instance()
            .set(&MarketDataKey::Market(condition_id), &market);
    }

    fn propose_resolution(
        env: Env,
        resolver: Address,
        condition_id: BytesN<32>,
        winning_outcome: u32,
    ) {
        resolver.require_auth();
        let mut market = get_market_or_panic(&env, &condition_id);
        if market.resolved {
            panic!("Market: Market already resolved");
        }
        if env.ledger().timestamp() < market.end_time {
            panic!("Market: Cannot resolve before end_time");
        }
        if resolver != market.oracle {
            access::require_admin(&env);
        }
        Self::require_resolution_input(&market, winning_outcome);

        if let Some(active) = Self::get_resolution_proposal(env.clone(), condition_id.clone()) {
            if !active.finalized && !active.disputed {
                panic!("Market: Active proposal exists");
            }
        }

        let proposal = ResolutionProposal {
            proposer: resolver,
            winning_outcome,
            proposed_at: env.ledger().timestamp(),
            dispute_deadline: env
                .ledger()
                .timestamp()
                .checked_add(Self::get_resolution_dispute_window_or_default(&env))
                .expect("Market: dispute deadline overflow"),
            disputed: false,
            finalized: false,
        };

        market.status = MarketStatus::Closed;
        env.storage()
            .instance()
            .set(&MarketDataKey::Market(condition_id.clone()), &market);
        env.storage()
            .instance()
            .set(&MarketDataKey::ResolutionProposal(condition_id), &proposal);
    }

    fn dispute_resolution(env: Env, disputer: Address, condition_id: BytesN<32>) {
        access::require_admin(&env);
        disputer.require_auth();
        let mut proposal: ResolutionProposal = env
            .storage()
            .instance()
            .get(&MarketDataKey::ResolutionProposal(condition_id.clone()))
            .expect("Market: no proposal");
        if proposal.finalized {
            panic!("Market: Proposal finalized");
        }
        if proposal.disputed {
            panic!("Market: Proposal already disputed");
        }
        if env.ledger().timestamp() >= proposal.dispute_deadline {
            panic!("Market: Dispute window elapsed");
        }
        proposal.disputed = true;
        env.storage()
            .instance()
            .set(&MarketDataKey::ResolutionProposal(condition_id), &proposal);
    }

    fn finalize_resolution(env: Env, condition_id: BytesN<32>) {
        let mut proposal: ResolutionProposal = env
            .storage()
            .instance()
            .get(&MarketDataKey::ResolutionProposal(condition_id.clone()))
            .expect("Market: no proposal");
        if proposal.finalized {
            panic!("Market: Proposal finalized");
        }
        if proposal.disputed {
            panic!("Market: Proposal disputed");
        }
        if env.ledger().timestamp() < proposal.dispute_deadline {
            panic!("Market: Dispute window active");
        }

        proposal.finalized = true;
        env.storage().instance().set(
            &MarketDataKey::ResolutionProposal(condition_id.clone()),
            &proposal,
        );
        Self::finalize_market(&env, &condition_id, proposal.winning_outcome);
    }

    fn resolve_market(env: Env, oracle: Address, condition_id: BytesN<32>, winning_outcome: u32) {
        access::require_admin(&env);
        oracle.require_auth();
        let market = get_market_or_panic(&env, &condition_id);
        if market.oracle != oracle {
            panic!("Market: Unauthorized resolver oracle");
        }

        env.storage().instance().set(
            &MarketDataKey::ResolutionProposal(condition_id.clone()),
            &ResolutionProposal {
                proposer: oracle,
                winning_outcome,
                proposed_at: env.ledger().timestamp(),
                dispute_deadline: env.ledger().timestamp(),
                disputed: false,
                finalized: true,
            },
        );
        Self::finalize_market(&env, &condition_id, winning_outcome);
    }

    fn get_resolution_proposal(env: Env, condition_id: BytesN<32>) -> Option<ResolutionProposal> {
        env.storage()
            .instance()
            .get(&MarketDataKey::ResolutionProposal(condition_id))
    }

    fn get_resolution_dispute_window(env: Env) -> u64 {
        Self::get_resolution_dispute_window_or_default(&env)
    }

    fn set_resolution_dispute_window(env: Env, window: u64) {
        access::require_admin(&env);
        if window == 0 {
            panic!("Market: dispute window must be non-zero");
        }
        env.storage()
            .instance()
            .set(&MarketDataKey::ResolutionDisputeWindow, &window);
    }

    fn is_market_resolved(env: Env, condition_id: BytesN<32>) -> bool {
        get_market_or_panic(&env, &condition_id).resolved
    }

    fn has_market_ended(env: Env, condition_id: BytesN<32>) -> bool {
        env.ledger().timestamp() >= get_market_or_panic(&env, &condition_id).end_time
    }

    fn get_market(env: Env, condition_id: BytesN<32>) -> Market {
        get_market_or_panic(&env, &condition_id)
    }

    fn get_markets(env: Env, condition_ids: Vec<BytesN<32>>) -> Vec<Market> {
        let mut out = Vec::new(&env);
        for id in condition_ids.iter() {
            out.push_back(get_market_or_panic(&env, &id));
        }
        out
    }

    fn get_event(env: Env, event_id: BytesN<32>) -> MarketEvent {
        get_event_or_panic(&env, &event_id)
    }

    fn get_event_markets(env: Env, event_id: BytesN<32>) -> Vec<BytesN<32>> {
        env.storage()
            .instance()
            .get(&MarketDataKey::EventMarkets(event_id))
            .unwrap_or(Vec::new(&env))
    }

    fn get_market_event(env: Env, condition_id: BytesN<32>) -> BytesN<32> {
        env.storage()
            .instance()
            .get(&MarketDataKey::MarketToEvent(condition_id))
            .unwrap_or_else(|| BytesN::from_array(&env, &[0; 32]))
    }

    fn set_market_metadata(env: Env, condition_id: BytesN<32>, metadata_hash: BytesN<32>) {
        access::require_admin(&env);
        env.storage()
            .instance()
            .set(&MarketDataKey::MarketMetadata(condition_id), &metadata_hash);
    }

    fn get_market_metadata(env: Env, condition_id: BytesN<32>) -> BytesN<32> {
        env.storage()
            .instance()
            .get(&MarketDataKey::MarketMetadata(condition_id))
            .unwrap_or_else(|| BytesN::from_array(&env, &[0; 32]))
    }
}
