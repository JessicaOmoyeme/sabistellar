use crate::access;
use crate::clients::{CtfClient, MarketClient, MarketType};
use crate::interface::INegRisk;
use crate::storage::{NegRiskDataKey, NegRiskEventConfig};
use soroban_sdk::{
    auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
    contract, contractimpl, vec, Address, BytesN, Env, IntoVal, Symbol, Vec,
};

#[contract]
pub struct NegRiskContract;

impl NegRiskContract {
    fn get_market_contract(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&NegRiskDataKey::MarketContract)
            .expect("NegRisk: market not initialized")
    }

    fn get_ctf_contract(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&NegRiskDataKey::CtfContract)
            .expect("NegRisk: ctf not initialized")
    }

    fn get_collateral_token(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&NegRiskDataKey::CollateralToken)
            .expect("NegRisk: collateral not initialized")
    }

    fn get_event_config_or_default(env: &Env, event_id: &BytesN<32>) -> NegRiskEventConfig {
        env.storage()
            .instance()
            .get(&NegRiskDataKey::EventConfig(event_id.clone()))
            .unwrap_or(NegRiskEventConfig {
                registered: false,
                has_other: false,
                other_market: BytesN::from_array(env, &[0; 32]),
            })
    }

    fn set_event_config(env: &Env, event_id: &BytesN<32>, config: &NegRiskEventConfig) {
        env.storage()
            .instance()
            .set(&NegRiskDataKey::EventConfig(event_id.clone()), config);
    }

    fn outcome_position_id(env: &Env, condition_id: &BytesN<32>, yes: bool) -> BytesN<32> {
        let index_set = if yes { 1u32 } else { 2u32 };
        let empty = BytesN::from_array(env, &[0; 32]);
        let ctf = CtfClient::new(env, &Self::get_ctf_contract(env));
        let collection_id = ctf.get_collection_id(&empty, condition_id, &index_set);
        ctf.get_position_id(&Self::get_collateral_token(env), &collection_id)
    }

    fn authorize_ctf_transfer(
        env: &Env,
        from: &Address,
        to: &Address,
        position_id: &BytesN<32>,
        amount: u128,
    ) {
        env.authorize_as_current_contract(vec![
            env,
            InvokerContractAuthEntry::Contract(SubContractInvocation {
                context: ContractContext {
                    contract: Self::get_ctf_contract(env),
                    fn_name: Symbol::new(env, "transfer_position"),
                    args: vec![
                        env,
                        from.clone().into_val(env),
                        to.clone().into_val(env),
                        position_id.clone().into_val(env),
                        amount.into_val(env),
                    ],
                },
                sub_invocations: vec![env],
            }),
        ]);
    }
}

#[contractimpl]
impl INegRisk for NegRiskContract {
    fn init(
        env: Env,
        admin: Address,
        market_contract: Address,
        ctf_contract: Address,
        collateral_token: Address,
    ) {
        access::init(&env, &admin);
        env.storage()
            .instance()
            .set(&NegRiskDataKey::MarketContract, &market_contract);
        env.storage()
            .instance()
            .set(&NegRiskDataKey::CtfContract, &ctf_contract);
        env.storage()
            .instance()
            .set(&NegRiskDataKey::CollateralToken, &collateral_token);
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

    fn register_neg_risk_event(env: Env, event_id: BytesN<32>, other_market: BytesN<32>) {
        access::require_admin(&env);
        access::assert_not_paused(&env);
        let market = MarketClient::new(&env, &Self::get_market_contract(&env));
        if !market.event_exists(&event_id) {
            panic!("NegRisk: event does not exist");
        }
        let market_event = market.get_event(&event_id);
        if !market_event.neg_risk {
            panic!("NegRisk: event not neg risk");
        }
        let existing = Self::get_event_config_or_default(&env, &event_id);
        if existing.registered {
            panic!("NegRisk: event already registered");
        }
        if other_market != BytesN::from_array(&env, &[0; 32])
            && market.get_market_event(&other_market) != event_id
        {
            panic!("NegRisk: other market not in event");
        }
        Self::set_event_config(
            &env,
            &event_id,
            &NegRiskEventConfig {
                registered: true,
                has_other: other_market != BytesN::from_array(&env, &[0; 32]),
                other_market,
            },
        );
    }

    fn set_other_market(env: Env, event_id: BytesN<32>, other_market: BytesN<32>) {
        access::require_admin(&env);
        let mut config = Self::get_event_config_or_default(&env, &event_id);
        if !config.registered {
            panic!("NegRisk: event not registered");
        }
        if MarketClient::new(&env, &Self::get_market_contract(&env)).get_market_event(&other_market)
            != event_id
        {
            panic!("NegRisk: other market not in event");
        }
        config.has_other = true;
        config.other_market = other_market;
        Self::set_event_config(&env, &event_id, &config);
    }

    fn set_placeholder_market(env: Env, condition_id: BytesN<32>, is_placeholder: bool) {
        access::require_admin(&env);
        env.storage().instance().set(
            &NegRiskDataKey::PlaceholderMarket(condition_id),
            &is_placeholder,
        );
    }

    fn deposit_yes_inventory(env: Env, provider: Address, condition_id: BytesN<32>, amount: u128) {
        provider.require_auth();
        access::assert_not_paused(&env);
        if amount == 0 {
            return;
        }

        let event_id = MarketClient::new(&env, &Self::get_market_contract(&env))
            .get_market_event(&condition_id);
        let config = Self::get_event_config_or_default(&env, &event_id);
        if !config.registered {
            panic!("NegRisk: event not registered");
        }

        let position_id = Self::outcome_position_id(&env, &condition_id, true);
        CtfClient::new(&env, &Self::get_ctf_contract(&env)).transfer_position(
            &provider,
            &env.current_contract_address(),
            &position_id,
            &amount,
        );
        let inventory = Self::get_yes_inventory(env.clone(), condition_id.clone());
        env.storage().instance().set(
            &NegRiskDataKey::YesInventory(condition_id),
            &(inventory + amount),
        );
    }

    fn withdraw_yes_inventory(
        env: Env,
        condition_id: BytesN<32>,
        amount: u128,
        recipient: Address,
    ) {
        access::require_admin(&env);
        access::assert_not_paused(&env);
        let inventory = Self::get_yes_inventory(env.clone(), condition_id.clone());
        if inventory < amount {
            panic!("NegRisk: insufficient inventory");
        }

        let position_id = Self::outcome_position_id(&env, &condition_id, true);
        Self::authorize_ctf_transfer(
            &env,
            &env.current_contract_address(),
            &recipient,
            &position_id,
            amount,
        );
        CtfClient::new(&env, &Self::get_ctf_contract(&env)).transfer_position(
            &env.current_contract_address(),
            &recipient,
            &position_id,
            &amount,
        );
        env.storage().instance().set(
            &NegRiskDataKey::YesInventory(condition_id),
            &(inventory - amount),
        );
    }

    fn preview_no_to_yes_set(
        env: Env,
        source_condition_id: BytesN<32>,
        amount: u128,
    ) -> (BytesN<32>, Vec<BytesN<32>>, Vec<BytesN<32>>, Vec<u128>) {
        let market = MarketClient::new(&env, &Self::get_market_contract(&env));
        if !market.market_exists(&source_condition_id) {
            panic!("NegRisk: source market does not exist");
        }

        let event_id = market.get_market_event(&source_condition_id);
        let config = Self::get_event_config_or_default(&env, &event_id);
        if !config.registered {
            panic!("NegRisk: event not registered");
        }

        let event = market.get_event(&event_id);
        if !event.neg_risk {
            panic!("NegRisk: event not neg risk");
        }

        let event_markets = market.get_event_markets(&event_id);
        if event_markets.len() <= 1 {
            panic!("NegRisk: event must contain multiple markets");
        }

        let mut target_condition_ids = Vec::new(&env);
        let mut target_yes_position_ids = Vec::new(&env);
        let mut target_amounts = Vec::new(&env);
        for condition_id in event_markets.iter() {
            if condition_id == source_condition_id {
                continue;
            }
            let target_market = market.get_market(&condition_id);
            if target_market.market_type != MarketType::Binary || target_market.outcome_count != 2 {
                panic!("NegRisk: target market not binary");
            }
            target_condition_ids.push_back(condition_id.clone());
            target_yes_position_ids.push_back(Self::outcome_position_id(&env, &condition_id, true));
            target_amounts.push_back(amount);
        }
        (
            event_id,
            target_condition_ids,
            target_yes_position_ids,
            target_amounts,
        )
    }

    fn convert_no_to_yes_set(
        env: Env,
        user: Address,
        source_condition_id: BytesN<32>,
        amount: u128,
    ) {
        user.require_auth();
        access::assert_not_paused(&env);
        let (_event_id, target_condition_ids, target_yes_position_ids, target_amounts) =
            Self::preview_no_to_yes_set(env.clone(), source_condition_id.clone(), amount);

        let source_no_position = Self::outcome_position_id(&env, &source_condition_id, false);
        CtfClient::new(&env, &Self::get_ctf_contract(&env)).transfer_position(
            &user,
            &env.current_contract_address(),
            &source_no_position,
            &amount,
        );

        for idx in 0..target_yes_position_ids.len() {
            let target_position = target_yes_position_ids
                .get(idx)
                .expect("NegRisk: missing target position");
            let target_condition = target_condition_ids
                .get(idx)
                .expect("NegRisk: missing target condition");
            let target_amount = target_amounts
                .get(idx)
                .expect("NegRisk: missing target amount");
            let inventory = Self::get_yes_inventory(env.clone(), target_condition.clone());
            if inventory < target_amount {
                panic!("NegRisk: insufficient yes inventory");
            }

            Self::authorize_ctf_transfer(
                &env,
                &env.current_contract_address(),
                &user,
                &target_position,
                target_amount,
            );
            CtfClient::new(&env, &Self::get_ctf_contract(&env)).transfer_position(
                &env.current_contract_address(),
                &user,
                &target_position,
                &target_amount,
            );
            env.storage().instance().set(
                &NegRiskDataKey::YesInventory(target_condition),
                &(inventory - target_amount),
            );
        }
    }

    fn get_event_config(env: Env, event_id: BytesN<32>) -> NegRiskEventConfig {
        Self::get_event_config_or_default(&env, &event_id)
    }

    fn is_neg_risk_market(env: Env, condition_id: BytesN<32>) -> bool {
        let market = MarketClient::new(&env, &Self::get_market_contract(&env));
        if !market.market_exists(&condition_id) {
            return false;
        }
        let event_id = market.get_market_event(&condition_id);
        if event_id == BytesN::from_array(&env, &[0; 32]) {
            return false;
        }
        let config = Self::get_event_config_or_default(&env, &event_id);
        if !config.registered {
            return false;
        }
        market.get_event(&event_id).neg_risk
    }

    fn is_placeholder_market(env: Env, condition_id: BytesN<32>) -> bool {
        env.storage()
            .instance()
            .get(&NegRiskDataKey::PlaceholderMarket(condition_id))
            .unwrap_or(false)
    }

    fn get_yes_inventory(env: Env, condition_id: BytesN<32>) -> u128 {
        env.storage()
            .instance()
            .get(&NegRiskDataKey::YesInventory(condition_id))
            .unwrap_or(0)
    }
}
