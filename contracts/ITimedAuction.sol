// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

interface ITimedAuction {
    function closed() external view returns (bool);
}
