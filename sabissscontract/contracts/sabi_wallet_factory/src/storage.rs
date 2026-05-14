use soroban_sdk::{contracttype, Address, BytesN};

#[derive(Clone)]
#[contracttype]
pub enum FactoryDataKey {
    Admin,
    WalletWasmHash,
}

#[derive(Clone, Debug)]
#[contracttype]
pub struct WalletFactoryConfig {
    pub admin: Address,
    pub wallet_wasm_hash: BytesN<32>,
}
