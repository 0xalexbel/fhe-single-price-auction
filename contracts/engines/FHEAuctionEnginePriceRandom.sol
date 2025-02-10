// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {TFHE, euint256, euint16, ebool} from "fhevm/lib/TFHE.sol";
import {FHEAuctionEngine} from "./FHEAuctionEngine.sol";

contract FHEAuctionEnginePriceRandom is FHEAuctionEngine {
    constructor(address auction_, address iterator_)
        FHEAuctionEngine(auction_, uint8(TieBreakingRule.PriceRandom), iterator_)
    {}

    /**
     * @dev Returns the fixed FHE gas cost per iteration for executing {_rankFromIdxToIdx}.
     */
    function _rankFheGasCostPerIdx() internal pure virtual override returns (uint32) {
        return 1_104_000;
    }

    /**
     * @notice Performs a ranking operation from index `fromIdx` to index `toIdx` using the following comparison function:
     *
     * It returns `true` if the bid at `idx` is ranked higher, otherwise returns `false`.
     *
     * The comparison follows these rules:
     * - If `price(idx) > price(bid)`, return `true`
     * - If `price(idx) < price(bid)`, return `false`
     * - If `price(idx) == price(bid)`, return `true` if `rand(idx) < rand(bid)`, otherwise return `false`
     *
     * @notice A lower `id` indicates that the bid was placed earlier.
     *
     * @dev FHE Gas Cost per iteration:
     * - 1x gt(euint256, uint256)   : 1 x   231_000
     * - 1x eq(euint256, uint256)   : 1 x   100_000
     * - 1x lt(euint256, uint256)   : 1 x   231_000
     * - 1x and                     : 1 x    44_000
     * - 1x or                      : 1 x    44_000
     * - 4x select(euint256)        : 4 x    90_000
     * - 2x select(euint16)         : 2 x    47_000
     *
     * Total FHE Gas Cost per iteration : 1_104_000
     */
    function _rankFromIdxToIdx(uint16 fromIdx, uint16 toIdx, ABid memory cursor) internal virtual override {
        ABid memory newBid;
        for (uint16 idx = fromIdx; idx < toIdx; ++idx) {
            ABid storage b = _rankedBidAt(idx);
            euint256 p_i = b.price;
            euint256 q_i = b.quantity;
            euint16 id_i = b.id;
            euint256 rand_i = b.rand;

            ebool i_gt_c;
            {
                ebool p_gt = TFHE.gt(p_i, cursor.price);
                ebool p_eq = TFHE.eq(p_i, cursor.price);

                ebool rand_lt = TFHE.lt(rand_i, cursor.rand);

                i_gt_c = TFHE.or(p_gt, TFHE.and(p_eq, rand_lt));
            }

            newBid.price = TFHE.select(i_gt_c, p_i, cursor.price);
            newBid.quantity = TFHE.select(i_gt_c, q_i, cursor.quantity);
            newBid.id = TFHE.select(i_gt_c, id_i, cursor.id);
            newBid.rand = TFHE.select(i_gt_c, rand_i, cursor.rand);

            cursor.price = TFHE.select(i_gt_c, cursor.price, p_i);
            cursor.quantity = TFHE.select(i_gt_c, cursor.quantity, q_i);
            cursor.id = TFHE.select(i_gt_c, cursor.id, id_i);
            cursor.rand = TFHE.select(i_gt_c, cursor.rand, rand_i);

            _setRankedBidAt(idx, newBid);
        }
    }
}
