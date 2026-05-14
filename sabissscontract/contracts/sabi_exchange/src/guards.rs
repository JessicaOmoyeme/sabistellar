use crate::access;
use soroban_sdk::{contracttype, Env};

#[derive(Clone)]
#[contracttype]
pub enum GuardDataKey {
    MinTradeAmount,
    MaxTradeAmount,
}

pub fn set_min_trade_amount(env: &Env, amount: u128) {
    access::require_admin(env);
    env.storage()
        .instance()
        .set(&GuardDataKey::MinTradeAmount, &amount);
}

pub fn set_max_trade_amount(env: &Env, amount: u128) {
    access::require_admin(env);
    env.storage()
        .instance()
        .set(&GuardDataKey::MaxTradeAmount, &amount);
}

pub fn get_min_trade_amount(env: &Env) -> u128 {
    env.storage()
        .instance()
        .get(&GuardDataKey::MinTradeAmount)
        .unwrap_or(500_000)
}

pub fn get_max_trade_amount(env: &Env) -> u128 {
    env.storage()
        .instance()
        .get(&GuardDataKey::MaxTradeAmount)
        .unwrap_or(1_000_000_000_000_000)
}

pub fn assert_valid_trade_amount(env: &Env, amount: u128) {
    if amount == 0 {
        panic!("TradingGuards: zero amount");
    }
    if amount < get_min_trade_amount(env) {
        panic!("TradingGuards: amount too small");
    }
    if amount > get_max_trade_amount(env) {
        panic!("TradingGuards: amount too large");
    }
}
