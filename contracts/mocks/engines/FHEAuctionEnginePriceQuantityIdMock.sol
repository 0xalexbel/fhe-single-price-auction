// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {FHEAuctionEngineBaseMock} from "./FHEAuctionEngineBaseMock.sol";
import {FHEAuctionEnginePriceQuantityId} from "../../engines/FHEAuctionEnginePriceQuantityId.sol";

contract FHEAuctionEnginePriceQuantityIdMock is FHEAuctionEngineBaseMock, FHEAuctionEnginePriceQuantityId {
    constructor(address auction_, address iterator_) FHEAuctionEnginePriceQuantityId(auction_, iterator_) {}
}
