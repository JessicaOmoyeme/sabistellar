use soroban_sdk::{contracttype, Address, Env};

#[derive(Clone)]
#[contracttype]
pub enum AccessKey {
    Admin,
    IsPaused,
    ExchangeContract,
    LiquidityManagerContract,
    MarketContract,
}

pub fn init_admin(env: &Env, admin: &Address) {
    if env.storage().instance().has(&AccessKey::Admin) {
        panic!("Already initialized");
    }
    env.storage().instance().set(&AccessKey::Admin, admin);
    env.storage().instance().set(&AccessKey::IsPaused, &false);
}

pub fn require_admin(env: &Env) {
    let admin: Address = env
        .storage()
        .instance()
        .get(&AccessKey::Admin)
        .expect("Admin not initialized");
    admin.require_auth();
}

pub fn transfer_admin(env: &Env, new_admin: &Address) {
    require_admin(env);
    env.storage().instance().set(&AccessKey::Admin, new_admin);
}

pub fn pause(env: &Env) {
    require_admin(env);
    env.storage().instance().set(&AccessKey::IsPaused, &true);
}

pub fn unpause(env: &Env) {
    require_admin(env);
    env.storage().instance().set(&AccessKey::IsPaused, &false);
}

pub fn is_paused(env: &Env) -> bool {
    env.storage()
        .instance()
        .get(&AccessKey::IsPaused)
        .unwrap_or(false)
}

pub fn assert_not_paused(env: &Env) {
    if is_paused(env) {
        panic!("Contract paused");
    }
}

pub fn set_exchange_contract(env: &Env, exchange_contract: &Address) {
    require_admin(env);
    env.storage()
        .instance()
        .set(&AccessKey::ExchangeContract, exchange_contract);
}

pub fn get_exchange_contract(env: &Env) -> Option<Address> {
    env.storage().instance().get(&AccessKey::ExchangeContract)
}

pub fn require_exchange_if_configured(env: &Env) {
    if let Some(exchange_contract) = get_exchange_contract(env) {
        exchange_contract.require_auth();
    }
}

pub fn require_exchange_or_liquidity_manager_if_configured(env: &Env) {
    if let Some(exchange_contract) = get_exchange_contract(env) {
        if env.current_contract_address() != exchange_contract {
            if let Some(liquidity_manager_contract) = get_liquidity_manager_contract(env) {
                liquidity_manager_contract.require_auth();
                return;
            }
        }
        exchange_contract.require_auth();
        return;
    }

    require_liquidity_manager_if_configured(env);
}

pub fn set_liquidity_manager_contract(env: &Env, liquidity_manager_contract: &Address) {
    require_admin(env);
    env.storage()
        .instance()
        .set(&AccessKey::LiquidityManagerContract, liquidity_manager_contract);
}

pub fn get_liquidity_manager_contract(env: &Env) -> Option<Address> {
    env.storage()
        .instance()
        .get(&AccessKey::LiquidityManagerContract)
}

pub fn require_liquidity_manager_if_configured(env: &Env) {
    if let Some(liquidity_manager_contract) = get_liquidity_manager_contract(env) {
        liquidity_manager_contract.require_auth();
    }
}

pub fn set_market_contract(env: &Env, market_contract: &Address) {
    require_admin(env);
    env.storage()
        .instance()
        .set(&AccessKey::MarketContract, market_contract);
}

pub fn get_market_contract(env: &Env) -> Option<Address> {
    env.storage().instance().get(&AccessKey::MarketContract)
}

pub fn require_market_if_configured(env: &Env) {
    if let Some(market_contract) = get_market_contract(env) {
        market_contract.require_auth();
    }
}
