use soroban_sdk::{Address, BytesN, Env, IntoVal, contract, contractimpl};

use crate::{
    interface::IWalletFactory,
    storage::FactoryDataKey,
};

#[contract]
pub struct WalletFactoryContract;

#[contractimpl]
impl IWalletFactory for WalletFactoryContract {
    fn init(env: Env, admin: Address, wallet_wasm_hash: BytesN<32>) {
        if env.storage().instance().has(&FactoryDataKey::Admin) {
            panic!("WalletFactory: already initialized");
        }

        admin.require_auth();
        env.storage().instance().set(&FactoryDataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&FactoryDataKey::WalletWasmHash, &wallet_wasm_hash);
    }

    fn transfer_admin(env: Env, new_admin: Address) {
        require_admin(&env);
        env.storage().instance().set(&FactoryDataKey::Admin, &new_admin);
    }

    fn get_admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&FactoryDataKey::Admin)
            .expect("WalletFactory: admin not initialized")
    }

    fn get_wallet_wasm_hash(env: Env) -> BytesN<32> {
        env.storage()
            .instance()
            .get(&FactoryDataKey::WalletWasmHash)
            .expect("WalletFactory: wallet wasm hash not initialized")
    }

    fn set_wallet_wasm_hash(env: Env, wallet_wasm_hash: BytesN<32>) {
        require_admin(&env);
        env.storage()
            .instance()
            .set(&FactoryDataKey::WalletWasmHash, &wallet_wasm_hash);
    }

    fn create_wallet(env: Env, owner: BytesN<32>) -> Address {
        let wallet_wasm_hash = Self::get_wallet_wasm_hash(env.clone());
        let admin = Self::get_admin(env.clone());
        let deployer = env.deployer();
        let salt = env.crypto().sha256(&owner.clone().into());
        let wallet_address = deployer
            .with_current_contract(salt)
            .deploy_v2(wallet_wasm_hash, ());

        env.invoke_contract::<()>(
            &wallet_address,
            &soroban_sdk::Symbol::new(&env, "init"),
            (admin, owner).into_val(&env),
        );

        wallet_address
    }
}

fn require_admin(env: &Env) {
    let admin: Address = env
        .storage()
        .instance()
        .get(&FactoryDataKey::Admin)
        .expect("WalletFactory: admin not initialized");
    admin.require_auth();
}
