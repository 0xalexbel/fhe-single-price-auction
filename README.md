## Setting up the environment

Three tokens are involved in the following test.

1. ETH for gas payment
2. AuctionERC20 (AUC) the pre-deployed ERC20 token put up for auction by Alice the beneficiary
3. PaymentERC20 (PAY) the pre-deployed ERC20 token used for auction payments

### Wallets ETH balance setup

The wallets of Alice, Bob, Carol and David must be topped up with at least 1.0 ETH to proceed.

```bash
# Set Alice=1 balance to 1.0 ETH
npx hardhat --network sepolia eth set-min-balance --min 1000000000000000000 --account 1
# Set Bob=2 balance to 1.0 ETH
npx hardhat --network sepolia eth set-min-balance --min 1000000000000000000 --account 2
# Set Carol=3 balance to 1.0 ETH
npx hardhat --network sepolia eth set-min-balance --min 1000000000000000000 --account 3
# Set David=4 balance to 1.0 ETH
npx hardhat --network sepolia eth set-min-balance --min 1000000000000000000 --account 4
```

### Wallets AUC (AuctionERC20) balance setup

```bash
# Set Alice=1 balance to 1000000 AUC (1000000 is the future quantity of token put up for auction)
npx hardhat --network sepolia erc20 transfer --token auction --to 1 --amount 1000000
```

### Wallets PAY (PaymentERC20) balance setup

```bash
# Set Bob=2 balance to 100000000000000000 AUC (price * quantity = 200000000000 * 500000)
npx hardhat --network sepolia erc20 transfer --token payment --to 2 --price 200000000000 --quantity 500000
# Set Carol=3 balance to 480000000000000000 AUC (price * quantity = 800000000000 * 600000)
npx hardhat --network sepolia erc20 transfer --token payment --to 3 --price 800000000000 --quantity 600000
# Set David=4 balance to 1000000000000 AUC (price * quantity = 1000000 * 1000000)
npx hardhat --network sepolia erc20 transfer --token payment --to 4 --price 1000000 --quantity 1000000
```

### Create a new auction

```bash
# Gas used : 7_485_470
# Alice = beneficiary = 1, Quantity = 1000000 (previously transfered to Alice's wallet)
npx hardhat --network sepolia auction create --type erc20 --beneficiary 1 --salt MyFHEAuction1 --quantity 1000000 --minimum-payment-deposit 1000000 --payment-penalty 500 --max-bid-count 3
```

Output:

```bash
🚀 New ERC20 auction at address 0xBb007ACDd6d18be638bC0B58be2a7a6C12b4639B has been successfully created.
```

### Start the new auction

- Once everything is set up, we can start the new auction and open it for bidders. Note that, by default, an auction is always flagged as manually stoppable,
  meaning the auction owner can call the stop command.

- The `start` command will automatically retreive the auction's owner wallet in order to run the command.

```bash
# Gas used : 7_485_470
# Alice = beneficiary = 1, Quantity = 1000000 (previously transfered to Alice's wallet)
npx hardhat --network sepolia auction start --address 0xBb007ACDd6d18be638bC0B58be2a7a6C12b4639B --duration 100000
```

You can also use the `--salt` argument to specify the auction. The command bellow is equivalent to the command above.

```bash
# Gas:
# Token Approval : 46_342
# Auction Start  : 121_384
# Alice = beneficiary = 1, Quantity = 1000000 (previously transfered to Alice's wallet)
npx hardhat --network sepolia auction start --type erc20 --beneficiary 1 --salt MyFHEAuction1 --duration 100000
```

### Place bids

```bash
# Bob = 2, price = 200_000_000_000, quantity = 500_000
npx hardhat --network sepolia auction bid --address 0xBb007ACDd6d18be638bC0B58be2a7a6C12b4639B --bidder 2 --price 200000000000 --quantity 500000
# Carol = 3, price = 800_000_000_000, quantity = 600_000
npx hardhat --network sepolia auction bid --address 0xBb007ACDd6d18be638bC0B58be2a7a6C12b4639B --bidder 3 --price 800000000000 --quantity 600000
# David = 4, price = 1_000_000, quantity = 1_000_000
npx hardhat --network sepolia auction bid --address 0xBb007ACDd6d18be638bC0B58be2a7a6C12b4639B --bidder 4 --price 1000000 --quantity 1000000
```

> [!WARNING]  
> The bid command requires the encryption of the price and quantity values. Sometimes the following error is raised :
> `Error: Gateway didn't response correctly`. This is usually due potential issues on Zama's Gateway server (server down or facing internal issues).
> In such a case the test on sepolia is not possible.

### Stop the auction

```bash
npx hardhat --network sepolia auction stop --address 0xBb007ACDd6d18be638bC0B58be2a7a6C12b4639B
```

### Compute the auction

```bash
npx hardhat --network sepolia auction compute --address 0xBb007ACDd6d18be638bC0B58be2a7a6C12b4639B --count 1 --worker 2
npx hardhat --network sepolia auction compute --address 0xBb007ACDd6d18be638bC0B58be2a7a6C12b4639B --count 1 --worker 3
npx hardhat --network sepolia auction compute --address 0xBb007ACDd6d18be638bC0B58be2a7a6C12b4639B --count 1 --worker 4
```
