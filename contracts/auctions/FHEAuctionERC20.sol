// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {einput} from "fhevm/lib/TFHE.sol";
import {FHEAuction} from "./FHEAuction.sol";
import {FHEAuctionBase} from "./FHEAuctionBase.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {FHEAuctionBlindClaimable} from "./extensions/FHEAuctionBlindClaimable.sol";

contract FHEAuctionERC20 is FHEAuction, FHEAuctionBlindClaimable {
    IERC20 private immutable _paymentToken;

    /**
     * @dev See {FHEAuctionBase-constructor}
     * @param paymentToken_ Address of the ERC20 payment token used for all auction deposits
     */
    constructor(uint256 minimumPaymentBalance_, uint256 paymentPenalty_, IERC20 paymentToken_)
        FHEAuctionBase(minimumPaymentBalance_, paymentPenalty_)
    {
        require(address(paymentToken_) != address(0));
        _paymentToken = paymentToken_;
    }

    /**
     * @notice See {FHEAuctionBase-isNative}.
     */
    function isNative() public pure override returns (bool) {
        return false;
    }

    /**
     * @notice Returns the ERC20 payment token used for all auction deposits
     */
    function paymentToken() public view returns (IERC20) {
        return _paymentToken;
    }

    /**
     * @notice Deposits a specified amount of payment tokens and places a bid with encrypted values in a single
     * transaction.
     *
     * This function is designed to prevent scenarios where a bidder successfully deposits funds in one transaction but
     * is unable to place a bid in a subsequent transaction because the auction has closed in the interim. By combining
     * the deposit and bid actions, the function ensures seamless participation in the auction within a single
     * operation.
     *
     * @notice Requirements:
     * - The auction should be open (meaning accepting new bids)
     * - See {FHEAuctionBase-bid} for bidding requirements.
     *
     * @param inPrice Encrypted input representing the bid price.
     * @param inQuantity Encrypted input representing the bid quantity.
     * @param inputProof Proof data required to validate the encrypted bid.
     * @param depositAmount The clear amount of payment tokens to deposit.
     */
    function bidWithDeposit(einput inPrice, einput inQuantity, bytes calldata inputProof, uint256 depositAmount)
        external
        whenIsOpen
        nonReentrant
    {
        address bidder = msg.sender;
        _depositFrom(bidder, depositAmount);
        _bid(bidder, inPrice, inQuantity, inputProof);
    }

    /**
     * @notice Deposits a specified amount of ERC20 payment tokens to the caller's account into the auction contract.
     * @notice Requirements:
     * - The auction should be open (meaning accepting new bids)
     */
    function deposit(uint256 amount) external whenIsOpen nonReentrant {
        _depositFrom(msg.sender, amount);
    }

    /**
     * @dev Internal function with no access restrictions. Deposits `amount` of ERC20 payment tokens from the
     * `bidder`'s ERC20 external account into their deposit balance within the auction contract.
     *
     * @param bidder The address of the bidder initiating the deposit.
     * @param amount The amount of ERC20 payment tokens to be transferred and credited.
     */
    function _depositFrom(address bidder, uint256 amount) internal {
        _transferPaymentTokenFrom(bidder, amount);
        _updatePaymentTokenAfterDeposit(bidder, amount);
    }

    /**
     * @dev Internal function with no access restrictions. Handles the transfer of `amount` ERC20 payment tokens
     * from the `bidder`'s account into the auction contract.
     *
     * This function utilizes the ERC20 allowance mechanism and calls {IERC20-transferFrom} to transfer tokens
     * from the bidder's address to the auction contract. It assumes that the bidder has approved the auction
     * contract to spend the specified `amount` of tokens in advance.
     *
     * @param bidder The address of the bidder initiating the deposit.
     * @param amount The amount of ERC20 tokens to be transferred.
     */
    function _transferPaymentTokenFrom(address bidder, uint256 amount) internal {
        if (amount == 0) {
            return;
        }
        IERC20 pToken = _paymentToken;
        uint256 balanceBefore = pToken.balanceOf(address(this));
        bool succeeded = pToken.transferFrom(bidder, address(this), amount);
        if (!succeeded) {
            revert DepositFailed(address(pToken), bidder, amount);
        }
        uint256 balanceAfter = pToken.balanceOf(address(this));

        if (balanceAfter - balanceBefore != amount) {
            revert DepositFailed(address(pToken), bidder, amount);
        }
    }

    /**
     * @dev Transfers `amount` of ERC20 payment token to account `to`.
     * @dev See {FHEAuction-_transferPaymentTokenTo}.
     */
    function _transferPaymentTokenTo(address to, uint256 amount) internal override {
        uint256 balanceBefore = _paymentToken.balanceOf(address(this));
        _paymentToken.transfer(to, amount);
        uint256 balanceAfter = _paymentToken.balanceOf(address(this));

        if (balanceBefore - balanceAfter != amount) {
            revert WithdrawFailed();
        }
    }

    /**
     * @dev Returns the balance of ERC20 payment tokens owned by a specified address (`account`).
     * @dev See {FHEAuction-_paymentTokenBalanceOf}.
     */
    function _paymentTokenBalanceOf(address account) internal view override returns (uint256) {
        return _paymentToken.balanceOf(account);
    }
}
