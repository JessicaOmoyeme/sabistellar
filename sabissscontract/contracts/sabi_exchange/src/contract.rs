use crate::access;
use crate::clients::{LiquidityManagerClient, MarketClient, MarketStatus};
use crate::execution::OrderExecution;
use crate::guards;
use crate::interface::IExchange;
use crate::storage::{ExchangeDataKey, Order, OrderStatus, OrderType, Side};
use soroban_sdk::{contract, contractimpl, token, Address, Bytes, BytesN, Env, MuxedAddress, Vec};

#[contract]
pub struct ExchangeContract;

impl ExchangeContract {
    fn get_market_if_exists(
        env: &Env,
        condition_id: &soroban_sdk::BytesN<32>,
    ) -> Option<crate::clients::MarketView> {
        let market_client = MarketClient::new(env, &Self::get_market_contract_or_panic(env));
        if !market_client.market_exists(condition_id) {
            return None;
        }

        Some(market_client.get_market(condition_id))
    }

    fn get_collateral_token_or_panic(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&ExchangeDataKey::CollateralToken)
            .expect("Exchange: Collateral token not initialized")
    }

    fn get_fee_recipient_or_panic(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&ExchangeDataKey::FeeRecipient)
            .expect("Exchange: Fee recipient not initialized")
    }

    fn get_ctf_contract_or_panic(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&ExchangeDataKey::CtfContract)
            .expect("Exchange: CTF contract not initialized")
    }

    fn get_market_contract_or_panic(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&ExchangeDataKey::MarketContract)
            .expect("Exchange: Market contract not initialized")
    }

    fn get_liquidity_manager_or_none(env: &Env) -> Option<Address> {
        env.storage()
            .instance()
            .get(&ExchangeDataKey::LiquidityManager)
    }

    fn require_liquidity_manager(env: &Env) -> Address {
        let liquidity_manager: Address = Self::get_liquidity_manager_or_none(env)
            .expect("Exchange: Liquidity manager not initialized");
        liquidity_manager.require_auth();
        liquidity_manager
    }

    fn get_price_bps(env: &Env, condition_id: &BytesN<32>, outcome_index: u32) -> u32 {
        env.storage()
            .instance()
            .get(&ExchangeDataKey::Price(condition_id.clone(), outcome_index))
            .unwrap_or(0)
    }

    fn set_price_bps(env: &Env, condition_id: &BytesN<32>, outcome_index: u32, price_bps: u32) {
        env.storage().instance().set(
            &ExchangeDataKey::Price(condition_id.clone(), outcome_index),
            &price_bps,
        );
    }

    fn quote_token_amount(usdc_amount: u128, price_bps: u32) -> u128 {
        if price_bps == 0 || price_bps >= 10_000 {
            panic!("Exchange: Invalid price");
        }
        let token_amount = usdc_amount
            .checked_mul(10_000u128)
            .expect("Exchange: Quote overflow")
            / (price_bps as u128);
        if token_amount == 0 {
            panic!("Exchange: Trade too small for price precision");
        }
        token_amount
    }

    fn quote_usdc_amount(token_amount: u128, price_bps: u32) -> u128 {
        if price_bps == 0 || price_bps >= 10_000 {
            panic!("Exchange: Invalid price");
        }
        let usdc_amount = token_amount
            .checked_mul(price_bps as u128)
            .expect("Exchange: Quote overflow")
            / 10_000u128;
        if usdc_amount == 0 {
            panic!("Exchange: Trade too small for price precision");
        }
        usdc_amount
    }

    fn outcome_position_id(env: &Env, condition_id: &BytesN<32>, outcome_index: u32) -> BytesN<32> {
        OrderExecution::position_id_for_outcome(
            env,
            &Self::get_ctf_contract_or_panic(env),
            &Self::get_collateral_token_or_panic(env),
            condition_id,
            outcome_index,
        )
    }

    fn available_liquidity(env: &Env, condition_id: &BytesN<32>, outcome_index: u32) -> u128 {
        let position_id = Self::outcome_position_id(env, condition_id, outcome_index);
        crate::clients::CtfClient::new(env, &Self::get_ctf_contract_or_panic(env))
            .get_position_balance(&env.current_contract_address(), &position_id)
    }

    fn collateral_balance(env: &Env) -> u128 {
        let balance = token::Client::new(env, &Self::get_collateral_token_or_panic(env))
            .balance(&env.current_contract_address());
        if balance < 0 {
            panic!("Exchange: Negative collateral balance");
        }
        balance as u128
    }

    fn require_order_maker_auth(env: &Env, order: &Order) {
        order.maker.require_auth_for_args(order.auth_args(env));
    }

    fn validate_order(env: &Env, order: &Order) {
        if order.maker_amount == 0 || order.taker_amount == 0 {
            panic!("Exchange: Invalid order size");
        }
        if order.fee_rate_bps > 10_000 {
            panic!("Exchange: Invalid fee rate");
        }
        if env.ledger().timestamp() >= order.expiration {
            panic!("Exchange: Order expired");
        }
        Self::assert_market_tradeable(env, &order.condition_id, order.outcome_index);
        if matches!(order.order_type, OrderType::Gtd) && order.expiration == 0 {
            panic!("Exchange: GTD order requires expiration");
        }
    }

    fn assert_market_tradeable(
        env: &Env,
        condition_id: &soroban_sdk::BytesN<32>,
        outcome_index: u32,
    ) {
        let market = Self::get_market_if_exists(env, condition_id)
            .expect("Exchange: Market does not exist");
        if market.status != MarketStatus::Open {
            panic!("Exchange: Market is not open");
        }
        if env.ledger().timestamp() >= market.end_time {
            panic!("Exchange: Trading closed");
        }
        if outcome_index >= market.outcome_count {
            panic!("Exchange: Invalid outcome index");
        }
    }

    fn assert_order_available(env: &Env, order: &Order) -> u128 {
        let cancelled = env
            .storage()
            .instance()
            .get(&ExchangeDataKey::Cancelled(
                order.maker.clone(),
                order.nonce,
            ))
            .unwrap_or(false);
        if cancelled {
            panic!("Exchange: Order cancelled");
        }

        env.storage()
            .instance()
            .get(&ExchangeDataKey::FilledAmount(
                order.maker.clone(),
                order.nonce,
            ))
            .unwrap_or(0)
    }

    fn enforce_order_type(order: &Order, fill_amount: u128) {
        match order.order_type {
            OrderType::Fok => {
                if fill_amount != order.maker_amount {
                    panic!("Exchange: FOK order must fill completely");
                }
            }
            OrderType::Gtc | OrderType::Gtd | OrderType::Fak => {}
        }
    }

    fn order_status(env: &Env, order: &Order) -> OrderStatus {
        let cancelled = env
            .storage()
            .instance()
            .get(&ExchangeDataKey::Cancelled(
                order.maker.clone(),
                order.nonce,
            ))
            .unwrap_or(false);
        if cancelled {
            return OrderStatus::Cancelled;
        }
        if env.ledger().timestamp() >= order.expiration {
            return OrderStatus::Expired;
        }
        let filled = env
            .storage()
            .instance()
            .get(&ExchangeDataKey::FilledAmount(
                order.maker.clone(),
                order.nonce,
            ))
            .unwrap_or(0u128);
        if filled >= order.maker_amount {
            return OrderStatus::Filled;
        }
        OrderStatus::Fillable
    }

    fn validate_limit_match(taker_order: &Order, maker_order: &Order) {
        if taker_order.condition_id != maker_order.condition_id {
            panic!("Exchange: Condition mismatch");
        }
        if taker_order.outcome_index != maker_order.outcome_index {
            panic!("Exchange: Outcome mismatch");
        }
        if taker_order.side == maker_order.side {
            panic!("Exchange: Orders must be on opposite sides");
        }
        if maker_order.taker != taker_order.maker {
            panic!("Exchange: Maker order taker mismatch");
        }

        match taker_order.side {
            Side::Buy => {
                let taker_bid = taker_order
                    .maker_amount
                    .checked_mul(maker_order.maker_amount)
                    .expect("Exchange: Price overflow");
                let maker_ask = taker_order
                    .taker_amount
                    .checked_mul(maker_order.taker_amount)
                    .expect("Exchange: Price overflow");
                if taker_bid < maker_ask {
                    panic!("Exchange: Prices do not cross");
                }
            }
            Side::Sell => {
                let maker_bid = maker_order
                    .maker_amount
                    .checked_mul(taker_order.maker_amount)
                    .expect("Exchange: Price overflow");
                let taker_ask = maker_order
                    .taker_amount
                    .checked_mul(taker_order.taker_amount)
                    .expect("Exchange: Price overflow");
                if maker_bid < taker_ask {
                    panic!("Exchange: Prices do not cross");
                }
            }
        }
    }

    fn validate_complementary_match(env: &Env, left_order: &Order, right_order: &Order) {
        if left_order.condition_id != right_order.condition_id {
            panic!("Exchange: Condition mismatch");
        }
        if left_order.outcome_index == right_order.outcome_index {
            panic!("Exchange: Complementary outcomes required");
        }
        if left_order.side != right_order.side {
            panic!("Exchange: Complementary orders must be on same side");
        }

        let market = MarketClient::new(env, &Self::get_market_contract_or_panic(env))
            .get_market(&left_order.condition_id);
        if market.outcome_count != 2 {
            panic!("Exchange: Complementary matching only supports binary markets");
        }

        Self::assert_market_tradeable(env, &left_order.condition_id, left_order.outcome_index);
        Self::assert_market_tradeable(env, &right_order.condition_id, right_order.outcome_index);
    }
}

#[contractimpl]
impl IExchange for ExchangeContract {
    fn init(
        env: Env,
        admin: Address,
        operator: Address,
        ctf_contract: Address,
        market_contract: Address,
        collateral_token: Address,
        fee_recipient: Address,
    ) {
        access::init(&env, &admin, &operator);
        env.storage()
            .instance()
            .set(&ExchangeDataKey::CtfContract, &ctf_contract);
        env.storage()
            .instance()
            .set(&ExchangeDataKey::MarketContract, &market_contract);
        env.storage()
            .instance()
            .set(&ExchangeDataKey::CollateralToken, &collateral_token);
        env.storage()
            .instance()
            .set(&ExchangeDataKey::FeeRecipient, &fee_recipient);
    }

    fn transfer_admin(env: Env, new_admin: Address) {
        access::transfer_admin(&env, &new_admin);
    }

    fn set_operator(env: Env, operator: Address) {
        access::set_operator_admin(&env, &operator);
    }

    fn get_operator(env: Env) -> Address {
        access::get_operator(&env)
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

    fn set_collateral_token(env: Env, collateral_token: Address) {
        access::require_admin(&env);
        env.storage()
            .instance()
            .set(&ExchangeDataKey::CollateralToken, &collateral_token);
    }

    fn get_collateral_token(env: Env) -> Address {
        Self::get_collateral_token_or_panic(&env)
    }

    fn set_fee_recipient(env: Env, fee_recipient: Address) {
        access::require_admin(&env);
        env.storage()
            .instance()
            .set(&ExchangeDataKey::FeeRecipient, &fee_recipient);
    }

    fn get_fee_recipient(env: Env) -> Address {
        Self::get_fee_recipient_or_panic(&env)
    }

    fn set_liquidity_manager(env: Env, liquidity_manager: Address) {
        access::require_admin(&env);
        env.storage()
            .instance()
            .set(&ExchangeDataKey::LiquidityManager, &liquidity_manager);
    }

    fn get_liquidity_manager(env: Env) -> Option<Address> {
        Self::get_liquidity_manager_or_none(&env)
    }

    fn set_price(env: Env, condition_id: BytesN<32>, outcome_index: u32, price_bps: u32) {
        access::require_admin(&env);
        Self::assert_market_tradeable(&env, &condition_id, outcome_index);
        if price_bps == 0 || price_bps >= 10_000 {
            panic!("Exchange: Invalid price");
        }
        Self::set_price_bps(&env, &condition_id, outcome_index, price_bps);
    }

    fn get_price(env: Env, condition_id: BytesN<32>, outcome_index: u32) -> u32 {
        Self::get_price_bps(&env, &condition_id, outcome_index)
    }

    fn deposit_inventory(
        env: Env,
        provider: Address,
        condition_id: BytesN<32>,
        outcome_index: u32,
        amount: u128,
    ) {
        provider.require_auth();
        access::assert_not_paused(&env);
        if amount == 0 {
            return;
        }
        Self::assert_market_tradeable(&env, &condition_id, outcome_index);

        let ctf_contract = Self::get_ctf_contract_or_panic(&env);
        let position_id = Self::outcome_position_id(&env, &condition_id, outcome_index);
        let exchange = env.current_contract_address();
        crate::clients::CtfClient::new(&env, &ctf_contract).transfer_position(
            &provider,
            &exchange,
            &position_id,
            &amount,
        );
    }

    fn deposit_inventory_lm(
        env: Env,
        provider: Address,
        condition_id: BytesN<32>,
        outcome_index: u32,
        amount: u128,
    ) {
        access::assert_not_paused(&env);
        let _ = Self::require_liquidity_manager(&env);
        if amount == 0 {
            return;
        }
        Self::assert_market_tradeable(&env, &condition_id, outcome_index);

        let ctf_contract = Self::get_ctf_contract_or_panic(&env);
        let position_id = Self::outcome_position_id(&env, &condition_id, outcome_index);
        let exchange = env.current_contract_address();
        OrderExecution::authorize_ctf_transfer_position_lm(
            &env,
            &ctf_contract,
            &provider,
            &exchange,
            &position_id,
            amount,
        );
        crate::clients::CtfClient::new(&env, &ctf_contract)
            .transfer_position_lm(&provider, &exchange, &position_id, &amount);
    }

    fn withdraw_inventory(
        env: Env,
        condition_id: BytesN<32>,
        outcome_index: u32,
        amount: u128,
        recipient: Address,
    ) {
        access::require_admin(&env);
        access::assert_not_paused(&env);
        if amount == 0 {
            return;
        }
        Self::assert_market_tradeable(&env, &condition_id, outcome_index);
        if Self::available_liquidity(&env, &condition_id, outcome_index) < amount {
            panic!("Exchange: Insufficient inventory");
        }

        let ctf_contract = Self::get_ctf_contract_or_panic(&env);
        let position_id = Self::outcome_position_id(&env, &condition_id, outcome_index);
        let exchange = env.current_contract_address();
        OrderExecution::authorize_ctf_transfer_position(
            &env,
            &ctf_contract,
            &exchange,
            &recipient,
            &position_id,
            amount,
        );
        crate::clients::CtfClient::new(&env, &ctf_contract).transfer_position(
            &exchange,
            &recipient,
            &position_id,
            &amount,
        );
    }

    fn deposit_collateral(env: Env, provider: Address, amount: u128) {
        provider.require_auth();
        access::assert_not_paused(&env);
        guards::assert_valid_trade_amount(&env, amount);
        let collateral_token = Self::get_collateral_token_or_panic(&env);
        let exchange: MuxedAddress = env.current_contract_address().into();
        token::Client::new(&env, &collateral_token).transfer(
            &provider,
            &exchange,
            &i128::try_from(amount).unwrap(),
        );
    }

    fn deposit_collateral_lm(env: Env, provider: Address, amount: u128) {
        access::assert_not_paused(&env);
        let _ = Self::require_liquidity_manager(&env);
        guards::assert_valid_trade_amount(&env, amount);
        let collateral_token = Self::get_collateral_token_or_panic(&env);
        let exchange: MuxedAddress = env.current_contract_address().into();
        token::Client::new(&env, &collateral_token).transfer(
            &provider,
            &exchange,
            &i128::try_from(amount).unwrap(),
        );
    }

    fn withdraw_collateral(env: Env, amount: u128, recipient: Address) {
        access::require_admin(&env);
        access::assert_not_paused(&env);
        guards::assert_valid_trade_amount(&env, amount);
        if Self::collateral_balance(&env) < amount {
            panic!("Exchange: Insufficient collateral");
        }
        let collateral_token = Self::get_collateral_token_or_panic(&env);
        OrderExecution::authorize_token_transfer(&env, &collateral_token, &recipient, amount);
        let muxed_recipient: MuxedAddress = recipient.into();
        token::Client::new(&env, &collateral_token).transfer(
            &env.current_contract_address(),
            &muxed_recipient,
            &i128::try_from(amount).unwrap(),
        );
    }

    fn buy_outcome(
        env: Env,
        buyer: Address,
        condition_id: BytesN<32>,
        outcome_index: u32,
        usdc_amount: u128,
    ) -> u128 {
        buyer.require_auth();
        access::assert_not_paused(&env);
        guards::assert_valid_trade_amount(&env, usdc_amount);
        Self::assert_market_tradeable(&env, &condition_id, outcome_index);

        let price_bps = Self::get_price_bps(&env, &condition_id, outcome_index);
        let token_amount = Self::quote_token_amount(usdc_amount, price_bps);
        if Self::available_liquidity(&env, &condition_id, outcome_index) < token_amount {
            panic!("Exchange: Insufficient liquidity");
        }

        let collateral_token = Self::get_collateral_token_or_panic(&env);
        let ctf_contract = Self::get_ctf_contract_or_panic(&env);
        let exchange = env.current_contract_address();
        let position_id = Self::outcome_position_id(&env, &condition_id, outcome_index);

        let exchange_muxed: MuxedAddress = exchange.clone().into();
        token::Client::new(&env, &collateral_token).transfer(
            &buyer,
            &exchange_muxed,
            &i128::try_from(usdc_amount).unwrap(),
        );

        crate::clients::CtfClient::new(&env, &ctf_contract).transfer_position(
            &exchange,
            &buyer,
            &position_id,
            &token_amount,
        );

        if let Some(liquidity_manager) = Self::get_liquidity_manager_or_none(&env) {
            LiquidityManagerClient::new(&env, &liquidity_manager).record_trade(
                &condition_id,
                &outcome_index,
                &token_amount,
                &usdc_amount,
                &true,
            );
        }

        token_amount
    }

    fn sell_outcome(
        env: Env,
        seller: Address,
        condition_id: BytesN<32>,
        outcome_index: u32,
        token_amount: u128,
    ) -> u128 {
        seller.require_auth();
        access::assert_not_paused(&env);
        if token_amount == 0 {
            return 0;
        }
        Self::assert_market_tradeable(&env, &condition_id, outcome_index);

        let price_bps = Self::get_price_bps(&env, &condition_id, outcome_index);
        let usdc_amount = Self::quote_usdc_amount(token_amount, price_bps);
        guards::assert_valid_trade_amount(&env, usdc_amount);
        if Self::collateral_balance(&env) < usdc_amount {
            panic!("Exchange: Insufficient collateral");
        }

        let ctf_contract = Self::get_ctf_contract_or_panic(&env);
        let collateral_token = Self::get_collateral_token_or_panic(&env);
        let exchange = env.current_contract_address();
        let position_id = Self::outcome_position_id(&env, &condition_id, outcome_index);

        crate::clients::CtfClient::new(&env, &ctf_contract).transfer_position(
            &seller,
            &exchange,
            &position_id,
            &token_amount,
        );

        OrderExecution::authorize_token_transfer(&env, &collateral_token, &seller, usdc_amount);
        let muxed_seller: MuxedAddress = seller.into();
        token::Client::new(&env, &collateral_token).transfer(
            &exchange,
            &muxed_seller,
            &i128::try_from(usdc_amount).unwrap(),
        );

        if let Some(liquidity_manager) = Self::get_liquidity_manager_or_none(&env) {
            LiquidityManagerClient::new(&env, &liquidity_manager).record_trade(
                &condition_id,
                &outcome_index,
                &token_amount,
                &usdc_amount,
                &false,
            );
        }

        usdc_amount
    }

    fn get_available_liquidity(env: Env, condition_id: BytesN<32>, outcome_index: u32) -> u128 {
        let Some(market) = Self::get_market_if_exists(&env, &condition_id) else {
            return 0;
        };
        if market.status != MarketStatus::Open {
            return 0;
        }
        if env.ledger().timestamp() >= market.end_time {
            return 0;
        }
        if outcome_index >= market.outcome_count {
            return 0;
        }
        Self::available_liquidity(&env, &condition_id, outcome_index)
    }

    fn get_collateral_balance(env: Env) -> u128 {
        Self::collateral_balance(&env)
    }

    fn release_inventory(
        env: Env,
        condition_id: BytesN<32>,
        outcome_index: u32,
        amount: u128,
        recipient: Address,
    ) {
        let _ = Self::require_liquidity_manager(&env);
        access::assert_not_paused(&env);
        if amount == 0 {
            return;
        }
        if Self::available_liquidity(&env, &condition_id, outcome_index) < amount {
            panic!("Exchange: Insufficient inventory");
        }

        let ctf_contract = Self::get_ctf_contract_or_panic(&env);
        let position_id = Self::outcome_position_id(&env, &condition_id, outcome_index);
        let exchange = env.current_contract_address();
        OrderExecution::authorize_ctf_transfer_position(
            &env,
            &ctf_contract,
            &exchange,
            &recipient,
            &position_id,
            amount,
        );
        crate::clients::CtfClient::new(&env, &ctf_contract).transfer_position(
            &exchange,
            &recipient,
            &position_id,
            &amount,
        );
    }

    fn release_pool_collateral(env: Env, amount: u128, recipient: Address) {
        let _ = Self::require_liquidity_manager(&env);
        access::assert_not_paused(&env);
        guards::assert_valid_trade_amount(&env, amount);
        if Self::collateral_balance(&env) < amount {
            panic!("Exchange: Insufficient collateral");
        }

        let collateral_token = Self::get_collateral_token_or_panic(&env);
        OrderExecution::authorize_token_transfer(&env, &collateral_token, &recipient, amount);
        let muxed_recipient: MuxedAddress = recipient.into();
        token::Client::new(&env, &collateral_token).transfer(
            &env.current_contract_address(),
            &muxed_recipient,
            &i128::try_from(amount).unwrap(),
        );
    }

    fn set_min_trade_amount(env: Env, amount: u128) {
        guards::set_min_trade_amount(&env, amount);
    }

    fn set_max_trade_amount(env: Env, amount: u128) {
        guards::set_max_trade_amount(&env, amount);
    }

    fn get_min_trade_amount(env: Env) -> u128 {
        guards::get_min_trade_amount(&env)
    }

    fn get_max_trade_amount(env: Env) -> u128 {
        guards::get_max_trade_amount(&env)
    }

    fn fill_order(env: Env, order: Order, _signature: Bytes, fill_amount: u128) {
        access::require_operator(&env);
        access::assert_not_paused(&env);
        if fill_amount == 0 {
            return;
        }
        order.taker.require_auth();
        guards::assert_valid_trade_amount(&env, fill_amount);

        Self::validate_order(&env, &order);
        Self::require_order_maker_auth(&env, &order);
        Self::enforce_order_type(&order, fill_amount);
        let filled = Self::assert_order_available(&env, &order);

        let new_filled = filled
            .checked_add(fill_amount)
            .expect("Exchange: Fill overflow");
        if new_filled > order.maker_amount {
            panic!("Exchange: Overfilled capacity");
        }

        let collateral_token = Self::get_collateral_token_or_panic(&env);
        let fee_recipient = Self::get_fee_recipient_or_panic(&env);
        let ctf_contract = Self::get_ctf_contract_or_panic(&env);
        OrderExecution::execute_trade(
            &env,
            &ctf_contract,
            &collateral_token,
            &fee_recipient,
            &order,
            filled,
            fill_amount,
        );

        env.storage().instance().set(
            &ExchangeDataKey::FilledAmount(order.maker.clone(), order.nonce),
            &new_filled,
        );
    }

    fn match_orders(
        env: Env,
        taker_order: Order,
        _taker_signature: Bytes,
        maker_orders: Vec<Order>,
        _maker_signatures: Vec<Bytes>,
        taker_fill_amount: u128,
        maker_fill_amounts: Vec<u128>,
    ) {
        access::require_operator(&env);
        access::assert_not_paused(&env);
        if taker_fill_amount == 0 || maker_orders.is_empty() {
            return;
        }
        guards::assert_valid_trade_amount(&env, taker_fill_amount);
        if maker_orders.len() != maker_fill_amounts.len() {
            panic!("Exchange: Fill vector mismatch");
        }

        Self::validate_order(&env, &taker_order);
        Self::require_order_maker_auth(&env, &taker_order);
        Self::enforce_order_type(&taker_order, taker_fill_amount);
        let taker_filled = Self::assert_order_available(&env, &taker_order);

        let taker_new_filled = taker_filled
            .checked_add(taker_fill_amount)
            .expect("Exchange: Fill overflow");
        if taker_new_filled > taker_order.maker_amount {
            panic!("Exchange: Overfilled taker order");
        }

        let collateral_token = Self::get_collateral_token_or_panic(&env);
        let fee_recipient = Self::get_fee_recipient_or_panic(&env);
        let ctf_contract = Self::get_ctf_contract_or_panic(&env);
        let mut expected_taker_fill = 0u128;

        for idx in 0..maker_orders.len() {
            let maker_order = maker_orders
                .get(idx)
                .expect("Exchange: Missing maker order");
            let maker_fill = maker_fill_amounts
                .get(idx)
                .expect("Exchange: Missing maker fill");
            if maker_fill == 0 {
                continue;
            }
            guards::assert_valid_trade_amount(&env, maker_fill);
            Self::validate_order(&env, &maker_order);
            Self::require_order_maker_auth(&env, &maker_order);
            Self::validate_limit_match(&taker_order, &maker_order);
            Self::enforce_order_type(&maker_order, maker_fill);

            let maker_filled = Self::assert_order_available(&env, &maker_order);

            let maker_new_filled = maker_filled
                .checked_add(maker_fill)
                .expect("Exchange: Fill overflow");
            if maker_new_filled > maker_order.maker_amount {
                panic!("Exchange: Overfilled maker order");
            }

            let maker_taker_fill =
                OrderExecution::counter_amount(&maker_order, maker_filled, maker_fill);
            expected_taker_fill = expected_taker_fill
                .checked_add(maker_taker_fill)
                .expect("Exchange: Aggregate fill overflow");

            OrderExecution::execute_trade(
                &env,
                &ctf_contract,
                &collateral_token,
                &fee_recipient,
                &maker_order,
                maker_filled,
                maker_fill,
            );

            env.storage().instance().set(
                &ExchangeDataKey::FilledAmount(maker_order.maker.clone(), maker_order.nonce),
                &maker_new_filled,
            );
        }

        if expected_taker_fill != taker_fill_amount {
            panic!("Exchange: Taker fill amount mismatch");
        }

        env.storage().instance().set(
            &ExchangeDataKey::FilledAmount(taker_order.maker.clone(), taker_order.nonce),
            &taker_new_filled,
        );
    }

    fn match_complementary_orders(
        env: Env,
        left_order: Order,
        _left_signature: Bytes,
        right_order: Order,
        _right_signature: Bytes,
        left_fill_amount: u128,
        right_fill_amount: u128,
    ) {
        access::require_operator(&env);
        access::assert_not_paused(&env);
        if left_fill_amount == 0 || right_fill_amount == 0 {
            return;
        }

        guards::assert_valid_trade_amount(&env, left_fill_amount);
        guards::assert_valid_trade_amount(&env, right_fill_amount);
        Self::validate_order(&env, &left_order);
        Self::validate_order(&env, &right_order);
        Self::require_order_maker_auth(&env, &left_order);
        Self::require_order_maker_auth(&env, &right_order);
        Self::validate_complementary_match(&env, &left_order, &right_order);

        let left_filled = Self::assert_order_available(&env, &left_order);
        let right_filled = Self::assert_order_available(&env, &right_order);
        Self::enforce_order_type(&left_order, left_fill_amount);
        Self::enforce_order_type(&right_order, right_fill_amount);

        let left_new_filled = left_filled
            .checked_add(left_fill_amount)
            .expect("Exchange: Fill overflow");
        let right_new_filled = right_filled
            .checked_add(right_fill_amount)
            .expect("Exchange: Fill overflow");
        if left_new_filled > left_order.maker_amount {
            panic!("Exchange: Overfilled left order");
        }
        if right_new_filled > right_order.maker_amount {
            panic!("Exchange: Overfilled right order");
        }

        let collateral_token = Self::get_collateral_token_or_panic(&env);
        let fee_recipient = Self::get_fee_recipient_or_panic(&env);
        let ctf_contract = Self::get_ctf_contract_or_panic(&env);
        match left_order.side {
            Side::Buy => OrderExecution::execute_complementary_buy(
                &env,
                &ctf_contract,
                &collateral_token,
                &fee_recipient,
                &left_order,
                left_filled,
                left_fill_amount,
                &right_order,
                right_filled,
                right_fill_amount,
            ),
            Side::Sell => OrderExecution::execute_complementary_sell(
                &env,
                &ctf_contract,
                &collateral_token,
                &fee_recipient,
                &left_order,
                left_filled,
                left_fill_amount,
                &right_order,
                right_filled,
                right_fill_amount,
            ),
        }

        env.storage().instance().set(
            &ExchangeDataKey::FilledAmount(left_order.maker.clone(), left_order.nonce),
            &left_new_filled,
        );
        env.storage().instance().set(
            &ExchangeDataKey::FilledAmount(right_order.maker.clone(), right_order.nonce),
            &right_new_filled,
        );
    }

    fn cancel_order_by_nonce(env: Env, maker: Address, nonce: u64) {
        maker.require_auth();
        env.storage()
            .instance()
            .set(&ExchangeDataKey::Cancelled(maker, nonce), &true);
    }

    fn get_filled_amount(env: Env, maker: Address, nonce: u64) -> u128 {
        env.storage()
            .instance()
            .get(&ExchangeDataKey::FilledAmount(maker, nonce))
            .unwrap_or(0)
    }

    fn is_order_cancelled(env: Env, maker: Address, nonce: u64) -> bool {
        env.storage()
            .instance()
            .get(&ExchangeDataKey::Cancelled(maker, nonce))
            .unwrap_or(false)
    }

    fn get_order_status(env: Env, order: Order) -> OrderStatus {
        Self::order_status(&env, &order)
    }
}
