#![no_std]

mod access;
mod contract;
mod interface;
mod storage;

pub use crate::contract::CtfContract;
pub use crate::interface::ICtf;
