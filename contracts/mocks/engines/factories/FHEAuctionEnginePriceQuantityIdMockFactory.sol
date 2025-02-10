// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {FHEAuctionEngineIteratorFactory} from "../../../engines/factories/FHEAuctionEngineIteratorFactory.sol";
import {FHEAuctionEnginePriceQuantityIdFactory} from
    "../../../engines/factories/FHEAuctionEnginePriceQuantityIdFactory.sol";
import {FHEAuctionEnginePriceQuantityIdMock} from "../FHEAuctionEnginePriceQuantityIdMock.sol";

contract FHEAuctionEnginePriceQuantityIdMockFactory is FHEAuctionEnginePriceQuantityIdFactory {
    constructor(FHEAuctionEngineIteratorFactory iteratorFactory_)
        FHEAuctionEnginePriceQuantityIdFactory(iteratorFactory_)
    {}

    function _createNewEngine(address initialOwner, address iteratorAddr) internal override returns (address) {
        require(Ownable(iteratorAddr).owner() == initialOwner, "Wrong owner");
        FHEAuctionEnginePriceQuantityIdMock engine = new FHEAuctionEnginePriceQuantityIdMock(initialOwner, iteratorAddr);
        return address(engine);
    }
}
