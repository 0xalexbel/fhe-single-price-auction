// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IFourStepsIterable {
    function runStep1(uint32 progress, uint32 iter, uint32 progressMax) external returns (uint8, uint32);
    function runStep2(uint32 progress, uint32 iter, uint32 progressMax) external returns (uint8, uint32);
    function runStep3(uint32 progress, uint32 iter, uint32 progressMax) external returns (uint8, uint32);
    function runStep4(uint32 progress, uint32 iter, uint32 progressMax) external returns (uint8, uint32);
}

/*
 * Return code, iterations were completed but the computation step is not finished
 */
uint8 constant S_NOT_FINISHED = 0;

/*
 * Return code, iterations were completed and the computation step is finished 
 */
uint8 constant S_FINISHED = 1;

/*
 * Return code, iterations could not be completed due to insufficient gas.
 */
uint8 constant E_NOT_ENOUGH_GAS = 2;

abstract contract FourStepsIterator is Ownable {
    struct Step {
        uint32 size;
        uint8 nativeGasWeight;
        uint32 unitFheGasCost;
    }

    uint64[] _cumulatives;
    Step[] _steps; // len = (4+1)
    uint8 _step; // 0 <= _step <= 4
    uint32 _stepProgress;
    uint64 _iterProgress;

    error NullWeight();
    error UnauthorizedIterable();
    //18,992           | 21,952

    constructor(address initialOwner) Ownable(initialOwner) {
        // _steps[4] should exist
        for (uint8 i = 0; i < 5; ++i) {
            _steps.push(Step({size: 0, nativeGasWeight: 0, unitFheGasCost: 0}));
            _cumulatives.push(0);
        }
    }

    function _initializeFourSteps(Step[] memory fourSteps) internal {
        //Debug
        require(fourSteps.length <= 4);

        uint64 max = 0;
        uint8 i;
        for (i = 0; i < fourSteps.length; ++i) {
            if (fourSteps[i].size > 0 && fourSteps[i].nativeGasWeight == 0) {
                revert NullWeight();
            }
            max += fourSteps[i].size * fourSteps[i].nativeGasWeight;
            Step storage s = _steps[i];
            s.size = fourSteps[i].size;
            s.nativeGasWeight = fourSteps[i].nativeGasWeight;
            s.unitFheGasCost = fourSteps[i].unitFheGasCost;
            _cumulatives[i] = max;
        }

        while (i < 4) {
            _cumulatives[i] = max;
            i++;
        }
    }

    /**
     * @dev Returns the minimum number of completed iterations needed in order to complete step `s`
     */
    function _minIterProgressForStep(uint8 s) internal view returns (uint64) {
        return _cumulatives[s];
    }

    /**
     * @dev Returns the minimum number of completed iterations needed in order to complete the four steps
     */
    function iterProgressMax() public view returns (uint64) {
        return _cumulatives[3];
    }

    /**
     * @dev Returns the number of completed iterations (`iterProgress()` <= `iterProgressMax()`).
     */
    function iterProgress() public view returns (uint64) {
        return _iterProgress;
    }

    function getStepProgress(uint8 s) public view returns (uint32) {
        uint8 cur = _step;
        if (cur == s) {
            return _stepProgress;
        } else if (cur > s) {
            return _steps[s].size;
        }
        return 0;
    }

    function getStepProgressMax(uint8 s) public view returns (uint32) {
        return _steps[s].size;
    }

    function getStepIterProgressMax(uint8 s) public view returns (uint64) {
        return _steps[s].size * _steps[s].nativeGasWeight;
    }

    function step() public view returns (uint8) {
        return _step;
    }

    function stepProgress() public view returns (uint32) {
        return _stepProgress;
    }

    function finished() public view returns (bool) {
        return _step == 4;
    }

    /**
     * @dev Executes up to `iter` computation iterations, stopping early if step `maxStepCompleted` is fully processed.
     *
     * @param iter The maximum number of computation iterations to execute.
     * @param stopAfterStep The computation step at which execution should stop if it has been fully completed.
     * @return code A status code indicating the outcome of the computation:
     *      - `S_NOT_FINISHED` = 0 : More cycles are required to complete the computation.
     *      - `S_FINISHED` = 1 : The full auction computation successfully completed.
     *      - `E_NOT_ENOUGH_GAS` = 2 : Insufficient gas to continue processing.
     * @return startIterProgress The total number of iterations completed before this function call.
     * @return endIterProgress The total number of iterations completed after this function call.
     *         The difference `(endIterProgress - startIterProgress)` represents the number of iterations executed in this call.
     */
    function _next(uint64 iter, uint8 stopAfterStep)
        internal
        returns (uint8 code, uint64 startIterProgress, uint64 endIterProgress)
    {
        //uint8 s0 = _step;
        //uint8 s = s0;
        uint8 s = _step;

        startIterProgress = _iterProgress;
        endIterProgress = startIterProgress;

        code = (s == 4) ? S_FINISHED : S_NOT_FINISHED;

        if (s > stopAfterStep) {
            return (code, startIterProgress, endIterProgress);
        }

        //uint32 p0 = _stepProgress;
        //uint32 p = p0;
        uint32 fheGasLeft = 10_000_000;
        uint32 p = _stepProgress;
        uint64 actualIter = 0;
        IFourStepsIterable iterable = IFourStepsIterable(owner());

        while (s < 4 && s <= stopAfterStep && fheGasLeft > 0) {
            Step memory theStep = _steps[s];

            uint32 r = theStep.size - p;

            // skip empty steps first.
            if (r == 0) {
                p = 0;
                s += 1;
                continue;
            }

            // after having skipped empty steps
            if (iter == 0) {
                break;
            }

            uint32 w = uint32(theStep.nativeGasWeight);
            uint32 i;
            if (iter < w) {
                // align
                i = 1;
                iter = w;
            } else {
                if (iter >= r * w) {
                    i = r;
                } else {
                    i = uint32(iter / w);
                }
            }

            if (i * theStep.unitFheGasCost > fheGasLeft) {
                i = uint32(fheGasLeft / theStep.unitFheGasCost);

                if (i == 0) {
                    fheGasLeft = 0;
                    break;
                }
            }

            fheGasLeft -= uint32(i * theStep.unitFheGasCost);

            uint32 j;

            if (s == 0) {
                (code, j) = iterable.runStep1(p, i, theStep.size);
            } else if (s == 1) {
                (code, j) = iterable.runStep2(p, i, theStep.size);
            } else if (s == 2) {
                (code, j) = iterable.runStep3(p, i, theStep.size);
            } else if (s == 3) {
                (code, j) = iterable.runStep4(p, i, theStep.size);
            }

            actualIter += j * w;
            iter -= j * w;
            p += j;

            if (code == S_FINISHED) {
                //Debug
                require(p == theStep.size, "Panic: p != theStep.size");
                p = 0;
                s += 1;
            } else {
                //Debug
                require(p < theStep.size, "Panic: p >= theStep.size");
                if (code != S_NOT_FINISHED) {
                    //Debug
                    require(code == E_NOT_ENOUGH_GAS, "Panic: code != E_NOT_ENOUGH_GAS");
                    break;
                }
            }
        }

        if (iter > 0 && fheGasLeft == 0) {
            code = E_NOT_ENOUGH_GAS;
        }

        if (actualIter > 0) {
            endIterProgress = startIterProgress + actualIter;
            _iterProgress = endIterProgress;
        }

        _stepProgress = p;
        _step = s;

        if (code != E_NOT_ENOUGH_GAS) {
            code = (s == 4) ? S_FINISHED : S_NOT_FINISHED;
        }
    }
}
