// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {FourStepsIterator, IFourStepsIterable} from "../FourStepsIterator.sol";
import {FHEAuctionEngine} from "./FHEAuctionEngine.sol";

// For better readability, steps are named using a one-based index.
uint8 constant STEP_1_VALIDATION = 0;
uint8 constant STEP_2_SORT = 1;
uint8 constant STEP_3_WON_QUANTITIES_BY_RANK = 2;
uint8 constant STEP_4_WON_QUANTITIES_BY_ID = 3;

contract FHEAuctionEngineIterator is FourStepsIterator {
    constructor(address initialOwner) FourStepsIterator(initialOwner) {}

    function initializeFourSteps(
        uint16 bidCount,
        uint32 step1UnitFheGasCost,
        uint32 step2UnitFheGasCost,
        uint32 step3UnitFheGasCost,
        uint32 step4UnitFheGasCost,
        bool onlyBlindClaim
    ) external onlyOwner {
        FourStepsIterator.Step[] memory fourSteps = new FourStepsIterator.Step[](4);

        fourSteps[0].size = bidCount;
        fourSteps[0].nativeGasWeight = 1;
        fourSteps[0].unitFheGasCost = step1UnitFheGasCost;

        fourSteps[1].size = (bidCount == 0) ? 0 : ((bidCount < 3) ? 1 : bidCount * (bidCount - 1) / 2);
        fourSteps[1].nativeGasWeight = 2;
        fourSteps[1].unitFheGasCost = step2UnitFheGasCost;

        fourSteps[2].size = bidCount;
        fourSteps[2].nativeGasWeight = 1;
        fourSteps[2].unitFheGasCost = step3UnitFheGasCost;

        if (!onlyBlindClaim) {
            fourSteps[3].size = bidCount * bidCount;
            fourSteps[3].nativeGasWeight = 1;
            fourSteps[3].unitFheGasCost = step4UnitFheGasCost;
        }

        _initializeFourSteps(fourSteps);
    }

    /**
     * @notice Returns the minimum number of computation iterations required to execute a blind claim.
     */
    function minIterationsForBlindClaim() external view returns (uint64) {
        // steps #1 to #3 must be completed. See {FHEAuctionEngine} for more details.
        return _minIterProgressForStep(STEP_3_WON_QUANTITIES_BY_RANK);
    }

    /**
     * @notice Returns the minimum number of computation iterations required to finalize the auction uniform price.
     */
    function minIterationsForUniformPrice() external view returns (uint64) {
        // steps #1 to #3 must be completed. See {FHEAuctionEngine} for more details.
        return _minIterProgressForStep(STEP_3_WON_QUANTITIES_BY_RANK);
    }

    /**
     * @notice see {FHEAuctionEngine-computeAuctionIterations}
     */
    function computeAuctionIterations(uint64 iter, bool stopIfReadyForBlindClaim)
        external
        onlyOwner
        returns (uint8 code, uint64 startIterProgress, uint64 endIterProgress)
    {
        (code, startIterProgress, endIterProgress) =
            _next(iter, (stopIfReadyForBlindClaim) ? STEP_3_WON_QUANTITIES_BY_RANK : STEP_4_WON_QUANTITIES_BY_ID);
    }
}
