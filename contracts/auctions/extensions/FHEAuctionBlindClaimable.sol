// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {IFHEAuctionEngine} from "../../engines/IFHEAuctionEngine.sol";
import {FHEAuctionBase} from "../FHEAuctionBase.sol";

/**
 * Experimental
 */
abstract contract FHEAuctionBlindClaimable is
    FHEAuctionBase
{
    uint16 private _blindClaimRequestCount;

    mapping(address bidder => uint16) private _bidderToBlindClaimRankPlusOne;

    /**
     * @notice Returns the total number of blind claim requests made so far.
     *
     * The number of remaining bidders who have not yet performed a blind claim can be calculated as:
     * `bidCount() - totalBlindClaimsRequested()`.
     */
    function totalBlindClaimsRequested() public view returns (uint16) {
        return _blindClaimRequestCount;
    }

    /**
     * @notice Returns `true` if the auction is ready for blind claim, `false` otherwise.
     *
     * @notice Conditions for a successful blind claim:
     * - The auction must be closed (ie. the auction is not accepting any additional bid).
     * - The engine must be ready for blind claim.
     * - The caller must be a registered bidder.
     */
    function canBlindClaim() public view whenClosed onlyBidder returns (bool) {
        return _canBlindClaim();
    }

    /**
     * @notice Returns `true` if the auction is ready for blind claim, `false` otherwise.
     * Internal function without access restriction.
     * This function is meant to be overriden to add extra conditions for a successfull claim.
     *
     * @notice Conditions for a successful claim:
     * - All ranked won quantities have been computed by the auction `_engine`.
     */
    function _canBlindClaim() internal view returns (bool) {
        return _canAwardPrizeByRank();
    }

    /**
     * @notice Allows a registered bidder to claim the auction prize on behalf of an anonymous bidder ranked at
     * position `rank`. The prize is awarded to the unidentified bidder at the final uniform price determined
     * by the auction. The caller acts as an intermediary and does not directly receive the prize.
     *
     * @dev Requirements:
     * - The caller must be a registered bidder.
     * - The auction must be closed.
     * - The auction engine must have finalized the computation of winning quantities for all bidders.
     * - The specified rank must not have already been claimed.
     *
     * @dev Each bidder is assigned a unique and constant claim rank. A bidder can claim the same rank multiple times.
     * If the bidder has not yet requested a blind claim, they are assigned the next available claim rank.
     */
    function blindClaim() external nonReentrant whenClosed {
        address bidder = msg.sender;

        uint16 blindRankPlusOne = _bidderToBlindClaimRankPlusOne[bidder];

        if (blindRankPlusOne == 0) {
            uint16 id = IFHEAuctionEngine(engine()).bidderId(bidder);
            if (id == 0) {
                revert BidderNotRegistered(bidder);
            }

            blindRankPlusOne = _blindClaimRequestCount + 1;
            _bidderToBlindClaimRankPlusOne[bidder] = blindRankPlusOne;
            _blindClaimRequestCount = blindRankPlusOne;
        }

        if (isPrizeAtRankAwarded(blindRankPlusOne - 1)) {
            return;
        }

        _awardPrizeAtRank(blindRankPlusOne - 1);
    }

    /**
     * @notice Returns `true` if the caller has already executed a blind claim, `false` otherwise.
     */
    function hasBlindClaimed() external view returns (bool) {
        return _bidderToBlindClaimRankPlusOne[msg.sender] != 0;
    }

    /**
     * @notice Returns `true` if the prize for the unidentified bidder assigned to the caller has been successfully
     * claimed via {blindClaim}, `false` otherwise.
     * @return completed `true` if the prize has been successfully claimed, `false` otherwise.
     */
    function blindClaimCompleted() external view returns (bool) {
        uint16 blindRankPlusOne = _bidderToBlindClaimRankPlusOne[msg.sender];
        if (blindRankPlusOne == 0) {
            return false;
        }
        return isPrizeAtRankAwarded(blindRankPlusOne - 1);
    }
}
