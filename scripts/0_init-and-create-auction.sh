#!/bin/bash

# WARNING!
# Before proceeding, a node instance must be launched.
# `npx hardhat node --gasprice 79843044542`

# Alice = beneficiary = 1
npx hardhat --network localhost eth set-min-balance --account 1 --min 10001eth
# Bob = 2
npx hardhat --network localhost eth set-min-balance --account 2 --min 10001eth
# Carol = 3
npx hardhat --network localhost eth set-min-balance --account 3 --min 10001eth
# David = 4
npx hardhat --network localhost eth set-min-balance --account 4 --min 10001eth

# Alice = beneficiary = 1 (set balance to quantity)
npx hardhat --network localhost erc20 transfer --token auction --to 1 --amount 1000000

# Bob = 2 (100000000000000000)
npx hardhat --network localhost erc20 transfer --token payment --to 2 --price 200000000000 --quantity 500000
# Carol = 3 (480000000000000000)
npx hardhat --network localhost erc20 transfer --token payment --to 3 --price 800000000000 --quantity 600000
# David = 4 (1000000000000)
npx hardhat --network localhost erc20 transfer --token payment --to 4 --price 1000000 --quantity 1000000

echo "====================================="
npx hardhat --network localhost eth balance --account 1
npx hardhat --network localhost eth balance --account 2
npx hardhat --network localhost eth balance --account 3
npx hardhat --network localhost eth balance --account 4
echo "====================================="
npx hardhat --network localhost erc20 balance --token auction --account 1
echo "====================================="
npx hardhat --network localhost erc20 balance --token payment --account 2
npx hardhat --network localhost erc20 balance --token payment --account 3
npx hardhat --network localhost erc20 balance --token payment --account 4
echo "====================================="

# Create new auction
# Alice = beneficiary = 1
# Quantity = 1000000
npx hardhat --network localhost auction create --type erc20 \
    --beneficiary 1 \
    --salt MyFHEAuction1 \
    --quantity 1000000 \
    --minimum-payment-deposit 1000000 \
    --payment-penalty 500 \
    --max-bid-count 3
