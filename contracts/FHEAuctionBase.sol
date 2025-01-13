// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import "fhevm/lib/TFHE.sol";
import "fhevm/config/ZamaFHEVMConfig.sol";
import "fhevm/config/ZamaGatewayConfig.sol";
import "fhevm/gateway/GatewayCaller.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {TimedAuction} from "./TimedAuction.sol";
import {IFHEAuctionEngine} from "./IFHEAuctionEngine.sol";

import {console} from "hardhat/console.sol";

/**
 * @dev Abstract contract for implementing a Single Price Auction.
 * This implementation is payment-agnostic, supporting various types of payments such as Ether, ERC20 tokens, or encrypted ERC20 tokens.
 * As a result, a payment or deposit locking mechanism must be implemented in a derived contract.
 *
 * Provides fundamental auction functionality, including:
 * - Initialization
 * - Auction timing (open/close states)
 * - Bid placement and canceling
 * - Prize claiming by bidders
 * - Auction termination
 *
 * The contract interacts with a separate `TFHEAuctionEngine` contract, which is responsible for:
 * - Validating bids
 * - Ranking bids
 * - Computing the final prize for each bidder
 */
abstract contract FHEAuctionBase is
    SepoliaZamaFHEVMConfig,
    SepoliaZamaGatewayConfig,
    TimedAuction,
    Ownable,
    ReentrancyGuard,
    GatewayCaller
{
    uint8 constant CLAIMED = 1;

    struct Bid {
        euint256 price;
        euint256 quantity;
    }

    uint256 private immutable _paymentPenalty;
    uint256 private immutable _minimumPaymentDeposit;

    address private _engine;
    address private _beneficiary;
    IERC20 private _auctionToken;
    uint256 private _clearUniformPrice;

    uint256 private _claimCount;
    uint256 private _blindClaimCount;

    mapping(address bidder => uint8) private _claimCompleted;
    mapping(uint16 rank => uint8) private _blindClaimCompleted;
    mapping(address bidder => Bid) private _bidderToBid;

    error BidderNotRegistered(address bidder);
    error DepositFailed(address token, address from, uint256 amount);
    error WithdrawFailed();
    error InvalidEngine(address engine);
    error InvalidBeneficiary(address beneficiary);
    error InvalidAuctionToken(address token);
    error InvalidAuctionQuantity(uint256 quantity);
    error InvalidTieBreakingRule(uint8 tieBreakingRule);
    error AlreadyClaimed(address bidder);
    error NotReadyToClaim(address bidder);
    error RankAlreadyClaimed(uint16 rank);
    error NotReadyToClaimRank(uint16 rank);
    error UniformPriceNotReadyToDecrypt();

    /**
     * @notice Thrown when the account's payment token balance is insufficient to perform the operation.
     *
     * @param balance The current payment token balance of the account.
     * @param needed The required payment token balance to complete the operation.
     */
    error InsufficientBalance(uint256 balance, uint256 needed);

    /**
     * @notice Thrown when the payment penalty exceeds the requested minimum payment token balance.
     *
     * @param minimumBalance The required minimum payment token balance.
     * @param penalty The payment penalty that triggered the error.
     */
    error PaymentPenaltyTooHigh(uint256 minimumBalance, uint256 penalty);

    /**
     * @notice Reverts if `paymentPenalty_` exceeds `minimumPaymentDeposit_`.
     * Ensures the auction retains sufficient payment tokens to cover any penalty fees.
     *
     * @param minimumPaymentDeposit_ The minimum amount of payment tokens a bidder must deposit before placing any bid.
     * @param paymentPenalty_ The amount of payment tokens transferred to the auction's {beneficiary} for each invalid bid.
     */
    constructor(uint256 minimumPaymentDeposit_, uint256 paymentPenalty_) Ownable(msg.sender) {
        if (paymentPenalty_ > minimumPaymentDeposit_) {
            revert PaymentPenaltyTooHigh(minimumPaymentDeposit_, paymentPenalty_);
        }
        _minimumPaymentDeposit = minimumPaymentDeposit_;
        _paymentPenalty = paymentPenalty_;
    }

    /**
     * @notice Initializes the auction with a specified auction engine and parameters.
     *
     * @notice Requirements:
     * - The auction must not already be initialized (see `_initialize`).
     * - The caller must be the contract owner.
     * - The `engine_`'s owner must be the current contract.
     * - The `auctionToken_` must not be the zero address.
     * - The `auctionQuantity_` must be strictly positive.
     * - The `beneficiary_` must not be the zero address.
     * - The `tieBreakingRule_` must be a valid value.
     *
     * @param engine_ Address of the auction engine used to compute auction prizes.
     * @param beneficiary_ Address of the auction beneficiary who will receive the proceeds.
     * @param auctionToken_ Address of the {IERC20} token being auctioned.
     * @param auctionQuantity_ Total quantity of tokens to be auctioned.
     * @param tieBreakingRule_ Tie-breaking rule used by the auction engine to resolve winning ties.
     */
    function initialize(
        address engine_,
        address beneficiary_,
        IERC20 auctionToken_,
        uint256 auctionQuantity_,
        uint8 tieBreakingRule_
    ) external onlyOwner nonReentrant {
        if (engine_ == address(0) || Ownable(engine_).owner() != address(this)) {
            revert InvalidEngine(engine_);
        }
        if (address(beneficiary_) == address(0)) {
            revert InvalidBeneficiary(beneficiary_);
        }
        if (address(auctionToken_) == address(0)) {
            revert InvalidAuctionToken(address(auctionToken_));
        }
        if (auctionQuantity_ == 0) {
            revert InvalidAuctionQuantity(auctionQuantity_);
        }
        if (tieBreakingRule_ != 2) {
            revert InvalidTieBreakingRule(tieBreakingRule_);
        }

        // reverts if the auction is already initialized.
        _initialize();

        _engine = engine_;
        _beneficiary = beneficiary_;
        _auctionToken = auctionToken_;

        IFHEAuctionEngine(engine_).initialize(auctionQuantity_, tieBreakingRule_);
    }

    /**
     * @notice Modifier to make a function callable only when the caller is a registered bidder.
     *
     * @notice Requirements:
     * - The auction must have started.
     * - Must be used as a final modifier as it is not checking if the auction is initialized
     */
    modifier onlyBidder() {
        _checkBidder();
        _;
    }

    /**
     * @notice Reverts if the caller is not a registered bidder
     */
    function _checkBidder() internal view virtual {
        if (!_registered(msg.sender)) {
            revert BidderNotRegistered(msg.sender);
        }
    }

    /**
     * @notice Returns true if `bidder` is a registered bidder
     */
    function _registered(address bidder) internal view returns (bool) {
        return IFHEAuctionEngine(_engine).bidderId(bidder) != 0;
    }

    /**
     * @notice Starts the auction. (see `TimedAuction._start`).
     * At start, {auctionQuantity} tokens will be transferred from the {beneficiary} to the current auction contract as
     * a deposit. If the auction contract is unable to execute the transfer operation, the function will revert.
     *
     * @notice Requirements:
     * - The auction must be initialized.
     * - The auction must not have already started.
     * - The caller must be the auction contract owner.
     * - The {beneficiary} must have approved the transfer of at least {auctionQuantity} tokens to
     * the current auction contract.
     *
     * @param durationInSeconds The duration of the auction in seconds.
     * @param stoppable Indicates whether the auction can be manually stopped.
     */
    function start(uint256 durationInSeconds, bool stoppable) external onlyOwner nonReentrant {
        _start(durationInSeconds, stoppable);
        _transferAuctionTokenFrom(_beneficiary, auctionQuantity());
    }

    /**
     * @notice Closes the auction
     *
     * @notice Requirements:
     * - The auction must be open (ie. accepting bids)
     * - The auction must be `stoppable`
     * - The caller must be the auction contract owner.
     */
    function stop() external onlyOwner nonReentrant {
        _stop();
        IFHEAuctionEngine(_engine).close();
    }

    /**
     * @notice Reverts if `balance` is less than the required minimum deposit amount of payment tokens.
     */
    function _requireSufficientBalance(uint256 balance) internal view virtual {
        if (balance < _minimumPaymentDeposit) {
            revert InsufficientBalance(balance, _minimumPaymentDeposit);
        }
    }

    /**
     * @notice Returns the minimum amount of payment tokens a bidder must deposit before placing any bid.
     */
    function minimumDeposit() public view returns (uint256) {
        return _minimumPaymentDeposit;
    }

    /**
     * @notice Returns the penalty fee (in payment tokens) charged to a bidder for insufficient balance
     * to pay their auction prize at the end of the auction.
     */
    function paymentPenalty() public view returns (uint256) {
        return _paymentPenalty;
    }

    /**
     * @notice Returns the address of the {IERC20} token being auctioned.
     */
    function auctionToken() public view returns (address) {
        return address(_auctionToken);
    }

    /**
     * @notice Returns the address of the auction beneficiary, who will receive the proceeds of the auction.
     */
    function beneficiary() public view returns (address) {
        return _beneficiary;
    }

    /**
     * @notice Returns the total amount of `auctionToken` available for auction.
     */
    function auctionQuantity() public view returns (uint256) {
        return IFHEAuctionEngine(_engine).totalQuantity();
    }

    /**
     * @notice Returns the maximum allowable price for each bid.
     */
    function maximumPrice() public view returns (uint256) {
        return IFHEAuctionEngine(_engine).maximumPrice();
    }

    /**
     * @notice Returns the total number of bidders.
     */
    function bidCount() public view returns (uint256) {
        return IFHEAuctionEngine(_engine).getBidCount();
    }

    /**
     * @notice Returns the encrypted bid of the caller.
     * @return price The unit price (encrypted) that the caller has offered to pay per token being auctioned.
     * @return quantity The total quantity (encrypted) of tokens the caller has bidded for.
     */
    function getBid() public view returns (euint256 price, euint256 quantity) {
        price = _bidderToBid[msg.sender].price;
        quantity = _bidderToBid[msg.sender].quantity;
    }

    /**
     * @notice Retrieves the bidder address associated with the specified bid ID.
     * @param id The ID of the bid to retrieve.
     * @return bidder The address of the bidder.
     */
    function _getBidderById(uint16 id) internal view returns (address) {
        return IFHEAuctionEngine(_engine).getBidderById(id);
    }

    /**
     * @notice Places a bid with encrypted values.
     * @param inPrice The encrypted unit price the caller offers to pay per token being auctioned.
     * @param inQuantity The encrypted total quantity of tokens the caller is bidding for.
     * @param inputProof The fhEVM proof for the encrypted input.
     *
     * Requirements:
     * - The auction must be open and accepting bids.
     * - The caller must not have already placed a bid.
     */
    function bid(einput inPrice, einput inQuantity, bytes calldata inputProof) external nonReentrant whenIsOpen {
        _bid(msg.sender, inPrice, inQuantity, inputProof);
    }

    /**
     * @notice Internal function without access restriction.
     * @param bidder address of the bidder
     * @param inPrice The encrypted unit price the `bidder` offers to pay per token being auctioned.
     * @param inQuantity The encrypted total quantity of tokens the `bidder` is bidding for.
     * @param inputProof The fhEVM proof for the encrypted input.
     *
     * Requirements:
     * - The caller must not have already placed a bid.
     */
    function _bid(address bidder, einput inPrice, einput inQuantity, bytes calldata inputProof) internal virtual {
        Bid memory newBid =
            Bid({price: TFHE.asEuint256(inPrice, inputProof), quantity: TFHE.asEuint256(inQuantity, inputProof)});

        address engineAddr = _engine;
        TFHE.allowTransient(newBid.price, engineAddr);
        TFHE.allowTransient(newBid.quantity, engineAddr);

        // will revert if `bidder` has already placed a bid
        IFHEAuctionEngine(_engine).addBid(bidder, newBid.price, newBid.quantity);

        TFHE.allow(newBid.price, bidder);
        TFHE.allow(newBid.quantity, bidder);
        TFHE.allowThis(newBid.price);
        TFHE.allowThis(newBid.quantity);

        _bidderToBid[bidder] = newBid;
    }

    /**
     * @notice Returns `true` if the caller's auction prize is ready to be claimed, `false` otherwise.
     *
     * @notice Requirements:
     * - The auction must be closed (ie. the auction is not accepting any additional bid).
     * - The caller must be a registered bidder.
     * - see {_canClaim} for additional requirements.
     */
    function canClaim() public view whenClosed onlyBidder returns (bool) {
        return _canClaim(msg.sender);
    }

    /**
     * @notice Returns `true` if the bidder can claim their auction prize, `false` otherwise.
     * Internal function without access restriction.
     * This function is meant to be overriden to add extra conditions for a successfull claim.
     *
     * @notice Conditions for a successful claim:
     * - All bidders' won quantities have been computed by the auction `_engine`.
     * - The `bidder` has not yet claimed their prize.
     *
     * @param bidder address of the bidder
     */
    function _canClaim(address bidder) internal view virtual returns (bool) {
        if (claimCompleted(bidder)) {
            // Cannot claim twice
            return false;
        }

        if (!IFHEAuctionEngine(_engine).canClaim()) {
            // Computation is not complete
            return false;
        }

        return true;
    }

    /**
     * @notice Claim the caller's won quantity of token sold in the auction at the final uniform price
     *
     * @notice Requirements:
     * - The auction must be closed.
     * - All bidders won quantities must have been computed by the auction engine.
     * - The caller sould not have already successfully claimed its price.
     */
    function claim() external nonReentrant whenClosed {
        address bidder = msg.sender;

        uint16 id = IFHEAuctionEngine(_engine).bidderId(bidder);
        if (id == 0) {
            revert BidderNotRegistered(bidder);
        }

        if (claimCompleted(bidder)) {
            // the prize has already been claimed successfully
            revert AlreadyClaimed(bidder);
        }

        (euint256 validatedPrice, euint256 wonQuantity) =
            IFHEAuctionEngine(_engine).validatedPriceAndWonQuantityById(id);
        if (euint256.unwrap(wonQuantity) == 0) {
            revert NotReadyToClaim(bidder);
        }

        _claim(bidder, id, validatedPrice, wonQuantity);
    }

    /**
     * @dev Abstract internal function to process a claim for the bid placed by bidder `bidder`.
     * Must be implemented by derived contracts to handle claims based on the bidder address, clear ID,
     * encrypted validated price, and encrypted won quantity.
     */
    function _claim(address bidder, uint16 id, euint256 validatedPrice, euint256 wonQuantity) internal virtual;

    /**
     * @notice Returns `true` if the `bidder` has successfully claimed their auction prize, `false` otherwise.
     * @param bidder The address of the bidder whose claim status is being checked.
     * @return completed A boolean indicating whether the bidder's auction prize has been successfully claimed.
     */
    function claimCompleted(address bidder) public view returns (bool) {
        return _claimCompleted[bidder] == CLAIMED;
    }

    /**
     * @notice Marks the claim as completed for the specified bidder.
     *
     * This function updates the internal state to reflect that the bidder has successfully claimed
     * their auction prize. It will revert if the bidder has already claimed their prize.
     *
     * @notice Requirements:
     * - The bidder must not have already completed the claim.
     *
     * @param bidder The address of the bidder whose claim is being marked as completed.
     */
    function _markClaimCompleted(address bidder) internal {
        if (claimCompleted(bidder)) {
            revert AlreadyClaimed(bidder);
        }
        _claimCompleted[bidder] = CLAIMED;
        _claimCount++;
    }

    /**
     * @notice Returns `true` if the auction prize ranked at position `rank` is ready to be claimed, `false` otherwise.
     *
     * @notice Requirements:
     * - The auction must be closed (ie. the auction is not accepting any additional bid).
     * - see {_canBlindClaim} for additional requirements.
     *
     * @param rank The zero-based rank of the unidentified bidder for whom the prize is being claimed.
     */
    function canBlindClaim(uint16 rank) public view whenClosed returns (bool) {
        return _canBlindClaim(rank);
    }

    /**
     * @notice Returns `true` the auction prize ranked at position `rank` is ready to be claimed, `false` otherwise.
     * Internal function without access restriction.
     * This function is meant to be overriden to add extra conditions for a successfull claim.
     *
     * @notice Conditions for a successful claim:
     * - All ranked won quantities have been computed by the auction `_engine`.
     * - The prize at rank position `rank` has not yet been claimed.
     *
     * @param rank The zero-based rank of the unidentified bidder for whom the prize is being claimed.
     */
    function _canBlindClaim(uint16 rank) internal view virtual returns (bool) {
        if (blindClaimCompleted(rank)) {
            // Cannot claim rank twice
            return false;
        }

        if (!IFHEAuctionEngine(_engine).isRankedWonQuantitiesComplete()) {
            // Computation is not complete
            return false;
        }

        return true;
    }

    /**
     * @notice Blindly claims the auction prize on behalf of the unidentified bidder ranked at position `rank`.
     * The prize is awarded to the bidder at the final uniform price determined by the auction.
     * The caller acts as an intermediary and does not directly receive the prize.
     *
     * @dev Requirements:
     * - The auction must be closed.
     * - The auction engine must have computed the final won quantities for all bidders.
     * - The specified rank must not have already been claimed.
     *
     * @param rank The zero-based rank of the bidder for whom the prize is being claimed.
     */
    function blindClaim(uint16 rank) external nonReentrant whenClosed {
        if (blindClaimCompleted(rank)) {
            revert RankAlreadyClaimed(rank);
        }

        (euint16 id, euint256 validatedPrice, euint256 wonQuantity) = IFHEAuctionEngine(_engine).getWonBidByRank(rank);
        if (euint256.unwrap(wonQuantity) == 0) {
            revert NotReadyToClaimRank(rank);
        }

        _blindClaim(rank, id, validatedPrice, wonQuantity);
    }

    /**
     * @dev Abstract internal function to process a claim for the bid ranked at `rank`.
     * Must be implemented by derived contracts to handle claims based on the clear rank, encrypted ID,
     * encrypted validated price, and encrypted won quantity.
     */
    function _blindClaim(uint16 rank, euint16 id, euint256 validatedPrice, euint256 wonQuantity) internal virtual;

    /**
     * @notice Returns `true` if the prize for the unidentified bidder at the specified `rank` has been successfully
     * claimed via {blindClaimByRank}, `false` otherwise.
     * @param rank The zero-based rank of the unidentified bidder.
     * @return completed `true` if the prize has been successfully claimed, `false` otherwise.
     */
    function blindClaimCompleted(uint16 rank) public view returns (bool) {
        return _blindClaimCompleted[rank] == CLAIMED;
    }

    function _markBlindClaimCompleted(uint16 rank) internal {
        if (blindClaimCompleted(rank)) {
            revert RankAlreadyClaimed(rank);
        }
        _blindClaimCompleted[rank] = CLAIMED;
        _blindClaimCount++;
    }

    /**
     * @dev See {TimedAuction-_canTerminateAfterStart}.
     */
    function _canTerminateAfterStart() internal view override returns (bool) {
        return _claimCount == bidCount() || _blindClaimCount == bidCount();
    }

    /**
     * @notice Terminates the auction.
     * An auction can be terminated if it has not yet started, `bidCount` is zero, or all bids have been claimed.
     * When terminated, all tokens being auctioned are transferred back to the `beneficiary`.
     *
     * @notice Requirements:
     * - The caller must be the auction contract owner.
     * - The auction must be in a terminable state (see `whenTerminable`).
     */
    function terminate() external onlyOwner nonReentrant {
        _terminate();
        _transferAuctionTokenTo(_beneficiary, _auctionToken.balanceOf(address(this)));
    }

    /**
     * @notice Internal function with no access restrictions.
     * Transfers `amount` of the auctioned tokens from the auction's contract account to the `to` address.
     *
     * @param to The recipient's address.
     * @param amount The amount of auctioned tokens to transfer to the `to` address.
     */
    function _transferAuctionTokenTo(address to, uint256 amount) internal {
        if (amount == 0) {
            return;
        }

        uint256 balanceBefore = _auctionToken.balanceOf(to);
        _auctionToken.transfer(to, amount);
        uint256 balanceAfter = _auctionToken.balanceOf(to);

        // Debug
        require((balanceAfter - balanceBefore) == amount, "Panic:(balanceAfter - balanceBefore) != amount");
    }

    /**
     * @dev Internal function with no access restrictions. Handles the transfer of `amount` ERC20 auction tokens
     * from the `from`'s account into the auction contract.
     *
     * This function utilizes the ERC20 allowance mechanism and calls {IERC20-transferFrom} to transfer tokens
     * from the source address to the auction contract. It assumes that the source address has approved the auction
     * contract to spend the specified `amount` of tokens in advance.
     *
     * @param from The address of the source account.
     * @param amount The amount of ERC20 tokens to be transferred.
     */
    function _transferAuctionTokenFrom(address from, uint256 amount) internal {
        if (amount == 0) {
            return;
        }

        IERC20 aToken = _auctionToken;
        uint256 balanceBefore = aToken.balanceOf(address(this));
        bool succeeded = aToken.transferFrom(from, address(this), amount);
        if (!succeeded) {
            revert DepositFailed(address(aToken), from, amount);
        }
        uint256 balanceAfter = aToken.balanceOf(address(this));

        if (balanceAfter - balanceBefore != amount) {
            revert DepositFailed(address(aToken), from, amount);
        }
    }

    /**
     * @notice Cancels the caller's bid.
     *
     * @notice Requirements:
     * - The caller must be a registered bidder.
     * - The auction must be open, meaning it is currently accepting bids.
     */
    function cancelBid() external nonReentrant whenIsOpen onlyBidder {
        _cancelBid(msg.sender);
    }

    /**
     * @notice Internal function without access restrictions.
     * @dev This function is intended to be overridden in derived contracts to implement
     * additional operations that should occur when a bid is canceled.
     *
     * @param bidder The address of the bidder whose bid is being canceled.
     */
    function _cancelBid(address bidder) internal virtual {
        _bidderToBid[bidder] = Bid({price: euint256.wrap(0), quantity: euint256.wrap(0)});
        IFHEAuctionEngine(_engine).removeBid(bidder);
    }

    /**
     * @notice Returns the decrypted final uniform auction price. The function returns `0` if
     * the auction is not completed and the price is not yet available. Non zero otherwise.
     */
    function clearUniformPrice() public view returns (uint256) {
        return _clearUniformPrice;
    }

    /**
     * @notice Returns `true` if the auction is ready to decrypt the final auction uniform price
     *
     * @notice Requirements:
     * - The auction contract must be initialized.
     */
    function canDecryptUniformPrice() public view whenInitialized returns (bool) {
        return IFHEAuctionEngine(_engine).canDecryptUniformPrice();
    }

    /**
     * @notice Initiate the decryption of the auction final uniform price.
     * @notice Requirements:
     * - Can only be called after the auction ends and the uniform price has been computed by the engine
     */
    function decryptUniformPrice() public onlyOwner nonReentrant whenInitialized {
        euint256 pu = IFHEAuctionEngine(_engine).getUniformPrice();
        if (!TFHE.isInitialized(pu)) {
            revert UniformPriceNotReadyToDecrypt();
        }

        // Debug
        require(TFHE.isAllowed(pu, address(this)), "Panic: TFHE.isAllowed(pu, address(this)) == false");

        uint256[] memory cts = new uint256[](1);
        cts[0] = Gateway.toUint256(pu);
        Gateway.requestDecryption(cts, this.callbackDecryptUniformPrice.selector, 0, block.timestamp + 100, false);
    }

    /**
     * @notice Callback function to set the decrypted auction final uniform price.
     * @notice Can only be called by the Gateway
     * @param resultDecryption The decrypted auction final uniform price
     */
    function callbackDecryptUniformPrice(uint256, /*requestID*/ uint256 resultDecryption) external onlyGateway {
        _clearUniformPrice = resultDecryption;
    }
}
