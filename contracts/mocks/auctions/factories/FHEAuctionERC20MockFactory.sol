// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {FHEAuctionERC20Factory} from "../../../auctions/factories/FHEAuctionERC20Factory.sol";
import {FHEAuctionERC20Mock} from "../FHEAuctionERC20Mock.sol";

contract FHEAuctionERC20MockFactory is FHEAuctionERC20Factory {
    constructor(FHEAuctionFactoryDetails memory details_)
        FHEAuctionERC20Factory(details_)
    {}

    function _getCode() internal view virtual override returns (bytes memory) {
        return type(FHEAuctionERC20Mock).creationCode;
    }
}
