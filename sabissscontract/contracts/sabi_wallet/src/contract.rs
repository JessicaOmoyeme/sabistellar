use soroban_sdk::{auth::Context, contract, contractimpl, BytesN, Env, Vec};

use crate::{access, interface::IWallet};

#[contract]
pub struct WalletContract;

#[contractimpl]
impl IWallet for WalletContract {
    fn init(env: Env, admin: soroban_sdk::Address, owner: BytesN<32>) {
        access::init(&env, &admin, &owner);
    }

    fn transfer_admin(env: Env, new_admin: soroban_sdk::Address) {
        access::transfer_admin(&env, &new_admin);
    }

    fn get_admin(env: Env) -> soroban_sdk::Address {
        access::get_admin(&env)
    }

    fn get_owner(env: Env) -> BytesN<32> {
        access::get_owner(&env)
    }

    fn set_owner(env: Env, new_owner: BytesN<32>) {
        access::require_admin(&env);
        access::set_owner(&env, &new_owner);
    }

    #[allow(non_snake_case)]
    fn __check_auth(
        env: Env,
        signature_payload: BytesN<32>,
        signature: BytesN<64>,
        _auth_context: Vec<Context>,
    ) {
        let owner = access::get_owner(&env);
        env.crypto()
            .ed25519_verify(&owner, &signature_payload.into(), &signature);
    }
}
