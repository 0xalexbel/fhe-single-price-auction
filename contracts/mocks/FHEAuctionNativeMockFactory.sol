// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {FHEAuctionFactory} from "../FHEAuctionFactory.sol";
import {FHEAuctionNativeFactory} from "../FHEAuctionNativeFactory.sol";
import {FHEAuctionEngineFactory} from "../FHEAuctionEngineFactory.sol";
import {FHEAuctionNativeMock} from "./FHEAuctionNativeMock.sol";

contract FHEAuctionNativeMockFactory is FHEAuctionNativeFactory {
    constructor(FHEAuctionEngineFactory engineFactory_) FHEAuctionFactory(engineFactory_) {
    }

    function _getCode() internal virtual override view returns(bytes memory) {
        return type(FHEAuctionNativeMock).creationCode;
    }
}
