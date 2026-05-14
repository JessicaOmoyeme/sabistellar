use soroban_sdk::{contracttype, Address, Env};

#[derive(Clone)]
#[contracttype]
pub enum AccessKey {
    Admin,
    IsPaused,
}

pub fn init(env: &Env, admin: &Address) {
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
