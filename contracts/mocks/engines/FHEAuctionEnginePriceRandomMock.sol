// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {FHEAuctionEngineBaseMock} from "./FHEAuctionEngineBaseMock.sol";
import {FHEAuctionEnginePriceRandom} from "../../engines/FHEAuctionEnginePriceRandom.sol";

contract FHEAuctionEnginePriceRandomMock is FHEAuctionEngineBaseMock, FHEAuctionEnginePriceRandom {
    constructor(address auction_, address iterator_) FHEAuctionEnginePriceRandom(auction_, iterator_) {}
}
