use soroban_sdk::{Address, BytesN, Env};

use crate::storage::WalletDataKey;

pub fn init(env: &Env, admin: &Address, owner: &BytesN<32>) {
    if env.storage().instance().has(&WalletDataKey::Admin) {
        panic!("Wallet: already initialized");
    }

    env.storage().instance().set(&WalletDataKey::Admin, admin);
    env.storage().instance().set(&WalletDataKey::Owner, owner);
}

pub fn require_admin(env: &Env) {
    let admin: Address = env
        .storage()
        .instance()
        .get(&WalletDataKey::Admin)
        .expect("Wallet: admin not initialized");
    admin.require_auth();
}

pub fn get_admin(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&WalletDataKey::Admin)
        .expect("Wallet: admin not initialized")
}

pub fn get_owner(env: &Env) -> BytesN<32> {
    env.storage()
        .instance()
        .get(&WalletDataKey::Owner)
        .expect("Wallet: owner not initialized")
}

pub fn set_owner(env: &Env, owner: &BytesN<32>) {
    env.storage().instance().set(&WalletDataKey::Owner, owner);
}

pub fn transfer_admin(env: &Env, new_admin: &Address) {
    require_admin(env);
    env.storage()
        .instance()
        .set(&WalletDataKey::Admin, new_admin);
}
