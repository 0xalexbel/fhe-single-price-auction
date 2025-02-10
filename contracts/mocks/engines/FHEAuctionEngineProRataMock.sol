// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {FHEAuctionEngineBaseMock} from "./FHEAuctionEngineBaseMock.sol";
import {FHEAuctionEngineProRata} from "../../engines/FHEAuctionEngineProRata.sol";

contract FHEAuctionEngineProRataMock is FHEAuctionEngineBaseMock, FHEAuctionEngineProRata {
    constructor(address auction_, address iterator_) FHEAuctionEngineProRata(auction_, iterator_) {}
}
