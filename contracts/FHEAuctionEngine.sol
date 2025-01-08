// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import "fhevm/lib/TFHE.sol";
import "fhevm/config/ZamaFHEVMConfig.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IFHEAuctionEngine} from "./IFHEAuctionEngine.sol";
import {IFHEAuction} from "./IFHEAuction.sol";

import {console} from "hardhat/console.sol";

/**
 * @notice ## Algorithm for bid validation and ranking.
 *
 * ### Step 1: Bid validation. O(N)
 *
 * The first step is to sanitize the list of registered bids by evaluating each one individually. If a bid fails to meet
 * the engine's validation criteria, it is marked as invalid, with both the price and quantity set to zero
 * (i.e., `price = 0` and `quantity = 0`).
 *
 * Registered bids are indexed starting from `1` up to `bidCount`. Therefore, an index of `0` indicates that no bid
 * exists. For each valid bid at index `i` (where `1 <= i <= bidCount`), the following two conditions must always hold:
 *
 * 1. `0 < price(i) <= Maximum Price`
 * 2. `0 < quantity(i) <= Total Quantity`
 *
 * ### Step 2: Bid ranking. O(N^2)
 *
 * - In this step, we determine the price and quantity of the bid ranked at position `k`, where `k` ranges from `0` to
 * `bidCount - 1`. The bid ranked at position `0` is the highest-ranked bid, which is determined based on the selected
 * ranking criteria. The ranking is strict, meaning no two bids can share the same rank. To achieve this, the bid
 * set is provided with a strict order relation, ensuring a clear distinction between each bid's position in the ranking.
 *
 * - The final list of ranked bids is constructed through an iterative process. Specifically, the bid at index `k+1` is
 * inserted into an existing list of ranked bids of length `k`, resulting in a new list of length `k+1`. During each
 * insertion, the bid is placed in its correct position, ensuring that the relationship `Bid(k) > Bid(k+1)` holds true
 * according to the selected comparison criteria.
 *
 * - The comparison function used to rank bids depends on two factors: the bid price and the auction engine's specified
 * tie-breaking rule. This ensures that bids are ranked in a consistent and predictable manner.
 *
 * - Finally, the computational complexity of this bid ranking operation is `N(N-1)/2 = O(N^2)`, where `N` represents the
 * total number of bids. This complexity arises from the need to perform pairwise comparisons and insert each bid into the
 * correct position within the sorted list.
 *
 * ### Step 3: Ranked bid won quantity and uniform price calculation. O(N)
 *
 * - In the third step, we determine the final quantity for the bid ranked at position `k`, where `k` ranges from `0` to
 * `bidCount - 1`, as well as the auction's final uniform price. A winning bid will have a strictly positive quantity,
 * while a losing bid will have a quantity of zero.
 *
 * - Since the bids are ranked in strict order, the quantity for each winning bid can be determined deterministically,
 * without the need for tie-breaking.
 *
 * - The uniform price is calculated as the price of the lowest winning bid.
 *
 * - The computational complexity O(N), linear in the number of bids.
 *
 * ### Step 4: Inverting ranking to index vector. O(N)
 *
 * - In this final step, we invert the ranking of the bids to produce an index vector, where the position in the vector
 * corresponds to the original index of the bid in the ranked list.
 */
contract FHEAuctionEngine is SepoliaZamaFHEVMConfig, Ownable, IFHEAuctionEngine {
    uint256 public constant MAX_UINT256 = 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff;

    /**
     * @notice Return code, iterations were completed but the computation step is not finished
     */
    uint8 public constant S_NOT_FINISHED = 0;
    /**
     * @notice Return code, iterations were completed and the computation step is finished
     */
    uint8 public constant S_FINISHED = 1;
    /**
     * @notice Return code, iterations could not be completed due to insufficient gas.
     */
    uint8 public constant E_NOT_ENOUGH_GAS = 2;

    uint256 public constant MIN_GAS_PER_BV_CYCLE = 165_000;
    uint256 public constant MIN_GAS_PER_RB_CYCLE = 420_000;
    uint256 public constant MIN_GAS_PER_RWQ_CYCLE = 250_000;
    uint256 public constant MIN_GAS_PER_WQ_CYCLE = 160_000;

    euint256 constant DUMMY_EUINT256_MEMORY = euint256.wrap(uint32(0xdeadbeef));
    euint16 constant DUMMY_EUINT16_MEMORY = euint16.wrap(uint32(0xdeadbeef));

    enum TieBreakingRule {
        Random,
        ProRata,
        PriceId,
        PriceQuantityId
    }

    struct ABid {
        euint256 price;
        euint256 quantity;
        euint256 rand;
        euint16 id;
    }

    uint256 private _totalQuantity;
    TieBreakingRule private _tieBreakingRule;
    bool private _auctionIsClosed;

    uint16 private _bidCount;
    uint16 private _nextId;

    // 1 <= id < _nextId
    mapping(address bidder => uint16 id) private _bidderToId;
    mapping(uint16 id => address bidder) private _idToBidder;

    // 1 <= idxPlusOne <= _bidCount
    mapping(uint16 idxPlusOne => uint16 id) private _indexPlusOneToId;
    mapping(uint16 id => uint16 idxPlusOne) private _idToIndexPlusOne;

    // 1 <= id < _nextId
    mapping(uint16 id => ABid bid) private _idToBid;

    euint256 private _cumulativeQuantity;
    euint256 private _uniformPrice;

    /// Step 1: Bid validation. O(N)
    //  ============================

    ///@dev Index from which the computation of step #1 should resume.
    uint16 _resumeIdxBV;

    // Step 2: Bid ranking. O(N^2)
    // ===========================

    ///@dev Step #2 progress value.
    uint32 private _progressRB;

    ///@dev Index from which the computation of step #2 should resume.
    uint16 private _resumeIdxRB;

    ///@dev Temporary saved did data required when the computation of step #2 should resume.
    ABid private _cursorRB;

    ///@dev Total number of ranked bids that have been computed so far.
    uint16 private _rankedBidCount;

    ///@dev Array of bids sorted by rank order, where entry k contains the bid placed by bidder ranked at position k.
    ABid[] private _rankedBids;

    // Step 3: Ranked bid won quantity and uniform price calculation. O(N)
    // ===================================================================

    ///@dev Index from which the computation of step #3 should resume.
    uint16 _resumeIdxRWQ;

    ///@dev Array of final won quantities sorted by rank order, where entry k contains the won quantity for bidder
    /// ranked at position k.
    euint256[] private _rankedWonQuantities;

    // Step 4: Inverting ranking to index vector. O(N)
    // ===============================================

    ///@dev Index of the bidder whose final won quantity is being computed
    uint16 private _idxWQ;

    ///@dev Index from which the computation of the final won quantity should resume
    uint16 private _resumeIdxWQ;

    ///@dev Current computed final won quantity for the bidder at index `_idxWQ`
    euint256 private _quantityWQ;

    ///@dev Array of final won quantities, where entry k contains the won quantity for bidder with index = k + 1
    euint256[] private _wonQuantities;

    error ExpectedNotClosed();
    error ExpectedClosed();
    error IndexOutOfBounds(uint16 idx, uint16 count);
    error RankOutOfBounds(uint16 rank, uint16 rankCount);
    error InvalidId(uint16 id);
    error BidderAlreadyRegistered(address bidder);
    error Step1BidsValidationNotCompleted();
    error Step2RankedBidsNotCompleted();
    error Step3RankedWonQuantitiesNotCompleted();

    /**
     * @dev Ensures the auction engine not closed before executing the function.
     */
    modifier whenNotClosed() {
        if (_auctionIsClosed) revert ExpectedNotClosed();
        _;
    }

    /**
     * @dev Ensures the auction engine is closed before executing the function.
     */
    modifier whenClosed() {
        if (!_auctionIsClosed) revert ExpectedClosed();
        _;
    }

    /**
     * @param auction_ The address of the `FHEAuctionBase` contract that owns this auction engine.
     */
    constructor(address auction_) Ownable(auction_) {
        _cumulativeQuantity = TFHE.asEuint256(0);
        _uniformPrice = TFHE.asEuint256(0);

        TFHE.allowThis(_cumulativeQuantity);
        TFHE.allowThis(_uniformPrice);

        // A bit counter intuitive.
        // Mainly to ensure that computation iterations have a constant gas cost
        _cursorRB.price = DUMMY_EUINT256_MEMORY;
        _cursorRB.quantity = DUMMY_EUINT256_MEMORY;
        _cursorRB.id = DUMMY_EUINT16_MEMORY;
        _resumeIdxBV = 0;
        _resumeIdxRB = uint16(0xdead);
        _progressRB = uint32(0);
        _quantityWQ = TFHE.asEuint256(0);
        _nextId = 1;

        TFHE.allowThis(_quantityWQ);
    }

    /**
     * @notice Initializes the auction engine with a specified quantity of items and a tie-breaking rule.
     * The `FHEAuctionEngine` contract is intended for internal use by its owner and is not designed to be
     * used by other contracts. It does not include protections against reentrancy or multiple initializations.
     *
     * @dev Requirements:
     * - The caller must be the engine owner (a contract of type `FHEAuctionBase`).
     * - The engine must not be in a closed state.
     *
     * @param totalQuantity_ The total quantity of items to be auctioned.
     * @param tieBreakingRule_ The tie-breaking rule used by the auction engine to resolve ties (only `PriceId` is supported).
     */
    function initialize(uint256 totalQuantity_, uint8 tieBreakingRule_) external onlyOwner whenNotClosed {
        require(tieBreakingRule_ == uint8(TieBreakingRule.PriceId), "Only PriceId is supported!");
        _tieBreakingRule = TieBreakingRule(tieBreakingRule_);
        _totalQuantity = totalQuantity_;
    }

    /**
     * @notice Returns total quantity of items to be auctioned.
     */
    function totalQuantity() external view returns (uint256) {
        return _totalQuantity;
    }

    /**
     * @notice Returns the maximum allowable price for each bid.
     * This value ensures that subsequent TFHE arithmetic operations will not overflow.
     */
    function maximumPrice() public view returns (uint256) {
        return MAX_UINT256 / _totalQuantity;
    }

    /**
     * @notice Returns the tie-breaking rule used to resolve winning ties.
     */
    function tieBreakingRule() external view returns (uint8) {
        return uint8(_tieBreakingRule);
    }

    /**
     * @notice Returns the total number of bids.
     */
    function getBidCount() public view returns (uint16) {
        return _bidCount;
    }

    /**
     * @notice Retrieves the bid associated with the specified bid ID.
     * @param id The ID of the bid to retrieve.
     * @return price The encrypted price of the bid.
     * @return quantity The encrypted quantity of the bid.
     */
    function getBidById(uint16 id) public view returns (euint256 price, euint256 quantity) {
        price = _idToBid[id].price;
        quantity = _idToBid[id].quantity;
    }

    /**
     * @notice Retrieves the bid associated with the specified bid index. Reverts if the index is out of bounds.
     * @param index The zero-based index of the bid to retrieve.
     * @return id The encrypted ID of the bid.
     * @return price The encrypted price of the bid.
     * @return quantity The encrypted quantity of the bid.
     */
    function getBidByIndex(uint16 index) public view returns (uint16 id, euint256 price, euint256 quantity) {
        if (index >= _bidCount) {
            revert IndexOutOfBounds(index, _bidCount);
        }

        id = _indexPlusOneToId[index + 1];
        price = _idToBid[id].price;
        quantity = _idToBid[id].quantity;
    }

    /**
     * @notice Retrieves the bid associated with the specified bidder address.
     * @param bidder The address of the bidder whose bid is being retrieved.
     * @return id The encrypted ID of the bid.
     * @return price The encrypted price of the bid.
     * @return quantity The encrypted quantity of the bid.
     */
    function getBidByBidder(address bidder) public view returns (uint16 id, euint256 price, euint256 quantity) {
        id = _bidderToId[bidder];
        price = _idToBid[id].price;
        quantity = _idToBid[id].quantity;
    }

    /**
     * @notice Returns the bid ranked at the specified position `rank`.
     * The bid at rank `0` is the highest-ranked (winning) bid. Reverts if `rank` is out of bounds.
     * @param rank The rank position of the bid to retrieve.
     * @return id The encrypted ID of the bid.
     * @return price The encrypted price of the bid.
     * @return quantity The encrypted quantity of the bid.
     */
    function getBidByRank(uint16 rank) public view returns (euint16 id, euint256 price, euint256 quantity) {
        if (rank < _rankedBidCount) {
            revert RankOutOfBounds(rank, _rankedBidCount);
        }

        id = _rankedBids[rank].id;
        price = _rankedBids[rank].price;
        quantity = _rankedBids[rank].quantity;
    }

    /**
     * @notice Returns `true` if the uniform price is ready for decryption.
     */
    function canDecryptUniformPrice() external view returns (bool) {
        return isRankedWonQuantitiesComplete();
    }

    /**
     * @notice Returns the encrypted uniform price if computations are complete;
     * otherwise, returns zero (uninitialized `euint256`).
     */
    function getUniformPrice() public view returns (euint256 price) {
        if (isRankedWonQuantitiesComplete()) {
            // Debug
            require(TFHE.isAllowed(_uniformPrice, owner()), "Panic: TFHE.isAllowed(_uniformPrice, owner()) == false");
            price = _uniformPrice;
        }
    }

    /**
     * @notice Returns `true` if all auction engine computations are complete,
     * allowing bidders to claim their auction prizes.
     */
    function canClaim() external view returns (bool) {
        return isWonQuantitiesComplete();
    }

    /**
     * @notice Returns the validated price and the encrypted won quantity associated with the bid identified by `id`.
     *
     * @notice Requirements:
     * - The computation of all won quantities must be complete (step 4).
     * - `id` must be a valid ID.
     *
     * @param id The bid ID.
     * @return validatedPrice The encrypted validated price of the bid.
     * @return wonQuantity The encrypted won quantity of the bid.
     */
    function validatedPriceAndWonQuantityById(uint16 id)
        external
        view
        returns (euint256 validatedPrice, euint256 wonQuantity)
    {
        if (isWonQuantitiesComplete()) {
            uint16 idxPlusOne = _idToIndexPlusOne[id];

            if (idxPlusOne == 0 || idxPlusOne > _bidCount) {
                revert InvalidId(id);
            }

            // Debug
            require(idxPlusOne > 0, "Panic: idxPlusOne == 0");
            // Debug
            require(idxPlusOne <= _bidCount, "Panic: idxPlusOne > _bidCount");

            validatedPrice = _idToBid[id].price;
            wonQuantity = _wonQuantities[idxPlusOne - 1];

            // Debug
            require(TFHE.isInitialized(wonQuantity), "Panic: TFHE.isInitialized(wonQuantity) == false");
            // Debug
            require(TFHE.isAllowed(wonQuantity, owner()), "Panic: TFHE.isAllowed(wonQuantity, owner()) == false");
        }
    }

    /**
     * @notice Returns the bid ID associated with the specified `bidder` address.
     */
    function bidderId(address bidder) external view returns (uint16) {
        return _bidderToId[bidder];
    }

    /**
     * @notice Removes a bidder's bid from the list of bids
     *
     * @notice Requirements:
     * - The caller must be the engine owner.
     * - The auction engine should not be closed. (ie still accepting new bids)
     */
    function removeBid(address bidder) external onlyOwner whenNotClosed {
        uint16 id = _bidderToId[bidder];
        if (id == 0) {
            return;
        }

        // Debug
        require(_bidCount > 0, "Panic: _bidCount == 0");

        uint16 idxPlusOne = _idToIndexPlusOne[id];

        // Debug
        require(idxPlusOne > 0, "Panic: idxPlusOne == 0");

        // remove bidder address
        _bidderToId[bidder] = 0;
        _idToBidder[id] = address(0);

        // swap id with last id
        if (idxPlusOne < _bidCount) {
            uint16 lastId = _indexPlusOneToId[_bidCount];

            // Debug only
            require(lastId > 0, "Panic: lastId == 0");

            _indexPlusOneToId[idxPlusOne] = lastId;
            _idToIndexPlusOne[lastId] = idxPlusOne;
        }

        // remove id
        _indexPlusOneToId[_bidCount] = 0;
        _idToIndexPlusOne[id] = 0;
        _idToBid[id] =
            ABid({price: euint256.wrap(0), quantity: euint256.wrap(0), id: euint16.wrap(0), rand: euint256.wrap(0)});

        _bidCount--;
    }

    /**
     * @notice Mark the auction engine as closed. When the engine is closed, it can no more accept new bids.
     *
     * @notice Requirements:
     * - The caller must be the engine owner.
     * - The auction engine should not already be closed.
     */
    function close() external onlyOwner whenNotClosed {
        _auctionIsClosed = true;
    }

    /**
     * @notice Adds a new bid to the list of bids.
     *
     * @dev Requirements:
     * - The caller must be the engine owner.
     * - The auction engine must not be closed.
     *
     * @param bidder The address of the bidder placing the new bid.
     * @param ePrice The encrypted price of the bid.
     * @param eQuantity The encrypted quantity of the bid.
     */
    function addBid(address bidder, euint256 ePrice, euint256 eQuantity) external onlyOwner whenNotClosed {
        if (_bidderToId[bidder] != 0) {
            revert BidderAlreadyRegistered(bidder);
        }

        uint16 nextId = _nextId;
        _nextId = nextId + 1;

        uint16 nextIdxPlusOne = _bidCount + 1;
        _bidCount = nextIdxPlusOne;

        ebool priceTooHigh = TFHE.gt(ePrice, maximumPrice());
        ePrice = TFHE.select(priceTooHigh, TFHE.asEuint256(0), ePrice);
        eQuantity = TFHE.min(eQuantity, _totalQuantity);

        ebool ePriceIsZero = TFHE.eq(ePrice, TFHE.asEuint256(0));
        ebool eQuantityIsZero = TFHE.eq(eQuantity, TFHE.asEuint256(0));

        ePrice = TFHE.select(eQuantityIsZero, TFHE.asEuint256(0), ePrice);
        eQuantity = TFHE.select(ePriceIsZero, TFHE.asEuint256(0), eQuantity);

        euint256 eRand = euint256.wrap(0);
        euint16 eId = TFHE.asEuint16(nextId);

        if (_tieBreakingRule == TieBreakingRule.Random) {
            eRand = TFHE.randEuint256();
            TFHE.allowThis(eRand);
        }

        TFHE.allowThis(ePrice);
        TFHE.allowThis(eQuantity);
        TFHE.allowThis(eId);

        _indexPlusOneToId[nextIdxPlusOne] = nextId;
        _idToIndexPlusOne[nextId] = nextIdxPlusOne;

        _bidderToId[bidder] = nextId;
        _idToBidder[nextId] = bidder;

        _idToBid[nextId] = ABid({price: ePrice, quantity: eQuantity, rand: eRand, id: eId});

        // Bidder pays for memory allocation
        ABid memory _emptySortedBid;
        _emptySortedBid.price = DUMMY_EUINT256_MEMORY;
        _emptySortedBid.quantity = DUMMY_EUINT256_MEMORY;
        _emptySortedBid.id = eId;

        _rankedBids.push(_emptySortedBid);
        _rankedWonQuantities.push(DUMMY_EUINT256_MEMORY);
        _wonQuantities.push(DUMMY_EUINT256_MEMORY);
    }

    // ====================================================================== //
    //
    //                    ⭐️ Step 1/4: Bid Validation ⭐️
    //
    // ====================================================================== //

    /**
     * @notice Returns `true` if step #1 is complete, `false` otherwise. (Bid Validation)
     * @dev Gas cost ~= 4_000
     */
    function isBidsValidationComplete() public view returns (bool) {
        return _resumeIdxBV == _bidCount && _bidCount > 0;
    }

    /**
     * @notice Returns the step #1 progress as a value between `0` and {xref-bidsValidationProgressMax}. (Bid Validation)
     */
    function bidsValidationProgress() external view returns (uint16) {
        return _resumeIdxBV;
    }

    /**
     * @notice Returns the maximum possible progress value for the step #1 (Bid Validation).
     */
    function bidsValidationProgressMax() external view returns (uint16) {
        return _bidCount;
    }

    // Step 1
    function iterBidsValidation(uint16 chunckSize) external whenClosed returns (uint8) {
        if (gasleft() < MIN_GAS_PER_BV_CYCLE) {
            return E_NOT_ENOUGH_GAS;
        }

        // Gas cost ~= 2_400
        uint16 maxIdx = _bidCount;
        uint16 resumeIdx = _resumeIdxBV;

        // Debug
        require(resumeIdx <= maxIdx, "Panic: from > max");

        if (resumeIdx == maxIdx) {
            return S_FINISHED;
        }

        uint16 toIdx = resumeIdx + chunckSize;
        toIdx = (toIdx > maxIdx) ? maxIdx : toIdx;

        if (resumeIdx == toIdx) {
            return S_NOT_FINISHED;
        }

        euint256 ePrice;
        euint256 eQuantity;

        IFHEAuction auction = IFHEAuction(owner());

        // From start to beginning of the loop : Gas cost ~= 2_600
        // 1x loop iter ~= 153_000 gas
        // After loop ~= 3_000 gas
        for (uint16 idx = resumeIdx; idx < toIdx; ++idx) {
            uint16 bidId = _indexPlusOneToId[idx + 1];

            // Debug
            require(bidId > 0, "Panic: bidId == 0");

            ePrice = _idToBid[bidId].price;
            eQuantity = _idToBid[bidId].quantity;

            // Cannot overflow
            euint256 minBalance = TFHE.mul(ePrice, eQuantity);

            ebool enoughBalance = TFHE.le(minBalance, auction.balanceOf(_idToBidder[bidId]));

            ePrice = TFHE.select(enoughBalance, ePrice, TFHE.asEuint256(0));
            eQuantity = TFHE.select(enoughBalance, eQuantity, TFHE.asEuint256(0));

            _idToBid[bidId].price = ePrice;
            _idToBid[bidId].quantity = eQuantity;

            TFHE.allowThis(ePrice);
            TFHE.allowThis(eQuantity);
            TFHE.allow(ePrice, address(auction));
            TFHE.allow(eQuantity, address(auction));

            if (gasleft() < MIN_GAS_PER_BV_CYCLE) {
                // Not enough gas to iter one more time and be sure to complete
                // the function without beeing out-of-gas
                break;
            }
        }

        // Storage gas cost ~= 3_000
        if (resumeIdx != toIdx) {
            _resumeIdxBV = toIdx;
        }

        return (toIdx == maxIdx) ? S_FINISHED : S_NOT_FINISHED;
    }

    // ====================================================================== //
    //
    //                ⭐️ Step 2/4: Sort Bids by Rank Order ⭐️
    //
    // ====================================================================== //

    /**
     * @notice Returns `true` if step #2 is complete, `false` otherwise. (Bid Ranking)
     * @dev Gas cost ~= 4_000
     */
    function isRankedBidsComplete() public view returns (bool) {
        return _rankedBidCount == _bidCount && _bidCount > 0;
    }

    /**
     * @notice Returns the step #2 progress as a value between `0` and {xref-rankedBidsProgressMax}. (Bid Ranking)
     */
    function rankedBidsProgress() external view returns (uint32) {
        return _progressRB;
    }

    /**
     * @notice Returns the maximum possible progress value for the step #2 (Bid Ranking).
     */
    function rankedBidsProgressMax() external view returns (uint32) {
        return _rankedBidsProgressMax(_bidCount);
    }

    /**
     * @notice Returns the maximum possible progress value for the step #2 given a number `n` of bids. (Bid Ranking)
     * @param n the number of bids
     */
    function _rankedBidsProgressMax(uint16 n) private pure returns (uint32) {
        return (n < 3) ? 1 : n * (n - 1) / 2;
    }

    function _rankFromIdxToIdx(uint16 fromIdx, uint16 toIdx, ABid memory cursor) private {
        ABid memory newBid;
        for (uint16 idx = fromIdx; idx < toIdx; ++idx) {
            euint256 p_i = _rankedBids[idx].price;
            euint256 q_i = _rankedBids[idx].quantity;
            euint16 id_i = _rankedBids[idx].id;
            //euint256 rand_i = _rankedBids[idx].rand;

            // Block to avoid stack too deep
            ebool i_gt_c;
            {
                ebool p_gt = TFHE.gt(p_i, cursor.price);
                ebool p_eq = TFHE.eq(p_i, cursor.price);
                ebool id_lt = TFHE.lt(id_i, cursor.id);

                i_gt_c = TFHE.or(p_gt, TFHE.and(p_eq, id_lt));
            }

            newBid.price = TFHE.select(i_gt_c, p_i, cursor.price);
            newBid.quantity = TFHE.select(i_gt_c, q_i, cursor.quantity);
            newBid.id = TFHE.select(i_gt_c, id_i, cursor.id);
            //newBid.rand = TFHE.select(i_gt_c, rand_i, cursor.rand);

            cursor.price = TFHE.select(i_gt_c, cursor.price, p_i);
            cursor.quantity = TFHE.select(i_gt_c, cursor.quantity, q_i);
            cursor.id = TFHE.select(i_gt_c, cursor.id, id_i);
            //cursor.rand = TFHE.select(i_gt_c, cursor.rand, rand_i);

            _rankedBids[idx] = newBid;
            _allowBid(newBid);
        }
    }

    /**
     * @notice Computes a set of `chunckSize` iteration cycles for the step #2 (Bid Ranking).
     *
     * - Returns `E_NOT_ENOUGH_GAS` if the `chunckSize` iterations could not be completed due to insufficient gas.
     * - Returns `S_NOT_FINISHED` if the iterations were completed but the computation step is not yet finished.
     * - Returns `S_FINISHED` if the iterations were completed (or fewer iterations were needed) and the bid ranking step has been completed.
     *
     * @param chunckSize The number of iterations to compute in a single call.
     * @return One of the following status code `S_FINISHED` or `S_NOT_FINISHED` or `E_NOT_ENOUGH_GAS`
     */
    function iterRankedBids(uint32 chunckSize) external returns (uint8) {
        if (!isBidsValidationComplete()) {
            revert Step1BidsValidationNotCompleted();
        }

        //uint256 startGas = gasleft();
        uint16 bidCount = _bidCount;

        require(chunckSize > 0, "Invalid chunck size");
        require(bidCount > 0, "Empty bid list");

        uint16 rankedBidCount = _rankedBidCount;

        // Computation cost:
        // =================
        // The sort algorithm performs N(N-1)/2 cycles. With N beeing the total number of registered bids.

        // Gas cost:
        // =========
        // The total number of computation cycles is defined as follows:
        //   N(N-1)/2 + 1 = N(N-1)/2 x (TFHE cycles) + 1 x (computation cycle to complete the algorithm)
        //
        // we define `MIN_GAS_PER_RB_CYCLE` as the minimum amount of gas needed to compute one cycle.

        // When the number of sorted bids equals the total number of registered bids,
        // the sort operation is completed.
        if (rankedBidCount == bidCount) {
            // Debug
            require(_progressRB == _rankedBidsProgressMax(bidCount), "Panic: wrong sort progress (1)");
            return S_FINISHED;
        }

        if (gasleft() < 2 * MIN_GAS_PER_RB_CYCLE) {
            // If we do not have enough gas left to perform `one TFHE cycle` + `one sort completion`
            // it is probably safe to interrupt at this point to avoid any
            // unecessary gas consumtion
            return E_NOT_ENOUGH_GAS;
        }

        uint16 fromIdx;
        ABid memory cursor;

        // We want to optimize the following calls:
        // - TFHE.allow(...) which cost about 25_000 gas
        // - SSTORE operations
        // We use the following 2 flags to minimize those calls.
        bool cursorAllowNeeded = false;
        bool cursorUpdateNeeded = false;

        // We the sort is beginning, the number of sorted bids is zero
        // We pick the first registered bid and store it at the first place of
        // the sorted bid list.
        if (rankedBidCount == 0) {
            // The first bid id is equal to `1`
            // (See the bid() function and the above remark (3))
            _rankedBids[0] = _idToBid[_indexPlusOneToId[1]];

            _rankedBidCount = 1;
            rankedBidCount = 1;

            // if there is only one single bidder, the sort is over
            if (bidCount == 1) {
                _progressRB = 1;
                // Debug
                require(_progressRB == _rankedBidsProgressMax(bidCount), "Panic: wrong sort progress (2)");
                return S_FINISHED;
            }

            // if there are more than one bidder,
            // load the second unsorted bid into the cursor and setup the cursor position to zero
            fromIdx = 0;
            cursor = _idToBid[_indexPlusOneToId[2]];
            cursorUpdateNeeded = true;
        } else {
            // If the function is called to resume the sort operation, then
            // start from the last position stored in the cursor.
            fromIdx = _resumeIdxRB;
            cursor = _cursorRB;
        }

        // Debug
        require(_progressRB < _rankedBidsProgressMax(bidCount), "Panic: wrong sort progress (3)");

        // These properties are always true:
        //   chunckSize > 0
        //   bidCount >= 2
        //   rankedBidCount == _rankedBidCount
        //   1 <= rankedBidCount < bidCount
        //   0 <= fromIdx < rankedBidCount
        //   remaining <= min(chunckSize, total progress)
        //   toIdx <= rankedBidCount
        //   toIdx <= fromIdx + remaining
        //   toIdx > fromIdx

        uint32 remainingProgress = _rankedBidsProgressMax(bidCount) - _progressRB;
        uint32 remainingMax = (remainingProgress < chunckSize) ? remainingProgress : chunckSize;
        uint32 remaining = remainingMax;

        while (remaining > 0) {
            // Manage potential arithmetic overflow
            uint32 requestedToIdx = fromIdx + remaining;
            uint16 toIdx = (requestedToIdx > rankedBidCount) ? rankedBidCount : uint16(requestedToIdx);

            // We want to make sure we have enough gas to compute the following:
            // - `toIdx - fromIdx` cycles of TFHE operations
            // - 1 extra gas quantity to finish the current sort pass.
            uint256 gasReq = (toIdx - fromIdx + 1) * MIN_GAS_PER_RB_CYCLE;
            if (gasleft() < gasReq) {
                break;
            }

            // since fromIdx < toIdx, the cursor will always be modified
            // therefore we must invalidate the storage `_cursorRB` struct.
            _rankFromIdxToIdx(fromIdx, toIdx, cursor);

            remaining -= (toIdx - fromIdx);

            // invalidate the storage `_cursorRB`
            cursorUpdateNeeded = true;

            // We have reached the end of the currently sorted bids.
            // We must do the following:
            // 1. append the bid cursor to end of the sorted list.
            // 2. load the cursor with the next unsorted bid
            // 3. set the cursor position to zero.
            if (toIdx == rankedBidCount) {
                _allowBid(cursor);
                _rankedBids[rankedBidCount] = cursor;

                rankedBidCount++;
                _rankedBidCount = rankedBidCount;

                // If all the registered bids have been sorted, then the sort operation
                // is completed.
                if (rankedBidCount == bidCount) {
                    _progressRB += (remainingMax - remaining);
                    // Debug
                    require(_progressRB == _rankedBidsProgressMax(bidCount), "Panic: wrong sort progress (4)");

                    //console.log("TOTAL GAS=%s", startGas - gasleft());

                    return S_FINISHED;
                }

                // restart from the beginning with the next unsorted bid.
                // The next unsorted bid index is equal to `rankedBidCount`
                fromIdx = 0;
                cursor = _idToBid[_indexPlusOneToId[rankedBidCount + 1]];
                // since the values stored in the cursor are already allowed, there
                // will be no need to perform any TFHE.allow() call
                cursorAllowNeeded = false;
            } else {
                // Debug
                require(remaining == 0, "Panic: remaining != 0");
                fromIdx = toIdx;
                // a TFHE.allow call must be executed on the new cursor values
                cursorAllowNeeded = true;
            }
        }

        // Perform TFHE.allow if needed
        if (cursorAllowNeeded) {
            _allowBid(cursor);
        }

        // Save the new cursor if needed
        if (cursorUpdateNeeded) {
            _cursorRB = cursor;
        }

        // Save the new cursor position
        _resumeIdxRB = fromIdx;

        // Update the sort progress
        if (remainingMax - remaining > 0) {
            _progressRB += (remainingMax - remaining);
            require(_progressRB < _rankedBidsProgressMax(bidCount), "Internal error: wrong sort progress 5");
        }

        //console.log("TOTAL GAS=%s", startGas - gasleft());

        return S_NOT_FINISHED;
    }

    // ====================================================================== //
    //
    //              ⭐️ Step 3/4: Compute Ranked Won Quantities ⭐️
    //
    // ====================================================================== //

    /**
     * @notice Returns `true` if step #3 is complete, `false` otherwise. (Ranked Won Quantities)
     * @dev Gas cost ~= 4_000
     */
    function isRankedWonQuantitiesComplete() public view returns (bool) {
        return _resumeIdxRWQ == _bidCount && _bidCount > 0;
    }

    /**
     * @notice Returns the step #3 progress as a value between `0` and {xref-rankedWonQuantitiesProgressMax}. (Ranked Won Quantities)
     */
    function rankedWonQuantitiesProgress() external view returns (uint16) {
        return _resumeIdxRWQ;
    }

    /**
     * @notice Returns the maximum possible progress value for the step #3 (Ranked Won Quantities).
     */
    function rankedWonQuantitiesProgressMax() external view returns (uint16) {
        return _bidCount;
    }

    /**
     * @notice Computes a set of `chunckSize` iteration cycles for the step #3 (Ranked Won Quantities).
     * see function {xref-iterRankedBids}
     */
    function iterRankedWonQuantities(uint16 chunckSize) external returns (uint8) {
        // Average gas cost:
        // - first iteration : 113_000 gas
        // - single iteration : 225_000 gas
        if (gasleft() < MIN_GAS_PER_RWQ_CYCLE) {
            return E_NOT_ENOUGH_GAS;
        }

        if (!isRankedBidsComplete()) {
            revert Step2RankedBidsNotCompleted();
        }

        // Gas cost ~= 2_000
        uint16 max = _rankedBidCount;
        uint16 from = _resumeIdxRWQ;

        // Debug (Gas cost ~= 2_000)
        require(max == _rankedBids.length, "Panic: max != _rankedBids.length");
        // Debug
        require(from <= max, "Panic: from > max");

        if (from == max) {
            return S_FINISHED;
        }

        uint16 to = from + chunckSize;
        to = (to > max) ? max : to;

        if (from == to) {
            return S_NOT_FINISHED;
        }

        // chunckSize > 0
        // from < to

        euint256 cumulativeQuantity;
        euint256 uniformPrice;
        // Gas cost ~= 9_000 (from start)

        if (from == 0) {
            // Gas cost ~= 103_000 (to == 1)
            // Gas cost ~= 73_000 (to != 1)
            cumulativeQuantity = _rankedBids[0].quantity;
            uniformPrice = _rankedBids[0].price;

            euint256 wonQuantity = TFHE.min(cumulativeQuantity, _totalQuantity);
            TFHE.allowThis(wonQuantity);

            _rankedWonQuantities[0] = wonQuantity;

            // Gas cost ~= 73_000 (if block)
            if (to == 1) {
                // Storage gas cost ~= 30_000
                _resumeIdxRWQ = 1;
                _cumulativeQuantity = cumulativeQuantity;
                _uniformPrice = uniformPrice;

                // total gas cost ~= 113_000
                if (to == max) {
                    TFHE.allow(uniformPrice, owner());
                    return S_FINISHED;
                } else {
                    return S_NOT_FINISHED;
                }
            }

            from = 1;
        } else {
            // Gas cost ~= 4_000
            cumulativeQuantity = _cumulativeQuantity;
            uniformPrice = _uniformPrice;
        }

        // Here: 1 <= from < to

        // Possible gas cost from start up to this point:
        //   - Branch #1 : 13_000 gas (from != 0)
        //   - Branch #2 : 73_000 gas (from == 0 && to != 1)
        //
        // 1x loop iter ~= 155_000 gas
        // After loop ~= 60_000 gas
        for (uint16 k = from; k < to; ++k) {
            if (gasleft() < MIN_GAS_PER_RWQ_CYCLE) {
                // Not enough gas to iter one more time and be sure to complete
                // the function without beeing out-of-gas
                break;
            }

            euint256 bidQuantity = _rankedBids[k].quantity;
            euint256 bidPrice = _rankedBids[k].price;

            // Formula:
            // Wk = (C(k-1) < Q) ? min(Q - C(k-1), q_k) : 0
            ebool isValid = TFHE.lt(cumulativeQuantity, _totalQuantity);

            // Price = 0 means the bid is invalid
            // pk = 0 => qk = 0
            isValid = TFHE.and(isValid, TFHE.gt(bidPrice, TFHE.asEuint256(0)));

            euint256 remainingQuantity = TFHE.sub(_totalQuantity, cumulativeQuantity);
            euint256 wonQuantity = TFHE.select(isValid, TFHE.min(remainingQuantity, bidQuantity), TFHE.asEuint256(0));

            cumulativeQuantity = TFHE.add(cumulativeQuantity, bidQuantity);

            uniformPrice = TFHE.select(isValid, bidPrice, uniformPrice);

            TFHE.allowThis(wonQuantity);

            _rankedWonQuantities[k] = wonQuantity;
        }

        // Debug
        require(to <= _bidCount, "Panic: to > _bidCount");

        // Allow cost ~= 48_000 gas
        TFHE.allowThis(cumulativeQuantity);
        TFHE.allowThis(uniformPrice);

        // Storage cost ~= 9_000 gas
        _resumeIdxRWQ = to;
        _cumulativeQuantity = cumulativeQuantity;
        _uniformPrice = uniformPrice;

        if (to == max) {
            TFHE.allow(uniformPrice, owner());
            return S_FINISHED;
        } else {
            return S_NOT_FINISHED;
        }
    }

    // ====================================================================== //
    //
    //                ⭐️ Step 4/4: Compute Won Quantities ⭐️
    //
    // ====================================================================== //

    /**
     * @notice Returns `true` if step #4 is complete, `false` otherwise. (Won Quantities)
     * @dev Gas cost ~= 4_000
     */
    function isWonQuantitiesComplete() public view returns (bool) {
        return _idxWQ == _bidCount && _bidCount > 0;
    }

    /**
     * @notice Returns the step #4 progress as a value between `0` and {xref-wonQuantitiesProgress}. (Won Quantities)
     */
    function wonQuantitiesProgress() external view returns (uint32) {
        return _idxWQ * _bidCount + _resumeIdxWQ;
    }

    /**
     * @notice Returns the maximum possible progress value for the step #4 (Won Quantities).
     */
    function wonQuantitiesProgressMax() external view returns (uint32) {
        return _bidCount * _bidCount;
    }

    /**
     * @notice Computes a set of `chunckSize` iteration cycles for the step #4 (Won Quantities).
     * see function {xref-iterRankedBids}
     */
    function iterWonQuantities(uint16 chunckSize) external returns (uint8) {
        if (gasleft() < MIN_GAS_PER_WQ_CYCLE) {
            return E_NOT_ENOUGH_GAS;
        }

        // Step 3/4 must be complete
        if (!isRankedWonQuantitiesComplete()) {
            revert Step3RankedWonQuantitiesNotCompleted();
        }

        uint16 bidCount = _bidCount;
        uint16 idxWQ = _idxWQ;

        if (idxWQ == bidCount) {
            return S_FINISHED;
        }

        uint16 resumeIdxWQ = _resumeIdxWQ;
        uint32 progressMax = bidCount * bidCount;
        uint32 progress = idxWQ * bidCount + resumeIdxWQ;

        // Debug
        require(resumeIdxWQ < bidCount, "Panic: resumeIdxWQ >= bidCount");
        // Debug
        require(progress < progressMax, "Panic: progress >= progressMax");

        uint32 nextProgress = progress + chunckSize;
        nextProgress = (nextProgress > progressMax) ? progressMax : nextProgress;

        uint16 idx = idxWQ;
        uint16 from = resumeIdxWQ;
        euint256 quantity = _quantityWQ;

        // Gas cost from start up to this point ~= 10_000 gas
        // Gas cost x1 iter ~= 104_000 gas (worst case) / 60_000 gas (otherwise)
        while (progress < nextProgress) {
            // Debug
            require(idx < bidCount, "Panic: idx >= bidCount");

            // We need 150_000 gas to be sure to complete

            ebool eq_id = TFHE.eq(_rankedBids[from].id, _indexPlusOneToId[idx + 1]);
            quantity = TFHE.select(eq_id, _rankedWonQuantities[from], quantity);
            from++;

            if (from == bidCount) {
                // store won quantity
                _wonQuantities[idx] = quantity;
                TFHE.allowThis(quantity);
                TFHE.allow(quantity, owner());
                // reset cursor
                idx += 1;
                from = 0;
                quantity = TFHE.asEuint256(0);
            }

            progress++;

            if (gasleft() < MIN_GAS_PER_WQ_CYCLE) {
                break;
            }
        }

        if (progress == progressMax) {
            // Debug
            require(idx == bidCount, "Panic: idx != bidCount");
            // Debug
            require(from == 0, "Panic: from != 0");
            _idxWQ = bidCount;
            _resumeIdxWQ = 0; //for progress computation
            return S_FINISHED;
        }

        // Debug
        require(idx < bidCount, "Panic: idx >= bidCount");

        // End gas cost ~= 36_000 gas (worst branch)
        if (from != resumeIdxWQ) {
            _resumeIdxWQ = from;
        }

        if (idx != idxWQ) {
            _idxWQ = idx;
        }

        // Storage gas cost ~= 3_000 gas (when stabilized)
        _quantityWQ = quantity;
        // Allow gas cost ~= 26_000 gas
        TFHE.allowThis(quantity);

        return S_NOT_FINISHED;
    }

    /**
     * @dev Grants the engine permission to access the encrypted bid values (`price`, `quantity`, `id`).
     */
    function _allowBid(ABid memory bid_) private {
        TFHE.allowThis(bid_.price);
        TFHE.allowThis(bid_.quantity);
        TFHE.allowThis(bid_.id);
    }
}
