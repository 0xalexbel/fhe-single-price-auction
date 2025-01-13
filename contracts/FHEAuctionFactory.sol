// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {FHEAuctionEngineFactory} from "./FHEAuctionEngineFactory.sol";
import {FHEAuctionBase} from "./FHEAuctionBase.sol";

abstract contract FHEAuctionFactory is Ownable2Step {
    FHEAuctionEngineFactory private _engineFactory;

    mapping(bytes32 => address) private _auctionDeployed;

    event AuctionDeployed(address indexed auction_, bytes32 indexed salt_, address beneficiary_, address auctionToken_);

    constructor(FHEAuctionEngineFactory engineFactory_) Ownable(msg.sender) {
        if (engineFactory_.owner() != msg.sender) {
            revert OwnableUnauthorizedAccount(_msgSender());
        }

        _engineFactory = engineFactory_;
    }

    function _hashSalt(bytes32 salt_, address beneficiary_, IERC20 auctionToken_) internal pure returns (bytes32) {
        return keccak256(abi.encode(salt_, beneficiary_, address(auctionToken_)));
    }

    function getAuction(bytes32 salt_, address beneficiary_, IERC20 auctionToken_) external view returns (address) {
        return _auctionDeployed[_hashSalt(salt_, beneficiary_, auctionToken_)];
    }

    function computeAuctionAddress(
        bytes32 salt_,
        address beneficiary_,
        IERC20 auctionToken_,
        uint256 minimumPaymentDeposit_,
        uint256 paymentPenalty_
    ) public view returns (address) {
        bytes32 deploySalt = _hashSalt(salt_, beneficiary_, auctionToken_);
        bytes memory code = _getCode();
        return _computeAuctionAddress(code, deploySalt, minimumPaymentDeposit_, paymentPenalty_);
    }

    function _getCode() internal view virtual returns (bytes memory);
    function isNative() public view virtual returns (bool);

    function _computeAuctionAddress(
        bytes memory code_,
        bytes32 deploySalt_,
        uint256 minimumPaymentDeposit_,
        uint256 paymentPenalty_
    ) internal view virtual returns (address) {
        bytes memory constructData = abi.encode(minimumPaymentDeposit_, paymentPenalty_);
        bytes memory bytecode = abi.encodePacked(code_, constructData);
        return Create2.computeAddress(deploySalt_, keccak256(bytecode));
    }

    function _deployAuction(
        bytes memory code_,
        bytes32 deploySalt_,
        uint256 minimumPaymentDeposit_,
        uint256 paymentPenalty_
    ) internal virtual returns (address) {
        bytes memory constructData = abi.encode(minimumPaymentDeposit_, paymentPenalty_);
        bytes memory bytecode = abi.encodePacked(code_, constructData);
        return Create2.deploy(0, deploySalt_, bytecode);
    }

    function createNewAuction(
        address auctionOwner_,
        bytes32 salt_,
        address beneficiary_,
        uint256 auctionQuantity_,
        IERC20 auctionToken_,
        uint8 tieBreakingRule_,
        uint256 minimumPaymentDeposit_,
        uint256 paymentPenalty_
    ) public onlyOwner returns (address) {
        address auctionAddr;
        {
            bytes32 deploySalt = _hashSalt(salt_, beneficiary_, auctionToken_);
            require(_auctionDeployed[deploySalt] == address(0), "auction already deployed");

            bytes memory code = _getCode();

            // Reentrancy
            address computedAuctionAddr =
                _computeAuctionAddress(code, deploySalt, minimumPaymentDeposit_, paymentPenalty_);
            _auctionDeployed[deploySalt] = computedAuctionAddr;

            auctionAddr = _deployAuction(code, deploySalt, minimumPaymentDeposit_, paymentPenalty_);

            // Debug
            require(auctionAddr == computedAuctionAddr, "Panic: auctionAddr != computedAuctionAddr");
        }

        address engine = _engineFactory.createNewEngine(auctionAddr);

        FHEAuctionBase auction = FHEAuctionBase(auctionAddr);

        auction.initialize(engine, beneficiary_, auctionToken_, auctionQuantity_, tieBreakingRule_);
        auction.transferOwnership(auctionOwner_);

        emit AuctionDeployed(auctionAddr, salt_, beneficiary_, address(auctionToken_));

        return auctionAddr;
    }
}
