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

    address private _engine;
    address private _beneficiary;
    IERC20 private _auctionToken;
    uint256 private _paymentPenalty;
    uint256 private _minBalance;
    uint256 private _clearUniformPrice;

    uint256 private _claimCount;

    mapping(address bidder => uint8) private _claimed;
    mapping(address bidder => Bid) private _bidderToBid;

    error BidderNotRegistered(address bidder);
    error DepositFailed();
    error WithdrawFailed();
    error InvalidEngine(address engine);
    error InvalidBeneficiary(address beneficiary);
    error InvalidAuctionToken(address token);
    error InvalidAuctionQuantity(uint256 quantity);
    error InvalidTieBreakingRule(uint8 tieBreakingRule);
    error AlreadyClaimed(address bidder);
    error NotReadyToClaim(address bidder);
    error UniformPriceNotReadyToDecrypt();

    /**
     * @dev The payment token balance of the account is not enough to perform the operation.
     */
    error InsufficientBalance(uint256 balance, uint256 needed);
    error PaymentPenaltyTooHigh(uint256 minimumBalance, uint256 penalty);

    constructor(uint256 minimumPaymentBalance_, uint256 paymentPenalty_) Ownable(msg.sender) {
        if (paymentPenalty_ > minimumPaymentBalance_) {
            revert PaymentPenaltyTooHigh(minimumPaymentBalance_, paymentPenalty_);
        }
        _minBalance = minimumPaymentBalance_;
        _paymentPenalty = paymentPenalty_;
    }

    /**
     * @dev Modifier to make a function callable only when the caller is a registered bidder.
     *
     * Requirements:
     *
     * - The auction must have started.
     * - Must be used as a final modifier as it is not checking if the auction is initialized 
     */
    modifier onlyBidder() {
        _checkBidder();
        _;
    }

    /**
     * @dev Throws if the caller is not a registered bidder
     */
    function _checkBidder() internal view virtual {
        if (!_registered(msg.sender)) {
            revert BidderNotRegistered(msg.sender);
        }
    }

    /**
     * @dev Returns true if `bidder` is a registered bidder
     */
    function _registered(address bidder) internal view returns (bool) {
        return IFHEAuctionEngine(_engine).bidderId(bidder) != 0;
    }

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

        _initialize();

        _engine = engine_;
        _beneficiary = beneficiary_;
        _auctionToken = auctionToken_;

        uint256 balanceBefore = auctionToken_.balanceOf(address(this));
        auctionToken_.transferFrom(beneficiary_, address(this), auctionQuantity_);
        uint256 balanceAfter = auctionToken_.balanceOf(address(this));

        if (balanceAfter - balanceBefore != auctionQuantity_) {
            revert DepositFailed();
        }

        // transfer token for sale * quantity to the auction
        IFHEAuctionEngine(engine_).initialize(auctionQuantity_, tieBreakingRule_);
    }

    function start(uint256 durationInSeconds, bool stoppable) external onlyOwner nonReentrant {
        _start(durationInSeconds, stoppable);
    }

    function stop() external onlyOwner nonReentrant {
        _stop();
        IFHEAuctionEngine(_engine).close();
    }

    /**
     * @dev Throws if the balance is lower than the minimum required balance
     */
    function _requireSufficientBalance(uint256 balance) internal view virtual {
        if (balance < _minBalance) {
            revert InsufficientBalance(balance, _minBalance);
        }
    }

    /**
     * @dev Returns the minimum amount of payment tokens a bidder must deposit to be eligible to place a bid.
     */
    function minimumDeposit() public view returns (uint256) {
        return _minBalance;
    }

    /**
     * @dev Returns the amout of payment tokens a bidder must pay as a penalty
     * if the bidder does not have enough balance to pay won quantities at the end of the auction.
     */
    function paymentPenalty() public view returns (uint256) {
        return _paymentPenalty;
    }

    /**
     * @dev Returns the token being sold during the auction.
     */
    function auctionToken() public view returns (address) {
        return address(_auctionToken);
    }

    /**
     * @dev Returns the total quantity of token being sold during the auction.
     */
    function auctionQuantity() public view returns (uint256) {
        return IFHEAuctionEngine(_engine).totalQuantity();
    }

    /**
     * @dev Returns the auction beneficiary.
     */
    function beneficiary() public view returns (address) {
        return _beneficiary;
    }

    /**
     * @dev Returns the total number of bidders.
     */
    function bidCount() public view returns (uint256) {
        return IFHEAuctionEngine(_engine).getBidCount();
    }

    /**
     * @dev Returns the caller's bid.
     */
    function getBid() public view returns (euint256 price, euint256 quantity) {
        price = _bidderToBid[msg.sender].price;
        quantity = _bidderToBid[msg.sender].quantity;
    }

    /**
     * @dev Place a bid with encrypted values
     * @param inPrice The bid encrypted price
     * @param inQuantity The bid encrypted quantity
     * @param inputProof Proof for the encrypted input
     *
     * Requirements:
     *
     * - The auction must be open (has started and has not yet ended).
     * - The caller must not have already placed a bid.
     */
    function bid(einput inPrice, einput inQuantity, bytes calldata inputProof) external nonReentrant whenIsOpen {
        _bid(msg.sender, inPrice, inQuantity, inputProof);
    }

    /**
     * @dev The engine will revert if `bidder` has already placed a bid.
     */
    function _bid(address bidder, einput inPrice, einput inQuantity, bytes calldata inputProof) internal virtual {
        // reentrancy cannot occur
        Bid memory newBid =
            Bid({price: TFHE.asEuint256(inPrice, inputProof), quantity: TFHE.asEuint256(inQuantity, inputProof)});

        address engineAddr = _engine;
        TFHE.allowTransient(newBid.price, engineAddr);
        TFHE.allowTransient(newBid.quantity, engineAddr);

        // will revert if bidder has already placed a bid
        IFHEAuctionEngine(_engine).bid(bidder, newBid.price, newBid.quantity);

        //save bid to allow bidder to retreive its bid if needed
        TFHE.allow(newBid.price, bidder);
        TFHE.allow(newBid.quantity, bidder);
        TFHE.allowThis(newBid.price);
        TFHE.allowThis(newBid.quantity);

        _bidderToBid[bidder] = newBid;
    }

    /**
     * @dev Returns true if the caller's auction prize is ready to be claimed by the caller, false otherwise.
     *
     * Requirements:
     *
     * - The auction must be closed.
     * - The caller must be a registered bidder.
     */
    function canClaim() public view whenClosed onlyBidder returns (bool) {
        return _canClaim(msg.sender);
    }

    /**
     * @dev Returns true if:
     *
     * - All bidders won quantities have been computed by the auction engine.
     * - The `bidder` has not already successfully claimed its price.
     */
    function _canClaim(address bidder) internal virtual view returns (bool) {
        if (claimCompleted(bidder)) {
            // the prize has already been claimed successfully
            return false;
        }

        // the engine has not yet completed the auction prizes.
        if(!IFHEAuctionEngine(_engine).canClaim()) {
            return false;
        }

        return true;
    }

    /**
     * @dev Claim the caller's won quantity of token sold in the auction at the final uniform price 
     *
     * Requirements:
     *
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

        (euint256 validatedPrice, euint256 wonQuantity) = IFHEAuctionEngine(_engine).validatedPriceAndWonQuantityById(id);
        if (euint256.unwrap(wonQuantity) == 0) {
            revert NotReadyToClaim(bidder);
        }

        _claim(bidder, id, validatedPrice, wonQuantity);
    }

    function _claim(address bidder, uint16 id, euint256 validatedPrice, euint256 wonQuantity) internal virtual;

    /**
     * @dev Returns true if the caller's auction prize has been successfully claimed.
     */
    function claimCompleted(address bidder) public view returns (bool) {
        return _claimed[bidder] == 1;
    }

    function _completeClaim(address bidder) internal {
        if (_claimed[bidder] == CLAIMED) {
            revert AlreadyClaimed(bidder);
        }
        _claimed[bidder] = CLAIMED;
        _claimCount++;
    }

    function _canTerminateAfterStart() internal view override returns (bool) {
        return _claimCount == bidCount();
    }

    function terminate() external onlyOwner nonReentrant {
        _terminate();
        _transferAuctionTokenTo(_beneficiary, _auctionToken.balanceOf(address(this)));
    }

    function _transferAuctionTokenTo(address to, uint256 amount) internal {
        uint256 balanceBefore = _auctionToken.balanceOf(to);
        _auctionToken.transfer(to, amount);
        uint256 balanceAfter = _auctionToken.balanceOf(to);

        // Debug
        require((balanceAfter - balanceBefore) == amount, "Panic:(balanceAfter - balanceBefore) != amount");
    }

    function cancelBid() external nonReentrant whenIsOpen onlyBidder {
        _cancelBid(msg.sender);
    }

    function _cancelBid(address bidder) internal virtual {
        IFHEAuctionEngine(_engine).removeBidder(bidder);
    }

    /**
     * @dev Returns the decrypted final uniform auction price. The function returns `0` if 
     * the auction is not completed and the price is not yet available. Non zero otherwise.
     */
    function clearUniformPrice() public view returns (uint256) {
        return _clearUniformPrice;
    }

    /**
     * @dev Returns `true` if the auction is ready to decrypt the final auction uniform price
     */
    function canDecryptUniformPrice() public view whenInitialized returns (bool) {
        return IFHEAuctionEngine(_engine).canDecryptUniformPrice();
    }

    /**
     * @dev Initiate the decryption of the auction final uniform price.
     * @dev Can only be called after the auction ends and the uniform price has been computed by the engine
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
     * @dev Callback function to set the decrypted auction final uniform price.
     * @dev Can only be called by the Gateway
     * @param resultDecryption The decrypted auction final uniform price
     */
    function callbackDecryptUniformPrice(uint256, uint256 resultDecryption) external onlyGateway {
        _clearUniformPrice = resultDecryption;
    }
}
