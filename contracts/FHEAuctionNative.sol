// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import "fhevm/lib/TFHE.sol";
import {FHEAuction} from "./FHEAuction.sol";
import {FHEAuctionBase} from "./FHEAuctionBase.sol";

import {console} from "hardhat/console.sol";

abstract contract FHEAuctionNative is FHEAuction {
    /**
     * @dev See {FHEAuctionBase-constructor}
     */
    constructor(uint256 minimumPaymentBalance, uint256 paymentPenalty)
        FHEAuctionBase(minimumPaymentBalance, paymentPenalty)
    {}

    /**
     * @notice Deposits a specified amount of ETH and places a bid with encrypted values in a single
     * transaction.
     *
     * @notice See {FHEAuctionERC20-bidWithDeposit}
     */
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

    /**
     * @notice Deposits a specified amount of ETH to the caller's account into the auction contract.
     * @notice Requirements:
     * - The auction should be open (meaning accepting new bids)
     */
    function deposit() external payable whenIsOpen nonReentrant {
        _updatePaymentTokenAfterDeposit(msg.sender, msg.value);
    }

    /**
     * @dev Transfers `amount` of ETH from the auction contract account to account `to`.
     * @dev See {FHEAuction-_transferPaymentTokenTo}.
     */
    function _transferPaymentTokenTo(address to, uint256 amount) internal override {
        // Native withdraw
        (bool success,) = to.call{value: amount}("");
        if (!success) {
            revert WithdrawFailed();
        }
    }

    /**
     * @dev Returns the balance of ETH owned by a specified address (`account`).
     * @dev See {FHEAuction-_paymentTokenBalanceOf}.
     */
    function _paymentTokenBalanceOf(address account) internal view override returns (uint256) {
        return account.balance;
    }
}
