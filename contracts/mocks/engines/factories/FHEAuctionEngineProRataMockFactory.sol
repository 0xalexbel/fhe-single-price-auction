// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {FHEAuctionEngineProRataFactory} from "../../../engines/factories/FHEAuctionEngineProRataFactory.sol";
import {FHEAuctionEngineIteratorFactory} from "../../../engines/factories/FHEAuctionEngineIteratorFactory.sol";
import {FHEAuctionEngineProRataMock} from "../FHEAuctionEngineProRataMock.sol";

contract FHEAuctionEngineProRataMockFactory is FHEAuctionEngineProRataFactory {
    constructor(FHEAuctionEngineIteratorFactory iteratorFactory_) FHEAuctionEngineProRataFactory(iteratorFactory_) {}

    function _createNewEngine(address initialOwner, address iteratorAddr) internal override returns (address) {
        require(Ownable(iteratorAddr).owner() == initialOwner, "Wrong owner");
        FHEAuctionEngineProRataMock engine = new FHEAuctionEngineProRataMock(initialOwner, iteratorAddr);
        return address(engine);
    }
}
