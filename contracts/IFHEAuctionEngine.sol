// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {euint16, euint256} from "fhevm/lib/TFHE.sol";

interface IFHEAuctionEngine {
    function canClaim() external view returns (bool);
    function canClaimByRank() external view returns (bool);
    function initialize(uint256 totalQuantity, uint8 tieBreakingRule) external;
    function close() external;
    function bidderId(address bidder) external view returns (uint16);
    function getBidderById(uint16 id) external view returns (address);
    function addBid(address bidder, euint256 inPrice, euint256 inQuantity) external;
    function removeBid(address bidder) external;
    function canDecryptUniformPrice() external view returns (bool);
    function getUniformPrice() external view returns (euint256);
    function validatedPriceAndWonQuantityById(uint16 id) external view returns (euint256, euint256);
    function totalQuantity() external view returns (uint256);
    function maximumPrice() external view returns (uint256);
    function getBidCount() external view returns (uint16);
    function getBidById(uint16 id) external view returns (euint256 price, euint256 quantity);
    function getBidByBidder(address bidder) external view returns (uint16 id, euint256 price, euint256 quantity);
    function getWonBidByRank(uint16 rank) external view returns (euint16 id, euint256 price, euint256 quantity);
    function isRankedWonQuantitiesComplete() external view returns (bool);
}
