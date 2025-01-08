// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import "fhevm/lib/TFHE.sol";
import "fhevm/gateway/GatewayCaller.sol";
import {FHEAuctionBase} from "./FHEAuctionBase.sol";
import {IFHEAuction} from "./IFHEAuction.sol";

import {console} from "hardhat/console.sol";

/**
 * @dev Base abstract contract for implementing a Single Price Auction using a non-encrypted payment token.
 *
 * This contract serves as the foundation for a Single Price Auction mechanism where bidders place bids
 * using non-encrypted payment tokens (e.g., Ether or ERC20 tokens).
 *
 * Derived contracts can further customize the logic for specific payment token operations.
 */
abstract contract FHEAuction is FHEAuctionBase, IFHEAuction {
    mapping(address account => uint256) private _balances;
    mapping(uint256 requestID => address bidder) private _requestIDToBidder;

    /**
     * @notice Returns the value of payment tokens deposited by `bidder`
     */
    function balanceOf(address bidder) public view returns (uint256) {
        return _balances[bidder];
    }

    /**
     * @dev See {FHEAuctionBase-_canClaim}.
     * @dev Additionnal conditions:
     * - The final uniform price must have been decrypted.
     */
    function _canClaim(address bidder) internal view virtual override(FHEAuctionBase) returns (bool) {
        if (clearUniformPrice() == 0) {
            // the auction uniform price is not yet decrypted
            return false;
        }
        return super._canClaim(bidder);
    }

    /**
     * @dev See {FHEAuctionBase-_claim}.
     */
    function _claim(address bidder, uint16, /*id*/ euint256 validatedPrice, euint256 wonQuantity)
        internal
        virtual
        override
    {
        uint256[] memory cts = new uint256[](2);
        cts[0] = Gateway.toUint256(validatedPrice);
        cts[1] = Gateway.toUint256(wonQuantity);
        uint256 requestID =
            Gateway.requestDecryption(cts, this.callbackDecryptWonQuantity.selector, 0, block.timestamp + 100, false);

        _requestIDToBidder[requestID] = bidder;
    }

    /**
     * @dev Callback function to process the results of a requested claim. This function can only be called by the
     * fhEVM Gateway.
     * It handles the transfer of payments as follows:
     * - Transfers the payment (including any penalty fees for invalid bids) to the auction beneficiary.
     * - Transfers any remaining payment token balance to the bidder.
     *
     * @param requestID The request ID from the fhEVM Gateway.
     * @param clearValidatedPrice The decrypted validated price of the auction provided by the Gateway. If this value is
     * zero, the bid is considered invalid and subject to a penalty fee.
     * @param clearWonQuantity The decrypted final quantity won by the bidder in the auction, provided by the Gateway.
     */
    function callbackDecryptWonQuantity(uint256 requestID, uint256 clearValidatedPrice, uint256 clearWonQuantity)
        external
        onlyGateway
    {
        address bidder = _requestIDToBidder[requestID];
        uint256 uniformPrice = clearUniformPrice();

        // Debug
        require(bidder != address(0), "Panic: bidder == 0");

        // Debug
        require(uniformPrice > 0, "Panic: uniformPrice == 0");

        if (clearValidatedPrice == 0) {
            // Debug
            require(clearWonQuantity == 0, "Panic: clearValidatedPrice == 0 && clearWonQuantity != 0");
        }

        _markClaimCompleted(bidder);

        if (clearWonQuantity > 0) {
            uint256 bidderDueAmount = uniformPrice * clearWonQuantity;

            // Debug
            require(bidderDueAmount > 0, "Panic: bidderDueAmount == 0");

            // Debug
            require(_balances[bidder] >= bidderDueAmount, "Panic: _balances[bidder] < bidderDueAmount");

            // Pay beneficiary
            _withdrawPaymentTo(bidder, beneficiary(), bidderDueAmount);
        } else {
            // if the bid was invalid, transfer a penalty fee.
            if (clearValidatedPrice == 0) {
                uint256 penalty = paymentPenalty();
                if (penalty > 0) {
                    // Pay penalty to beneficiary
                    _withdrawPaymentTo(bidder, beneficiary(), penalty);
                }
            }
        }

        uint256 remaining = _balances[bidder];
        if (remaining > 0) {
            // Give back remaining balance to bidder (minus penalty)
            _withdrawPayment(bidder, remaining);
        }

        // Debug
        require(_balances[bidder] == 0, "Panic: _balances[bidder] > 0");

        if (clearWonQuantity > 0) {
            // Transfer auction tokens to winner
            _transferAuctionTokenTo(bidder, clearWonQuantity);
        }
    }

    /**
     * @notice Overrides the `FHEAuctionBase._bid` function to enforce a minimum deposit requirement before placing a bid.
     * The function reverts if the caller's deposit balance is insufficient to meet the auction's minimum required amount.
     *
     * @dev See {FHEAuctionBase-_bid}
     */
    function _bid(address bidder, einput inPrice, einput inQuantity, bytes calldata inputProof)
        internal
        virtual
        override
    {
        _requireSufficientBalance(_balances[bidder]);
        super._bid(bidder, inPrice, inQuantity, inputProof);
    }

    /**
     * @dev See {FHEAuctionBase-_cancelBid}.
     */
    function _cancelBid(address bidder) internal virtual override {
        _withdrawPayment(bidder, _balances[bidder]);
        super._cancelBid(bidder);
    }

    /**
     * @notice Allows the caller to withdraw `amount` of payment tokens previously deposited into the auction contract
     * as collateral for placing bids. If the withdrawal causes the caller's bid value (`price * quantity`) to fall
     * below the required balance at the end of the auction, a penalty fee will be applied
     * (see {FHEAuctionBase-paymentPenalty}).
     *
     * @dev Requirements:
     * - If the caller has already placed a bid, the auction must be open and currently accepting bids.
     * - If the caller has not placed any bid, the auction must have started.
     * - The function reverts if the withdrawal causes the caller's remaining deposit balance to fall below the minimum
     *   deposit required by the auction.
     *
     * @param amount The amount of payment tokens to withdraw.
     */
    function withdraw(uint256 amount) public nonReentrant whenStarted {
        address bidder = msg.sender;
        bool registered = _registered(bidder);

        uint256 balance = _balances[bidder];
        uint256 maxWithdrawAmount = balance;
        uint256 minDeposit = minimumDeposit();

        if (registered) {
            _requireIsOpen();

            if (balance < minDeposit) {
                // Debug
                require(balance == 0, "Panic: balance > 0 && balance < minDeposit");
                return;
            }

            maxWithdrawAmount -= minDeposit;
        }

        if (amount > maxWithdrawAmount) {
            amount = maxWithdrawAmount;
        }

        if (amount == 0) {
            return;
        }

        _withdrawPayment(bidder, amount);

        // Debug
        if (registered) {
            require(_balances[bidder] >= minDeposit, "Panic: _balances[bidder] < minDeposit");
        }
    }

    /**
     * @notice Transfers `amount` of payment tokens from the bidder's deposit in the auction contract to the bidder's
     * own address.
     *
     * @param bidder The address of the bidder whose deposit will be withdrawn.
     * @param amount The amount of payment tokens to withdraw and transfer back to the bidder.
     */
    function _withdrawPayment(address bidder, uint256 amount) internal {
        _withdrawPaymentTo(bidder, bidder, amount);
    }

    /**
     * @dev Internal function without access restriction. Transfers `amount` of payment tokens from the bidder's
     * deposit in the auction contract to the specified address `to`.
     *
     * @dev This function updates the bidder's deposit balance before performing the transfer and handles the token
     * transfer to the specified recipient.
     *
     * @param bidder The address of the bidder whose deposit will be withdrawn.
     * @param to The address to which the payment tokens will be sent.
     * @param amount The amount of payment tokens to withdraw and transfer.
     */
    function _withdrawPaymentTo(address bidder, address to, uint256 amount) internal {
        _updatePaymentTokenBeforeWithdraw(bidder, amount);
        _transferPaymentTokenTo(to, amount);
    }

    /**
     * @notice Updates the bidder's balance before a withdraw operation.
     * This is an internal function with no access restrictions.
     *
     * @param bidder The address of the bidder whose deposit will be withdrawn.
     * @param amount The amount of payment tokens to withdraw and transfer.
     */
    function _updatePaymentTokenBeforeWithdraw(address bidder, uint256 amount) internal {
        _balances[bidder] -= amount;
    }

    /**
     * @notice Updates the bidder's balance after a deposit operation.
     * This is an internal function with no access restrictions.
     *
     * @param bidder The address of the bidder whose balance is being updated.
     * @param amount The amount of payment tokens deposited.
     */
    function _updatePaymentTokenAfterDeposit(address bidder, uint256 amount) internal {
        _balances[bidder] += amount;
    }

    /**
     * @dev Abstract function to be implemented by derived contracts.
     * It allows for the inclusion of custom logic for transferring payment tokens to a specified address.
     * Derived contracts should provide the specific implementation for how the transfer should be handled
     * (e.g., native Eth or ERC20 token transfer).
     *
     * @param to The address receiving the transferred payment tokens.
     * @param amount The amount of payment tokens to be transferred.
     */
    function _transferPaymentTokenTo(address to, uint256 amount) internal virtual;

    /**
     * @dev Abstract function to be implemented by derived contracts.
     * This function should return the balance of payment tokens owned by a specified address (`account`).
     * @param account The address for which the payment token balance is being queried.
     * @return The balance of payment tokens owned by the `account`.
     */
    function _paymentTokenBalanceOf(address account) internal view virtual returns (uint256);
}
