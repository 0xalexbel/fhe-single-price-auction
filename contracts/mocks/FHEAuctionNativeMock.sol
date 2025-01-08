// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {TFHE, euint16, euint256} from "fhevm/lib/TFHE.sol";
import {FHEAuctionNative} from "../FHEAuctionNative.sol";

import {console} from "hardhat/console.sol";

contract FHEAuctionNativeMock is FHEAuctionNative {
    constructor(uint256 minimumPaymentBalance, uint256 paymentPenalty)
        FHEAuctionNative(minimumPaymentBalance, paymentPenalty)
    {}
}
