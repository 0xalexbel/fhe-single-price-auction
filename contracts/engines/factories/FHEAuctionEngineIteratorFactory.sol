// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {FHEAuctionEngineIterator} from "../FHEAuctionEngineIterator.sol";
import {FHEAuctionEngine} from "../FHEAuctionEngine.sol";

contract FHEAuctionEngineIteratorFactory is Ownable2Step {
    constructor() Ownable(msg.sender) {}

    function createNewIterator(address initialOwner) public virtual returns (address) {
        FHEAuctionEngineIterator iterator = new FHEAuctionEngineIterator(initialOwner);
        return address(iterator);
    }
}
