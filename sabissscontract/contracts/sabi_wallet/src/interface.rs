use soroban_sdk::{auth::Context, contractclient, Address, BytesN, Env, Vec};

#[contractclient(name = "WalletClient")]
pub trait IWallet {
    fn init(env: Env, admin: Address, owner: BytesN<32>);
    fn transfer_admin(env: Env, new_admin: Address);
    fn get_admin(env: Env) -> Address;
    fn get_owner(env: Env) -> BytesN<32>;
    fn set_owner(env: Env, new_owner: BytesN<32>);
    fn __check_auth(
        env: Env,
        signature_payload: BytesN<32>,
        signature: BytesN<64>,
        auth_context: Vec<Context>,
    );
}
