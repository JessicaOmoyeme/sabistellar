use soroban_sdk::{contracttype, Address, BytesN, Env, IntoVal, Val, Vec};

#[derive(Clone, PartialEq, Debug)]
#[contracttype]
pub enum Side {
    Buy,
    Sell,
}

impl Side {
    pub fn as_u32(&self) -> u32 {
        match self {
            Self::Buy => 0,
            Self::Sell => 1,
        }
    }
}

#[derive(Clone, PartialEq, Debug)]
#[contracttype]
pub enum OrderType {
    Gtc,
    Gtd,
    Fok,
    Fak,
}

impl OrderType {
    pub fn as_u32(&self) -> u32 {
        match self {
            Self::Gtc => 0,
            Self::Gtd => 1,
            Self::Fok => 2,
            Self::Fak => 3,
        }
    }
}

#[derive(Clone, Debug)]
#[contracttype]
pub struct Order {
    pub salt: BytesN<32>,
    pub maker: Address,
    pub taker: Address,
    pub condition_id: BytesN<32>,
    pub outcome_index: u32,
    pub maker_amount: u128,
    pub taker_amount: u128,
    pub expiration: u64,
    pub nonce: u64,
    pub fee_rate_bps: u32,
    pub order_type: OrderType,
    pub side: Side,
}

impl Order {
    pub fn outcome_index_set(&self) -> u32 {
        if self.outcome_index >= 32 {
            panic!("Exchange: Invalid outcome index");
        }
        1u32 << self.outcome_index
    }

    pub fn auth_args(&self, env: &Env) -> Vec<Val> {
        (
            self.salt.clone(),
            self.taker.clone(),
            self.condition_id.clone(),
            self.outcome_index,
            self.maker_amount,
            self.taker_amount,
            self.expiration,
            self.nonce,
            self.fee_rate_bps,
            self.order_type.as_u32(),
            self.side.as_u32(),
        )
            .into_val(env)
    }
}

#[derive(Clone, PartialEq, Debug)]
#[contracttype]
pub enum OrderStatus {
    Fillable,
    Filled,
    Cancelled,
    Expired,
}

#[derive(Clone)]
#[contracttype]
pub enum ExchangeDataKey {
    CtfContract,
    MarketContract,
    CollateralToken,
    FeeRecipient,
    LiquidityManager,
    Price(BytesN<32>, u32),
    FilledAmount(Address, u64),
    Cancelled(Address, u64),
}
