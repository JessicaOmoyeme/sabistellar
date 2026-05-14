use soroban_sdk::{Address, BytesN, Env, contractclient};

#[contractclient(name = "WalletFactoryClient")]
pub trait IWalletFactory {
    fn init(env: Env, admin: Address, wallet_wasm_hash: BytesN<32>);
    fn transfer_admin(env: Env, new_admin: Address);
    fn get_admin(env: Env) -> Address;
    fn get_wallet_wasm_hash(env: Env) -> BytesN<32>;
    fn set_wallet_wasm_hash(env: Env, wallet_wasm_hash: BytesN<32>);
    fn create_wallet(env: Env, owner: BytesN<32>) -> Address;
}
