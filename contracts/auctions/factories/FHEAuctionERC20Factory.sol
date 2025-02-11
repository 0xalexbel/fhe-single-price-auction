// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {FHEAuctionEngineFactory} from "../../engines/factories/FHEAuctionEngineFactory.sol";
import {FHEAuctionFactory} from "./FHEAuctionFactory.sol";
import {FHEAuctionERC20} from "../FHEAuctionERC20.sol";
import {FHEAuctionBase} from "../FHEAuctionBase.sol";

contract FHEAuctionERC20Factory is FHEAuctionFactory {
    event FHEAuctionERC20Deployed(
        address indexed auction_,
        bytes32 indexed salt_,
        address beneficiary_,
        address auctionToken_,
        address paymentToken_
    );

    constructor(FHEAuctionFactoryDetails memory details_) FHEAuctionFactory(details_) {}

    function isNative() public view virtual override returns (bool) {
        return false;
    }

    function getAuction(bytes32 salt_, address beneficiary_, address auctionToken_, address paymentToken_)
        external
        view
        returns (address)
    {
        return _getAuction(_hashSalt(salt_, beneficiary_, auctionToken_, paymentToken_));
    }

    function _getCode() internal view virtual override returns (bytes memory) {
        return type(FHEAuctionERC20).creationCode;
    }

    function _hashSalt(bytes32 salt_, address beneficiary_, address auctionToken_, address paymentToken_)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(salt_, beneficiary_, auctionToken_, paymentToken_));
    }

    function computeAuctionAddress(
        bytes32 salt_,
        address beneficiary_,
        address auctionToken_,
        address paymentToken_,
        uint256 minimumPaymentDeposit_,
        uint256 paymentPenalty_
    ) public view returns (address) {
        bytes32 deploySalt = _hashSalt(salt_, beneficiary_, auctionToken_, paymentToken_);
        bytes memory code = _getCode();
        bytes memory constructData = abi.encode(minimumPaymentDeposit_, paymentPenalty_, paymentToken_);
        bytes memory bytecode = abi.encodePacked(code, constructData);
        return Create2.computeAddress(deploySalt, keccak256(bytecode));
    }

    function createNewAuction(
        address auctionOwner_,
        bytes32 salt_,
        address beneficiary_,
        uint256 auctionQuantity_,
        address auctionToken_,
        uint16 maxBidCount_,
        uint8 tieBreakingRule_,
        address paymentToken_,
        uint256 minimumPaymentDeposit_,
        uint256 paymentPenalty_
    ) public returns (address) {
        address auctionAddr;
        {
            bytes32 deploySalt = _hashSalt(salt_, beneficiary_, auctionToken_, paymentToken_);

            require(_getAuction(deploySalt) == address(0), "auction already deployed");

            bytes memory code = _getCode();
            bytes memory constructData = abi.encode(minimumPaymentDeposit_, paymentPenalty_, paymentToken_);
            bytes memory bytecode = abi.encodePacked(code, constructData);

            // Reentrancy
            address computedAuctionAddr = Create2.computeAddress(deploySalt, keccak256(bytecode));
            _setAuction(deploySalt, computedAuctionAddr);

            auctionAddr = Create2.deploy(0, deploySalt, bytecode);

            // Debug
            require(auctionAddr == computedAuctionAddr, "Panic: auctionAddr != computedAuctionAddr");
        }

        address engine = _getEngineFactory(tieBreakingRule_).createNewEngine(auctionAddr);

        FHEAuctionBase auction = FHEAuctionBase(auctionAddr);

        auction.initialize(engine, beneficiary_, IERC20(auctionToken_), auctionQuantity_, maxBidCount_);
        auction.transferOwnership(auctionOwner_);

        emit FHEAuctionERC20Deployed(auctionAddr, salt_, beneficiary_, auctionToken_, paymentToken_);

        return auctionAddr;
    }
}
