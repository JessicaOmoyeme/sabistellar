use soroban_sdk::{contracttype, Address, BytesN};

#[derive(Clone)]
#[contracttype]
pub enum WalletDataKey {
    Admin,
    Owner,
}

#[derive(Clone, Debug)]
#[contracttype]
pub struct WalletConfig {
    pub admin: Address,
    pub owner: BytesN<32>,
}
