use crate::access;
use crate::clients::{CtfClient, ExchangeClient, MarketClient, MarketType};
use crate::interface::ILiquidityManager;
use crate::storage::{LiquidityDataKey, LiquidityPosition, LiquidityTotals};
use soroban_sdk::{
    auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
    contract, contractimpl, token, vec, Address, BytesN, Env, IntoVal, Symbol, Vec,
};

#[contract]
pub struct LiquidityManagerContract;

impl LiquidityManagerContract {
    fn apply_delta(value: u128, delta: i128) -> u128 {
        if delta >= 0 {
            value
                .checked_add(delta as u128)
                .expect("Liquidity: delta overflow")
        } else {
            value
                .checked_sub((-delta) as u128)
                .expect("Liquidity: delta underflow")
        }
    }

    fn get_exchange(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&LiquidityDataKey::Exchange)
            .expect("Liquidity: exchange not initialized")
    }

    fn get_market_contract(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&LiquidityDataKey::MarketContract)
            .expect("Liquidity: market not initialized")
    }

    fn get_ctf_contract(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&LiquidityDataKey::CtfContract)
            .expect("Liquidity: ctf not initialized")
    }

    fn get_collateral_token(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&LiquidityDataKey::CollateralToken)
            .expect("Liquidity: collateral not initialized")
    }

    fn get_position_or_default(
        env: &Env,
        condition_id: &BytesN<32>,
        provider: &Address,
    ) -> LiquidityPosition {
        env.storage()
            .instance()
            .get(&LiquidityDataKey::Position(
                condition_id.clone(),
                provider.clone(),
            ))
            .unwrap_or(LiquidityPosition {
                yes_amount: 0,
                no_amount: 0,
                idle_yes_amount: 0,
                idle_no_amount: 0,
                collateral_amount: 0,
                claimable_collateral_amount: 0,
                timestamp: 0,
                active: false,
            })
    }

    fn set_position(
        env: &Env,
        condition_id: &BytesN<32>,
        provider: &Address,
        position: &LiquidityPosition,
    ) {
        env.storage().instance().set(
            &LiquidityDataKey::Position(condition_id.clone(), provider.clone()),
            position,
        );
    }

    fn get_totals(env: &Env, condition_id: &BytesN<32>) -> LiquidityTotals {
        env.storage()
            .instance()
            .get(&LiquidityDataKey::MarketTotals(condition_id.clone()))
            .unwrap_or(LiquidityTotals {
                idle_yes_total: 0,
                idle_no_total: 0,
                posted_yes_total: 0,
                posted_no_total: 0,
                claimable_collateral_total: 0,
            })
    }

    fn set_totals(env: &Env, condition_id: &BytesN<32>, totals: &LiquidityTotals) {
        env.storage().instance().set(
            &LiquidityDataKey::MarketTotals(condition_id.clone()),
            totals,
        );
    }

    fn get_event_totals(env: &Env, event_id: &BytesN<32>) -> LiquidityTotals {
        env.storage()
            .instance()
            .get(&LiquidityDataKey::EventTotals(event_id.clone()))
            .unwrap_or(LiquidityTotals {
                idle_yes_total: 0,
                idle_no_total: 0,
                posted_yes_total: 0,
                posted_no_total: 0,
                claimable_collateral_total: 0,
            })
    }

    fn set_event_totals(env: &Env, event_id: &BytesN<32>, totals: &LiquidityTotals) {
        env.storage()
            .instance()
            .set(&LiquidityDataKey::EventTotals(event_id.clone()), totals);
    }

    fn assert_binary_market(env: &Env, condition_id: &BytesN<32>) {
        let market =
            MarketClient::new(env, &Self::get_market_contract(env)).get_market(condition_id);
        if market.market_type != MarketType::Binary {
            panic!("Liquidity: binary markets only");
        }
        if market.outcome_count != 2 {
            panic!("Liquidity: invalid binary market");
        }
    }

    fn get_event_id(env: &Env, condition_id: &BytesN<32>) -> BytesN<32> {
        MarketClient::new(env, &Self::get_market_contract(env)).get_market_event(condition_id)
    }

    fn update_event_totals(
        env: &Env,
        event_id: &BytesN<32>,
        idle_yes_delta: i128,
        idle_no_delta: i128,
        posted_yes_delta: i128,
        posted_no_delta: i128,
        collateral_delta: i128,
    ) {
        let mut totals = Self::get_event_totals(env, event_id);
        totals.idle_yes_total = Self::apply_delta(totals.idle_yes_total, idle_yes_delta);
        totals.idle_no_total = Self::apply_delta(totals.idle_no_total, idle_no_delta);
        totals.posted_yes_total = Self::apply_delta(totals.posted_yes_total, posted_yes_delta);
        totals.posted_no_total = Self::apply_delta(totals.posted_no_total, posted_no_delta);
        totals.claimable_collateral_total =
            Self::apply_delta(totals.claimable_collateral_total, collateral_delta);
        Self::set_event_totals(env, event_id, &totals);
    }

    fn update_position_activity(position: &mut LiquidityPosition) {
        position.active = position.yes_amount > 0
            || position.no_amount > 0
            || position.idle_yes_amount > 0
            || position.idle_no_amount > 0
            || position.collateral_amount > 0
            || position.claimable_collateral_amount > 0;
    }

    fn outcome_position_id(env: &Env, condition_id: &BytesN<32>, outcome_index: u32) -> BytesN<32> {
        let ctf = Self::get_ctf_contract(env);
        let collateral = Self::get_collateral_token(env);
        let empty_collection = BytesN::from_array(env, &[0; 32]);
        let outcome_index_set = 1u32 << outcome_index;
        let ctf_client = CtfClient::new(env, &ctf);
        let collection_id =
            ctf_client.get_collection_id(&empty_collection, condition_id, &outcome_index_set);
        ctf_client.get_position_id(&collateral, &collection_id)
    }

    fn track_provider(env: &Env, condition_id: &BytesN<32>, provider: &Address) {
        let key = LiquidityDataKey::ProviderIndex(condition_id.clone(), provider.clone());
        if env.storage().instance().has(&key) {
            return;
        }
        let mut providers: Vec<Address> = env
            .storage()
            .instance()
            .get(&LiquidityDataKey::MarketProviders(condition_id.clone()))
            .unwrap_or(Vec::new(env));
        providers.push_back(provider.clone());
        env.storage().instance().set(
            &LiquidityDataKey::MarketProviders(condition_id.clone()),
            &providers,
        );
        env.storage().instance().set(&key, &providers.len());
    }

    fn deposit_inventory_internal(
        env: &Env,
        holder: &Address,
        condition_id: &BytesN<32>,
        yes_amount: u128,
        no_amount: u128,
    ) {
        Self::assert_binary_market(env, condition_id);
        if yes_amount == 0 && no_amount == 0 {
            return;
        }

        if yes_amount > 0 {
            let position_id = Self::outcome_position_id(env, condition_id, 0);
            Self::authorize_ctf_transfer_position(
                env,
                holder,
                &env.current_contract_address(),
                &position_id,
                yes_amount,
            );
            CtfClient::new(env, &Self::get_ctf_contract(env)).transfer_position_lm(
                holder,
                &env.current_contract_address(),
                &position_id,
                &yes_amount,
            );
        }
        if no_amount > 0 {
            let position_id = Self::outcome_position_id(env, condition_id, 1);
            Self::authorize_ctf_transfer_position(
                env,
                holder,
                &env.current_contract_address(),
                &position_id,
                no_amount,
            );
            CtfClient::new(env, &Self::get_ctf_contract(env)).transfer_position_lm(
                holder,
                &env.current_contract_address(),
                &position_id,
                &no_amount,
            );
        }
    }

    fn authorize_exchange_release_inventory(
        env: &Env,
        condition_id: &BytesN<32>,
        outcome_index: u32,
        amount: u128,
        recipient: &Address,
    ) {
        env.authorize_as_current_contract(vec![
            env,
            InvokerContractAuthEntry::Contract(SubContractInvocation {
                context: ContractContext {
                    contract: Self::get_exchange(env),
                    fn_name: Symbol::new(env, "release_inventory"),
                    args: vec![
                        env,
                        condition_id.clone().into_val(env),
                        outcome_index.into_val(env),
                        amount.into_val(env),
                        recipient.clone().into_val(env),
                    ],
                },
                sub_invocations: vec![env],
            }),
        ]);
    }

    fn authorize_ctf_transfer_position(
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
                    fn_name: Symbol::new(env, "transfer_position_lm"),
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

    fn authorize_ctf_merge_positions(
        env: &Env,
        holder: &Address,
        recipient: &Address,
        condition_id: &BytesN<32>,
        amount: u128,
    ) {
        let mut partition = Vec::new(env);
        partition.push_back(1);
        partition.push_back(2);

        env.authorize_as_current_contract(vec![
            env,
            InvokerContractAuthEntry::Contract(SubContractInvocation {
                context: ContractContext {
                    contract: Self::get_ctf_contract(env),
                    fn_name: Symbol::new(env, "merge_positions_lm"),
                    args: vec![
                        env,
                        holder.clone().into_val(env),
                        recipient.clone().into_val(env),
                        Self::get_collateral_token(env).into_val(env),
                        BytesN::from_array(env, &[0; 32]).into_val(env),
                        condition_id.clone().into_val(env),
                        partition.into_val(env),
                        amount.into_val(env),
                    ],
                },
                sub_invocations: vec![env],
            }),
        ]);
    }

    fn authorize_exchange_deposit_collateral(env: &Env, provider: &Address, amount: u128) {
        env.authorize_as_current_contract(vec![
            env,
            InvokerContractAuthEntry::Contract(SubContractInvocation {
                context: ContractContext {
                    contract: Self::get_exchange(env),
                    fn_name: Symbol::new(env, "deposit_collateral_lm"),
                    args: vec![env, provider.clone().into_val(env), amount.into_val(env)],
                },
                sub_invocations: vec![env],
            }),
        ]);
    }

    fn authorize_exchange_release_collateral(env: &Env, amount: u128, recipient: &Address) {
        env.authorize_as_current_contract(vec![
            env,
            InvokerContractAuthEntry::Contract(SubContractInvocation {
                context: ContractContext {
                    contract: Self::get_exchange(env),
                    fn_name: Symbol::new(env, "release_pool_collateral"),
                    args: vec![env, amount.into_val(env), recipient.clone().into_val(env)],
                },
                sub_invocations: vec![env],
            }),
        ]);
    }
}

#[contractimpl]
impl ILiquidityManager for LiquidityManagerContract {
    fn init(
        env: Env,
        admin: Address,
        exchange: Address,
        market_contract: Address,
        ctf_contract: Address,
        collateral_token: Address,
    ) {
        access::init(&env, &admin);
        env.storage()
            .instance()
            .set(&LiquidityDataKey::Exchange, &exchange);
        env.storage()
            .instance()
            .set(&LiquidityDataKey::MarketContract, &market_contract);
        env.storage()
            .instance()
            .set(&LiquidityDataKey::CtfContract, &ctf_contract);
        env.storage()
            .instance()
            .set(&LiquidityDataKey::CollateralToken, &collateral_token);
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

    fn split_position(
        env: Env,
        provider: Address,
        condition_id: BytesN<32>,
        amount: u128,
    ) -> (u128, u128) {
        provider.require_auth();
        access::assert_not_paused(&env);
        if amount == 0 {
            return (0, 0);
        }
        Self::assert_binary_market(&env, &condition_id);

        let mut partition = Vec::new(&env);
        partition.push_back(1);
        partition.push_back(2);
        CtfClient::new(&env, &Self::get_ctf_contract(&env)).split_position_lm(
            &provider,
            &Self::get_collateral_token(&env),
            &BytesN::from_array(&env, &[0; 32]),
            &condition_id,
            &partition,
            &amount,
        );
        Self::deposit_inventory_internal(&env, &provider, &condition_id, amount, amount);

        let mut position = Self::get_position_or_default(&env, &condition_id, &provider);
        position.idle_yes_amount += amount;
        position.idle_no_amount += amount;
        position.collateral_amount += amount;
        position.timestamp = env.ledger().timestamp();
        position.active = true;
        Self::set_position(&env, &condition_id, &provider, &position);

        let mut totals = Self::get_totals(&env, &condition_id);
        totals.idle_yes_total += amount;
        totals.idle_no_total += amount;
        Self::set_totals(&env, &condition_id, &totals);
        let event_id = Self::get_event_id(&env, &condition_id);
        Self::update_event_totals(
            &env,
            &event_id,
            amount as i128,
            amount as i128,
            0,
            0,
            0,
        );
        Self::track_provider(&env, &condition_id, &provider);
        (amount, amount)
    }

    fn add_liquidity(
        env: Env,
        provider: Address,
        condition_id: BytesN<32>,
        yes_amount: u128,
        no_amount: u128,
    ) {
        provider.require_auth();
        access::assert_not_paused(&env);
        let mut position = Self::get_position_or_default(&env, &condition_id, &provider);
        if position.idle_yes_amount < yes_amount || position.idle_no_amount < no_amount {
            panic!("Liquidity: insufficient idle inventory");
        }

        let exchange = Self::get_exchange(&env);
        if yes_amount > 0 {
            let position_id = Self::outcome_position_id(&env, &condition_id, 0);
            Self::authorize_ctf_transfer_position(
                &env,
                &env.current_contract_address(),
                &exchange,
                &position_id,
                yes_amount,
            );
            CtfClient::new(&env, &Self::get_ctf_contract(&env)).transfer_position_lm(
                &env.current_contract_address(),
                &exchange,
                &position_id,
                &yes_amount,
            );
        }
        if no_amount > 0 {
            let position_id = Self::outcome_position_id(&env, &condition_id, 1);
            Self::authorize_ctf_transfer_position(
                &env,
                &env.current_contract_address(),
                &exchange,
                &position_id,
                no_amount,
            );
            CtfClient::new(&env, &Self::get_ctf_contract(&env)).transfer_position_lm(
                &env.current_contract_address(),
                &exchange,
                &position_id,
                &no_amount,
            );
        }

        position.idle_yes_amount -= yes_amount;
        position.idle_no_amount -= no_amount;
        position.yes_amount += yes_amount;
        position.no_amount += no_amount;
        position.timestamp = env.ledger().timestamp();
        Self::update_position_activity(&mut position);
        Self::set_position(&env, &condition_id, &provider, &position);

        let mut totals = Self::get_totals(&env, &condition_id);
        totals.idle_yes_total -= yes_amount;
        totals.idle_no_total -= no_amount;
        totals.posted_yes_total += yes_amount;
        totals.posted_no_total += no_amount;
        Self::set_totals(&env, &condition_id, &totals);
        let event_id = Self::get_event_id(&env, &condition_id);
        Self::update_event_totals(
            &env,
            &event_id,
            -(yes_amount as i128),
            -(no_amount as i128),
            yes_amount as i128,
            no_amount as i128,
            0,
        );
        Self::track_provider(&env, &condition_id, &provider);
    }

    fn split_and_add_liquidity(
        env: Env,
        provider: Address,
        condition_id: BytesN<32>,
        amount: u128,
    ) {
        if amount == 0 {
            return;
        }
        let _ = Self::split_position(env.clone(), provider.clone(), condition_id.clone(), amount);
        Self::add_liquidity(env, provider, condition_id, amount, amount);
    }

    fn deposit_inventory(
        env: Env,
        provider: Address,
        condition_id: BytesN<32>,
        yes_amount: u128,
        no_amount: u128,
    ) {
        provider.require_auth();
        access::assert_not_paused(&env);
        Self::deposit_inventory_internal(&env, &provider, &condition_id, yes_amount, no_amount);

        let mut position = Self::get_position_or_default(&env, &condition_id, &provider);
        position.idle_yes_amount += yes_amount;
        position.idle_no_amount += no_amount;
        position.timestamp = env.ledger().timestamp();
        position.active = true;
        Self::set_position(&env, &condition_id, &provider, &position);

        let mut totals = Self::get_totals(&env, &condition_id);
        totals.idle_yes_total += yes_amount;
        totals.idle_no_total += no_amount;
        Self::set_totals(&env, &condition_id, &totals);
        let event_id = Self::get_event_id(&env, &condition_id);
        Self::update_event_totals(
            &env,
            &event_id,
            yes_amount as i128,
            no_amount as i128,
            0,
            0,
            0,
        );
        Self::track_provider(&env, &condition_id, &provider);
    }

    fn deposit_collateral(env: Env, provider: Address, condition_id: BytesN<32>, amount: u128) {
        provider.require_auth();
        access::assert_not_paused(&env);
        Self::assert_binary_market(&env, &condition_id);
        if amount == 0 {
            return;
        }

        let exchange = Self::get_exchange(&env);
        token::Client::new(&env, &Self::get_collateral_token(&env)).transfer(
            &provider,
            &exchange,
            &i128::try_from(amount).expect("Liquidity: collateral amount overflow"),
        );
        let mut position = Self::get_position_or_default(&env, &condition_id, &provider);
        position.claimable_collateral_amount += amount;
        position.timestamp = env.ledger().timestamp();
        position.active = true;
        Self::set_position(&env, &condition_id, &provider, &position);

        let mut totals = Self::get_totals(&env, &condition_id);
        totals.claimable_collateral_total += amount;
        Self::set_totals(&env, &condition_id, &totals);
        let event_id = Self::get_event_id(&env, &condition_id);
        Self::update_event_totals(&env, &event_id, 0, 0, 0, 0, amount as i128);
        Self::track_provider(&env, &condition_id, &provider);
    }

    fn remove_liquidity(
        env: Env,
        provider: Address,
        condition_id: BytesN<32>,
        yes_amount: u128,
        no_amount: u128,
    ) {
        provider.require_auth();
        access::assert_not_paused(&env);
        let mut position = Self::get_position_or_default(&env, &condition_id, &provider);
        if position.yes_amount < yes_amount || position.no_amount < no_amount {
            panic!("Liquidity: insufficient posted inventory");
        }

        let exchange = Self::get_exchange(&env);
        if yes_amount > 0 {
            Self::authorize_exchange_release_inventory(
                &env,
                &condition_id,
                0,
                yes_amount,
                &env.current_contract_address(),
            );
            ExchangeClient::new(&env, &exchange).release_inventory(
                &condition_id,
                &0,
                &yes_amount,
                &env.current_contract_address(),
            );
        }
        if no_amount > 0 {
            Self::authorize_exchange_release_inventory(
                &env,
                &condition_id,
                1,
                no_amount,
                &env.current_contract_address(),
            );
            ExchangeClient::new(&env, &exchange).release_inventory(
                &condition_id,
                &1,
                &no_amount,
                &env.current_contract_address(),
            );
        }

        position.yes_amount -= yes_amount;
        position.no_amount -= no_amount;
        position.idle_yes_amount += yes_amount;
        position.idle_no_amount += no_amount;
        position.timestamp = env.ledger().timestamp();
        Self::update_position_activity(&mut position);
        Self::set_position(&env, &condition_id, &provider, &position);

        let mut totals = Self::get_totals(&env, &condition_id);
        totals.idle_yes_total += yes_amount;
        totals.idle_no_total += no_amount;
        totals.posted_yes_total -= yes_amount;
        totals.posted_no_total -= no_amount;
        Self::set_totals(&env, &condition_id, &totals);
        let event_id = Self::get_event_id(&env, &condition_id);
        Self::update_event_totals(
            &env,
            &event_id,
            yes_amount as i128,
            no_amount as i128,
            -(yes_amount as i128),
            -(no_amount as i128),
            0,
        );
    }

    fn withdraw_inventory(
        env: Env,
        provider: Address,
        condition_id: BytesN<32>,
        yes_amount: u128,
        no_amount: u128,
        recipient: Address,
    ) {
        provider.require_auth();
        access::assert_not_paused(&env);
        let mut position = Self::get_position_or_default(&env, &condition_id, &provider);
        if position.idle_yes_amount < yes_amount || position.idle_no_amount < no_amount {
            panic!("Liquidity: insufficient idle inventory");
        }

        if yes_amount > 0 {
            let position_id = Self::outcome_position_id(&env, &condition_id, 0);
            Self::authorize_ctf_transfer_position(
                &env,
                &env.current_contract_address(),
                &recipient,
                &position_id,
                yes_amount,
            );
            CtfClient::new(&env, &Self::get_ctf_contract(&env)).transfer_position_lm(
                &env.current_contract_address(),
                &recipient,
                &position_id,
                &yes_amount,
            );
        }
        if no_amount > 0 {
            let position_id = Self::outcome_position_id(&env, &condition_id, 1);
            Self::authorize_ctf_transfer_position(
                &env,
                &env.current_contract_address(),
                &recipient,
                &position_id,
                no_amount,
            );
            CtfClient::new(&env, &Self::get_ctf_contract(&env)).transfer_position_lm(
                &env.current_contract_address(),
                &recipient,
                &position_id,
                &no_amount,
            );
        }

        position.idle_yes_amount -= yes_amount;
        position.idle_no_amount -= no_amount;
        position.timestamp = env.ledger().timestamp();
        Self::update_position_activity(&mut position);
        Self::set_position(&env, &condition_id, &provider, &position);

        let mut totals = Self::get_totals(&env, &condition_id);
        totals.idle_yes_total -= yes_amount;
        totals.idle_no_total -= no_amount;
        Self::set_totals(&env, &condition_id, &totals);
        let event_id = Self::get_event_id(&env, &condition_id);
        Self::update_event_totals(
            &env,
            &event_id,
            -(yes_amount as i128),
            -(no_amount as i128),
            0,
            0,
            0,
        );
    }

    fn withdraw_collateral(
        env: Env,
        provider: Address,
        condition_id: BytesN<32>,
        amount: u128,
        recipient: Address,
    ) {
        provider.require_auth();
        access::assert_not_paused(&env);
        let mut position = Self::get_position_or_default(&env, &condition_id, &provider);
        if position.claimable_collateral_amount < amount {
            panic!("Liquidity: insufficient claimable collateral");
        }

        Self::authorize_exchange_release_collateral(&env, amount, &recipient);
        ExchangeClient::new(&env, &Self::get_exchange(&env))
            .release_pool_collateral(&amount, &recipient);
        position.claimable_collateral_amount -= amount;
        position.timestamp = env.ledger().timestamp();
        Self::update_position_activity(&mut position);
        Self::set_position(&env, &condition_id, &provider, &position);

        let mut totals = Self::get_totals(&env, &condition_id);
        totals.claimable_collateral_total -= amount;
        Self::set_totals(&env, &condition_id, &totals);
        let event_id = Self::get_event_id(&env, &condition_id);
        Self::update_event_totals(&env, &event_id, 0, 0, 0, 0, -(amount as i128));
    }

    fn merge_positions(
        env: Env,
        provider: Address,
        condition_id: BytesN<32>,
        amount: u128,
    ) -> u128 {
        provider.require_auth();
        access::assert_not_paused(&env);
        let mut position = Self::get_position_or_default(&env, &condition_id, &provider);
        if position.idle_yes_amount < amount || position.idle_no_amount < amount {
            panic!("Liquidity: insufficient idle inventory");
        }

        Self::authorize_ctf_merge_positions(
            &env,
            &env.current_contract_address(),
            &provider,
            &condition_id,
            amount,
        );
        let mut partition = Vec::new(&env);
        partition.push_back(1);
        partition.push_back(2);
        CtfClient::new(&env, &Self::get_ctf_contract(&env)).merge_positions_lm(
            &env.current_contract_address(),
            &provider,
            &Self::get_collateral_token(&env),
            &BytesN::from_array(&env, &[0; 32]),
            &condition_id,
            &partition,
            &amount,
        );

        position.idle_yes_amount -= amount;
        position.idle_no_amount -= amount;
        position.collateral_amount = position.collateral_amount.saturating_sub(amount);
        position.timestamp = env.ledger().timestamp();
        Self::update_position_activity(&mut position);
        Self::set_position(&env, &condition_id, &provider, &position);

        let mut totals = Self::get_totals(&env, &condition_id);
        totals.idle_yes_total -= amount;
        totals.idle_no_total -= amount;
        Self::set_totals(&env, &condition_id, &totals);
        let event_id = Self::get_event_id(&env, &condition_id);
        Self::update_event_totals(
            &env,
            &event_id,
            -(amount as i128),
            -(amount as i128),
            0,
            0,
            0,
        );
        amount
    }

    fn remove_and_merge_liquidity(
        env: Env,
        provider: Address,
        condition_id: BytesN<32>,
        amount: u128,
    ) -> u128 {
        provider.require_auth();
        access::assert_not_paused(&env);
        Self::remove_liquidity(
            env.clone(),
            provider.clone(),
            condition_id.clone(),
            amount,
            amount,
        );
        Self::merge_positions(env, provider, condition_id, amount)
    }

    fn record_trade(
        env: Env,
        condition_id: BytesN<32>,
        outcome_index: u32,
        token_amount: u128,
        collateral_amount: u128,
        maker_sold_inventory: bool,
    ) {
        access::assert_not_paused(&env);
        if token_amount == 0 || collateral_amount == 0 {
            return;
        }
        let providers: Vec<Address> = env
            .storage()
            .instance()
            .get(&LiquidityDataKey::MarketProviders(condition_id.clone()))
            .unwrap_or(Vec::new(&env));
        if providers.is_empty() {
            panic!("Liquidity: no pool providers");
        }

        let mut total_weight = 0u128;
        for provider in providers.iter() {
            let position = Self::get_position_or_default(&env, &condition_id, &provider);
            total_weight += if maker_sold_inventory {
                if outcome_index == 0 {
                    position.yes_amount
                } else {
                    position.no_amount
                }
            } else {
                position.claimable_collateral_amount
            };
        }
        if total_weight == 0 {
            panic!("Liquidity: zero provider weight");
        }

        let mut remaining_token = token_amount;
        let mut remaining_collateral = collateral_amount;
        for idx in 0..providers.len() {
            let provider = providers.get(idx).expect("Liquidity: missing provider");
            let mut position = Self::get_position_or_default(&env, &condition_id, &provider);
            let weight = if maker_sold_inventory {
                if outcome_index == 0 {
                    position.yes_amount
                } else {
                    position.no_amount
                }
            } else {
                position.claimable_collateral_amount
            };
            if weight == 0 {
                continue;
            }

            let is_last = idx + 1 == providers.len();
            let token_share = if is_last {
                remaining_token
            } else {
                token_amount
                    .checked_mul(weight)
                    .expect("Liquidity: token share overflow")
                    / total_weight
            };
            let collateral_share = if is_last {
                remaining_collateral
            } else {
                collateral_amount
                    .checked_mul(weight)
                    .expect("Liquidity: collateral share overflow")
                    / total_weight
            };

            if maker_sold_inventory {
                if outcome_index == 0 {
                    position.yes_amount -= token_share;
                } else {
                    position.no_amount -= token_share;
                }
                position.claimable_collateral_amount += collateral_share;
            } else {
                position.claimable_collateral_amount -= collateral_share;
                if outcome_index == 0 {
                    position.yes_amount += token_share;
                } else {
                    position.no_amount += token_share;
                }
            }
            position.timestamp = env.ledger().timestamp();
            Self::update_position_activity(&mut position);
            Self::set_position(&env, &condition_id, &provider, &position);

            remaining_token -= token_share;
            remaining_collateral -= collateral_share;
        }

        let mut totals = Self::get_totals(&env, &condition_id);
        if maker_sold_inventory {
            if outcome_index == 0 {
                totals.posted_yes_total -= token_amount;
            } else {
                totals.posted_no_total -= token_amount;
            }
            totals.claimable_collateral_total += collateral_amount;
        } else {
            if outcome_index == 0 {
                totals.posted_yes_total += token_amount;
            } else {
                totals.posted_no_total += token_amount;
            }
            totals.claimable_collateral_total -= collateral_amount;
        }
        Self::set_totals(&env, &condition_id, &totals);
        let event_id = Self::get_event_id(&env, &condition_id);
        let (posted_yes_delta, posted_no_delta) = if outcome_index == 0 {
            if maker_sold_inventory {
                (-(token_amount as i128), 0)
            } else {
                (token_amount as i128, 0)
            }
        } else if maker_sold_inventory {
            (0, -(token_amount as i128))
        } else {
            (0, token_amount as i128)
        };
        let collateral_delta = if maker_sold_inventory {
            collateral_amount as i128
        } else {
            -(collateral_amount as i128)
        };
        Self::update_event_totals(
            &env,
            &event_id,
            0,
            0,
            posted_yes_delta,
            posted_no_delta,
            collateral_delta,
        );
    }

    fn get_liquidity_position(
        env: Env,
        condition_id: BytesN<32>,
        provider: Address,
    ) -> LiquidityPosition {
        Self::get_position_or_default(&env, &condition_id, &provider)
    }

    fn get_position(env: Env, condition_id: BytesN<32>, provider: Address) -> LiquidityPosition {
        Self::get_position_or_default(&env, &condition_id, &provider)
    }

    fn get_total_liquidity(env: Env, condition_id: BytesN<32>) -> (u128, u128) {
        let totals = Self::get_totals(&env, &condition_id);
        (totals.posted_yes_total, totals.posted_no_total)
    }

    fn get_market_liquidity(env: Env, condition_id: BytesN<32>) -> LiquidityTotals {
        Self::get_totals(&env, &condition_id)
    }

    fn get_event_liquidity(env: Env, event_id: BytesN<32>) -> LiquidityTotals {
        Self::get_event_totals(&env, &event_id)
    }
}
