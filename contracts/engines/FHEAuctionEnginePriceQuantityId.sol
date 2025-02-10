// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {TFHE, euint256, euint16, ebool} from "fhevm/lib/TFHE.sol";
import {FHEAuctionEngine} from "./FHEAuctionEngine.sol";

contract FHEAuctionEnginePriceQuantityId is FHEAuctionEngine {
    constructor(address auction_, address iterator_)
        FHEAuctionEngine(auction_, uint8(TieBreakingRule.PriceQuantityId), iterator_)
    {}

    /**
     * @dev Returns the fixed FHE gas cost per iteration for executing {_rankFromIdxToIdx}.
     */
    function _rankFheGasCostPerIdx() internal pure virtual override returns (uint32) {
        return 1_397_000;
    }

    /**
     * @notice Performs a ranking operation from index `fromIdx` to index `toIdx` using the following comparison function:
     *
     * It returns `true` if the bid at `idx` is ranked higher, otherwise returns `false`.
     *
     * The comparison follows these rules:
     * - If `price(idx) > price(bid)`, return `true`
     * - If `price(idx) < price(bid)`, return `false`
     * - If `price(idx) == price(bid)`,
     *      . If `quantity(idx) > quantity(bid)`, return `true`
     *      . If `quantity(idx) < quantity(bid)`, return `false`
     *      . If `quantity(idx) == quantity(bid)`, return `true` if `id(idx) < id(bid)`, otherwise return `false`
     *
     * @notice A lower `id` indicates that the bid was placed earlier.
     *
     * @dev FHE Gas Cost per iteration:
     * - 2x gt(euint256, uint256)   : 2 x   231_000
     * - 2x eq(euint256, uint256)   : 2 x   100_000
     * - 1x lt(euint16, uint16)     : 1 x   105_000
     * - 2x and                     : 2 x    44_000
     * - 2x or                      : 2 x    44_000
     * - 4x select(euint256)        : 4 x    90_000
     * - 2x select(euint16)         : 2 x    47_000
     *
     * Total FHE Gas Cost per iteration : 1_397_000
     */
    function _rankFromIdxToIdx(uint16 fromIdx, uint16 toIdx, ABid memory cursor) internal virtual override {
        ABid memory newBid;
        for (uint16 idx = fromIdx; idx < toIdx; ++idx) {
            ABid storage b = _rankedBidAt(idx);
            euint256 p_i = b.price;
            euint256 q_i = b.quantity;
            euint16 id_i = b.id;

            ebool i_gt_c;
            {
                ebool p_gt = TFHE.gt(p_i, cursor.price);
                ebool p_eq = TFHE.eq(p_i, cursor.price);

                ebool q_gt = TFHE.gt(q_i, cursor.quantity);
                ebool q_eq = TFHE.eq(q_i, cursor.quantity);

                ebool id_lt = TFHE.lt(id_i, cursor.id);

                i_gt_c = TFHE.or(p_gt, TFHE.and(p_eq, TFHE.or(q_gt, TFHE.and(q_eq, id_lt))));
            }

            newBid.price = TFHE.select(i_gt_c, p_i, cursor.price);
            newBid.quantity = TFHE.select(i_gt_c, q_i, cursor.quantity);
            newBid.id = TFHE.select(i_gt_c, id_i, cursor.id);

            cursor.price = TFHE.select(i_gt_c, cursor.price, p_i);
            cursor.quantity = TFHE.select(i_gt_c, cursor.quantity, q_i);
            cursor.id = TFHE.select(i_gt_c, cursor.id, id_i);

            _setRankedBidAt(idx, newBid);
        }
    }
}
