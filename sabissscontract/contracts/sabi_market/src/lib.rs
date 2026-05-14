#![no_std]

mod access;
mod clients;
mod contract;
mod interface;
mod storage;

pub use crate::contract::MarketContract;
pub use crate::interface::IMarket;
pub use crate::storage::{Market, MarketEvent, MarketStatus, MarketType, ResolutionProposal};
