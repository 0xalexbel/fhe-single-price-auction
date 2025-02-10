// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {FHEAuctionEngineIteratorFactory} from "../../../engines/factories/FHEAuctionEngineIteratorFactory.sol";
import {FHEAuctionEnginePriceIdFactory} from "../../../engines/factories/FHEAuctionEnginePriceIdFactory.sol";
import {FHEAuctionEnginePriceIdMock} from "../FHEAuctionEnginePriceIdMock.sol";

contract FHEAuctionEnginePriceIdMockFactory is FHEAuctionEnginePriceIdFactory {
    constructor(FHEAuctionEngineIteratorFactory iteratorFactory_) FHEAuctionEnginePriceIdFactory(iteratorFactory_) {}

    function _createNewEngine(address initialOwner, address iteratorAddr) internal override returns (address) {
        require(Ownable(iteratorAddr).owner() == initialOwner, "Wrong owner");
        FHEAuctionEnginePriceIdMock engine = new FHEAuctionEnginePriceIdMock(initialOwner, iteratorAddr);
        return address(engine);
    }
}
