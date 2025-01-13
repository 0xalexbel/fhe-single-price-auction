// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {FHEAuctionEngineFactory} from "./FHEAuctionEngineFactory.sol";
import {FHEAuctionFactory} from "./FHEAuctionFactory.sol";

abstract contract FHEAuctionERC20Factory is FHEAuctionFactory {
    IERC20 private _paymentToken;

    constructor(IERC20 paymentToken_, FHEAuctionEngineFactory engineFactory_) FHEAuctionFactory(engineFactory_) {
        _paymentToken = paymentToken_;
    }

    function paymentToken() public view returns (address) {
        return address(_paymentToken);
    }

    function isNative() public view virtual override returns (bool) {
        return false;
    }

    function _computeAuctionAddress(
        bytes memory code_,
        bytes32 deploySalt_,
        uint256 minimumPaymentDeposit_,
        uint256 paymentPenalty_
    ) internal view virtual override returns (address) {
        bytes memory constructData = abi.encode(minimumPaymentDeposit_, paymentPenalty_, _paymentToken);
        bytes memory bytecode = abi.encodePacked(code_, constructData);
        return Create2.computeAddress(deploySalt_, keccak256(bytecode));
    }

    function _deployAuction(
        bytes memory code_,
        bytes32 deploySalt_,
        uint256 minimumPaymentDeposit_,
        uint256 paymentPenalty_
    ) internal virtual override returns (address) {
        bytes memory constructData = abi.encode(minimumPaymentDeposit_, paymentPenalty_, _paymentToken);
        bytes memory bytecode = abi.encodePacked(code_, constructData);
        return Create2.deploy(0, deploySalt_, bytecode);
    }
}
