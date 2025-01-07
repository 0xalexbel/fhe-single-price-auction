// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {TFHE, euint16, euint256} from  "fhevm/lib/TFHE.sol";
import {FHEAuctionEngine} from "../FHEAuctionEngine.sol";

import {console} from "hardhat/console.sol";

contract FHEAuctionEngineMock is FHEAuctionEngine {
    constructor(
        address vault_
    ) FHEAuctionEngine(vault_) {
    }

    function allowBids() external {
        uint16 n = getBidCount();
        for(uint16 i = 0; i < n; ++i) {
            // external call is better for coprocessorUtils.ts
            this.allowAccountToAccessBidWithIndex(i, msg.sender);
        }
    }

    function allowRankedBids() external {
        uint16 n = getBidCount();
        for(uint16 i = 0; i < n; ++i) {
            // external call is better for coprocessorUtils.ts
            this.allowAccountToAccessBidWithRank(i, msg.sender);
        }
    }

    function allowUniformPrice() external {
        // external call is better for coprocessorUtils.ts
        this.allowAccountToAccessUniformPrice(msg.sender);
    }

    function allowAccountToAccessUniformPrice(address account) public {
        euint256 pu = getUniformPrice();

        require(TFHE.isAllowed(pu, address(this)), "This is not allowed to access uniform price");

        TFHE.allow(pu, account);
    }

    function allowAccountToAccessBidWithRank(uint16 rank, address account) public {
        require(address(this) == msg.sender, "Sender is not this");
        (euint16 id, euint256 price, euint256 quantity) = getBidByRank(rank);

        require(TFHE.isAllowed(price, address(this)), "This is not allowed to access price");
        require(TFHE.isAllowed(quantity, address(this)), "This is not allowed to access quantity");
        require(TFHE.isAllowed(id, address(this)), "This is not allowed to access id");

        TFHE.allow(id, account);
        TFHE.allow(price, account);
        TFHE.allow(quantity, account);
    }

    function allowAccountToAccessBidWithIndex(uint16 idx, address account) public {
        require(address(this) == msg.sender, "Sender is not this");
        (, euint256 price, euint256 quantity) = getBidByIndex(idx);

        require(TFHE.isAllowed(price, address(this)), "This is not allowed to access price");
        require(TFHE.isAllowed(quantity, address(this)), "This is not allowed to access quantity");

        TFHE.allow(price, account);
        TFHE.allow(quantity, account);
    }
}
