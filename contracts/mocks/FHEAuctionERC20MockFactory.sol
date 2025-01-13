// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {FHEAuctionEngineFactory} from "../FHEAuctionEngineFactory.sol";
import {FHEAuctionERC20Factory} from "../FHEAuctionERC20Factory.sol";
import {FHEAuctionERC20Mock} from "./FHEAuctionERC20Mock.sol";

contract FHEAuctionERC20MockFactory is FHEAuctionERC20Factory {
    constructor(IERC20 paymentToken_, FHEAuctionEngineFactory engineFactory_) FHEAuctionERC20Factory(paymentToken_, engineFactory_) {
    }

    function _getCode() internal virtual override view returns(bytes memory) {
        return type(FHEAuctionERC20Mock).creationCode;
    }
}
