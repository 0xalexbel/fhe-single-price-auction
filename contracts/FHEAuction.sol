// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import "fhevm/lib/TFHE.sol";
import "fhevm/gateway/GatewayCaller.sol";
import {FHEAuctionBase} from "./FHEAuctionBase.sol";
import {IFHEAuction} from "./IFHEAuction.sol";

abstract contract FHEAuction is FHEAuctionBase, IFHEAuction {
    mapping(address account => uint256) private _balances;
    mapping(uint256 requestID => address bidder) private _requestIDToBidder;

    constructor(uint256 minimumPaymentDeposit_, uint256 paymentPenalty_)
        FHEAuctionBase(minimumPaymentDeposit_, paymentPenalty_)
    {}

    /**
     * @dev Returns the value of payment tokens deposited by `bidder`
     */
    function balanceOf(address bidder) public view returns (uint256) {
        return _balances[bidder];
    }

    /**
     * @dev See {FHEAuctionBase-_canClaim}.
     *
     * Additionnal conditions:
     *
     * - The final uniform price must have been decrypted.
     */     
    function _canClaim(address bidder) internal virtual override view returns (bool) {
        if (clearUniformPrice() == 0) {
            // the auction uniform price is not decrypted
            return false;
        }
        return super._canClaim(bidder);
    }

    function _claim(address bidder, uint16 /*id*/, euint256 validatedPrice, euint256 wonQuantity) internal virtual override {
        uint256[] memory cts = new uint256[](2);
        cts[0] = Gateway.toUint256(validatedPrice);
        cts[1] = Gateway.toUint256(wonQuantity);
        uint256 requestID =
            Gateway.requestDecryption(cts, this.callbackDecryptWonQuantity.selector, 0, block.timestamp + 100, false);

        _requestIDToBidder[requestID] = bidder;
    }

    /**
     * @notice Callback function to compute the requested claim.
     * @dev Can only be called by the Gateway
     * @param requestID The fhEVM gateway requestID
     * @param clearValidatedPrice The requester decrypted auction validated price. If zero, the bid is considered as invalid and subject ot penalty
     * @param clearWonQuantity The requester decrypted auction final won quantity
     */
    function callbackDecryptWonQuantity(uint256 requestID, uint256 clearValidatedPrice, uint256 clearWonQuantity)
        external
        onlyGateway
    {
        // requestID -> bidder
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

    function _bid(address bidder, einput inPrice, einput inQuantity, bytes calldata inputProof) internal virtual override {
        _requireSufficientBalance(_balances[bidder]);
        super._bid(bidder, inPrice, inQuantity, inputProof);
    }

    function _cancelBid(address bidder) internal virtual override {
        _withdrawPayment(bidder, _balances[bidder]);
        super._cancelBid(bidder);
    }

    function withdraw(uint256 amount) public nonReentrant whenStarted {
        address bidder = msg.sender;
        bool registered = _registered(bidder);

        uint256 balance = _balances[bidder];
        uint256 maxWithdrawAmount = balance;
        uint256 minBalance = minimumDeposit();

        if (registered) {
            _requireIsOpen();

            if (balance < minBalance) {
                // Debug
                require(balance == 0, "Panic: balance > 0 && balance < minBalance");
                return;
            }

            maxWithdrawAmount -= minBalance;
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
            require(_balances[bidder] >= minBalance, "Panic: _balances[bidder] < minBalance");
        }
    }

    function _withdrawPayment(address bidder, uint256 amount) internal {
        _withdrawPaymentTo(bidder, bidder, amount);
    }

    function _withdrawPaymentTo(address bidder, address to, uint256 amount) internal {
        _updatePaymentTokenBeforeWithdraw(bidder, amount);
        _transferPaymentTokenTo(to, amount);
    }

    function _updatePaymentTokenBeforeWithdraw(address bidder, uint256 amount) internal {
        _balances[bidder] -= amount;
    }

    function _updatePaymentTokenAfterDeposit(address bidder, uint256 amount) internal {
        _balances[bidder] += amount;
    }

    function _transferPaymentTokenTo(address to, uint256 amount) internal virtual;
    function _paymentTokenBalanceOf(address account) internal view virtual returns (uint256);
}
