// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {FHEAuctionFactory} from "./FHEAuctionFactory.sol";

abstract contract FHEAuctionNativeFactory is FHEAuctionFactory {
    function isNative() public view virtual override returns (bool) {
        return true;
    }
}
