// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {FHEAuctionEngineIteratorFactory} from "../../../engines/factories/FHEAuctionEngineIteratorFactory.sol";
import {FHEAuctionEnginePriceRandomFactory} from "../../../engines/factories/FHEAuctionEnginePriceRandomFactory.sol";
import {FHEAuctionEnginePriceRandomMock} from "../FHEAuctionEnginePriceRandomMock.sol";

contract FHEAuctionEnginePriceRandomMockFactory is FHEAuctionEnginePriceRandomFactory {
    constructor(FHEAuctionEngineIteratorFactory iteratorFactory_)
        FHEAuctionEnginePriceRandomFactory(iteratorFactory_)
    {}

    function _createNewEngine(address initialOwner, address iteratorAddr) internal override returns (address) {
        require(Ownable(iteratorAddr).owner() == initialOwner, "Wrong owner");
        FHEAuctionEnginePriceRandomMock engine = new FHEAuctionEnginePriceRandomMock(initialOwner, iteratorAddr);
        return address(engine);
    }
}
