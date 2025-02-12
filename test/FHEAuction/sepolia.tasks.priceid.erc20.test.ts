import hre from "hardhat";
import { expect } from "chai";
import {
  SCOPE_AUCTION,
  SCOPE_AUCTION_TASK_AWARD,
  SCOPE_AUCTION_TASK_BID,
  SCOPE_AUCTION_TASK_BLIND_CLAIM,
  SCOPE_AUCTION_TASK_CLAIM,
  SCOPE_AUCTION_TASK_CLAIM_INFO,
  SCOPE_AUCTION_TASK_COMPUTE,
  SCOPE_AUCTION_TASK_CREATE,
  SCOPE_AUCTION_TASK_DECRYPT_UNIFORM_PRICE,
  SCOPE_AUCTION_TASK_START,
  SCOPE_AUCTION_TASK_STOP,
  SCOPE_ERC20,
  SCOPE_ETH,
  TASK_BALANCE,
  TASK_SET_BALANCE,
  TASK_SET_MIN_BALANCE,
  TASK_TRANSFER,
} from "../../tasks/task-names";
import { awaitAllDecryptionResults, initGateway } from "../asyncDecrypt";

function checkEnv() {
  return (
    hre.network.name == "sepolia" ||
    hre.network.name == "localhost" ||
    hre.network.name == "hardhat"
  );
}

if (checkEnv()) {
  describe("sepolia.tasks.priceid.erc20", () => {
    const alice = "1";
    const bob = "2";
    const carol = "3";
    const david = "4";

    const salt = undefined;
    const quantity = 1000000n;
    const duration = 100000n;
    const expectedUniformPrice = 200000000000n;

    const bids = {
      bob: {
        price: 200000000000n,
        quantity: 500000n,
        wonQuantity: 400000n,
      },
      carol: {
        price: 800000000000n,
        quantity: 600000n,
        wonQuantity: 600000n,
      },
      david: {
        price: 1000000n,
        quantity: 1000000n,
        wonQuantity: 0n,
      },
    };

    before(async () => {
      await hre.run("deploy");
      await initGateway(hre);
    });

    async function getTokenBalances(token: string, auctionAddress?: string) {
      const aliceBalance = await hre.run(
        {
          scope: SCOPE_ERC20,
          task: TASK_BALANCE,
        },
        {
          account: alice,
          token,
        }
      );
      const bobBalance = await hre.run(
        {
          scope: SCOPE_ERC20,
          task: TASK_BALANCE,
        },
        {
          account: bob,
          token,
        }
      );
      const carolBalance = await hre.run(
        {
          scope: SCOPE_ERC20,
          task: TASK_BALANCE,
        },
        {
          account: carol,
          token,
        }
      );
      const davidBalance = await hre.run(
        {
          scope: SCOPE_ERC20,
          task: TASK_BALANCE,
        },
        {
          account: david,
          token,
        }
      );
      const auctionBalance = auctionAddress
        ? await hre.run(
            {
              scope: SCOPE_ERC20,
              task: TASK_BALANCE,
            },
            {
              account: auctionAddress,
              token,
            }
          )
        : undefined;

      return {
        alice: aliceBalance,
        bob: bobBalance,
        carol: carolBalance,
        david: davidBalance,
        auction: auctionBalance,
      };
    }

    ////////////////////////////////////////////////////////////////////////////

    async function checkBalances(
      startPaymentBalances: any,
      startAuctionBalances: any,
      auctionAddr: string
    ) {
      const endAuctionBalances = await getTokenBalances("auction", auctionAddr);
      const endPaymentBalances = await getTokenBalances("payment", auctionAddr);

      expect(
        startPaymentBalances.alice +
          bids.bob.wonQuantity * expectedUniformPrice +
          bids.carol.wonQuantity * expectedUniformPrice +
          bids.david.wonQuantity * expectedUniformPrice
      ).to.equal(endPaymentBalances.alice);
      expect(
        startPaymentBalances.bob - bids.bob.wonQuantity * expectedUniformPrice
      ).to.equal(endPaymentBalances.bob);
      expect(
        startPaymentBalances.carol -
          bids.carol.wonQuantity * expectedUniformPrice
      ).to.equal(endPaymentBalances.carol);
      expect(
        startPaymentBalances.david -
          bids.david.wonQuantity * expectedUniformPrice
      ).to.equal(endPaymentBalances.david);

      expect(endAuctionBalances.bob - startAuctionBalances.bob).to.equal(
        bids.bob.wonQuantity
      );
      expect(endAuctionBalances.carol - startAuctionBalances.carol).to.equal(
        bids.carol.wonQuantity
      );
      expect(endAuctionBalances.david - startAuctionBalances.david).to.equal(
        bids.david.wonQuantity
      );
      expect(endAuctionBalances.auction).to.equal(0);
      expect(endAuctionBalances.alice).to.equal(
        startAuctionBalances.alice -
          (bids.bob.wonQuantity +
            bids.carol.wonQuantity +
            bids.david.wonQuantity)
      );
    }

    ////////////////////////////////////////////////////////////////////////////

    it("Test award scripts", async () => {
      for (let i = 1; i <= 4; ++i) {
        await hre.run(
          { scope: SCOPE_ETH, task: TASK_SET_MIN_BALANCE },
          { account: i.toString(), min: "1eth" }
        );
      }

      // Set Alice's auction balance to Quantity
      await hre.run(
        { scope: SCOPE_ERC20, task: TASK_SET_BALANCE },
        { token: "auction", account: alice, amount: quantity }
      );

      // Set Alice's payment balance to Zero
      await hre.run(
        { scope: SCOPE_ERC20, task: TASK_SET_BALANCE },
        {
          token: "payment",
          account: alice,
          amount: 0n,
        }
      );

      await hre.run(
        { scope: SCOPE_ERC20, task: TASK_SET_BALANCE },
        {
          token: "payment",
          account: bob,
          price: bids.bob.price,
          quantity: bids.bob.quantity,
        }
      );

      await hre.run(
        { scope: SCOPE_ERC20, task: TASK_SET_BALANCE },
        {
          token: "payment",
          account: carol,
          price: bids.carol.price,
          quantity: bids.carol.quantity,
        }
      );

      await hre.run(
        { scope: SCOPE_ERC20, task: TASK_SET_BALANCE },
        {
          token: "payment",
          account: david,
          price: bids.david.price,
          quantity: bids.david.quantity,
        }
      );

      const startPaymentTokenBalances = await getTokenBalances("payment");
      const startAuctionTokenBalances = await getTokenBalances("auction");

      // Create
      const auctionAddr = await hre.run(
        { scope: SCOPE_AUCTION, task: SCOPE_AUCTION_TASK_CREATE },
        {
          type: "erc20",
          beneficiary: alice,
          salt,
          quantity: quantity,
          minimumPaymentDeposit: 1000000n,
          paymentPenalty: 500n,
          tieBreakingRule: 0, //PriceId
          maxBidCount: 3n,
        }
      );

      expect(auctionAddr).to.be.properAddress;

      // Start
      await hre.run(
        { scope: SCOPE_AUCTION, task: SCOPE_AUCTION_TASK_START },
        {
          address: auctionAddr,
          duration,
        }
      );

      // Bob's bid
      await hre.run(
        { scope: SCOPE_AUCTION, task: SCOPE_AUCTION_TASK_BID },
        {
          address: auctionAddr,
          bidder: bob,
          price: bids.bob.price,
          quantity: bids.bob.quantity,
        }
      );

      // Carol's bid
      await hre.run(
        { scope: SCOPE_AUCTION, task: SCOPE_AUCTION_TASK_BID },
        {
          address: auctionAddr,
          bidder: carol,
          price: bids.carol.price,
          quantity: bids.carol.quantity,
        }
      );

      // David's bid
      await hre.run(
        { scope: SCOPE_AUCTION, task: SCOPE_AUCTION_TASK_BID },
        {
          address: auctionAddr,
          bidder: david,
          price: bids.david.price,
          quantity: bids.david.quantity,
        }
      );

      // Stop
      await hre.run(
        { scope: SCOPE_AUCTION, task: SCOPE_AUCTION_TASK_STOP },
        {
          address: auctionAddr,
        }
      );

      for (let i = 0; i < 2; ++i) {
        // Bob's computing contribution
        await hre.run(
          { scope: SCOPE_AUCTION, task: SCOPE_AUCTION_TASK_COMPUTE },
          {
            address: auctionAddr,
            count: 2n,
            worker: bob,
            gasLimit: 2000000n,
            award: true,
          }
        );

        // Carol's computing contribution
        await hre.run(
          { scope: SCOPE_AUCTION, task: SCOPE_AUCTION_TASK_COMPUTE },
          {
            address: auctionAddr,
            count: 2n,
            worker: carol,
            gasLimit: 2000000n,
            award: true,
          }
        );

        // David's computing contribution
        await hre.run(
          { scope: SCOPE_AUCTION, task: SCOPE_AUCTION_TASK_COMPUTE },
          {
            address: auctionAddr,
            count: 2n,
            worker: david,
            gasLimit: 2000000n,
            award: true,
          }
        );
      }

      // Decrypt uniform price
      await hre.run(
        {
          scope: SCOPE_AUCTION,
          task: SCOPE_AUCTION_TASK_DECRYPT_UNIFORM_PRICE,
        },
        {
          address: auctionAddr,
        }
      );

      await awaitAllDecryptionResults(hre);

      // Check claim infos
      let infos = await hre.run(
        {
          scope: SCOPE_AUCTION,
          task: SCOPE_AUCTION_TASK_CLAIM_INFO,
        },
        {
          address: auctionAddr,
        }
      );
      expect(infos.clearUniformPrice).to.equal(expectedUniformPrice);

      // 'award' command can be executed by any account.

      // Award first prize
      await hre.run(
        {
          scope: SCOPE_AUCTION,
          task: SCOPE_AUCTION_TASK_AWARD,
        },
        {
          address: auctionAddr,
          rank: 0n,
          worker: bob,
        }
      );

      // Award second prize
      await hre.run(
        {
          scope: SCOPE_AUCTION,
          task: SCOPE_AUCTION_TASK_AWARD,
        },
        {
          address: auctionAddr,
          rank: 1n,
          worker: carol,
        }
      );

      // Award third prize
      await hre.run(
        {
          scope: SCOPE_AUCTION,
          task: SCOPE_AUCTION_TASK_AWARD,
        },
        {
          address: auctionAddr,
          rank: 2n,
          worker: carol,
        }
      );

      await awaitAllDecryptionResults(hre);

      // Check claim infos
      infos = await hre.run(
        {
          scope: SCOPE_AUCTION,
          task: SCOPE_AUCTION_TASK_CLAIM_INFO,
        },
        {
          address: auctionAddr,
        }
      );

      expect(infos.totalClaimsCompleted).to.equal(3);

      await checkBalances(
        startPaymentTokenBalances,
        startAuctionTokenBalances,
        auctionAddr
      );
    });

    ////////////////////////////////////////////////////////////////////////////

    it("Test blindClaim scripts (Experimental)", async () => {
      for (let i = 1; i <= 4; ++i) {
        await hre.run(
          { scope: SCOPE_ETH, task: TASK_SET_MIN_BALANCE },
          { account: i.toString(), min: "1eth" }
        );
      }

      await hre.run(
        { scope: SCOPE_ERC20, task: TASK_TRANSFER },
        { token: "auction", to: alice, amount: quantity.toString() }
      );

      await hre.run(
        { scope: SCOPE_ERC20, task: TASK_TRANSFER },
        {
          token: "payment",
          to: bob,
          price: bids.bob.price.toString(),
          quantity: bids.bob.quantity,
        }
      );

      await hre.run(
        { scope: SCOPE_ERC20, task: TASK_TRANSFER },
        {
          token: "payment",
          to: carol,
          price: bids.carol.price.toString(),
          quantity: bids.carol.quantity,
        }
      );

      await hre.run(
        { scope: SCOPE_ERC20, task: TASK_TRANSFER },
        {
          token: "payment",
          to: david,
          price: bids.david.price.toString(),
          quantity: bids.david.quantity,
        }
      );

      const startPaymentTokenBalances = await getTokenBalances("payment");
      const startAuctionTokenBalances = await getTokenBalances("auction");

      // Create
      const auctionAddr = await hre.run(
        { scope: SCOPE_AUCTION, task: SCOPE_AUCTION_TASK_CREATE },
        {
          type: "erc20",
          beneficiary: alice,
          salt,
          quantity: quantity,
          minimumPaymentDeposit: 1000000n,
          paymentPenalty: 500n,
          tieBreakingRule: 0, //PriceId
          maxBidCount: 3n,
        }
      );

      expect(auctionAddr).to.be.properAddress;

      // Start
      await hre.run(
        { scope: SCOPE_AUCTION, task: SCOPE_AUCTION_TASK_START },
        {
          address: auctionAddr,
          duration,
        }
      );

      // Bob's bid
      await hre.run(
        { scope: SCOPE_AUCTION, task: SCOPE_AUCTION_TASK_BID },
        {
          address: auctionAddr,
          bidder: bob,
          price: bids.bob.price,
          quantity: bids.bob.quantity,
        }
      );

      // Carol's bid
      await hre.run(
        { scope: SCOPE_AUCTION, task: SCOPE_AUCTION_TASK_BID },
        {
          address: auctionAddr,
          bidder: carol,
          price: bids.carol.price,
          quantity: bids.carol.quantity,
        }
      );

      // David's bid
      await hre.run(
        { scope: SCOPE_AUCTION, task: SCOPE_AUCTION_TASK_BID },
        {
          address: auctionAddr,
          bidder: david,
          price: bids.david.price,
          quantity: bids.david.quantity,
        }
      );

      // Stop
      await hre.run(
        { scope: SCOPE_AUCTION, task: SCOPE_AUCTION_TASK_STOP },
        {
          address: auctionAddr,
        }
      );

      for (let i = 0; i < 2; ++i) {
        // Bob's computing contribution
        await hre.run(
          { scope: SCOPE_AUCTION, task: SCOPE_AUCTION_TASK_COMPUTE },
          {
            address: auctionAddr,
            count: 2n,
            worker: bob,
            gasLimit: 2000000n,
            award: true,
          }
        );

        // Carol's computing contribution
        await hre.run(
          { scope: SCOPE_AUCTION, task: SCOPE_AUCTION_TASK_COMPUTE },
          {
            address: auctionAddr,
            count: 2n,
            worker: carol,
            gasLimit: 2000000n,
            award: true,
          }
        );

        // David's computing contribution
        await hre.run(
          { scope: SCOPE_AUCTION, task: SCOPE_AUCTION_TASK_COMPUTE },
          {
            address: auctionAddr,
            count: 2n,
            worker: david,
            gasLimit: 2000000n,
            award: true,
          }
        );
      }

      // Decrypt uniform price
      await hre.run(
        {
          scope: SCOPE_AUCTION,
          task: SCOPE_AUCTION_TASK_DECRYPT_UNIFORM_PRICE,
        },
        {
          address: auctionAddr,
        }
      );

      await awaitAllDecryptionResults(hre);

      // Check claim infos
      let infos = await hre.run(
        {
          scope: SCOPE_AUCTION,
          task: SCOPE_AUCTION_TASK_CLAIM_INFO,
        },
        {
          address: auctionAddr,
        }
      );
      expect(infos.clearUniformPrice).to.equal(expectedUniformPrice);

      // 'blindClaim' command can be executed by any account.

      await hre.run(
        {
          scope: SCOPE_AUCTION,
          task: SCOPE_AUCTION_TASK_BLIND_CLAIM,
        },
        {
          address: auctionAddr,
          bidder: bob,
        }
      );

      await hre.run(
        {
          scope: SCOPE_AUCTION,
          task: SCOPE_AUCTION_TASK_BLIND_CLAIM,
        },
        {
          address: auctionAddr,
          bidder: carol,
        }
      );

      await hre.run(
        {
          scope: SCOPE_AUCTION,
          task: SCOPE_AUCTION_TASK_BLIND_CLAIM,
        },
        {
          address: auctionAddr,
          bidder: david,
        }
      );

      await awaitAllDecryptionResults(hre);

      // Check claim infos
      infos = await hre.run(
        {
          scope: SCOPE_AUCTION,
          task: SCOPE_AUCTION_TASK_CLAIM_INFO,
        },
        {
          address: auctionAddr,
        }
      );

      expect(infos.totalClaimsCompleted).to.equal(3);

      await checkBalances(
        startPaymentTokenBalances,
        startAuctionTokenBalances,
        auctionAddr
      );
    });

    ////////////////////////////////////////////////////////////////////////////

    it("Test claim scripts", async () => {
      for (let i = 1; i <= 4; ++i) {
        await hre.run(
          { scope: SCOPE_ETH, task: TASK_SET_MIN_BALANCE },
          { account: i.toString(), min: "1eth" }
        );
      }

      await hre.run(
        { scope: SCOPE_ERC20, task: TASK_TRANSFER },
        { token: "auction", to: alice, amount: quantity.toString() }
      );

      await hre.run(
        { scope: SCOPE_ERC20, task: TASK_TRANSFER },
        {
          token: "payment",
          to: bob,
          price: bids.bob.price.toString(),
          quantity: bids.bob.quantity,
        }
      );

      await hre.run(
        { scope: SCOPE_ERC20, task: TASK_TRANSFER },
        {
          token: "payment",
          to: carol,
          price: bids.carol.price.toString(),
          quantity: bids.carol.quantity,
        }
      );

      await hre.run(
        { scope: SCOPE_ERC20, task: TASK_TRANSFER },
        {
          token: "payment",
          to: david,
          price: bids.david.price.toString(),
          quantity: bids.david.quantity,
        }
      );

      const startPaymentTokenBalances = await getTokenBalances("payment");
      const startAuctionTokenBalances = await getTokenBalances("auction");

      // Create
      const auctionAddr = await hre.run(
        { scope: SCOPE_AUCTION, task: SCOPE_AUCTION_TASK_CREATE },
        {
          type: "erc20",
          beneficiary: alice,
          salt,
          quantity: quantity,
          minimumPaymentDeposit: 1000000n,
          paymentPenalty: 500n,
          tieBreakingRule: 0, //PriceId
          maxBidCount: 3n,
        }
      );

      expect(auctionAddr).to.be.properAddress;

      // Start
      await hre.run(
        { scope: SCOPE_AUCTION, task: SCOPE_AUCTION_TASK_START },
        {
          address: auctionAddr,
          duration,
        }
      );

      // Bob's bid
      await hre.run(
        { scope: SCOPE_AUCTION, task: SCOPE_AUCTION_TASK_BID },
        {
          address: auctionAddr,
          bidder: bob,
          price: bids.bob.price,
          quantity: bids.bob.quantity,
        }
      );

      // Carol's bid
      await hre.run(
        { scope: SCOPE_AUCTION, task: SCOPE_AUCTION_TASK_BID },
        {
          address: auctionAddr,
          bidder: carol,
          price: bids.carol.price,
          quantity: bids.carol.quantity,
        }
      );

      // David's bid
      await hre.run(
        { scope: SCOPE_AUCTION, task: SCOPE_AUCTION_TASK_BID },
        {
          address: auctionAddr,
          bidder: david,
          price: bids.david.price,
          quantity: bids.david.quantity,
        }
      );

      // Stop
      await hre.run(
        { scope: SCOPE_AUCTION, task: SCOPE_AUCTION_TASK_STOP },
        {
          address: auctionAddr,
        }
      );

      for (let i = 0; i < 3; ++i) {
        const count = i == 2 ? 3n : 2n;
        // Bob's computing contribution
        await hre.run(
          { scope: SCOPE_AUCTION, task: SCOPE_AUCTION_TASK_COMPUTE },
          {
            address: auctionAddr,
            count,
            worker: bob,
            gasLimit: 2000000n,
            award: false,
          }
        );

        // Carol's computing contribution
        await hre.run(
          { scope: SCOPE_AUCTION, task: SCOPE_AUCTION_TASK_COMPUTE },
          {
            address: auctionAddr,
            count,
            worker: carol,
            gasLimit: 2000000n,
            award: false,
          }
        );

        // David's computing contribution
        await hre.run(
          { scope: SCOPE_AUCTION, task: SCOPE_AUCTION_TASK_COMPUTE },
          {
            address: auctionAddr,
            count,
            worker: david,
            gasLimit: 2000000n,
            award: false,
          }
        );
      }

      // Decrypt uniform price (by David)
      await hre.run(
        {
          scope: SCOPE_AUCTION,
          task: SCOPE_AUCTION_TASK_DECRYPT_UNIFORM_PRICE,
        },
        {
          address: auctionAddr,
          worker: david,
        }
      );

      await awaitAllDecryptionResults(hre);

      // Check claim infos
      let infos = await hre.run(
        {
          scope: SCOPE_AUCTION,
          task: SCOPE_AUCTION_TASK_CLAIM_INFO,
        },
        {
          address: auctionAddr,
        }
      );
      expect(infos.clearUniformPrice).to.equal(expectedUniformPrice);

      // 'claim' command can only be executed by the bidder.

      // Bob claims its prize
      await hre.run(
        {
          scope: SCOPE_AUCTION,
          task: SCOPE_AUCTION_TASK_CLAIM,
        },
        {
          address: auctionAddr,
          bidder: bob,
        }
      );

      await awaitAllDecryptionResults(hre);

      // Carol claims its prize
      await hre.run(
        {
          scope: SCOPE_AUCTION,
          task: SCOPE_AUCTION_TASK_CLAIM,
        },
        {
          address: auctionAddr,
          bidder: carol,
        }
      );

      await awaitAllDecryptionResults(hre);

      // David claims its prize
      await hre.run(
        {
          scope: SCOPE_AUCTION,
          task: SCOPE_AUCTION_TASK_CLAIM,
        },
        {
          address: auctionAddr,
          bidder: david,
        }
      );

      await awaitAllDecryptionResults(hre);

      // Check claim infos
      infos = await hre.run(
        {
          scope: SCOPE_AUCTION,
          task: SCOPE_AUCTION_TASK_CLAIM_INFO,
        },
        {
          address: auctionAddr,
        }
      );

      expect(infos.totalClaimsCompleted).to.equal(3);

      await checkBalances(
        startPaymentTokenBalances,
        startAuctionTokenBalances,
        auctionAddr
      );
    });
  });
}
