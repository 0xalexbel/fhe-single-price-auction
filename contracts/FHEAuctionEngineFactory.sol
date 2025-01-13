// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import "./FHEAuctionEngine.sol";

contract FHEAuctionEngineFactory is Ownable2Step {
    constructor() Ownable(msg.sender) {}

    function createNewEngine(address auction) public returns (address) {
        FHEAuctionEngine engine = new FHEAuctionEngine(auction);
        return address(engine);
    }
}
