#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, String};

#[contracttype]
pub enum DataKey {
    Allowance(Address, Address), // (from, spender)
    Balance(Address),
    Admin,
}

#[contract]
pub struct MockUsdc;

#[contractimpl]
impl MockUsdc {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("USDC: already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    // Infinite supply un-restricted minting for the Hackathon/Testing Platform
    pub fn mint(env: Env, to: Address, amount: i128) {
        if amount < 0 {
            panic!("USDC: negative amount");
        }
        let balance: i128 = env
            .storage()
            .instance()
            .get(&DataKey::Balance(to.clone()))
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::Balance(to), &(balance + amount));
    }

    // ----------------------------------------------------------------------------
    // STANDARD token interface mappings
    // ----------------------------------------------------------------------------

    pub fn allowance(env: Env, from: Address, spender: Address) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::Allowance(from, spender))
            .unwrap_or(0)
    }

    pub fn approve(
        env: Env,
        from: Address,
        spender: Address,
        amount: i128,
        _expiration_ledger: u32,
    ) {
        from.require_auth();
        env.storage()
            .instance()
            .set(&DataKey::Allowance(from, spender), &amount);
    }

    pub fn balance(env: Env, id: Address) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::Balance(id))
            .unwrap_or(0)
    }

    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();
        if amount < 0 {
            panic!("USDC: negative transfer amount");
        }
        if from == to || amount == 0 {
            return;
        }
        let from_bal: i128 = Self::balance(env.clone(), from.clone());
        if from_bal < amount {
            panic!("USDC: insufficient balance");
        }
        env.storage()
            .instance()
            .set(&DataKey::Balance(from), &(from_bal - amount));

        let to_bal: i128 = Self::balance(env.clone(), to.clone());
        env.storage()
            .instance()
            .set(&DataKey::Balance(to), &(to_bal + amount));
    }

    pub fn transfer_from(env: Env, spender: Address, from: Address, to: Address, amount: i128) {
        if amount < 0 {
            panic!("USDC: negative transfer amount");
        }
        let allowance = Self::allowance(env.clone(), from.clone(), spender.clone());
        if allowance < amount {
            panic!("USDC: insufficient allowance");
        }
        env.storage().instance().set(
            &DataKey::Allowance(from.clone(), spender),
            &(allowance - amount),
        );
        if from == to || amount == 0 {
            return;
        }

        let from_bal = Self::balance(env.clone(), from.clone());
        if from_bal < amount {
            panic!("USDC: insufficient balance");
        }
        env.storage()
            .instance()
            .set(&DataKey::Balance(from), &(from_bal - amount));

        let to_bal = Self::balance(env.clone(), to.clone());
        env.storage()
            .instance()
            .set(&DataKey::Balance(to), &(to_bal + amount));
    }

    pub fn burn(env: Env, from: Address, amount: i128) {
        from.require_auth();
        let from_bal = Self::balance(env.clone(), from.clone());
        if from_bal < amount {
            panic!("USDC: insufficient balance");
        }
        env.storage()
            .instance()
            .set(&DataKey::Balance(from), &(from_bal - amount));
    }

    pub fn decimals(_env: Env) -> u32 {
        6 // Standard for USDC on Stellar
    }

    pub fn name(env: Env) -> String {
        String::from_str(&env, "Mock USDC Token")
    }

    pub fn symbol(env: Env) -> String {
        String::from_str(&env, "USDC")
    }
}
