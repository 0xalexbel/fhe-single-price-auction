// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import "./FHEAuctionEngine.sol";

contract FHEAuctionEngineFactory {
    function CreateNewEngine(address vault_) public returns (address) {
        FHEAuctionEngine engine = new FHEAuctionEngine(vault_);
        return address(engine);
    }
}
