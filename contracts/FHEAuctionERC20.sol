// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import "fhevm/lib/TFHE.sol";
import {FHEAuction} from "./FHEAuction.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract FHEAuctionERC20 is FHEAuction {
    IERC20 private immutable _paymentToken;

    constructor(uint256 minimumPaymentBalance, uint256 paymentPenalty, IERC20 paymentToken) FHEAuction(minimumPaymentBalance, paymentPenalty) {
        require(address(paymentToken) != address(0));
        _paymentToken = paymentToken;
    }

    function deposit(uint256 amount) external whenIsOpen nonReentrant {
        _deposit(msg.sender, amount);
    }

    function _deposit(address bidder, uint256 amount) internal {
        _depositPaymentToken(bidder, amount);
        _updatePaymentTokenAfterDeposit(bidder, amount);
    }

    function _depositPaymentToken(address bidder, uint256 amount) internal {
        uint256 balanceBefore = _paymentToken.balanceOf(address(this));
        _paymentToken.transferFrom(bidder, address(this), amount);
        uint256 balanceAfter = _paymentToken.balanceOf(address(this));

        if (balanceAfter - balanceBefore != amount) {
            revert DepositFailed();
        }
    }

    function _transferPaymentTokenTo(address to, uint256 amount) internal override {
        uint256 balanceBefore = _paymentToken.balanceOf(address(this));
        _paymentToken.transfer(to, amount);
        uint256 balanceAfter = _paymentToken.balanceOf(address(this));

        if (balanceBefore - balanceAfter != amount) {
            revert WithdrawFailed();
        }
    }

    function _paymentTokenBalanceOf(address account) internal override view returns(uint256) {
        return _paymentToken.balanceOf(account);
    }

    function bidWithDeposit(einput inPrice, einput inQuantity, bytes calldata inputProof, uint256 depositAmount)
        external
        whenIsOpen
        nonReentrant
    {
        address bidder = msg.sender;
        _deposit(bidder, depositAmount);
        _bid(bidder, inPrice, inQuantity, inputProof);
    }
}
