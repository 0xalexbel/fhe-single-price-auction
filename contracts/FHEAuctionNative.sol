// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import "fhevm/lib/TFHE.sol";
import {FHEAuction} from "./FHEAuction.sol";

import {console} from "hardhat/console.sol";

contract FHEAuctionNative is FHEAuction {
    constructor(uint256 minimumPaymentBalance, uint256 paymentPenalty) FHEAuction(minimumPaymentBalance, paymentPenalty) {}

    function deposit() external payable whenIsOpen nonReentrant {
        _updatePaymentTokenAfterDeposit(msg.sender, msg.value);
    }

    function _transferPaymentTokenTo(address to, uint256 amount) internal override {
        // Native withdraw
        (bool success,) = to.call{value: amount}("");
        if (!success) {
            revert WithdrawFailed();
        }
    }

    function _paymentTokenBalanceOf(address account) internal override view returns(uint256) {
        return account.balance;
    }

    function bidWithDeposit(einput inPrice, einput inQuantity, bytes calldata inputProof)
        external
        payable
        whenIsOpen
        nonReentrant
    {
        address bidder = msg.sender;
        uint256 newBalance = balanceOf(bidder) + msg.value;
        _requireSufficientBalance(newBalance);
        _updatePaymentTokenAfterDeposit(bidder, msg.value);

        _bid(bidder, inPrice, inQuantity, inputProof);
    }
}
