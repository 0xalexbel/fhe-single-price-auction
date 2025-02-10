// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {TFHE, euint16, euint256} from "fhevm/lib/TFHE.sol";
import {FHEAuctionEngine} from "../../engines/FHEAuctionEngine.sol";
import {
    FHEAuctionEngineIterator,
    STEP_1_VALIDATION,
    STEP_2_SORT,
    STEP_3_WON_QUANTITIES_BY_RANK,
    STEP_4_WON_QUANTITIES_BY_ID
} from "../../engines/FHEAuctionEngineIterator.sol";
import {FourStepsIterator, IFourStepsIterable, S_FINISHED} from "../../FourStepsIterator.sol";

abstract contract FHEAuctionEngineBaseMock is FHEAuctionEngine {
    function allowBids() external {
        uint16 n = getBidCount();
        for (uint16 i = 0; i < n; ++i) {
            // external call is better for coprocessorUtils.ts
            this.allowAccountToAccessBidByIndex(i, msg.sender);
        }
    }

    function allowRankedBids() external {
        uint16 n = getBidCount();
        for (uint16 i = 0; i < n; ++i) {
            // external call is better for coprocessorUtils.ts
            this.allowAccountToAccessBidByRank(i, msg.sender);
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

    function allowAccountToAccessBidByRank(uint16 rank, address account) public {
        require(address(this) == msg.sender, "Sender is not this");
        (euint16 id, euint256 price, euint256 quantity) = getBidByRank(rank);

        // require(TFHE.isAllowed(price, address(this)), "This is not allowed to access price");
        // require(TFHE.isAllowed(quantity, address(this)), "This is not allowed to access quantity");
        // require(TFHE.isAllowed(id, address(this)), "This is not allowed to access id");

        TFHE.allow(id, account);
        TFHE.allow(price, account);
        TFHE.allow(quantity, account);
    }

    function allowAccountToAccessBidByIndex(uint16 idx, address account) public {
        require(address(this) == msg.sender, "Sender is not this");
        (, euint256 price, euint256 quantity) = getBidByIndex(idx);

        // require(TFHE.isAllowed(price, address(this)), "This is not allowed to access price");
        // require(TFHE.isAllowed(quantity, address(this)), "This is not allowed to access quantity");

        TFHE.allow(price, account);
        TFHE.allow(quantity, account);
    }

    function _computeAuctionStepIterations(uint8 step, uint64 chunckSize) internal returns (uint8) {
        FHEAuctionEngineIterator aei = FHEAuctionEngineIterator(iterator());

        uint8 s = aei.step();
        if (s > step) {
            return S_FINISHED;
        }
        require(s == step, "s != step");

        uint64 mx = aei.getStepIterProgressMax(s);
        chunckSize = (chunckSize > mx) ? mx : chunckSize;

        (uint8 code,,) = aei.computeAuctionIterations(chunckSize, false);
        return code;
    }

    // ====================================================================== //
    //
    //                    ⭐️ Step 1/4: Bid Validation ⭐️
    //
    // ====================================================================== //

    function validationCompleted() public view returns (bool) {
        return FHEAuctionEngineIterator(iterator()).step() > STEP_1_VALIDATION;
    }

    function validationProgress() external view returns (uint32) {
        return FHEAuctionEngineIterator(iterator()).getStepProgress(STEP_1_VALIDATION);
    }

    function validationProgressMax() external view returns (uint32) {
        return FHEAuctionEngineIterator(iterator()).getStepProgressMax(STEP_1_VALIDATION);
    }

    function computeValidation(uint64 chunckSize) external whenClosed returns (uint8) {
        return _computeAuctionStepIterations(STEP_1_VALIDATION, chunckSize);
    }

    // ====================================================================== //
    //
    //                ⭐️ Step 2/4: Sort Bids by Rank Order ⭐️
    //
    // ====================================================================== //

    function sortCompleted() public view returns (bool) {
        //return _rankedBidCount == _bidCount && _bidCount > 0;
        return FHEAuctionEngineIterator(iterator()).step() > STEP_2_SORT;
    }

    function sortProgress() external view returns (uint32) {
        return FHEAuctionEngineIterator(iterator()).getStepProgress(STEP_2_SORT);
    }

    function sortProgressMax() external view returns (uint32) {
        //return _rankedBidsProgressMax(_bidCount);
        return FHEAuctionEngineIterator(iterator()).getStepProgressMax(STEP_2_SORT);
    }

    function computeSort(uint64 chunckSize) external whenClosed returns (uint8) {
        return _computeAuctionStepIterations(STEP_2_SORT, chunckSize);
    }

    // ====================================================================== //
    //
    //              ⭐️ Step 3/4: Compute Ranked Won Quantities ⭐️
    //
    // ====================================================================== //

    function wonQuantitiesByRankProgress() external view returns (uint32) {
        //return _resumeIdxRWQ;
        return FHEAuctionEngineIterator(iterator()).getStepProgress(STEP_3_WON_QUANTITIES_BY_RANK);
    }

    function wonQuantitiesByRankProgressMax() external view returns (uint32) {
        //return _bidCount;
        return FHEAuctionEngineIterator(iterator()).getStepProgressMax(STEP_3_WON_QUANTITIES_BY_RANK);
    }

    function computeWonQuantitiesByRank(uint64 chunckSize) external returns (uint8) {
        return _computeAuctionStepIterations(STEP_3_WON_QUANTITIES_BY_RANK, chunckSize);
    }

    // ====================================================================== //
    //
    //                ⭐️ Step 4/4: Compute Won Quantities ⭐️
    //
    // ====================================================================== //

    function wonQuantitiesByIdProgress() external view returns (uint32) {
        //return _idxWQ * _bidCount + _resumeIdxWQ;
        return FHEAuctionEngineIterator(iterator()).getStepProgress(STEP_4_WON_QUANTITIES_BY_ID);
    }

    function wonQuantitiesByIdProgressMax() external view returns (uint32) {
        //return _bidCount * _bidCount;
        return FHEAuctionEngineIterator(iterator()).getStepProgressMax(STEP_4_WON_QUANTITIES_BY_ID);
    }

    function computeWonQuantitiesById(uint64 chunckSize) external returns (uint8) {
        return _computeAuctionStepIterations(STEP_4_WON_QUANTITIES_BY_ID, chunckSize);
    }
}
