// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {TFHE, euint16, euint256} from  "fhevm/lib/TFHE.sol";
import {FHEAuctionERC20} from "../FHEAuctionERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {console} from "hardhat/console.sol";

contract FHEAuctionERC20Mock is FHEAuctionERC20 {
    constructor(
        uint256 minimumPaymentBalance_,
        uint256 paymentPenalty_,
        IERC20 paymentToken_
    ) FHEAuctionERC20(minimumPaymentBalance_, paymentPenalty_, paymentToken_) {
    }
}
