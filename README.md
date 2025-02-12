# Install

```bash
pnpm install
```

# Test

```bash
npx hardhat test
```

> [!NOTE]  
> fhevmjsMocked.ts, asyncDecrypt.ts and coprocessorUtils.ts where improved to add support to 'hardhat node' + task debug.

```bash
# Run a standalone node
npx hardhad node
# Test tasks only
npx hardhat --network localhost test --grep "sepolia.tasks.priceid.erc20"
```

# Deploy on Sepolia

```bash
# Gas : 612_056
npx hardhat --network sepolia deploy --tags PaymentERC20 --report-gas
# Gas : 612_056
npx hardhat --network sepolia deploy --tags AuctionERC20 --report-gas
# Gas: 23_715_561
npx hardhat --network sepolia deploy --tags AuctionFactories --report-gas
```

# Major Commands

```bash
# Displays the list of auction related commands
npx hardhat auction --help
```

```bash
# Displays the list of ERC20 Token related commands
npx hardhat erc20 --help
```

```bash
# Displays the list of ETH Token related commands
npx hardhat eth --help
```

## Auction Commands

- `auction create` : creates a new auction
- `auction start` : starts a existing auction, and make ready to accept bids
- `auction bid` : place a new bid
- `auction cancel-bid` : cancels a bid (when the auction is open)
- `auction stop` : stops a existing auction, and make ready to compute
- `auction compute` : execute chunck-by-chunck computing iterations
- `auction decrypt-uniform-price` : decrypts the computed uniform price
- `auction award` or `auction claim` : to distribute prizes

## ERC20 Commands

- `erc20 balance` : prints the balance of an account
- `erc20 transfer` : executes an erc20 transfer transaction
- `erc20 set-balance` : sets the balance of an account to a specified amount

## ETH Commands

- `eth balance` : prints the ETH balance of an account
- `eth transfer` : executes an ETH transfer transaction
- `eth set-min-balance` : sets the ETH balance of an account to a minimum amount

# Algorithm

For more information about the architecture and the algorithm, see [contracts/engines/FHEAuctionEngine.sol](https://github.com/0xalexbel/fhe-single-price-auction/blob/14c7121b1dee13cbef8224a096d9ded8a45aaaa2/contracts/engines/FHEAuctionEngine.sol) contract commentary.

# Missing features & improvements

- ProRata tie-breaking mode is not yet implemeneted.
- Better incorporate the uniform price decryption pass into the computation flow.

# Tutorial

## Setting up the environment

Three tokens are involved in the following test.

1. ETH for gas payment
2. AuctionERC20 (AUC) the pre-deployed ERC20 token put up for auction by Alice the beneficiary
3. PaymentERC20 (PAY) the pre-deployed ERC20 token used for auction payments

### Step 1: Wallets ETH balance setup

For convenience, the wallets of Alice, Bob, Carol and David are topped up with 1.0 ETH.

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

### Step 2: Wallets AUC (AuctionERC20) balance setup

```bash
# Set Alice=1 balance to 1000000 AUC (1000000 is the future quantity of token put up for auction) (Gas: 51_556)
npx hardhat --network sepolia erc20 set-balance --token auction --to 1 --amount 1000000
```

It is preferrable to reset the AUC token balances.

```bash
# Set Bob=2 balance to 0 PAY
npx hardhat --network sepolia erc20 set-balance --token payment --account 2 --amount 0
# Set Carol=3 balance to 0 PAY
npx hardhat --network sepolia erc20 set-balance --token payment --account 3 --amount 0
# Set David=4 balance to 0 PAY
npx hardhat --network sepolia erc20 set-balance --token payment --account 4 --amount 0
```

### Step 3: Wallets PAY (PaymentERC20) balance setup

```bash
# Set Aice=1 balance to 0 PAY
npx hardhat --network sepolia erc20 set-balance --token payment --account 1 --amount 0
# Set Bob=2 balance to 100000000000000000 PAY (price * quantity = 200000000000 * 500000)
npx hardhat --network sepolia erc20 set-balance --token payment --account 2 --price 200000000000 --quantity 500000
# Set Carol=3 balance to 480000000000000000 PAY (price * quantity = 800000000000 * 600000)
npx hardhat --network sepolia erc20 set-balance --token payment --account 3 --price 800000000000 --quantity 600000
# Set David=4 balance to 1000000000000 PAY (price * quantity = 1000000 * 1000000)
npx hardhat --network sepolia erc20 set-balance --token payment --account 4 --price 1000000 --quantity 1000000
```

### Step 4: Create a new auction

```bash
# Gas used : 7_505_721
# Alice = beneficiary = 1, Quantity = 1000000 (previously transfered to Alice's wallet)
npx hardhat --network sepolia auction create --type erc20 --beneficiary 1 --salt MyFHEAuction1 --quantity 1000000 --minimum-payment-deposit 1000000 --payment-penalty 500 --max-bid-count 3
```

Output:

```bash
🚀 New ERC20 auction at address 0xa47DB400d1691fb5BEAa1B49104138a8c22c8360 has been successfully created.
```

### Step 5: Start the new auction

- Once everything is set up, we can start the new auction and open it for bidders. Note that, by default, an auction is always flagged as manually stoppable,
  meaning the auction owner can call the stop command.

- The `start` command will automatically retreive the auction's owner wallet in order to run the command.

```bash
# Gas used : 121_362
# Alice = beneficiary = 1, Quantity = 1000000 (previously transfered to Alice's wallet)
npx hardhat --network sepolia auction start --address 0xa47DB400d1691fb5BEAa1B49104138a8c22c8360 --duration 100000
```

You can also use the `--salt` argument to specify the auction. The command bellow is equivalent to the command above.

```bash
# Gas:
# Token Approval : 46_342
# Auction Start  : 121_362
# Alice = beneficiary = 1, Quantity = 1000000 (previously transfered to Alice's wallet)
npx hardhat --network sepolia auction start --type erc20 --beneficiary 1 --salt MyFHEAuction1 --duration 100000
```

### Place bids

```bash
# Bob = 2, price = 200_000_000_000, quantity = 500_000 (Gas used: Approve=46_378, Deposit=81_658, Bid=1_007_802)
npx hardhat --network sepolia auction bid --address 0xa47DB400d1691fb5BEAa1B49104138a8c22c8360 --bidder 2 --price 200000000000 --quantity 500000
# Carol = 3, price = 800_000_000_000, quantity = 600_000 (Gas used: Approve=46_378, Deposit=64_558, Bid=997_809)
npx hardhat --network sepolia auction bid --address 0xa47DB400d1691fb5BEAa1B49104138a8c22c8360 --bidder 3 --price 800000000000 --quantity 600000
# David = 4, price = 1_000_000, quantity = 1_000_000 (Gas used: Approve=46_354, Deposit=64_534, Bid=997_785)
npx hardhat --network sepolia auction bid --address 0xa47DB400d1691fb5BEAa1B49104138a8c22c8360 --bidder 4 --price 1000000 --quantity 1000000
```

Sepolia Tx:
Bob's bid Tx: 0xb186ed3b3ff4a2422545cffc1a66965b839597cbc180dc55ea2dcd5e14bd2b2b
Carol's bid Tx: 0xd1ce7d14a0ba9240127d2a2e6c504f3b3f546825bc987a8ba0a5861ba024c26d
David's bid Tx: 0x29337a1dff59e3362bcc77e7da6ae4d76c00aa156ab69c04f1425e1abfab69bd

> [!WARNING]  
> The bid command requires the encryption of the price and quantity values. Sometimes the following error is raised :
> `Error: Gateway didn't response correctly`. This is usually due potential issues on Zama's Gateway server (server down or facing internal issues).
> In such a case the test on sepolia is not possible.

### Step 6: Stop the auction

```bash
# Gas used 177_147
npx hardhat --network sepolia auction stop --address 0xa47DB400d1691fb5BEAa1B49104138a8c22c8360
```

Sepolia Tx: 0x2abd044b21bf1226e3e97c8dbd4eade4ac484863d137026af26072527d011c20

### Step 7: Compute the auction

> [!WARNING]  
> A gas limit must be specified : minimum 1_000_000

In this example, 12 iterations are required to fully compute the auction prizes in blind mode (the most cost effective approach).

```bash
# Gas used: 448_737 (Tx: 0xe1d50e6b1b4ef0b06269b282e8f0fdd4b0303f60587ae38d8720e1c79f9f5cb4)
npx hardhat --network sepolia auction compute --address 0xa47DB400d1691fb5BEAa1B49104138a8c22c8360 --count 2 --worker 2 --gas-limit 2000000 --award
# Gas used: 664_620 (Tx: 0xb0317fc3d60fe8e53fa4ad4325268fe436241bae08c268ff193dca6859a3ffeb) Progress=41%
npx hardhat --network sepolia auction compute --address 0xa47DB400d1691fb5BEAa1B49104138a8c22c8360 --count 2 --worker 3 --gas-limit 2000000 --award
# Gas used: 453_261 (Tx: 0x5a7ae63025b81f560a32dae5187f34d612be1e07175b54d9d466bd95ed0d0503) Progress=58%
npx hardhat --network sepolia auction compute --address 0xa47DB400d1691fb5BEAa1B49104138a8c22c8360 --count 2 --worker 4 --gas-limit 2000000 --award
# Gas used: 441_890 (Tx: 0x69b3bab8a38709ea565cbbf75a9a3d14c052b07b9905d204db7a8efd029839fc) Progress=75%
npx hardhat --network sepolia auction compute --address 0xa47DB400d1691fb5BEAa1B49104138a8c22c8360 --count 2 --worker 2 --gas-limit 2000000 --award
# Gas used: 508_583 (Tx: 0x15f84bcd5850fce2bbff1687923ee54ff40f8af64e9a478fc8d8270e1025b3f6) Progress=91%
npx hardhat --network sepolia auction compute --address 0xa47DB400d1691fb5BEAa1B49104138a8c22c8360 --count 2 --worker 3 --gas-limit 2000000 --award
# Gas used: 433_226 (Tx: 0x3574cf53cf21fc65ac94eef2bb8b4b1f99b8b4544bd3992c6f275ccc9144addd) Progress=100%
npx hardhat --network sepolia auction compute --address 0xa47DB400d1691fb5BEAa1B49104138a8c22c8360 --count 2 --worker 4 --gas-limit 2000000 --award
```

### Step 8: Decrypt uniform prize

```bash
# Gas used: 188_783 (Tx:0xe560f25d96675ff8906f78751bc3d1d36256f47130fa9c9da8c3a8b239c0f22b)
npx hardhat --network sepolia auction decrypt-uniform-price --address 0xa47DB400d1691fb5BEAa1B49104138a8c22c8360
```

To check if the uniform price has been decrypted:

```bash
npx hardhat --network sepolia auction claim-info --address 0xa47DB400d1691fb5BEAa1B49104138a8c22c8360
```

### Step 9: Award prizes (Push)

```bash
# Bob runs the 'award' transaction for rank 0 (Gas used: 302_975, Tx: 0x4a7e56cdf5916d3373aeac4ffeec76f61a1436fd1261a833d58822b566dcd8cd)
npx hardhat --network sepolia auction award --address 0xa47DB400d1691fb5BEAa1B49104138a8c22c8360 --rank 0 --worker 2
# Carol runs the 'award' transaction for rank 1 (Gas used: 322_887, Tx: 0xe6774f01c4153f123f1d4ae911ffa23f81eea76619f57a40ea691b95952a6351)
npx hardhat --network sepolia auction award --address 0xa47DB400d1691fb5BEAa1B49104138a8c22c8360 --rank 1 --worker 3
# David runs the 'award' transaction for rank 2 (Gas used: 322_887, Tx: 0xe07a668d9a5d072eaa23956f10ec1d68b7a0a908d1d13d66a69da62836efd47b)
npx hardhat --network sepolia auction award --address 0xa47DB400d1691fb5BEAa1B49104138a8c22c8360 --rank 2 --worker 4
```

To check prize award progress:

```bash
npx hardhat --network sepolia auction claim-info --address 0xa47DB400d1691fb5BEAa1B49104138a8c22c8360
```

### Step 10: Prizes verification

```bash
# Bob's ERC20 Auction Token (AUC) balance
npx hardhat --network sepolia erc20 balance --token auction --account 2
# Carol's ERC20 Auction Token (AUC) balance
npx hardhat --network sepolia erc20 balance --token auction --account 3
# David's ERC20 Auction Token (AUC) balance
npx hardhat --network sepolia erc20 balance --token auction --account 4
```

Output:

```bash
ERC20 Balance : 400000 (AUC) (account: 0x3f0CdAe6ebd93F9F776BCBB7da1D42180cC8fcC1)
```

```bash
ERC20 Balance : 600000 (AUC) (account: 0x28e2bD235e7831b71AF247D452340B6127627131)
```

```bash
ERC20 Balance : 0 (AUC) (account: 0x619b83dD7F04a151bC317475B91C80dC02E33d3A)
```

- 🥇 Bod has won 400_000 AUC Tokens
- 🥈 Carol has won 600_000 AUC Tokens
- 🥉 David has won 0 AUC Tokens
