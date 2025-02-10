// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {FHEAuctionEngineIteratorFactory} from "./FHEAuctionEngineIteratorFactory.sol";
import {FHEAuctionEngineFactory} from "./FHEAuctionEngineFactory.sol";
import {FHEAuctionEnginePriceQuantityId} from "../FHEAuctionEnginePriceQuantityId.sol";

contract FHEAuctionEnginePriceQuantityIdFactory is FHEAuctionEngineFactory {
    constructor(FHEAuctionEngineIteratorFactory iteratorFactory_) FHEAuctionEngineFactory(iteratorFactory_) {}

    function _createNewEngine(address initialOwner, address iteratorAddr) internal virtual override returns (address) {
        require(Ownable(iteratorAddr).owner() == initialOwner, "Wrong owner");
        FHEAuctionEnginePriceQuantityId engine = new FHEAuctionEnginePriceQuantityId(initialOwner, iteratorAddr);
        return address(engine);
    }
}
