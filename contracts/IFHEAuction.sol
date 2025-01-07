// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {IFHEAuctionBase} from "./IFHEAuctionBase.sol";

interface IFHEAuction is IFHEAuctionBase {
    function balanceOf(address bidder) external view returns (uint256);
}
