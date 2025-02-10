// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {FourStepsIterator, IFourStepsIterable, S_FINISHED, S_NOT_FINISHED} from "../FourStepsIterator.sol";

contract FourStepsIteratorMock is FourStepsIterator, IFourStepsIterable {
    uint64[] private _theCumulatives;
    uint32[] private _theStepProgress;
    Step[] private _theSteps;

    constructor(address initialOwner) FourStepsIterator(initialOwner) {}

    function initializeFourSteps(Step[] calldata fourSteps) external {
        for (uint8 i = 0; i < 4; ++i) {
            _theSteps.push(Step({size: 0, nativeGasWeight: 0, unitFheGasCost: 0}));
            _theStepProgress.push(0);
            _theCumulatives.push(0);

            if (fourSteps.length > i) {
                _theSteps[i].size = fourSteps[i].size;
                _theSteps[i].nativeGasWeight = fourSteps[i].nativeGasWeight;
                _theSteps[i].unitFheGasCost = fourSteps[i].unitFheGasCost;
                if (i == 0) {
                    _theCumulatives[0] = fourSteps[0].size * fourSteps[0].nativeGasWeight;
                } else {
                    _theCumulatives[i] = fourSteps[i].size * fourSteps[i].nativeGasWeight + _theCumulatives[i - 1];
                }
            }
        }

        _initializeFourSteps(fourSteps);
    }

    function next(uint32 iter, uint8 stopAfterStep)
        external
        returns (uint8 code, uint64 startIterProgress, uint64 endIterProgress)
    {
        return _next(iter, stopAfterStep);
    }

    function runStep1(uint32 progress, uint32 iter, uint32 progressMax)
        public
        virtual
        override
        returns (uint8, uint32)
    {
        return _runStep(0, progress, iter, progressMax);
    }

    function runStep2(uint32 progress, uint32 iter, uint32 progressMax)
        public
        virtual
        override
        returns (uint8, uint32)
    {
        return _runStep(1, progress, iter, progressMax);
    }

    function runStep3(uint32 progress, uint32 iter, uint32 progressMax)
        public
        virtual
        override
        returns (uint8, uint32)
    {
        return _runStep(2, progress, iter, progressMax);
    }

    function runStep4(uint32 progress, uint32 iter, uint32 progressMax)
        public
        virtual
        override
        returns (uint8, uint32)
    {
        return _runStep(3, progress, iter, progressMax);
    }

    function _runStep(uint8 idx, uint32 progress, uint32 iter, uint32 progressMax) internal returns (uint8, uint32) {
        require(iter > 0, "iter == 0");
        require(_theStepProgress[idx] < _theSteps[idx].size, "_stepProgress >= _step.size");
        require(_theStepProgress[idx] == progress, "_stepProgress != progress");
        require(progress + iter <= _theSteps[idx].size, "progress + iter > _step.size");
        require(progressMax == _theSteps[idx].size, "progressMax != _theSteps[idx].size");
        require(
            _minIterProgressForStep(idx) == _theCumulatives[idx], "_minIterProgressForStep(idx) != _theCumulatives[idx]"
        );

        _theStepProgress[idx] = progress + iter;

        uint8 code = (progress + iter == _theSteps[idx].size) ? S_FINISHED : S_NOT_FINISHED;

        return (code, iter);
    }
}
