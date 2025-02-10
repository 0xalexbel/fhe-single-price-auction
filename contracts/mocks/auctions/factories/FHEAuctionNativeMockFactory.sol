// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {FHEAuctionNativeFactory} from "../../../auctions/factories/FHEAuctionNativeFactory.sol";
import {FHEAuctionNativeMock} from "../FHEAuctionNativeMock.sol";

contract FHEAuctionNativeMockFactory is FHEAuctionNativeFactory {
    constructor(FHEAuctionFactoryDetails memory details_) FHEAuctionNativeFactory(details_) {}

    function _getCode() internal view virtual override returns (bytes memory) {
        return type(FHEAuctionNativeMock).creationCode;
    }
}
