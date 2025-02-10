// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {FHEAuctionEngine} from "./FHEAuctionEngine.sol";

contract FHEAuctionEngineProRata is FHEAuctionEngine {
    constructor(address auction_, address iterator_)
        FHEAuctionEngine(auction_, uint8(TieBreakingRule.ProRata), iterator_)
    {}

    /**
     * @dev Returns the fixed FHE gas cost per iteration for executing {_rankFromIdxToIdx}.
     */
    function _rankFheGasCostPerIdx() internal pure virtual override returns (uint32) {
        return 0;
    }

    function _rankFromIdxToIdx(uint16, /*fromIdx*/ uint16, /*toIdx*/ ABid memory /*cursor*/ )
        internal
        virtual
        override
    {
        if (true) {
            revert("Not yet implemented");
        }
    }
}
