use crate::access;
use crate::interface::ICtf;
use crate::storage::{Condition, CtfDataKey};
use soroban_sdk::xdr::ToXdr;
use soroban_sdk::{contract, contractimpl, token, Address, Bytes, BytesN, Env, MuxedAddress, Vec};

#[contract]
pub struct CtfContract;

impl CtfContract {
    fn full_index_set(outcome_slot_count: u32) -> u32 {
        if outcome_slot_count == 32 {
            u32::MAX
        } else {
            (1u32 << outcome_slot_count) - 1
        }
    }

    fn get_balance(env: &Env, user: &Address, position_id: &BytesN<32>) -> u128 {
        env.storage()
            .instance()
            .get(&CtfDataKey::PositionBalance(
                user.clone(),
                position_id.clone(),
            ))
            .unwrap_or(0)
    }

    fn set_balance(env: &Env, user: &Address, position_id: &BytesN<32>, balance: u128) {
        env.storage().instance().set(
            &CtfDataKey::PositionBalance(user.clone(), position_id.clone()),
            &balance,
        );
    }

    fn get_supply(env: &Env, position_id: &BytesN<32>) -> u128 {
        env.storage()
            .instance()
            .get(&CtfDataKey::PositionSupply(position_id.clone()))
            .unwrap_or(0)
    }

    fn set_supply(env: &Env, position_id: &BytesN<32>, supply: u128) {
        env.storage()
            .instance()
            .set(&CtfDataKey::PositionSupply(position_id.clone()), &supply);
    }

    fn do_mint(env: &Env, user: &Address, position_id: &BytesN<32>, amount: u128) {
        let balance = Self::get_balance(env, user, position_id);
        Self::set_balance(env, user, position_id, balance + amount);
        let supply = Self::get_supply(env, position_id);
        Self::set_supply(env, position_id, supply + amount);
    }

    fn do_burn(env: &Env, user: &Address, position_id: &BytesN<32>, amount: u128) {
        let balance = Self::get_balance(env, user, position_id);
        if balance < amount {
            panic!("CTF: Insufficient position balance");
        }
        Self::set_balance(env, user, position_id, balance - amount);

        let supply = Self::get_supply(env, position_id);
        if supply < amount {
            panic!("CTF: Position supply underflow");
        }
        Self::set_supply(env, position_id, supply - amount);
    }

    fn apply_payouts(env: &Env, condition_id: &BytesN<32>, payouts: Vec<u32>) {
        let mut condition: Condition = env
            .storage()
            .instance()
            .get(&CtfDataKey::Condition(condition_id.clone()))
            .expect("CTF: Condition not prepared");

        if condition.payout_denominator != 0 {
            panic!("CTF: Condition already resolved");
        }

        if payouts.len() as u32 != condition.outcome_slot_count {
            panic!("CTF: Payout vector length mismatch");
        }

        let mut denominator = 0u32;
        for numerator in payouts.iter() {
            denominator = denominator
                .checked_add(numerator)
                .expect("CTF: Payout overflow");
        }
        if denominator == 0 {
            panic!("CTF: Denominator cannot be zero");
        }

        condition.payout_numerators = payouts;
        condition.payout_denominator = denominator;
        env.storage()
            .instance()
            .set(&CtfDataKey::Condition(condition_id.clone()), &condition);
    }

    fn validate_partition(
        env: &Env,
        condition_id: &BytesN<32>,
        partition: &Vec<u32>,
    ) -> (Condition, u32) {
        let condition: Condition = env
            .storage()
            .instance()
            .get(&CtfDataKey::Condition(condition_id.clone()))
            .expect("CTF: Condition not prepared");
        let full_index_set = Self::full_index_set(condition.outcome_slot_count);
        let mut free_index_set = full_index_set;

        for subset in partition.iter() {
            if subset == 0 || subset > full_index_set {
                panic!("CTF: Invalid subset");
            }
            if (free_index_set & subset) != subset {
                panic!("CTF: Partition subsets overlap");
            }
            free_index_set ^= subset;
        }
        if free_index_set != 0 {
            panic!("CTF: Partition does not cover all outcomes");
        }

        (condition, full_index_set)
    }

    fn split_position_internal(
        env: &Env,
        user: &Address,
        collateral_token: &Address,
        parent_collection_id: &BytesN<32>,
        condition_id: &BytesN<32>,
        partition: &Vec<u32>,
        amount: u128,
    ) {
        let _ = Self::validate_partition(env, condition_id, partition);

        let empty = BytesN::from_array(env, &[0; 32]);
        if *parent_collection_id == empty {
            let contract_address: MuxedAddress = env.current_contract_address().into();
            token::Client::new(env, collateral_token).transfer(
                user,
                &contract_address,
                &i128::try_from(amount).unwrap(),
            );
        } else {
            let parent_position = Self::get_position_id(
                env.clone(),
                collateral_token.clone(),
                parent_collection_id.clone(),
            );
            Self::do_burn(env, user, &parent_position, amount);
        }

        for subset in partition.iter() {
            let child_collection = Self::get_collection_id(
                env.clone(),
                parent_collection_id.clone(),
                condition_id.clone(),
                subset,
            );
            let child_position =
                Self::get_position_id(env.clone(), collateral_token.clone(), child_collection);
            Self::do_mint(env, user, &child_position, amount);
        }
    }

    fn merge_positions_internal(
        env: &Env,
        holder: &Address,
        recipient: &Address,
        collateral_token: &Address,
        parent_collection_id: &BytesN<32>,
        condition_id: &BytesN<32>,
        partition: &Vec<u32>,
        amount: u128,
    ) {
        let condition: Condition = env
            .storage()
            .instance()
            .get(&CtfDataKey::Condition(condition_id.clone()))
            .expect("CTF: Condition not prepared");
        let full_index_set = Self::full_index_set(condition.outcome_slot_count);
        let mut free_index_set = full_index_set;

        for subset in partition.iter() {
            if subset == 0 || subset > full_index_set {
                panic!("CTF: Invalid subset");
            }
            if (free_index_set & subset) != subset {
                panic!("CTF: Partition subsets overlap");
            }
            free_index_set ^= subset;
        }
        if free_index_set != 0 {
            panic!("CTF: Partition does not cover all outcomes");
        }

        for subset in partition.iter() {
            let child_collection = Self::get_collection_id(
                env.clone(),
                parent_collection_id.clone(),
                condition_id.clone(),
                subset,
            );
            let child_position =
                Self::get_position_id(env.clone(), collateral_token.clone(), child_collection);
            Self::do_burn(env, holder, &child_position, amount);
        }

        let empty = BytesN::from_array(env, &[0; 32]);
        if *parent_collection_id == empty {
            let recipient_muxed: MuxedAddress = recipient.clone().into();
            token::Client::new(env, collateral_token).transfer(
                &env.current_contract_address(),
                &recipient_muxed,
                &i128::try_from(amount).unwrap(),
            );
        } else {
            let parent_position = Self::get_position_id(
                env.clone(),
                collateral_token.clone(),
                parent_collection_id.clone(),
            );
            Self::do_mint(env, recipient, &parent_position, amount);
        }
    }
}

#[contractimpl]
impl ICtf for CtfContract {
    fn init(env: Env, admin: Address) {
        access::init_admin(&env, &admin);
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

    fn set_exchange_contract(env: Env, exchange_contract: Address) {
        access::set_exchange_contract(&env, &exchange_contract);
    }

    fn get_exchange_contract(env: Env) -> Option<Address> {
        access::get_exchange_contract(&env)
    }

    fn set_liquidity_manager_contract(env: Env, liquidity_manager_contract: Address) {
        access::set_liquidity_manager_contract(&env, &liquidity_manager_contract);
    }

    fn get_liquidity_manager_contract(env: Env) -> Option<Address> {
        access::get_liquidity_manager_contract(&env)
    }

    fn set_market_contract(env: Env, market_contract: Address) {
        access::set_market_contract(&env, &market_contract);
    }

    fn get_market_contract(env: Env) -> Option<Address> {
        access::get_market_contract(&env)
    }

    fn prepare_condition(
        env: Env,
        oracle: Address,
        question_id: BytesN<32>,
        outcome_slot_count: u32,
    ) {
        if !(2..=32).contains(&outcome_slot_count) {
            panic!("CTF: Invalid outcome slot count");
        }

        let condition_id =
            Self::get_condition_id(env.clone(), oracle.clone(), question_id, outcome_slot_count);
        if env
            .storage()
            .instance()
            .has(&CtfDataKey::Condition(condition_id.clone()))
        {
            panic!("CTF: Condition already prepared");
        }

        env.storage().instance().set(
            &CtfDataKey::Condition(condition_id),
            &Condition {
                oracle,
                outcome_slot_count,
                payout_numerators: Vec::new(&env),
                payout_denominator: 0,
            },
        );
    }

    fn report_payouts(env: Env, oracle: Address, question_id: BytesN<32>, payouts: Vec<u32>) {
        oracle.require_auth();

        let outcome_slot_count = payouts.len() as u32;
        let condition_id =
            Self::get_condition_id(env.clone(), oracle.clone(), question_id, outcome_slot_count);
        Self::apply_payouts(&env, &condition_id, payouts);
    }

    fn report_payouts_by_condition(env: Env, condition_id: BytesN<32>, payouts: Vec<u32>) {
        access::require_market_if_configured(&env);
        Self::apply_payouts(&env, &condition_id, payouts);
    }

    fn split_position(
        env: Env,
        user: Address,
        collateral_token: Address,
        parent_collection_id: BytesN<32>,
        condition_id: BytesN<32>,
        partition: Vec<u32>,
        amount: u128,
    ) {
        user.require_auth();
        access::assert_not_paused(&env);
        if amount == 0 {
            return;
        }
        Self::split_position_internal(
            &env,
            &user,
            &collateral_token,
            &parent_collection_id,
            &condition_id,
            &partition,
            amount,
        );
    }

    fn merge_positions(
        env: Env,
        user: Address,
        collateral_token: Address,
        parent_collection_id: BytesN<32>,
        condition_id: BytesN<32>,
        partition: Vec<u32>,
        amount: u128,
    ) {
        user.require_auth();
        access::assert_not_paused(&env);
        if amount == 0 {
            return;
        }
        Self::merge_positions_internal(
            &env,
            &user,
            &user,
            &collateral_token,
            &parent_collection_id,
            &condition_id,
            &partition,
            amount,
        );
    }

    fn merge_positions_lm(
        env: Env,
        holder: Address,
        recipient: Address,
        collateral_token: Address,
        parent_collection_id: BytesN<32>,
        condition_id: BytesN<32>,
        partition: Vec<u32>,
        amount: u128,
    ) {
        access::assert_not_paused(&env);
        access::require_liquidity_manager_if_configured(&env);
        if amount == 0 {
            return;
        }
        Self::merge_positions_internal(
            &env,
            &holder,
            &recipient,
            &collateral_token,
            &parent_collection_id,
            &condition_id,
            &partition,
            amount,
        );
    }

    fn redeem_positions(
        env: Env,
        user: Address,
        collateral_token: Address,
        parent_collection_id: BytesN<32>,
        condition_id: BytesN<32>,
        index_sets: Vec<u32>,
    ) {
        user.require_auth();
        access::assert_not_paused(&env);

        let condition: Condition = env
            .storage()
            .instance()
            .get(&CtfDataKey::Condition(condition_id.clone()))
            .expect("CTF: Condition not prepared");
        if condition.payout_denominator == 0 {
            panic!("CTF: Condition not resolved");
        }

        let full_index_set = Self::full_index_set(condition.outcome_slot_count);
        let mut total_payout = 0u128;

        for index_set in index_sets.iter() {
            if index_set == 0 || index_set > full_index_set {
                panic!("CTF: Invalid redemption subset");
            }

            let mut numerator = 0u32;
            for i in 0..condition.outcome_slot_count {
                if (index_set & (1u32 << i)) != 0 {
                    numerator = numerator
                        .checked_add(condition.payout_numerators.get(i).unwrap_or(0))
                        .expect("CTF: Redemption overflow");
                }
            }
            if numerator == 0 {
                continue;
            }

            let child_collection = Self::get_collection_id(
                env.clone(),
                parent_collection_id.clone(),
                condition_id.clone(),
                index_set,
            );
            let child_position =
                Self::get_position_id(env.clone(), collateral_token.clone(), child_collection);
            let balance = Self::get_balance(&env, &user, &child_position);
            if balance == 0 {
                continue;
            }

            total_payout += (balance * numerator as u128) / (condition.payout_denominator as u128);
            Self::do_burn(&env, &user, &child_position, balance);
        }

        if total_payout == 0 {
            return;
        }

        let empty = BytesN::from_array(&env, &[0; 32]);
        if parent_collection_id == empty {
            let user_muxed: MuxedAddress = user.into();
            token::Client::new(&env, &collateral_token).transfer(
                &env.current_contract_address(),
                &user_muxed,
                &i128::try_from(total_payout).unwrap(),
            );
        } else {
            let parent_position =
                Self::get_position_id(env.clone(), collateral_token, parent_collection_id);
            Self::do_mint(&env, &user, &parent_position, total_payout);
        }
    }

    fn get_position_balance(env: Env, user: Address, position_id: BytesN<32>) -> u128 {
        Self::get_balance(&env, &user, &position_id)
    }

    fn get_position_supply(env: Env, position_id: BytesN<32>) -> u128 {
        Self::get_supply(&env, &position_id)
    }

    fn transfer_position(
        env: Env,
        from: Address,
        to: Address,
        position_id: BytesN<32>,
        amount: u128,
    ) {
        access::assert_not_paused(&env);
        from.require_auth();
        Self::do_burn(&env, &from, &position_id, amount);
        Self::do_mint(&env, &to, &position_id, amount);
    }

    fn split_position_lm(
        env: Env,
        user: Address,
        collateral_token: Address,
        parent_collection_id: BytesN<32>,
        condition_id: BytesN<32>,
        partition: Vec<u32>,
        amount: u128,
    ) {
        access::assert_not_paused(&env);
        access::require_liquidity_manager_if_configured(&env);
        if amount == 0 {
            return;
        }
        user.require_auth();
        Self::split_position_internal(
            &env,
            &user,
            &collateral_token,
            &parent_collection_id,
            &condition_id,
            &partition,
            amount,
        );
    }

    fn transfer_position_lm(
        env: Env,
        from: Address,
        to: Address,
        position_id: BytesN<32>,
        amount: u128,
    ) {
        access::assert_not_paused(&env);
        access::require_liquidity_manager_if_configured(&env);
        Self::do_burn(&env, &from, &position_id, amount);
        Self::do_mint(&env, &to, &position_id, amount);
    }

    fn mint_position(env: Env, user: Address, position_id: BytesN<32>, amount: u128) {
        access::assert_not_paused(&env);
        access::require_exchange_if_configured(&env);
        Self::do_mint(&env, &user, &position_id, amount);
    }

    fn burn_position(env: Env, user: Address, position_id: BytesN<32>, amount: u128) {
        access::assert_not_paused(&env);
        access::require_exchange_if_configured(&env);
        Self::do_burn(&env, &user, &position_id, amount);
    }

    fn get_condition_id(
        env: Env,
        oracle: Address,
        question_id: BytesN<32>,
        outcome_slot_count: u32,
    ) -> BytesN<32> {
        let mut payload = Bytes::new(&env);
        payload.append(&oracle.to_xdr(&env));
        payload.append(&question_id.into());
        payload.append(&Bytes::from_slice(&env, &outcome_slot_count.to_be_bytes()));
        env.crypto().keccak256(&payload).into()
    }

    fn get_collection_id(
        env: Env,
        parent_collection_id: BytesN<32>,
        condition_id: BytesN<32>,
        index_set: u32,
    ) -> BytesN<32> {
        let mut payload = Bytes::new(&env);
        payload.append(&parent_collection_id.into());
        payload.append(&condition_id.into());
        payload.append(&Bytes::from_slice(&env, &index_set.to_be_bytes()));
        env.crypto().keccak256(&payload).into()
    }

    fn get_position_id(
        env: Env,
        collateral_token: Address,
        collection_id: BytesN<32>,
    ) -> BytesN<32> {
        let mut payload = Bytes::new(&env);
        payload.append(&collateral_token.to_xdr(&env));
        payload.append(&collection_id.into());
        env.crypto().keccak256(&payload).into()
    }
}
