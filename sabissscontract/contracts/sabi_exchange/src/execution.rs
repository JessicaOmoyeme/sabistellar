use crate::clients::CtfClient;
use crate::storage::{Order, Side};
use soroban_sdk::{
    auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
    token, vec, Address, BytesN, Env, IntoVal, MuxedAddress, Symbol,
};

pub struct OrderExecution;

impl OrderExecution {
    fn fee_amount(amount: u128, fee_rate_bps: u32) -> u128 {
        amount
            .checked_mul(fee_rate_bps as u128)
            .expect("Exchange: Fee overflow")
            / 10_000u128
    }

    pub fn position_id(
        env: &Env,
        ctf_contract: &Address,
        collateral_token: &Address,
        order: &Order,
    ) -> BytesN<32> {
        Self::position_id_for_outcome(
            env,
            ctf_contract,
            collateral_token,
            &order.condition_id,
            order.outcome_index,
        )
    }

    pub fn position_id_for_outcome(
        env: &Env,
        ctf_contract: &Address,
        collateral_token: &Address,
        condition_id: &BytesN<32>,
        outcome_index: u32,
    ) -> BytesN<32> {
        if outcome_index >= 32 {
            panic!("Exchange: Invalid outcome index");
        }
        let ctf = CtfClient::new(env, ctf_contract);
        let empty_collection = BytesN::from_array(env, &[0; 32]);
        let outcome_index_set = 1u32 << outcome_index;
        let collection_id =
            ctf.get_collection_id(&empty_collection, condition_id, &outcome_index_set);
        ctf.get_position_id(collateral_token, &collection_id)
    }

    pub fn authorize_token_transfer_from(
        env: &Env,
        token_contract: &Address,
        from: &Address,
        to: &Address,
        amount: u128,
    ) {
        let exchange = env.current_contract_address();
        let amount_i128 = i128::try_from(amount).expect("Exchange: token amount overflow");
        env.authorize_as_current_contract(vec![
            env,
            InvokerContractAuthEntry::Contract(SubContractInvocation {
                context: ContractContext {
                    contract: token_contract.clone(),
                    fn_name: Symbol::new(env, "transfer_from"),
                    args: vec![
                        env,
                        exchange.into_val(env),
                        from.clone().into_val(env),
                        to.clone().into_val(env),
                        amount_i128.into_val(env),
                    ],
                },
                sub_invocations: vec![env],
            }),
        ]);
    }

    pub fn authorize_token_transfer(
        env: &Env,
        token_contract: &Address,
        to: &Address,
        amount: u128,
    ) {
        let exchange = env.current_contract_address();
        let muxed_to: MuxedAddress = to.clone().into();
        let amount_i128 = i128::try_from(amount).expect("Exchange: token amount overflow");
        env.authorize_as_current_contract(vec![
            env,
            InvokerContractAuthEntry::Contract(SubContractInvocation {
                context: ContractContext {
                    contract: token_contract.clone(),
                    fn_name: Symbol::new(env, "transfer"),
                    args: vec![
                        env,
                        exchange.into_val(env),
                        muxed_to.into_val(env),
                        amount_i128.into_val(env),
                    ],
                },
                sub_invocations: vec![env],
            }),
        ]);
    }

    pub fn authorize_ctf_transfer_position(
        env: &Env,
        ctf_contract: &Address,
        from: &Address,
        to: &Address,
        position_id: &BytesN<32>,
        amount: u128,
    ) {
        env.authorize_as_current_contract(vec![
            env,
            InvokerContractAuthEntry::Contract(SubContractInvocation {
                context: ContractContext {
                    contract: ctf_contract.clone(),
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

    pub fn authorize_ctf_transfer_position_lm(
        env: &Env,
        ctf_contract: &Address,
        from: &Address,
        to: &Address,
        position_id: &BytesN<32>,
        amount: u128,
    ) {
        env.authorize_as_current_contract(vec![
            env,
            InvokerContractAuthEntry::Contract(SubContractInvocation {
                context: ContractContext {
                    contract: ctf_contract.clone(),
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

    pub fn authorize_ctf_mint_position(
        env: &Env,
        ctf_contract: &Address,
        user: &Address,
        position_id: &BytesN<32>,
        amount: u128,
    ) {
        env.authorize_as_current_contract(vec![
            env,
            InvokerContractAuthEntry::Contract(SubContractInvocation {
                context: ContractContext {
                    contract: ctf_contract.clone(),
                    fn_name: Symbol::new(env, "mint_position"),
                    args: vec![
                        env,
                        user.clone().into_val(env),
                        position_id.clone().into_val(env),
                        amount.into_val(env),
                    ],
                },
                sub_invocations: vec![env],
            }),
        ]);
    }

    pub fn authorize_ctf_merge_positions(
        env: &Env,
        ctf_contract: &Address,
        user: &Address,
        collateral_token: &Address,
        parent_collection_id: &BytesN<32>,
        condition_id: &BytesN<32>,
        partition: &soroban_sdk::Vec<u32>,
        amount: u128,
    ) {
        env.authorize_as_current_contract(vec![
            env,
            InvokerContractAuthEntry::Contract(SubContractInvocation {
                context: ContractContext {
                    contract: ctf_contract.clone(),
                    fn_name: Symbol::new(env, "merge_positions"),
                    args: vec![
                        env,
                        user.clone().into_val(env),
                        collateral_token.clone().into_val(env),
                        parent_collection_id.clone().into_val(env),
                        condition_id.clone().into_val(env),
                        partition.clone().into_val(env),
                        amount.into_val(env),
                    ],
                },
                sub_invocations: vec![env],
            }),
        ]);
    }

    pub fn counter_amount(order: &Order, filled_before: u128, fill_amount: u128) -> u128 {
        let filled_after = filled_before
            .checked_add(fill_amount)
            .expect("Exchange: Fill overflow");
        let quote_before = filled_before
            .checked_mul(order.taker_amount)
            .expect("Exchange: Quote overflow")
            / order.maker_amount;
        let quote_after = filled_after
            .checked_mul(order.taker_amount)
            .expect("Exchange: Quote overflow")
            / order.maker_amount;
        let quote_delta = quote_after
            .checked_sub(quote_before)
            .expect("Exchange: Quote underflow");
        if quote_delta == 0 {
            panic!("Exchange: Fill too small for order precision");
        }
        quote_delta
    }

    pub fn execute_trade(
        env: &Env,
        ctf_contract: &Address,
        collateral_token: &Address,
        fee_recipient: &Address,
        order: &Order,
        filled_before: u128,
        fill_amount: u128,
    ) {
        let ctf = CtfClient::new(env, ctf_contract);
        let counter_amount = Self::counter_amount(order, filled_before, fill_amount);
        let token_client = token::Client::new(env, collateral_token);
        let exchange = env.current_contract_address();
        let position_id = Self::position_id(env, ctf_contract, collateral_token, order);

        match order.side {
            Side::Buy => {
                let fee_amount = Self::fee_amount(fill_amount, order.fee_rate_bps);
                let taker_proceeds = fill_amount
                    .checked_sub(fee_amount)
                    .expect("Exchange: Fee exceeds proceeds");
                Self::authorize_token_transfer_from(
                    env,
                    collateral_token,
                    &order.maker,
                    &order.taker,
                    taker_proceeds,
                );
                token_client.transfer_from(
                    &exchange,
                    &order.maker,
                    &order.taker,
                    &i128::try_from(taker_proceeds).unwrap(),
                );
                if fee_amount > 0 {
                    Self::authorize_token_transfer_from(
                        env,
                        collateral_token,
                        &order.maker,
                        fee_recipient,
                        fee_amount,
                    );
                    token_client.transfer_from(
                        &exchange,
                        &order.maker,
                        fee_recipient,
                        &i128::try_from(fee_amount).unwrap(),
                    );
                }

                let taker_balance = ctf.get_position_balance(&order.taker, &position_id);
                if taker_balance < counter_amount {
                    panic!("Exchange: Taker has insufficient CTF");
                }
                Self::authorize_ctf_transfer_position(
                    env,
                    ctf_contract,
                    &order.taker,
                    &order.maker,
                    &position_id,
                    counter_amount,
                );
                ctf.transfer_position(&order.taker, &order.maker, &position_id, &counter_amount);
            }
            Side::Sell => {
                let fee_amount = Self::fee_amount(counter_amount, order.fee_rate_bps);
                let maker_proceeds = counter_amount
                    .checked_sub(fee_amount)
                    .expect("Exchange: Fee exceeds proceeds");
                Self::authorize_token_transfer_from(
                    env,
                    collateral_token,
                    &order.taker,
                    &order.maker,
                    maker_proceeds,
                );
                token_client.transfer_from(
                    &exchange,
                    &order.taker,
                    &order.maker,
                    &i128::try_from(maker_proceeds).unwrap(),
                );
                if fee_amount > 0 {
                    Self::authorize_token_transfer_from(
                        env,
                        collateral_token,
                        &order.taker,
                        fee_recipient,
                        fee_amount,
                    );
                    token_client.transfer_from(
                        &exchange,
                        &order.taker,
                        fee_recipient,
                        &i128::try_from(fee_amount).unwrap(),
                    );
                }

                let maker_balance = ctf.get_position_balance(&order.maker, &position_id);
                if maker_balance < fill_amount {
                    panic!("Exchange: Maker has insufficient CTF");
                }
                Self::authorize_ctf_transfer_position(
                    env,
                    ctf_contract,
                    &order.maker,
                    &order.taker,
                    &position_id,
                    fill_amount,
                );
                ctf.transfer_position(&order.maker, &order.taker, &position_id, &fill_amount);
            }
        }
    }

    pub fn execute_complementary_buy(
        env: &Env,
        ctf_contract: &Address,
        collateral_token: &Address,
        fee_recipient: &Address,
        left_order: &Order,
        left_filled_before: u128,
        left_fill_amount: u128,
        right_order: &Order,
        right_filled_before: u128,
        right_fill_amount: u128,
    ) {
        let ctf = CtfClient::new(env, ctf_contract);
        let left_tokens = Self::counter_amount(left_order, left_filled_before, left_fill_amount);
        let right_tokens =
            Self::counter_amount(right_order, right_filled_before, right_fill_amount);
        if left_tokens != right_tokens {
            panic!("Exchange: Complementary buy token amounts must match");
        }

        let left_fee = Self::fee_amount(left_fill_amount, left_order.fee_rate_bps);
        let right_fee = Self::fee_amount(right_fill_amount, right_order.fee_rate_bps);
        let left_net = left_fill_amount
            .checked_sub(left_fee)
            .expect("Exchange: Fee exceeds proceeds");
        let right_net = right_fill_amount
            .checked_sub(right_fee)
            .expect("Exchange: Fee exceeds proceeds");
        let complete_sets = left_tokens;
        let total_net = left_net
            .checked_add(right_net)
            .expect("Exchange: Complementary collateral overflow");
        if total_net < complete_sets {
            panic!("Exchange: Complementary bids do not fund complete sets");
        }

        let token_client = token::Client::new(env, collateral_token);
        let exchange = env.current_contract_address();
        if left_fee > 0 {
            Self::authorize_token_transfer_from(
                env,
                collateral_token,
                &left_order.maker,
                fee_recipient,
                left_fee,
            );
            token_client.transfer_from(
                &exchange,
                &left_order.maker,
                fee_recipient,
                &i128::try_from(left_fee).unwrap(),
            );
        }
        if right_fee > 0 {
            Self::authorize_token_transfer_from(
                env,
                collateral_token,
                &right_order.maker,
                fee_recipient,
                right_fee,
            );
            token_client.transfer_from(
                &exchange,
                &right_order.maker,
                fee_recipient,
                &i128::try_from(right_fee).unwrap(),
            );
        }
        Self::authorize_token_transfer_from(
            env,
            collateral_token,
            &left_order.maker,
            &exchange,
            left_net,
        );
        token_client.transfer_from(
            &exchange,
            &left_order.maker,
            &exchange,
            &i128::try_from(left_net).unwrap(),
        );
        Self::authorize_token_transfer_from(
            env,
            collateral_token,
            &right_order.maker,
            &exchange,
            right_net,
        );
        token_client.transfer_from(
            &exchange,
            &right_order.maker,
            &exchange,
            &i128::try_from(right_net).unwrap(),
        );

        let left_position = Self::position_id(env, ctf_contract, collateral_token, left_order);
        let right_position = Self::position_id(env, ctf_contract, collateral_token, right_order);
        Self::authorize_ctf_mint_position(
            env,
            ctf_contract,
            &left_order.maker,
            &left_position,
            complete_sets,
        );
        ctf.mint_position(&left_order.maker, &left_position, &complete_sets);
        Self::authorize_ctf_mint_position(
            env,
            ctf_contract,
            &right_order.maker,
            &right_position,
            complete_sets,
        );
        ctf.mint_position(&right_order.maker, &right_position, &complete_sets);

        let surplus = total_net - complete_sets;
        if surplus > 0 {
            Self::authorize_token_transfer(env, collateral_token, fee_recipient, surplus);
            let fee_recipient_muxed: MuxedAddress = fee_recipient.clone().into();
            token_client.transfer(
                &exchange,
                &fee_recipient_muxed,
                &i128::try_from(surplus).unwrap(),
            );
        }
    }

    pub fn execute_complementary_sell(
        env: &Env,
        ctf_contract: &Address,
        collateral_token: &Address,
        fee_recipient: &Address,
        left_order: &Order,
        left_filled_before: u128,
        left_fill_amount: u128,
        right_order: &Order,
        right_filled_before: u128,
        right_fill_amount: u128,
    ) {
        if left_fill_amount != right_fill_amount {
            panic!("Exchange: Complementary sell token amounts must match");
        }

        let ctf = CtfClient::new(env, ctf_contract);
        let left_quote = Self::counter_amount(left_order, left_filled_before, left_fill_amount);
        let right_quote = Self::counter_amount(right_order, right_filled_before, right_fill_amount);
        let left_fee = Self::fee_amount(left_quote, left_order.fee_rate_bps);
        let right_fee = Self::fee_amount(right_quote, right_order.fee_rate_bps);
        let left_payout = left_quote
            .checked_sub(left_fee)
            .expect("Exchange: Fee exceeds proceeds");
        let right_payout = right_quote
            .checked_sub(right_fee)
            .expect("Exchange: Fee exceeds proceeds");
        let total_out = left_payout
            .checked_add(right_payout)
            .and_then(|v| v.checked_add(left_fee))
            .and_then(|v| v.checked_add(right_fee))
            .expect("Exchange: Complementary payout overflow");
        if total_out > left_fill_amount {
            panic!("Exchange: Complementary asks exceed collateral backing");
        }

        let exchange = env.current_contract_address();
        let empty_collection = BytesN::from_array(env, &[0; 32]);
        let left_position = Self::position_id(env, ctf_contract, collateral_token, left_order);
        let right_position = Self::position_id(env, ctf_contract, collateral_token, right_order);
        Self::authorize_ctf_transfer_position(
            env,
            ctf_contract,
            &left_order.maker,
            &exchange,
            &left_position,
            left_fill_amount,
        );
        ctf.transfer_position(
            &left_order.maker,
            &exchange,
            &left_position,
            &left_fill_amount,
        );
        Self::authorize_ctf_transfer_position(
            env,
            ctf_contract,
            &right_order.maker,
            &exchange,
            &right_position,
            right_fill_amount,
        );
        ctf.transfer_position(
            &right_order.maker,
            &exchange,
            &right_position,
            &right_fill_amount,
        );

        let mut partition = soroban_sdk::Vec::new(env);
        partition.push_back(left_order.outcome_index_set());
        partition.push_back(right_order.outcome_index_set());
        Self::authorize_ctf_merge_positions(
            env,
            ctf_contract,
            &exchange,
            collateral_token,
            &empty_collection,
            &left_order.condition_id,
            &partition,
            left_fill_amount,
        );
        ctf.merge_positions(
            &exchange,
            collateral_token,
            &empty_collection,
            &left_order.condition_id,
            &partition,
            &left_fill_amount,
        );

        let token_client = token::Client::new(env, collateral_token);
        Self::authorize_token_transfer(env, collateral_token, &left_order.maker, left_payout);
        let left_recipient: MuxedAddress = left_order.maker.clone().into();
        token_client.transfer(
            &exchange,
            &left_recipient,
            &i128::try_from(left_payout).unwrap(),
        );
        Self::authorize_token_transfer(env, collateral_token, &right_order.maker, right_payout);
        let right_recipient: MuxedAddress = right_order.maker.clone().into();
        token_client.transfer(
            &exchange,
            &right_recipient,
            &i128::try_from(right_payout).unwrap(),
        );

        let total_fee = left_fee
            .checked_add(right_fee)
            .expect("Exchange: Fee overflow");
        let spread = left_fill_amount
            .checked_sub(left_payout + right_payout + total_fee)
            .expect("Exchange: Spread underflow");
        let fee_total = total_fee
            .checked_add(spread)
            .expect("Exchange: Fee overflow");
        if fee_total > 0 {
            Self::authorize_token_transfer(env, collateral_token, fee_recipient, fee_total);
            let fee_recipient_muxed: MuxedAddress = fee_recipient.clone().into();
            token_client.transfer(
                &exchange,
                &fee_recipient_muxed,
                &i128::try_from(fee_total).unwrap(),
            );
        }
    }
}
