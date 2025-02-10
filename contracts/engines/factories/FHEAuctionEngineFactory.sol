// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {FHEAuctionEngineIterator} from "../FHEAuctionEngineIterator.sol";
import {FHEAuctionEngineIteratorFactory} from "./FHEAuctionEngineIteratorFactory.sol";

abstract contract FHEAuctionEngineFactory is Ownable2Step {
    FHEAuctionEngineIteratorFactory _iteratorFactory;

    constructor(FHEAuctionEngineIteratorFactory iteratorFactory_) Ownable(msg.sender) {
        _iteratorFactory = iteratorFactory_;
    }

    /**
     * @dev Deploys a new FHEAuctionEngine contract.
     * - engine.owner() == `auctionAddr`
     */
    function createNewEngine(address auctionAddr) public returns (address) {
        // Constructor requirements:
        // - iterator.owner() == engine.owner()
        // Runtime requirements:
        // - iterator.owner() == address(engine)
        // - engine.owner() == auctionAddr
        address iteratorAddr = _iteratorFactory.createNewIterator(address(this));
        address engineAddr = _createNewEngine(address(this), iteratorAddr);
        Ownable(iteratorAddr).transferOwnership(engineAddr);
        Ownable(engineAddr).transferOwnership(auctionAddr);
        return engineAddr;
    }

    /**
     * @dev Abstract function, should be implemented by derived contracts
     */
    function _createNewEngine(address auction_, address iterator_) internal virtual returns (address);
}
