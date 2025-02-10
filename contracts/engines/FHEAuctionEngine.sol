// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import "fhevm/lib/TFHE.sol";
import "fhevm/config/ZamaFHEVMConfig.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IFHEAuctionEngine} from "./IFHEAuctionEngine.sol";
import {IFHEAuction} from "../auctions/IFHEAuction.sol";
import {FHEAuctionEngineIterator} from "./FHEAuctionEngineIterator.sol";
import {
    FourStepsIterator,
    IFourStepsIterable,
    S_FINISHED,
    S_NOT_FINISHED,
    E_NOT_ENOUGH_GAS
} from "../FourStepsIterator.sol";

/**
 * @notice ## Engine Architecture
 *
 * ### Incremental Computation
 *
 * - A uniform price auction requires an FHE-based sorting operation, which has a computational complexity
 *   of O(N^2), where N is the number of bidders. As a result, the overall auction computation consumes
 *   a significant amount of both native and FHE gas.
 *
 * - To overcome these gas cost limitations, the implementation adopts an incremental batch-processing mechanism,
 *   allowing the full computation to be executed iteratively across multiple smaller transactions, rather
 *   than in a single execution. This ensures computations remain gas-efficient and
 *   prevents exceeding blockchain transaction limits as well as fhEVM limits.
 *
 * - Since the auction results cannot be determined in a single transaction, a dedicated contract,
 *   {FHEAuctionEngineIterator}, is responsible for managing the paging mechanism. It orchestrates the
 *   progressive execution of auction computation cycles until completion.
 *
 * - A drawback of such iterative approach is the extra native gas cost required to read/write additional state 
 *   variables required to save the computation status between two consecutive computation transactions.
 *
 * ### Contract Size Limit
 *
 * Due to the maximum contract size restrictions, the auction engine is modularized across multiple contracts:
 *
 * - Core Engine: `FHEAuctionEngine`, the base contract.
 * - Tie-Breaking Implementations: Four specialized contracts inherit from `FHEAuctionEngine`, each
 *   implementing a different tie-breaking rule:
 *      - `FHEAuctionEnginePriceId`
 *      - `FHEAuctionEnginePriceQuantityId`
 *      - `FHEAuctionEnginePriceRandom`
 *      - `FHEAuctionEngineProRata`
 * - Computation Manager: `FHEAuctionEngineIterator`, responsible for orchestrating the incremental
 *   computation process.
 *
 * @notice ## Algorithm for Bid Validation and Ranking
 *
 * ### Approach
 *
 * A bit-level strategy would have been optimal in terms of FHE cost; however, the resulting native gas cost 
 * would be overwhelming. The primary reason is that the current version of TFHE library lacks batch functions 
 * or high-level bitwise operations (such as array manipulations or tensor operations). 
 * As a result, a more "brute force" approach manipulating encrypted integers is necessary.
 *
 * The algorithm consists in 4 steps, with the last one beeing optional. 
 *
 *  |  Steps                     |  Cost    | 
 *  |----------------------------|----------|
 *  |  1. Bid validation         |  O(N)    |
 *  |  2. Bid ranking            |  O(N^2)  |
 *  |  3. Won Quantities by rank |  O(N)    | 
 *  |  4. Won Quantities by id   |  O(N^2)  |
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
 * ### Step 2: Bid ranking (sort). O(N^2)
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
 * ### Step 3: Ranked bid won quantities and uniform price calculation. O(N)
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
 * ### Step 4 (Optional): Inverting ranking to index vector. O(N^2)
 *
 * - This step generates an index vector that maps the ranking of bids back to their original positions in the
 * ranked list. Each position in the index vector corresponds to the original index of a bid in the ranked list.
 *
 * - The purpose of this step is to facilitate lookup or processing based on the original bid order.
 *
 * - This step is optional and can be skipped to minimize computation cost and if auction prizes can delivered directly
 * based on ranking positions rather than requiring bidder addresses.
 */
abstract contract FHEAuctionEngine is SepoliaZamaFHEVMConfig, Ownable, IFourStepsIterable, IFHEAuctionEngine {
    uint256 public constant MAX_UINT256 = 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff;

    uint256 public constant MIN_GAS_PER_BV_CYCLE = 165_000;
    uint256 public constant MIN_GAS_PER_RB_CYCLE = 420_000;
    uint256 public constant MIN_GAS_PER_RWQ_CYCLE = 250_000;
    uint256 public constant MIN_GAS_PER_WQ_CYCLE = 160_000;

    euint256 constant DUMMY_EUINT256_MEMORY = euint256.wrap(uint32(0xdeadbeef));
    euint16 constant DUMMY_EUINT16_MEMORY = euint16.wrap(uint32(0xdeadbeef));

    enum TieBreakingRule {
        PriceId,
        PriceQuantityId,
        PriceRandom,
        ProRata
    }

    struct ABid {
        euint256 price;
        euint256 quantity;
        euint256 rand;
        euint16 id;
    }

    FHEAuctionEngineIterator _iterator;

    uint256 private _totalQuantity;
    TieBreakingRule private _tieBreakingRule;
    bool private _auctionIsClosed;

    uint16 private _maxBidCount;
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

    ///@dev A precomputed zero euint256 to minimize the `TFHE.asEuint256(0)` calls 
    euint256 private immutable _eZeroU256;

    // Step 2: Bid ranking. O(N^2)
    // ===========================

    ///@dev Index from which the computation of step #2 should resume.
    uint16 private _resumeIdxRB;

    ///@dev Temporary saved did data required when the computation of step #2 should resume.
    ABid private _cursorRB;

    ///@dev Total number of ranked bids that have been computed so far.
    ///@dev 0 <= _rankedBidCount <= _bidCount
    uint16 private _rankedBidCount;

    ///@dev Array of bids sorted by rank order, where entry k contains the bid placed by bidder ranked at position k.
    ///@dev 0 <= rank < _rankedBidCount
    ABid[] private _rankedBids;

    // Step 3: Ranked bid won quantity and uniform price calculation. O(N)
    // ===================================================================

    ///@dev Array of final won quantities sorted by rank order, where entry k contains the won quantity for bidder
    /// ranked at position k.
    euint256[] private _rankedWonQuantities;

    // Step 4: Inverting ranking to index vector. O(N)
    // ===============================================

    ///@dev Index of the bidder whose final won quantity is being computed
    uint16 private _idxWQ;

    ///@dev Index from which the computation of the final won quantity should resume
    uint16 private _resumeIdxWQ;

    ///@dev `true` if all won quantities have been computed
    bool private _wonQuantitiesByIdReady;

    ///@dev `true` if all ranked won quantities have been computed
    bool private _wonQuantitiesByRankReady;

    ///@dev Current computed final won quantity for the bidder at index `_idxWQ`
    euint256 private _quantityWQ;

    ///@dev Array of final won quantities, where entry k contains the won quantity for bidder with index = k + 1
    euint256[] private _wonQuantities;

    error ExpectedNotClosed();
    error ExpectedClosed();
    error IndexOutOfBounds(uint16 idx, uint16 count);
    error RankOutOfBounds(uint16 rank, uint16 rankCount);
    error InvalidIterator();
    error InvalidId(uint16 id);
    error BidderAlreadyRegistered(address bidder);
    error TooManyBids();
    error WonQuantitiesByRankNotReady();
    error WonQuantitiesByIdNotReady();
    error NotEnoughGas(uint256 gasLeft, uint256 gasNeeded);
    error UnauthorizedIterator();
    // Debug
    error DebugEngineError(uint16 code);

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
     * @dev Throws if called by any account other than the iterator.
     */
    modifier onlyIterator() {
        if (address(_iterator) != msg.sender) {
            revert UnauthorizedIterator();
        }
        _;
    }

    /**
     * @param auctionOrInitialOwner_ The address of the `FHEAuctionBase` contract that owns this auction engine or the 
     * address of the initial owner. If the engine initial owner is not the auction contract, a transfer ownership must
     * be performed to give ownership to the auction contract.
     * @param tieBreakingRule_ The tie-breaking rule used by the auction engine to resolve ties. 
     * @param iterator_ The addre.
     */
    constructor(address auctionOrInitialOwner_, uint8 tieBreakingRule_, address iterator_) Ownable(auctionOrInitialOwner_) {
        if (iterator_ == address(0) || Ownable(iterator_).owner() != auctionOrInitialOwner_) {
            revert InvalidIterator();
        }

        _iterator = FHEAuctionEngineIterator(iterator_);
        _tieBreakingRule = TieBreakingRule(tieBreakingRule_);

        euint256 eZero = TFHE.asEuint256(0);
        TFHE.allowThis(eZero);

        _eZeroU256 = eZero;
        _cumulativeQuantity = eZero;
        _uniformPrice = eZero;

        // A bit counter intuitive.
        // Mainly to ensure that computation iterations have a constant gas cost
        _cursorRB.price = DUMMY_EUINT256_MEMORY;
        _cursorRB.quantity = DUMMY_EUINT256_MEMORY;
        _cursorRB.id = DUMMY_EUINT16_MEMORY;
        _resumeIdxRB = uint16(0xdead);

        _quantityWQ = eZero;
        _nextId = 1;
        _maxBidCount = type(uint16).max;
    }

    /**
     * @notice Initializes the auction engine with a specified quantity of items.
     * The `FHEAuctionEngine` contract is intended for internal use by its owner and is not designed to be
     * used by other contracts. It does not include protections against reentrancy or multiple initializations.
     *
     * @dev Requirements:
     * - The caller must be the engine owner (a contract of type `FHEAuctionBase`).
     * - The engine must not be in a closed state.
     *
     * @param totalQuantity_ The total quantity of items to be auctioned.
     */
    function initialize(uint256 totalQuantity_, uint16 maxBidCount_) external onlyOwner whenNotClosed {
        _totalQuantity = totalQuantity_;
        _maxBidCount = maxBidCount_;
    }

    /**
     * @notice Returns the auction contract associated with this engine.
     * @dev The auction contract is required to be the owner of the engine.
     * @return The auction contract interface.
     */
    function _auction() internal view returns (IFHEAuction) {
        return IFHEAuction(owner());
    }

    /**
     * @notice Returns the engine iterator address. The iterator's owner is the engine itself.
     */
    function iterator() public view returns (address) {
        return address(_iterator);
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
     * @notice Returns the maximum number of bids.
     */
    function getMaximumBidCount() public view returns (uint16) {
        return _maxBidCount;
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
     * @return id The clear ID of the bid.
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
     * @param rank The zero-based rank position of the bid to retrieve.
     * @return id The encrypted ID of the bid.
     * @return price The encrypted price of the bid.
     * @return quantity The encrypted quantity of the bid.
     */
    function getBidByRank(uint16 rank) public view returns (euint16 id, euint256 price, euint256 quantity) {
        if (rank >= _rankedBidCount) {
            revert RankOutOfBounds(rank, _rankedBidCount);
        }

        id = _rankedBids[rank].id;
        price = _rankedBids[rank].price;
        quantity = _rankedBids[rank].quantity;
    }

    /**
     * @notice Retrieves the bid ranked at the specified position `rank`.
     * The bid at rank `0` represents the highest-ranked (winning) bid.
     * The function reverts if:
     * - The ranked won quantities computation is not complete.
     * - The provided `rank` is out of bounds.
     *
     * @param rank The zero-based rank position of the bid to retrieve.
     * @return id The encrypted ID of the bid at the specified rank.
     * @return price The encrypted price of the bid at the specified rank.
     * @return quantity The encrypted quantity won by the bid at the specified rank.
     */
    function getWonBidByRank(uint16 rank) public view returns (euint16 id, euint256 price, euint256 quantity) {
        if (!_wonQuantitiesByRankReady) {
            // step #3 is not yet completed
            revert WonQuantitiesByRankNotReady();
        }

        if (rank >= _rankedBidCount) {
            revert IndexOutOfBounds(rank, _rankedBidCount);
        }

        id = _rankedBids[rank].id;
        price = _rankedBids[rank].price;
        quantity = _rankedWonQuantities[rank];
    }

    /**
     * @notice Returns `true` if the uniform price is ready for decryption.
     */
    function canDecryptUniformPrice() external view returns (bool) {
        // uniformPrice is computed during step #3
        return _wonQuantitiesByRankReady;
    }

    /**
     * @notice Returns the encrypted uniform price if computations are complete;
     * otherwise, returns zero (uninitialized `euint256`).
     * @return price the encrypted uniform price. The engine owner has TFHE permissions to access `price`.
     */
    function getUniformPrice() public view returns (euint256 price) {
        // uniformPrice is computed during step #3
        if (_wonQuantitiesByRankReady) {
            price = _uniformPrice;
        }
    }

    /**
     * @notice Returns `true` if the computation of all won quantities is complete (step #4),
     * allowing bidders to claim their auction prizes.
     */
    function canClaim() external view returns (bool) {
        return _wonQuantitiesByIdReady;
    }

    /**
     * @notice Returns `true` if all ranked won quantities have been computed (step #3),
     */
    function canBlindClaim() external view returns (bool) {
        return _wonQuantitiesByRankReady;
    }

    /**
     * @notice Returns `true` if all ranked won quantities have been computed (step #3),
     */
    function wonQuantitiesByRankReady() external view returns (bool) {
        return _wonQuantitiesByRankReady;
    }

    /**
     * @notice Returns `true` if all ranked won quantities have been computed (step #4),
     */
    function wonQuantitiesByIdReady() external view returns (bool) {
        return _wonQuantitiesByIdReady;
    }

    /**
     * @notice Returns the validated price and the encrypted won quantity associated with the bid identified by `id`.
     *
     * @notice Requirements:
     * - The computation of all won quantities must be complete (step #4).
     * - `id` must be a valid ID.
     *
     * @param id The bid ID.
     * @return validatedPrice The encrypted validated price of the bid.
     * @return wonQuantity The encrypted won quantity of the bid.
     *
     * @dev The owning auction contract has TFHE access permissions on both `wonQuantity` and `validatedPrice`.
     */
    function validatedPriceAndWonQuantityById(uint16 id)
        external
        view
        returns (euint256 validatedPrice, euint256 wonQuantity)
    {
        if (_wonQuantitiesByIdReady) {
            uint16 idxPlusOne = _idToIndexPlusOne[id];

            if (idxPlusOne == 0 || idxPlusOne > _bidCount) {
                revert InvalidId(id);
            }

            // owner has TFHE permissions.
            validatedPrice = _idToBid[id].price;
            wonQuantity = _wonQuantities[idxPlusOne - 1];
        }
    }

    /**
     * @notice Returns the bid ID associated with the specified `bidder` address.
     */
    function bidderId(address bidder) external view returns (uint16) {
        return _bidderToId[bidder];
    }

    /**
     * @notice Returns the bidder address associated with the specified `id`.
     */
    function getBidderById(uint16 id) external view returns (address) {
        return _idToBidder[id];
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
        if (!(_bidCount > 0)) revert DebugEngineError(4);

        uint16 idxPlusOne = _idToIndexPlusOne[id];

        // Debug
        if (!(idxPlusOne > 0)) revert DebugEngineError(5);

        // remove bidder address
        _bidderToId[bidder] = 0;
        _idToBidder[id] = address(0);

        // swap id with last id
        if (idxPlusOne < _bidCount) {
            uint16 lastId = _indexPlusOneToId[_bidCount];

            // Debug
            if (!(lastId > 0)) revert DebugEngineError(6);

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
        _close(false);
    }

    function _close(bool onlyBlindClaim) internal {
        _auctionIsClosed = true;
        _iterator.initializeFourSteps(_bidCount, 2_456_000, _rankFheGasCostPerIdx(), 1_469_000, 101_000, onlyBlindClaim);
    }

    /**
     * @notice Executes a batch of auction computation cycles, processing up to `iter` cycles in a single call.
     * This function allows incremental processing of the auction results until completion.
     *
     * @dev If the auction is not yet closed, it will be closed before starting the computation.
     *
     * @notice Requirements:
     * - Only the contract owner can call this function.
     *
     * @param iter The maximum number of computation cycles to execute in this call.
     * @param stopIfReadyForBlindClaim The computation should stop if `blindClaim` can be executed.
     * @return code A status code indicating the outcome of the computation:
     *      - `S_NOT_FINISHED` = 0 : More cycles are required to complete the computation.
     *      - `S_FINISHED` = 1 : The full auction computation successfully completed.
     *      - `E_NOT_ENOUGH_GAS` = 2 : Insufficient gas to continue processing.
     * @return startIterProgress The total number of computation cycles completed before this function call.
     * @return endIterProgress The total number of computation cycles completed after this function call.
     */
    function computeAuctionIterations(uint64 iter, bool stopIfReadyForBlindClaim)
        external
        onlyOwner
        returns (uint8 code, uint64 startIterProgress, uint64 endIterProgress)
    {
        if (!_auctionIsClosed) {
            _close(false);
        }
        (code, startIterProgress, endIterProgress) = _iterator.computeAuctionIterations(iter, stopIfReadyForBlindClaim);
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

        if (_bidCount == _maxBidCount) {
            revert TooManyBids();
        }

        uint16 nextId = _nextId;
        _nextId = nextId + 1;

        uint16 nextIdxPlusOne = _bidCount + 1;
        _bidCount = nextIdxPlusOne;

        euint256 zero = _eZeroU256;
        ebool priceTooHigh = TFHE.gt(ePrice, maximumPrice());
        ePrice = TFHE.select(priceTooHigh, zero, ePrice);
        eQuantity = TFHE.min(eQuantity, _totalQuantity);

        ebool ePriceIsZero = TFHE.eq(ePrice, zero);
        ebool eQuantityIsZero = TFHE.eq(eQuantity, zero);

        ePrice = TFHE.select(eQuantityIsZero, zero, ePrice);
        eQuantity = TFHE.select(ePriceIsZero, zero, eQuantity);

        euint256 eRand = euint256.wrap(0);
        euint16 eId = TFHE.asEuint16(nextId);

        if (_tieBreakingRule == TieBreakingRule.PriceRandom) {
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
        _emptySortedBid.rand = DUMMY_EUINT256_MEMORY;
        _emptySortedBid.id = eId;

        _rankedBids.push(_emptySortedBid);
        _rankedWonQuantities.push(DUMMY_EUINT256_MEMORY);
        _wonQuantities.push(DUMMY_EUINT256_MEMORY);
    }

    // ====================================================================== //
    //
    //                  ⭐️ Step 1/4: Bid Validation O(N) ⭐️
    //
    // ====================================================================== //

    /**
     * @notice Computes a set of `chunckSize` iteration cycles for the step #1.
     *
     * - Returns `E_NOT_ENOUGH_GAS` if the `chunckSize` iterations could not be completed due to insufficient gas.
     * - Returns `S_NOT_FINISHED` if the iterations were completed but the computation step is not yet finished.
     * - Returns `S_FINISHED` if the iterations were completed (or fewer iterations were needed) and the bid ranking step has been completed.
     * @param progress The current step progress.
     * @param iter The number of iterations to compute in a single call. (`iter` > 0)
     * @param progressMax The max progress value for the step #1. (`progress` + `iter` <= `progressMax`)
     * @return One of the following status code `S_FINISHED` or `S_NOT_FINISHED` or `E_NOT_ENOUGH_GAS`
     *
     * @dev FHE Gas Cost per iteration:
     * - 1x mul(euint256, euint256) : 1 x 2_045_000
     * - 1x le(euint256, uint256)   : 1 x   231_000
     * - 2x select(euint256)        : 2 x    90_000
     *
     * Total FHE Gas Cost per iteration : 2_456_000
     */
    function _runStep1(uint32 progress, uint32 iter, uint32 progressMax) internal returns (uint8, uint32) {
        if (gasleft() < MIN_GAS_PER_BV_CYCLE) {
            return (E_NOT_ENOUGH_GAS, 0);
        }

        // Gas cost ~= 2_400
        uint16 toIdx = uint16(progress + iter);

        euint256 ePrice;
        euint256 eQuantity;

        IFHEAuction auction = _auction();

        // From start to beginning of the loop : Gas cost ~= 2_600
        // 1x loop iter ~= 153_000 gas
        // After loop ~= 3_000 gas
        uint16 count = 0;
        uint8 code = S_NOT_FINISHED;

        for (uint16 idx = uint16(progress); idx < toIdx; ++idx) {
            uint16 bidId = _indexPlusOneToId[idx + 1];

            // Debug
            if (!(bidId > 0)) revert DebugEngineError(7);

            ABid storage b = _idToBid[bidId];
            ePrice = b.price;
            eQuantity = b.quantity;
            // ePrice = _idToBid[bidId].price;
            // eQuantity = _idToBid[bidId].quantity;

            // Cannot overflow
            euint256 minBalance = TFHE.mul(ePrice, eQuantity);

            ebool enoughBalance = TFHE.le(minBalance, auction.balanceOf(_idToBidder[bidId]));

            ePrice = TFHE.select(enoughBalance, ePrice, _eZeroU256);
            eQuantity = TFHE.select(enoughBalance, eQuantity, _eZeroU256);

            // _idToBid[bidId].price = ePrice;
            // _idToBid[bidId].quantity = eQuantity;
            b.price = ePrice;
            b.quantity = eQuantity;

            TFHE.allowThis(ePrice);
            TFHE.allowThis(eQuantity);
            TFHE.allow(ePrice, address(auction));
            TFHE.allow(eQuantity, address(auction));

            count++;

            if (gasleft() < MIN_GAS_PER_BV_CYCLE) {
                // Not enough gas to iter one more time and be sure to complete
                // the function without beeing out-of-gas
                code = E_NOT_ENOUGH_GAS;
                break;
            }
        }

        if (progress + count == progressMax) {
            code = S_FINISHED;
        }

        return (code, count);
    }

    // ====================================================================== //
    //
    //             ⭐️ Step 2/4: Sort Bids by Rank Order O(N^2) ⭐️
    //
    // ====================================================================== //

    /**
     * @dev Returns the FHE Gas cost per iteration consumed by the `_rankFromIdxToIdx` function.
     */
    function _rankFheGasCostPerIdx() internal pure virtual returns (uint32);

    /**
     * @dev Performs a ranking pass from index `fromIdx` to index `toIdx`. The FHE Gas cost can be evaluated using the
     * `_rankFheGasCostPerIdx` function.
     */
    function _rankFromIdxToIdx(uint16 fromIdx, uint16 toIdx, ABid memory cursor) internal virtual;

    /**
     * @notice Computes a set of `chunckSize` iteration cycles for the step #2.
     * see function {computeValidation}
     * @param progress The current step progress.
     * @param iter The number of iterations to compute in a single call. (`iter` > 0)
     * @param progressMax The max progress value for the step #2. (`progress` + `iter` <= `progressMax`)
     * @return One of the following status code `S_FINISHED` or `S_NOT_FINISHED` or `E_NOT_ENOUGH_GAS`
     *
     * @dev Total FHE Gas Cost per iteration : `_rankFheGasCostPerIdx()`
     */
    function _runStep2(uint32 progress, uint32 iter, uint32 progressMax) internal returns (uint8, uint32) {
        if (gasleft() < 2 * MIN_GAS_PER_RB_CYCLE) {
            // If we do not have enough gas left to perform `one TFHE cycle` + `one sort completion`
            // it is probably safe to interrupt at this point to avoid any accidental revert due to insufficient gas
            return (E_NOT_ENOUGH_GAS, 0);
        }

        uint16 rankedBidCount = _rankedBidCount;
        uint16 resumeIdx;

        // We want to optimize the following calls:
        // - TFHE.allow(...) which cost about 25_000 gas
        // - SSTORE operations
        // We use the following 2 flags to minimize those calls.
        bool cursorAllowNeeded = false;
        bool cursorUpdateNeeded = false;

        ABid memory cursor;

        // We pick the first registered bid and store it at the first place of
        // the sorted bid list.
        if (rankedBidCount == 0) {
            // The first bid id is equal to `1`
            // (See the bid() function and the above remark (3))
            _rankedBids[0] = _idToBid[_indexPlusOneToId[1]];

            // if there is only one single bidder, the sort is over
            if (_bidCount == 1) {
                _rankedBidCount = 1;
                return (S_FINISHED, 1);
            }

            // if there are more than one bidder,
            // load the second unsorted bid into the cursor and setup the cursor position to zero
            rankedBidCount = 1;
            resumeIdx = 0;
            cursor = _idToBid[_indexPlusOneToId[2]];
            cursorUpdateNeeded = true;
        } else {
            // If the function is called to resume the sort operation, then
            // start from the last position stored in the cursor.
            resumeIdx = _resumeIdxRB;
            cursor = _cursorRB;
        }

        uint8 code = S_NOT_FINISHED;
        uint32 count = 0;

        while (count < iter) {
            uint32 toIdx = resumeIdx + uint16(iter - count);
            if (toIdx > rankedBidCount) {
                toIdx = rankedBidCount;
            }

            // We want to make sure we have enough gas to compute the following:
            // - `toIdx - resumeIdxRB` cycles of TFHE operations
            // - 1 extra gas quantity to finish the current sort pass.
            if (gasleft() < (toIdx - resumeIdx + 1) * MIN_GAS_PER_RB_CYCLE) {
                code = E_NOT_ENOUGH_GAS;
                break;
            }

            // since resumeIdx < toIdx, the cursor will always be modified
            // therefore we must invalidate the storage `_cursorRB` struct.
            _rankFromIdxToIdx(resumeIdx, uint16(toIdx), cursor);

            count += (toIdx - resumeIdx);

            // invalidate the storage `_cursorRB`
            cursorUpdateNeeded = true;

            // We have reached the end of the currently sorted bids.
            // We must do the following:
            // 1. append the bid cursor to end of the sorted list.
            // 2. load the cursor with the next unsorted bid
            // 3. set the cursor position to zero.
            if (toIdx == rankedBidCount) {
                _rankedBids[rankedBidCount] = cursor;
                rankedBidCount++;

                _allowBid(cursor);

                // If all the registered bids have been sorted, then the sort operation
                // is completed.
                if (rankedBidCount == _bidCount) {
                    // Debug
                    if (!(progress + count == progressMax)) revert DebugEngineError(8);

                    _rankedBidCount = rankedBidCount;
                    return (S_FINISHED, count);
                }

                // restart from the beginning with the next unsorted bid.
                // The next unsorted bid index is equal to `rankedBidCount`
                resumeIdx = 0;
                cursor = _idToBid[_indexPlusOneToId[rankedBidCount + 1]];

                // since the values stored in the cursor are already allowed, there
                // will be no need to perform any TFHE.allow() call.
                cursorAllowNeeded = false;
            } else {
                // Debug
                if (!(count == iter)) revert DebugEngineError(9);

                resumeIdx = uint16(toIdx);

                // a TFHE.allow call must be executed on the new cursor values
                cursorAllowNeeded = true;
            }
        }

        // Debug
        if (!(progress + count < progressMax)) revert DebugEngineError(10);

        // Perform TFHE.allow if needed
        if (cursorAllowNeeded) {
            _allowBid(cursor);
        }

        // Save the new cursor if needed
        if (cursorUpdateNeeded) {
            _cursorRB = cursor;
        }

        // Save the new _rankedBidCount value
        _rankedBidCount = rankedBidCount;

        // Save the new cursor position
        _resumeIdxRB = resumeIdx;

        return (code, count);
    }

    // ====================================================================== //
    //
    //            ⭐️ Step 3/4: Compute Ranked Won Quantities O(N) ⭐️
    //
    // ====================================================================== //

    /**
     * @notice Computes a set of `chunckSize` iteration cycles for the step #3.
     * see function {computeValidation}
     * @param progress The current step progress.
     * @param iter The number of iterations to compute in a single call. (`iter` > 0)
     * @param progressMax The maximum progress value for the step #3 which is equal to `_bidCount`.
     * (`progress` + `iter` <= `progressMax`)
     *
     * @dev FHE Gas Cost per iteration:
     * - 1x lt(euint256, euint256)  : 1 x 231_000
     * - 1x gt(euint256, euint256)  : 1 x 231_000
     * - 1x and                     : 1 x  44_000
     * - 1x sub(euint256, euint256) : 1 x 253_000
     * - 1x min(euint256, euint256) : 1 x 277_000
     * - 1x add(euint256, euint256) : 1 x 253_000
     * - 2x select(euint256)        : 2 x  90_000
     *
     * Total FHE Gas Cost per iteration : 1_469_000
     */
    function _runStep3(uint32 progress, uint32 iter, uint32 progressMax) internal returns (uint8, uint32) {
        // Average gas cost:
        // - first iteration : 113_000 gas
        // - single iteration : 225_000 gas
        if (gasleft() < MIN_GAS_PER_RWQ_CYCLE) {
            return (E_NOT_ENOUGH_GAS, 0);
        }

        // Debug
        if (!(_rankedBidCount == _bidCount && _rankedBids.length >= _bidCount)) revert DebugEngineError(11);

        uint16 from = uint16(progress);
        uint16 to = uint16(from + iter);

        address auctionAddr = address(_auction());
        euint256 cumulativeQuantity;
        euint256 uniformPrice;

        uint16 count = 0;
        uint8 code = S_NOT_FINISHED;

        if (from == 0) {
            cumulativeQuantity = _rankedBids[0].quantity;
            uniformPrice = _rankedBids[0].price;

            euint256 wonQuantity = TFHE.min(cumulativeQuantity, _totalQuantity);
            TFHE.allowThis(wonQuantity);

            // Additional allowance, required when using blind claim
            TFHE.allow(wonQuantity, auctionAddr);
            TFHE.allow(_rankedBids[0].id, auctionAddr);
            TFHE.allow(_rankedBids[0].price, auctionAddr);

            _rankedWonQuantities[0] = wonQuantity;

            if (to == 1) {
                _cumulativeQuantity = cumulativeQuantity;
                _uniformPrice = uniformPrice;

                if (to == progressMax) {
                    TFHE.allow(uniformPrice, auctionAddr);
                    code = S_FINISHED;
                    _wonQuantitiesByRankReady = true;
                }

                return (code, 1);
            }

            from = 1;
            count = 1;
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
                code = E_NOT_ENOUGH_GAS;
                break;
            }

            euint256 bidQuantity = _rankedBids[k].quantity;
            euint256 bidPrice = _rankedBids[k].price;

            // Formula:
            // Wk = (C(k-1) < Q) ? min(Q - C(k-1), q_k) : 0
            ebool isValid = TFHE.lt(cumulativeQuantity, _totalQuantity);

            // Price = 0 means the bid is invalid
            // pk = 0 => qk = 0
            isValid = TFHE.and(isValid, TFHE.gt(bidPrice, _eZeroU256));

            euint256 remainingQuantity = TFHE.sub(_totalQuantity, cumulativeQuantity);
            euint256 wonQuantity = TFHE.select(isValid, TFHE.min(remainingQuantity, bidQuantity), _eZeroU256);

            cumulativeQuantity = TFHE.add(cumulativeQuantity, bidQuantity);

            uniformPrice = TFHE.select(isValid, bidPrice, uniformPrice);

            TFHE.allowThis(wonQuantity);

            // Additional allowance, required when using blind claim
            TFHE.allow(wonQuantity, auctionAddr);
            TFHE.allow(_rankedBids[k].id, auctionAddr);
            TFHE.allow(_rankedBids[k].price, auctionAddr);

            _rankedWonQuantities[k] = wonQuantity;

            count++;
        }

        // Allow cost ~= 48_000 gas
        if (count > 0) {
            TFHE.allowThis(cumulativeQuantity);
            TFHE.allowThis(uniformPrice);
        }

        // Storage cost ~= 9_000 gas
        _cumulativeQuantity = cumulativeQuantity;
        _uniformPrice = uniformPrice;

        // Debug
        if (!(progress + count <= progressMax)) revert DebugEngineError(13);

        if (progress + count == progressMax) {
            TFHE.allow(uniformPrice, auctionAddr);
            code = S_FINISHED;
            _wonQuantitiesByRankReady = true;
        }

        return (code, count);
    }

    // ====================================================================== //
    //
    //        ⭐️ Step 4/4: Compute Won Quantities O(N^2) (Optional) ⭐️
    //
    // ====================================================================== //
 
    /**
     * @notice Computes a set of `iter` iteration cycles for the step #4.
     * see function {computeValidation}
     *
     * @dev FHE Gas Cost per iteration:
     * - 1x eq(euint16, euint16)  : 1 x 54_000
     * - 1x select(euint16)       : 1 x 47_000
     *
     * Total FHE Gas Cost per iteration : 101_000
     */
    function _runStep4(uint32 progress, uint32 iter, uint32 progressMax) internal returns (uint8, uint32) {
        if (gasleft() < MIN_GAS_PER_WQ_CYCLE) {
            return (E_NOT_ENOUGH_GAS, 0);
        }

        uint16 idxWQ = _idxWQ;
        uint16 resumeIdxWQ = _resumeIdxWQ;
        euint256 quantity = _quantityWQ;

        // Debug
        if (!(idxWQ < _bidCount && resumeIdxWQ < _bidCount && (idxWQ * _bidCount + resumeIdxWQ + iter <= _bidCount * _bidCount))) {
            revert DebugEngineError(14);
        }
        // Debug
        if (!(progress == idxWQ * _bidCount + resumeIdxWQ)) revert DebugEngineError(15);

        uint16 idx = idxWQ;
        uint16 resumeIdx = resumeIdxWQ;
        uint32 count = 0;
        uint8 code = S_NOT_FINISHED;
        address auctionAddr = address(_auction());

        while (count < iter) {
            ebool eq_id = TFHE.eq(_rankedBids[resumeIdx].id, _indexPlusOneToId[idx + 1]);
            quantity = TFHE.select(eq_id, _rankedWonQuantities[resumeIdx], quantity);

            resumeIdx++;

            if (resumeIdx == _bidCount) {
                // store won quantity
                _wonQuantities[idx] = quantity;
                TFHE.allowThis(quantity);
                TFHE.allow(quantity, auctionAddr);

                // reset cursor
                idx += 1;
                resumeIdx = 0;
                quantity = _eZeroU256;
            }

            count++;

            if (gasleft() < MIN_GAS_PER_WQ_CYCLE) {
                code = E_NOT_ENOUGH_GAS;
                break;
            }
        }

        if (progress + count == progressMax) {
            // Debug
            if (!(idx == _bidCount && resumeIdx == 0)) revert DebugEngineError(18);

            //could be removed
            _idxWQ = _bidCount;
            //not necessary ?
            //_resumeIdxWQ = 0;
            _wonQuantitiesByIdReady = true;

            return (S_FINISHED, count);
        }

        // Debug
        if (!(idx < _bidCount)) revert DebugEngineError(19);

        if (resumeIdx != resumeIdxWQ) {
            _resumeIdxWQ = resumeIdx;
        }

        if (idx != idxWQ) {
            _idxWQ = idx;
        }

        _quantityWQ = quantity;
        TFHE.allowThis(quantity);

        return (code, count);
    }

    /**
     * @dev Returns the encrypted bid ranked at position `rank`.
     * This function is meant be called by derived contracts.
     */
    function _rankedBidAt(uint16 rank) internal view returns (ABid storage bid) {
        bid = _rankedBids[rank];
    }

    /**
     * @dev Sets the encrypted bid ranked at position `rank`
     * This function is meant be called by derived contracts.
     */
    function _setRankedBidAt(uint16 rank, ABid memory newBid) internal {
        _rankedBids[rank] = newBid;
        _allowBid(newBid);
    }

    /**
     * @dev Grants the engine permission to access the encrypted bid values (`price`, `quantity`, `id`, `rand`).
     */
    function _allowBid(ABid memory bid_) private {
        TFHE.allowThis(bid_.price);
        TFHE.allowThis(bid_.quantity);
        TFHE.allowThis(bid_.id);
        if (TFHE.isInitialized(bid_.rand)) {
            TFHE.allowThis(bid_.rand);
        }
    }

    // ====================================================================== //
    //
    //               ⭐️ IFourStepsIterable implementation ⭐️
    //
    // ====================================================================== //

    function runStep1(uint32 progress, uint32 iter, uint32 progressMax)
        external
        virtual
        override
        onlyIterator
        returns (uint8, uint32)
    {
        return _runStep1(progress, iter, progressMax);
    }

    function runStep2(uint32 progress, uint32 iter, uint32 progressMax)
        external
        virtual
        override
        onlyIterator
        returns (uint8, uint32)
    {
        return _runStep2(progress, iter, progressMax);
    }

    function runStep3(uint32 progress, uint32 iter, uint32 progressMax)
        external
        virtual
        override
        onlyIterator
        returns (uint8, uint32)
    {
        return _runStep3(progress, iter, progressMax);
    }

    function runStep4(uint32 progress, uint32 iter, uint32 progressMax)
        external
        virtual
        override
        onlyIterator
        returns (uint8, uint32)
    {
        return _runStep4(progress, iter, progressMax);
    }
}
