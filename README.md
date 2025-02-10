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
# Bob = 2, price = 200_000_000_000, quantity = 500_000 (Gas used: Bid=1_051_919)
npx hardhat --network sepolia auction bid --address 0xBb007ACDd6d18be638bC0B58be2a7a6C12b4639B --bidder 2 --price 200000000000 --quantity 500000
# Carol = 3, price = 800_000_000_000, quantity = 600_000 (Gas used: Approve=46_378, Deposit=64_623, Bid=997_795)
npx hardhat --network sepolia auction bid --address 0xBb007ACDd6d18be638bC0B58be2a7a6C12b4639B --bidder 3 --price 800000000000 --quantity 600000
# Gas used: Approve=46_354, Deposit=64_599, Bid=997_831
# David = 4, price = 1_000_000, quantity = 1_000_000 (Gas used: Approve=46_354, Deposit=64_599, Bid=997_831)
npx hardhat --network sepolia auction bid --address 0xBb007ACDd6d18be638bC0B58be2a7a6C12b4639B --bidder 4 --price 1000000 --quantity 1000000
```

Sepolia Tx:
Bob's bid Tx: 0x65331cc98fa8934b6a8f22240a2452e8c2596e608966960bbd5390d4fbef7777
Carol's bid Tx: 0x97552ae33689b0f49343e2356c46e13f1ad0a43ac6463b67200b36478fe97f2f
David's bid Tx: 0x66dfd2aa632b1bb1f932e20a3e23171cfee490459297254856496a4a31d56689

> [!WARNING]  
> The bid command requires the encryption of the price and quantity values. Sometimes the following error is raised :
> `Error: Gateway didn't response correctly`. This is usually due potential issues on Zama's Gateway server (server down or facing internal issues).
> In such a case the test on sepolia is not possible.

### Stop the auction

```bash
# Gas used 177_147
npx hardhat --network sepolia auction stop --address 0xBb007ACDd6d18be638bC0B58be2a7a6C12b4639B
```

Sepolia Tx: 0xe45135c09812e22ba02486ad0b84d1d73594d4c44e40a0311e3a2852ee411805

### Compute the auction

> [!WARNING]  
> A gas limit must be specified : minimum 1_000_000

In this example, 12 iterations are required to fully compute the auction prizes in blind mode (the most cost effective approach).

```bash
# Gas used: 447_959 (Tx: 0xee168db9edcb349c383d8cebd224c077f2dc4b1bc125ddf5fad11dab679a9e15)
npx hardhat --network sepolia auction compute --address 0xBb007ACDd6d18be638bC0B58be2a7a6C12b4639B --count 2 --worker 2 --gas-limit 2000000 --blind-claim
# Gas used: 271_758 (Tx: 0xc3a439779bc36f87199d2323e3d1d4630060179aeef0cdfa07d7e7c166441f41)
npx hardhat --network sepolia auction compute --address 0xBb007ACDd6d18be638bC0B58be2a7a6C12b4639B --count 2 --worker 3 --gas-limit 2000000 --blind-claim
# Gas used: 498_195 (Tx: 0xbb53638f49821792afbf37e03ba13c648cf1b16c33f99f1d61c4d2a3a237ef65)
npx hardhat --network sepolia auction compute --address 0xBb007ACDd6d18be638bC0B58be2a7a6C12b4639B --count 2 --worker 4 --gas-limit 2000000 --blind-claim
# Gas used: 450_512 (Tx: 0x64bc1d14650c1ec10607c99dcf241c69778b533d3e7985d9b74d5b6df49f7336)
npx hardhat --network sepolia auction compute --address 0xBb007ACDd6d18be638bC0B58be2a7a6C12b4639B --count 2 --worker 2 --gas-limit 2000000 --blind-claim
# Gas used: 508_647 (Tx: 0xdde23766d2e2c05bce43d019097fbdef555341ca3e5074418c5095679b0e2221) Progress=91%
npx hardhat --network sepolia auction compute --address 0xBb007ACDd6d18be638bC0B58be2a7a6C12b4639B --count 2 --worker 3 --gas-limit 2000000 --blind-claim
# Gas used: 433_290 (Tx: 0x5ddf738bcd05f3a7c6cbdc9fe5003016edffeb7fd5b7f508498a2c9b8ea65078) Progress=100%
npx hardhat --network sepolia auction compute --address 0xBb007ACDd6d18be638bC0B58be2a7a6C12b4639B --count 2 --worker 4 --gas-limit 2000000 --blind-claim
```

### Blind Claim prizes

```bash
# Bob's blind claim: Gas used: 347_756 (Tx: 0x06013e305cf689ac977af2ca1e9cb2c737594e1a4a528b99001916943f1dab12)
npx hardhat --network sepolia auction blind-claim --address 0xBb007ACDd6d18be638bC0B58be2a7a6C12b4639B --bidder 2
# Carol's blind claim: Gas used: 350_556 (Tx: 0xeb3a53d9e9aa71c546e11180ac2851ac3995afbc09d2fb336f4ae7e009157ed8)
npx hardhat --network sepolia auction blind-claim --address 0xBb007ACDd6d18be638bC0B58be2a7a6C12b4639B --bidder 3
# David's blind claim: Gas used: 350_556 (Tx: 0x8f4186e91a047e0f174c78af533e00790ab3a01dc07a982422712975617101aa)
npx hardhat --network sepolia auction blind-claim --address 0xBb007ACDd6d18be638bC0B58be2a7a6C12b4639B --bidder 4
```
