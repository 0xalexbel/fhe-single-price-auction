#!/bin/bash

AUCTION_ADDR=0xf5ed4A9692e63fAf16FE4b57EA8970Db23e28A51

# Start auction
npx hardhat --network localhost auction start --address "${AUCTION_ADDR}" --duration 100000

# Bid
npx hardhat --network localhost auction bid --address "${AUCTION_ADDR}" --bidder 2 --price 200000000000 --quantity 500000
npx hardhat --network localhost auction bid --address "${AUCTION_ADDR}" --bidder 3 --price 800000000000 --quantity 600000
npx hardhat --network localhost auction bid --address "${AUCTION_ADDR}" --bidder 4 --price 1000000 --quantity 1000000

# Stops the auction
npx hardhat --network localhost auction stop --address "${AUCTION_ADDR}"

# Compute auction until ready for blind claim
npx hardhat --network localhost auction compute --address "${AUCTION_ADDR}" --count 1 --worker 4
npx hardhat --network localhost auction compute --address "${AUCTION_ADDR}" --count 2 --worker 3
npx hardhat --network localhost auction compute --address "${AUCTION_ADDR}" --count 1 --worker 3
npx hardhat --network localhost auction compute --address "${AUCTION_ADDR}" --count 1 --worker 3
npx hardhat --network localhost auction compute --address "${AUCTION_ADDR}" --count 1 --worker 3
npx hardhat --network localhost auction compute --address "${AUCTION_ADDR}" --count 1 --worker 3
npx hardhat --network localhost auction compute --address "${AUCTION_ADDR}" --count 1 --worker 3
npx hardhat --network localhost auction compute --address "${AUCTION_ADDR}" --count 5 --worker 3
