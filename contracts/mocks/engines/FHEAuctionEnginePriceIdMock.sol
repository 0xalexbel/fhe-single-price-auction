// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {FHEAuctionEngineBaseMock} from "./FHEAuctionEngineBaseMock.sol";
import {FHEAuctionEnginePriceId} from "../../engines/FHEAuctionEnginePriceId.sol";

contract FHEAuctionEnginePriceIdMock is FHEAuctionEngineBaseMock, FHEAuctionEnginePriceId {
    constructor(address auction_, address iterator_) FHEAuctionEnginePriceId(auction_, iterator_) {}
}
