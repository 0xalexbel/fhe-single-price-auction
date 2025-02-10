// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {ITimedAuction} from "./ITimedAuction.sol";

abstract contract TimedAuction is ITimedAuction {
    uint256 private _startTime;
    uint256 private _endTime;
    uint256 private _flags;
    bool private _stoppable;

    /*
     * State Graph:
     * ------------
     *         UNINITIALIZED               ->  INITIALIZED
     *         INITIALIZED                 ->  INITIALIZED_TERMINATED
     *                                         INITIALIZED_STARTED
     *         INITIALIZED_STARTED         ->  INITIALIZED_STARTED_ENDED
     *                                         INITIALIZED_STARTED_ENDED_TERMINATED
     *         INITIALIZED_STARTED_ENDED   ->  INITIALIZED_STARTED_ENDED_TERMINATED
     */

    uint256 private constant UNINITIALIZED = uint256(0x0);
    uint256 private constant INITIALIZED = uint256(0x1);
    uint256 private constant INITIALIZED_TERMINATED = uint256(0x9);
    uint256 private constant INITIALIZED_STARTED = uint256(0x3);
    uint256 private constant INITIALIZED_STARTED_ENDED = uint256(0x7);
    uint256 private constant INITIALIZED_STARTED_ENDED_TERMINATED = uint256(0xF);

    uint256 private constant FLAGS_INITIALIZED = uint256(0x1);
    uint256 private constant FLAGS_STARTED = uint256(0x2);
    uint256 private constant FLAGS_ENDED = uint256(0x4);
    uint256 private constant FLAGS_TERMINATED = uint256(0x8);

    error NotInitialized();
    error NotInitializable();
    error NotStartable();
    error NotStoppable();
    error NotTerminable();
    error NotStarted();
    error NotOpen();
    error NotClosed();
    error InvalidDuration();

    constructor() {}

    function durationInSeconds() public view returns (uint256) {
        return _endTime - _startTime;
    }

    function startTime() public view returns (uint256) {
        return _startTime;
    }

    function endTime() public view returns (uint256) {
        return _endTime;
    }

    function _state() internal view returns (uint256) {
        uint256 f = _flags;
        if (f == INITIALIZED_STARTED) {
            if (block.timestamp >= _endTime) {
                return f | FLAGS_ENDED;
            }
        }
        return f;
    }

    function _initialize() internal whenInitializable {
        _flags = INITIALIZED;
    }

    function _start(uint256 durationInSeconds_, bool stoppable_) internal whenStartable {
        if (durationInSeconds_ == 0) {
            revert InvalidDuration();
        }

        _flags = INITIALIZED_STARTED;

        _startTime = block.timestamp;
        _endTime = _startTime + durationInSeconds_;
        _stoppable = stoppable_;
    }

    function _stop() internal whenStoppable {
        _flags = INITIALIZED_STARTED_ENDED;
    }

    function _terminate() internal whenTerminable {
        if (_flags == INITIALIZED) {
            _flags = INITIALIZED_TERMINATED;
        } else {
            _flags = INITIALIZED_STARTED_ENDED_TERMINATED;
        }
    }

    /**
     * @notice Returns `true` if the auction can be manually stopped.
     */
    function stoppable() public view returns (bool) {
        return _stoppable;
    }

    /**
     * @notice Returns `true` if the auction is ready to start, `false` otherwise.
     */
    function canStart() public view returns (bool) {
        return _flags == INITIALIZED;
    }

    /**
     * @notice Returns `true` if the auction can be stopped by calling the {stop} function, `false` otherwise.
     */
    function canStop() public view returns (bool) {
        return (_flags == INITIALIZED_STARTED) && _stoppable;
    }

    /**
     * @notice Returns `true` if the auction can be terminated by calling the {terminate} function, `false` otherwise.
     */
    function canTerminate() public view returns (bool) {
        uint256 f = _flags;
        if (f == UNINITIALIZED || f == INITIALIZED_TERMINATED || f == INITIALIZED_STARTED_ENDED_TERMINATED) {
            return false;
        }

        // state == INITIALIZED or INITIALIZED_STARTED or INITIALIZED_STARTED_ENDED
        uint256 state = _state();
        if (state == INITIALIZED_STARTED || state == INITIALIZED_STARTED_ENDED) {
            if (!_canTerminateAfterStart()) {
                return false;
            }
        }

        return true;
    }

    function _canTerminateAfterStart() internal view virtual returns (bool) {
        return true;
    }

    /**
     * @notice Returns `true` if the auction has been initialized, `false` otherwise.
     */
    function initialized() public view returns (bool) {
        return _flags != UNINITIALIZED;
    }

    /**
     * @notice Returns `true` if the auction is initialized and ready to accept bids, `false` otherwise.
     */
    function isOpen() public view returns (bool) {
        return _state() == INITIALIZED_STARTED;
    }

    /**
     * @notice Returns the auction status code. Can be one of the following values.
     *      - UNINITIALIZED = uint256(0x0)
     *      - INITIALIZED = uint256(0x1)
     *      - INITIALIZED_TERMINATED = uint256(0x9)
     *      - INITIALIZED_STARTED = uint256(0x3)
     *      - INITIALIZED_STARTED_ENDED = uint256(0x7)
     *      - INITIALIZED_STARTED_ENDED_TERMINATED = uint256(0xF)
     */
    function statusCode() public view returns (uint256) {
        return _state();
    }

    /**
     * @notice Returns `true` if the auction is ready to compute the auction prizes, `false` otherwise.
     * When the auction is closed, it can no more accept bids.
     */
    function closed() public view returns (bool) {
        return _state() == INITIALIZED_STARTED_ENDED;
    }

    function terminated() public view returns (bool) {
        return _flags & FLAGS_TERMINATED != 0;
    }

    /**
     * @dev Throws if the auction cannot be initialized.
     */
    modifier whenInitializable() {
        if (_flags != UNINITIALIZED) {
            revert NotInitializable();
        }
        _;
    }

    /**
     * @dev Throws if the auction is not initialized.
     */
    modifier whenInitialized() {
        if (!initialized()) {
            revert NotInitialized();
        }
        _;
    }

    /**
     * @dev Throws if the auction cannot be started.
     */
    modifier whenStartable() {
        if (!canStart()) {
            revert NotStartable();
        }
        _;
    }

    /**
     * @dev Throws if the auction cannot be stopped.
     */
    modifier whenStoppable() {
        if (!canStop()) {
            revert NotStoppable();
        }
        _;
    }

    /**
     * @dev Throws if the auction cannot be terminated.
     */
    modifier whenTerminable() {
        if (!canTerminate()) {
            revert NotTerminable();
        }
        _;
    }

    /**
     * @dev Throws if the auction is not started.
     */
    modifier whenStarted() {
        if ((_state() & FLAGS_STARTED) != 0) {
            revert NotStarted();
        }
        _;
    }

    /**
     * @dev Throws if the auction is not open and accepting new bids.
     */
    modifier whenIsOpen() {
        _requireIsOpen();
        _;
    }

    /**
     * @dev Throws if the auction is not closed (in prize computing state).
     */
    modifier whenClosed() {
        if (!closed()) {
            revert NotClosed();
        }
        _;
    }

    /**
     * @dev Throws if the auction is not open and accepting new bids.
     */
    function _requireIsOpen() internal view virtual {
        if (_state() != INITIALIZED_STARTED) {
            revert NotOpen();
        }
    }
}
