// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {FHEAuctionEngineFactory} from "../../engines/factories/FHEAuctionEngineFactory.sol";
import {FHEAuctionEngine} from "../../engines/FHEAuctionEngine.sol";

abstract contract FHEAuctionFactory is Ownable2Step {
    struct FHEAuctionFactoryDetails {
        FHEAuctionEngineFactory enginePriceIdFactory;
        FHEAuctionEngineFactory enginePriceQuantityIdFactory;
        FHEAuctionEngineFactory enginePriceRandomFactory;
        FHEAuctionEngineFactory engineProRataFactory;
    }

    mapping(uint8 => FHEAuctionEngineFactory) private _engineFactories;
    mapping(bytes32 => address) private _auctionDeployed;
    uint256 private _auctionDeployedCount;

    constructor(FHEAuctionFactoryDetails memory details_) Ownable(msg.sender) {
        if (address(details_.enginePriceIdFactory) != address(0)) {
            if (details_.enginePriceIdFactory.owner() != msg.sender) {
                revert OwnableUnauthorizedAccount(_msgSender());
            }
            _engineFactories[uint8(FHEAuctionEngine.TieBreakingRule.PriceId)] = details_.enginePriceIdFactory;
        }

        if (address(details_.enginePriceQuantityIdFactory) != address(0)) {
            if (details_.enginePriceQuantityIdFactory.owner() != msg.sender) {
                revert OwnableUnauthorizedAccount(_msgSender());
            }
            _engineFactories[uint8(FHEAuctionEngine.TieBreakingRule.PriceQuantityId)] =
                details_.enginePriceQuantityIdFactory;
        }

        if (address(details_.enginePriceRandomFactory) != address(0)) {
            if (details_.enginePriceRandomFactory.owner() != msg.sender) {
                revert OwnableUnauthorizedAccount(_msgSender());
            }
            _engineFactories[uint8(FHEAuctionEngine.TieBreakingRule.PriceRandom)] = details_.enginePriceRandomFactory;
        }

        if (address(details_.engineProRataFactory) != address(0)) {
            if (details_.engineProRataFactory.owner() != msg.sender) {
                revert OwnableUnauthorizedAccount(_msgSender());
            }
            _engineFactories[uint8(FHEAuctionEngine.TieBreakingRule.ProRata)] = details_.engineProRataFactory;
        }
    }

    function _getEngineFactory(uint8 tieBreakingRule) internal view returns (FHEAuctionEngineFactory) {
        return _engineFactories[tieBreakingRule];
    }

    function _getAuction(bytes32 deploySalt) internal view returns (address) {
        return _auctionDeployed[deploySalt];
    }

    function _setAuction(bytes32 deploySalt, address auctionAddr) internal {
        require(_auctionDeployed[deploySalt] == address(0), "Auction already deployed");
        _auctionDeployed[deploySalt] = auctionAddr;
        _auctionDeployedCount += 1;
    }

    function count() external view returns (uint256) {
        return _auctionDeployedCount;
    }

    function isNative() public view virtual returns (bool);
    function _getCode() internal view virtual returns (bytes memory);
}
