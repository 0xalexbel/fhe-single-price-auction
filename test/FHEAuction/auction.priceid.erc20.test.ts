import hre from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import {
  FHEBids,
  FHEAuctionERC20MockTestCtx,
  TieBreakingRulePriceId,
} from "./utils";
import { deployERC20AuctionWithMaxBiddersFixture } from "./fixtures";
import { HardhatNetworkHDAccountsConfig } from "hardhat/types";

const DEFAULT_QUANTITY = 1_000_000n;
const DEFAULT_DURATION = 86400n;
const DEFAULT_MAX_BID_COUNT = 10000n;
const DEFAULT_TIE_BREAKING_RULE = TieBreakingRulePriceId;
const DEFAULT_MIN_PAYMENT_DEPOSIT = 100n;
const DEFAULT_PAYMENT_PENALTY = 70n;
const DEFAULT_STOPPABLE = true;
const DEFAULT_PAYMENT_TOKEN_BALANCE = 0n;
const DEFAULT_PAYMENT_TOKEN_TOTAL_SUPPLY = 1_000_000_000_000_000_000_000n;

function fourBids(bidders: HardhatEthersSigner[]): {
  expectedUniformPrice: bigint;
  bids: FHEBids;
} {
  return {
    expectedUniformPrice: 1000n,
    bids: [
      {
        bidder: bidders[0],
        id: 1n,
        price: 2000n,
        quantity: 2n,
        startPaymentBalance: 5000n,
        endPaymentBalance: 3000n,
        paymentDeposit: 4200n,
        wonQuantity: 2n,
      },
      {
        bidder: bidders[1],
        id: 2n,
        price: 3000n,
        quantity: 3n,
        startPaymentBalance: 10000n,
        endPaymentBalance: 7000n,
        paymentDeposit: 9900n,
        wonQuantity: 3n,
      },
      {
        bidder: bidders[2],
        id: 3n,
        price: 1100n,
        quantity: 1n,
        startPaymentBalance: 1100n,
        endPaymentBalance: 100n,
        paymentDeposit: 1100n,
        wonQuantity: 1n,
      },
      {
        bidder: bidders[3],
        id: 4n,
        price: 1000n,
        quantity: 1n,
        startPaymentBalance: 1000n,
        endPaymentBalance: 0n,
        paymentDeposit: 1000n,
        wonQuantity: 1n,
      },
    ],
  };
}

function checkEnv() {
  return (
    hre.network.name == "hardhat" &&
    (hre.network.config.accounts as HardhatNetworkHDAccountsConfig).count == 15
  );
}

if (checkEnv()) {
  describe("auction.priceid.erc20", () => {
    let ctx: FHEAuctionERC20MockTestCtx;
    let bidders: Array<HardhatEthersSigner>;

    async function fixture() {
      return deployERC20AuctionWithMaxBiddersFixture(
        DEFAULT_QUANTITY,
        DEFAULT_DURATION,
        DEFAULT_MAX_BID_COUNT,
        DEFAULT_TIE_BREAKING_RULE,
        DEFAULT_MIN_PAYMENT_DEPOSIT,
        DEFAULT_PAYMENT_PENALTY,
        DEFAULT_STOPPABLE,
        true /* start */,
        DEFAULT_PAYMENT_TOKEN_BALANCE,
        DEFAULT_PAYMENT_TOKEN_TOTAL_SUPPLY
      );
    }

    beforeEach(async function () {
      const res = await loadFixture(fixture);
      ctx = res.ctx;
      bidders = res.bidders;
      expect(bidders.length).to.equal(10);
    });

    it("1 valid bid", async () => {
      const expectedUniformPrice = 1000n;
      const bids: FHEBids = [
        {
          bidder: bidders[0],
          id: 1n,
          price: 1000n,
          quantity: 1n,
          startPaymentBalance: 1000n * 1n + 1500n, // price x quantity + extra
          endPaymentBalance: 1500n, // extra
          paymentDeposit: 1000n * 1n,
          wonQuantity: 1n,
        },
      ];
      await ctx.run(bids, expectedUniformPrice);
    });

    it("2 valid bids: p(1) < p(2)", async () => {
      const expectedUniformPrice = 1000n;
      const bids: FHEBids = [
        {
          bidder: bidders[0],
          id: 1n,
          price: 1000n,
          quantity: 1n,
          startPaymentBalance: 1000n * 1n + 1500n, // price x quantity + extra
          endPaymentBalance: 1500n, // extra
          paymentDeposit: 1000n * 1n,
          wonQuantity: 1n,
        },
        {
          bidder: bidders[1],
          id: 2n,
          price: 2000n,
          quantity: 2n,
          startPaymentBalance: 2000n * 2n,
          endPaymentBalance: 2000n, // = startPaymentBalance - 1000 x 2
          paymentDeposit: 2000n * 2n,
          wonQuantity: 2n,
        },
      ];
      await ctx.run(bids, expectedUniformPrice);
    });

    it("Claim without uniform price decryption should revert", async () => {
      const expectedUniformPrice = 1000n;
      const bids: FHEBids = [
        {
          bidder: bidders[0],
          price: 1000n,
          quantity: 1n,
          wonQuantity: 1n,
        },
        {
          bidder: bidders[1],
          price: 2000n,
          quantity: 2n,
          wonQuantity: 2n,
        },
      ];
      await ctx.run(bids, expectedUniformPrice, undefined, true);
      await expect(ctx.auction.connect(bids[0].bidder).claim())
        .to.be.revertedWithCustomError(ctx.auction, "NotReadyForBidderClaim")
        .withArgs(bids[0].bidder);
    });

    it("Blind claim without uniform price decryption should revert", async () => {
      const expectedUniformPrice = 1000n;
      const bids: FHEBids = [
        {
          bidder: bidders[0],
          price: 1000n,
          quantity: 1n,
          wonQuantity: 1n,
        },
        {
          bidder: bidders[1],
          price: 2000n,
          quantity: 2n,
          wonQuantity: 2n,
        },
      ];
      await ctx.run(bids, expectedUniformPrice, undefined, true);
      await expect(ctx.auctionERC20.connect(bids[0].bidder).blindClaim())
        .to.be.revertedWithCustomError(ctx.auction, "NotReadyForPrizeAwarding")
        .withArgs();
    });

    it("Blind claim rank without uniform price decryption should revert", async () => {
      const expectedUniformPrice = 1000n;
      const bids: FHEBids = [
        {
          bidder: bidders[0],
          price: 1000n,
          quantity: 1n,
          wonQuantity: 1n,
        },
        {
          bidder: bidders[1],
          price: 2000n,
          quantity: 2n,
          wonQuantity: 2n,
        },
      ];
      await ctx.run(bids, expectedUniformPrice, undefined, true);
      await expect(
        ctx.auction.connect(bids[0].bidder).awardPrizeAtRank(0)
      ).to.be.revertedWithCustomError(ctx.auction, "NotReadyForPrizeAwarding");
    });

    it("2 valid bids: p(1) > p(2)", async () => {
      const expectedUniformPrice = 1000n;
      const bids: FHEBids = [
        {
          bidder: bidders[0],
          id: 1n,
          price: 2000n,
          quantity: 1n,
          startPaymentBalance: 2500n,
          endPaymentBalance: 1500n,
          paymentDeposit: 2000n,
          wonQuantity: 1n,
        },
        {
          bidder: bidders[1],
          id: 2n,
          price: 1000n,
          quantity: 2n,
          startPaymentBalance: 5000n,
          endPaymentBalance: 5000n - 2000n,
          paymentDeposit: 2500n,
          wonQuantity: 2n,
        },
      ];
      await ctx.run(bids, expectedUniformPrice);
    });

    it("2 valid bids: p(1) = p(2)", async () => {
      const expectedUniformPrice = 1000n;
      const bids: FHEBids = [
        {
          bidder: bidders[0],
          id: 1n,
          price: 1000n,
          quantity: 1n,
          startPaymentBalance: 2500n,
          endPaymentBalance: 1500n,
          paymentDeposit: 1200n,
          wonQuantity: 1n,
        },
        {
          bidder: bidders[1],
          id: 2n,
          price: 1000n,
          quantity: 2n,
          startPaymentBalance: 5000n,
          endPaymentBalance: 5000n - 2000n,
          paymentDeposit: 2500n,
          wonQuantity: 2n,
        },
      ];
      await ctx.run(bids, expectedUniformPrice);
    });

    it("Award, 2 valid bids: p(1) < p(2)", async () => {
      const expectedUniformPrice = 1000n;
      const bids: FHEBids = [
        {
          bidder: bidders[0],
          id: 1n,
          price: 1000n,
          quantity: 1n,
          startPaymentBalance: 1000n * 1n + 1500n, // price x quantity + extra
          endPaymentBalance: 1500n, // extra
          paymentDeposit: 1000n * 1n,
          wonQuantity: 1n,
        },
        {
          bidder: bidders[1],
          id: 2n,
          price: 2000n,
          quantity: 2n,
          startPaymentBalance: 2000n * 2n,
          endPaymentBalance: 2000n, // = startPaymentBalance - 1000 x 2
          paymentDeposit: 2000n * 2n,
          wonQuantity: 2n,
        },
      ];
      await ctx.runUsingAward(bids, expectedUniformPrice);
    });

    it("Blind claim, 2 valid bids: p(1) < p(2)", async () => {
      const expectedUniformPrice = 1000n;
      const bids: FHEBids = [
        {
          bidder: bidders[0],
          id: 1n,
          price: 1000n,
          quantity: 1n,
          startPaymentBalance: 1000n * 1n + 1500n, // price x quantity + extra
          endPaymentBalance: 1500n, // extra
          paymentDeposit: 1000n * 1n,
          wonQuantity: 1n,
        },
        {
          bidder: bidders[1],
          id: 2n,
          price: 2000n,
          quantity: 2n,
          startPaymentBalance: 2000n * 2n,
          endPaymentBalance: 2000n, // = startPaymentBalance - 1000 x 2
          paymentDeposit: 2000n * 2n,
          wonQuantity: 2n,
        },
      ];
      await ctx.runUsingBlindClaim(bids, expectedUniformPrice);
    });

    it("3 valid bids: p(1) < p(2) < p(3)", async () => {
      const expectedUniformPrice = 1000n;
      const bids: FHEBids = [
        {
          bidder: bidders[0],
          id: 1n,
          price: 1000n,
          quantity: 1n,
          startPaymentBalance: 1000n,
          endPaymentBalance: 0n,
          paymentDeposit: 1000n,
          wonQuantity: 1n,
        },
        {
          bidder: bidders[1],
          id: 2n,
          price: 2000n,
          quantity: 2n,
          startPaymentBalance: 5000n,
          endPaymentBalance: 3000n,
          paymentDeposit: 4200n,
          wonQuantity: 2n,
        },
        {
          bidder: bidders[2],
          id: 3n,
          price: 3000n,
          quantity: 3n,
          startPaymentBalance: 10000n,
          endPaymentBalance: 7000n,
          paymentDeposit: 9900n,
          wonQuantity: 3n,
        },
      ];
      await ctx.run(bids, expectedUniformPrice);
    });

    it("3 valid bids: p(1) > p(2) > p(3)", async () => {
      const expectedUniformPrice = 1000n;
      const bids: FHEBids = [
        {
          bidder: bidders[0],
          id: 1n,
          price: 3000n,
          quantity: 3n,
          startPaymentBalance: 10000n,
          endPaymentBalance: 7000n,
          paymentDeposit: 9900n,
          wonQuantity: 3n,
        },
        {
          bidder: bidders[1],
          id: 2n,
          price: 2000n,
          quantity: 2n,
          startPaymentBalance: 5000n,
          endPaymentBalance: 3000n,
          paymentDeposit: 4200n,
          wonQuantity: 2n,
        },
        {
          bidder: bidders[2],
          id: 3n,
          price: 1000n,
          quantity: 1n,
          startPaymentBalance: 1000n,
          endPaymentBalance: 0n,
          paymentDeposit: 1000n,
          wonQuantity: 1n,
        },
      ];
      await ctx.run(bids, expectedUniformPrice);
    });

    it("3 valid bids: p(1) = p(2) = p(3)", async () => {
      const expectedUniformPrice = 3000n;
      const bids: FHEBids = [
        {
          bidder: bidders[0],
          id: 1n,
          price: 3000n,
          quantity: 3n,
          startPaymentBalance: 10000n,
          endPaymentBalance: 1000n,
          paymentDeposit: 9900n,
          wonQuantity: 3n,
        },
        {
          bidder: bidders[1],
          id: 2n,
          price: 3000n,
          quantity: 2n,
          startPaymentBalance: 6000n,
          endPaymentBalance: 0n,
          paymentDeposit: 6000n,
          wonQuantity: 2n,
        },
        {
          bidder: bidders[2],
          id: 3n,
          price: 3000n,
          quantity: 1n,
          startPaymentBalance: 3000n,
          endPaymentBalance: 0n,
          paymentDeposit: 3000n,
          wonQuantity: 1n,
        },
      ];
      await ctx.run(bids, expectedUniformPrice);
    });

    it("3 valid bids: p(2) > p(1) > p(3)", async () => {
      const expectedUniformPrice = 1000n;
      const bids: FHEBids = [
        {
          bidder: bidders[0],
          id: 1n,
          price: 2000n,
          quantity: 2n,
          startPaymentBalance: 5000n,
          endPaymentBalance: 3000n,
          paymentDeposit: 4200n,
          wonQuantity: 2n,
        },
        {
          bidder: bidders[1],
          id: 2n,
          price: 3000n,
          quantity: 3n,
          startPaymentBalance: 10000n,
          endPaymentBalance: 7000n,
          paymentDeposit: 9900n,
          wonQuantity: 3n,
        },
        {
          bidder: bidders[2],
          id: 3n,
          price: 1000n,
          quantity: 1n,
          startPaymentBalance: 1000n,
          endPaymentBalance: 0n,
          paymentDeposit: 1000n,
          wonQuantity: 1n,
        },
      ];
      await ctx.run(bids, expectedUniformPrice);
    });

    it("Award, 3 valid bids: p(1) < p(2) < p(3)", async () => {
      const expectedUniformPrice = 1000n;
      const bids: FHEBids = [
        {
          bidder: bidders[0],
          id: 1n,
          price: 1000n,
          quantity: 1n,
          startPaymentBalance: 1000n,
          endPaymentBalance: 0n,
          paymentDeposit: 1000n,
          wonQuantity: 1n,
        },
        {
          bidder: bidders[1],
          id: 2n,
          price: 2000n,
          quantity: 2n,
          startPaymentBalance: 5000n,
          endPaymentBalance: 3000n,
          paymentDeposit: 4200n,
          wonQuantity: 2n,
        },
        {
          bidder: bidders[2],
          id: 3n,
          price: 3000n,
          quantity: 3n,
          startPaymentBalance: 10000n,
          endPaymentBalance: 7000n,
          paymentDeposit: 9900n,
          wonQuantity: 3n,
        },
      ];
      await ctx.runUsingAward(bids, expectedUniformPrice);
    });

    it("Blind claim, 3 valid bids: p(1) < p(2) < p(3)", async () => {
      const expectedUniformPrice = 1000n;
      const bids: FHEBids = [
        {
          bidder: bidders[0],
          id: 1n,
          price: 1000n,
          quantity: 1n,
          startPaymentBalance: 1000n,
          endPaymentBalance: 0n,
          paymentDeposit: 1000n,
          wonQuantity: 1n,
        },
        {
          bidder: bidders[1],
          id: 2n,
          price: 2000n,
          quantity: 2n,
          startPaymentBalance: 5000n,
          endPaymentBalance: 3000n,
          paymentDeposit: 4200n,
          wonQuantity: 2n,
        },
        {
          bidder: bidders[2],
          id: 3n,
          price: 3000n,
          quantity: 3n,
          startPaymentBalance: 10000n,
          endPaymentBalance: 7000n,
          paymentDeposit: 9900n,
          wonQuantity: 3n,
        },
      ];
      await ctx.runUsingBlindClaim(bids, expectedUniformPrice);
    });

    it("4 valid bids: p(2) > p(1) > p(3) > p(4)", async () => {
      const expectedUniformPrice = 1000n;
      const bids: FHEBids = [
        {
          bidder: bidders[0],
          id: 1n,
          price: 2000n,
          quantity: 2n,
          startPaymentBalance: 5000n,
          endPaymentBalance: 3000n,
          paymentDeposit: 4200n,
          wonQuantity: 2n,
        },
        {
          bidder: bidders[1],
          id: 2n,
          price: 3000n,
          quantity: 3n,
          startPaymentBalance: 10000n,
          endPaymentBalance: 7000n,
          paymentDeposit: 9900n,
          wonQuantity: 3n,
        },
        {
          bidder: bidders[2],
          id: 3n,
          price: 1100n,
          quantity: 1n,
          startPaymentBalance: 1100n,
          endPaymentBalance: 100n,
          paymentDeposit: 1100n,
          wonQuantity: 1n,
        },
        {
          bidder: bidders[3],
          id: 4n,
          price: 1000n,
          quantity: 1n,
          startPaymentBalance: 1000n,
          endPaymentBalance: 0n,
          paymentDeposit: 1000n,
          wonQuantity: 1n,
        },
      ];
      await ctx.run(bids, expectedUniformPrice);
    });
  });

  describe("auction.priceid.erc20", () => {
    let ctx: FHEAuctionERC20MockTestCtx;
    let bidders: Array<HardhatEthersSigner>;

    async function fixture() {
      return deployERC20AuctionWithMaxBiddersFixture(
        1_000_000n,
        DEFAULT_DURATION,
        DEFAULT_MAX_BID_COUNT,
        DEFAULT_TIE_BREAKING_RULE,
        DEFAULT_MIN_PAYMENT_DEPOSIT,
        DEFAULT_PAYMENT_PENALTY,
        DEFAULT_STOPPABLE,
        true /* start */,
        0n,
        1_000_000_000_000_000_000_000n
      );
    }

    beforeEach(async function () {
      const res = await loadFixture(fixture);
      ctx = res.ctx;
      bidders = res.bidders;
      expect(bidders.length).to.equal(10);
    });

    it("Alice: beneficiary, Bob, Carol, David : bidders", async () => {
      // Initialization: Alice creates an auction to sell 1,000,000 tokens in ether.
      // Bidding:
      //   - Bob bids 0.000002 ether per token for 500,000 tokens,
      //   - Carol bids 0.000008 ether per token for 600,000 tokens,
      //   - David bids 0.00000000001 per token for 1,000,000 tokens.
      // Resolution:
      //   - Carol gets 600,000 tokens,
      //   - Bob gets 400,000 tokens (min((1,000,000 - 600,000), 500,000) = 400,000),
      //   - David gets 0 token.
      //   - The settlement price is 0.000002 ether.
      //   - Alice collects 0.000002 * 1,000,000 = 2 ethers.
      const expectedUniformPrice = 2_000_000_000_000n;
      const expectedBeneficiaryCollect = hre.ethers.parseUnits("2.0", "ether");
      const bids: FHEBids = [
        {
          bidder: bidders[0],
          id: 1n,
          price: 2_000_000_000_000n, //0.000002 ETH
          quantity: 500_000n,
          startPaymentBalance: 2_000_000_000_000n * 500_000n,
          paymentDeposit: 2_000_000_000_000n * 500_000n,
          wonQuantity: 400_000n,
        },
        {
          bidder: bidders[1],
          id: 2n,
          price: 8_000_000_000_000n, //0.000008 ETH
          quantity: 600_000n,
          startPaymentBalance: 8_000_000_000_000n * 600_000n,
          paymentDeposit: 8_000_000_000_000n * 600_000n,
          wonQuantity: 600_000n,
        },
        {
          bidder: bidders[2],
          id: 3n,
          price: 10_000_000n, //0.00000000001 ETH
          quantity: 1_000_000n,
          startPaymentBalance: 10_000_000n * 1_000_000n,
          endPaymentBalance: 10_000_000n * 1_000_000n,
          paymentDeposit: 10_000_000n * 1_000_000n,
          wonQuantity: 0n,
        },
      ];
      await ctx.run(bids, expectedUniformPrice, expectedBeneficiaryCollect);
    });

    it("Blind claim, Alice: beneficiary, Bob, Carol, David : bidders", async () => {
      // Initialization: Alice creates an auction to sell 1,000,000 tokens in ether.
      // Bidding:
      //   - Bob bids 0.000002 ether per token for 500,000 tokens,
      //   - Carol bids 0.000008 ether per token for 600,000 tokens,
      //   - David bids 0.00000000001 per token for 1,000,000 tokens.
      // Resolution:
      //   - Carol gets 600,000 tokens,
      //   - Bob gets 400,000 tokens (min((1,000,000 - 600,000), 500,000) = 400,000),
      //   - David gets 0 token.
      //   - The settlement price is 0.000002 ether.
      //   - Alice collects 0.000002 * 1,000,000 = 2 ethers.
      const expectedUniformPrice = 2_000_000_000_000n;
      const expectedBeneficiaryCollect = hre.ethers.parseUnits("2.0", "ether");
      const bids: FHEBids = [
        {
          bidder: bidders[0],
          id: 1n,
          price: 2_000_000_000_000n, //0.000002 ETH
          quantity: 500_000n,
          startPaymentBalance: 2_000_000_000_000n * 500_000n,
          paymentDeposit: 2_000_000_000_000n * 500_000n,
          wonQuantity: 400_000n,
        },
        {
          bidder: bidders[1],
          id: 2n,
          price: 8_000_000_000_000n, //0.000008 ETH
          quantity: 600_000n,
          startPaymentBalance: 8_000_000_000_000n * 600_000n,
          paymentDeposit: 8_000_000_000_000n * 600_000n,
          wonQuantity: 600_000n,
        },
        {
          bidder: bidders[2],
          id: 3n,
          price: 10_000_000n, //0.00000000001 ETH
          quantity: 1_000_000n,
          startPaymentBalance: 10_000_000n * 1_000_000n,
          endPaymentBalance: 10_000_000n * 1_000_000n,
          paymentDeposit: 10_000_000n * 1_000_000n,
          wonQuantity: 0n,
        },
      ];
      await ctx.runUsingAward(
        bids,
        expectedUniformPrice,
        expectedBeneficiaryCollect
      );
    });

    //    describe("computeAuction", () => {
    it("non-uniform iterations: 4 valid bids: p(2) > p(1) > p(3) > p(4)", async () => {
      const expectedUniformPrice = 1000n;
      const bids: FHEBids = [
        {
          bidder: bidders[0],
          id: 1n,
          price: 2000n,
          quantity: 2n,
          startPaymentBalance: 5000n,
          endPaymentBalance: 3000n,
          paymentDeposit: 4200n,
          wonQuantity: 2n,
        },
        {
          bidder: bidders[1],
          id: 2n,
          price: 3000n,
          quantity: 3n,
          startPaymentBalance: 10000n,
          endPaymentBalance: 7000n,
          paymentDeposit: 9900n,
          wonQuantity: 3n,
        },
        {
          bidder: bidders[2],
          id: 3n,
          price: 1100n,
          quantity: 1n,
          startPaymentBalance: 1100n,
          endPaymentBalance: 100n,
          paymentDeposit: 1100n,
          wonQuantity: 1n,
        },
        {
          bidder: bidders[3],
          id: 4n,
          price: 1000n,
          quantity: 1n,
          startPaymentBalance: 1000n,
          endPaymentBalance: 0n,
          paymentDeposit: 1000n,
          wonQuantity: 1n,
        },
      ];
      await ctx.runBlindUsingComputeAuction(
        bids,
        expectedUniformPrice,
        [3, 5, 8, 2, 1, 1] //using non uniform iterations
      );
    });

    it("1 by 1 uniform iterations: 4 valid bids: p(2) > p(1) > p(3) > p(4)", async () => {
      const four = fourBids(bidders);
      await ctx.runBlindUsingComputeAuction(
        four.bids,
        four.expectedUniformPrice
      );
    });

    it("2 by 2 uniform iterations: 4 valid bids: p(2) > p(1) > p(3) > p(4)", async () => {
      const four = fourBids(bidders);
      await ctx.runBlindUsingComputeAuction(
        four.bids,
        four.expectedUniformPrice,
        [2, 2, 2, 2, 2, 2, 2, 2, 2, 2]
      );
    });

    it("4 by 4 uniform iterations: 4 valid bids: p(2) > p(1) > p(3) > p(4)", async () => {
      const four = fourBids(bidders);
      await ctx.runBlindUsingComputeAuction(
        four.bids,
        four.expectedUniformPrice,
        [4, 4, 4, 4, 4]
      );
    });

    it("5 by 5 uniform iterations: 4 valid bids: p(2) > p(1) > p(3) > p(4)", async () => {
      const four = fourBids(bidders);
      await ctx.runBlindUsingComputeAuction(
        four.bids,
        four.expectedUniformPrice,
        [5, 5, 5, 5]
      );
    });

    it("Blind claim, Alice: beneficiary, Bob, Carol, David : bidders", async () => {
      // Initialization: Alice creates an auction to sell 1,000,000 tokens in ether.
      // Bidding:
      //   - Bob bids 0.000002 ether per token for 500,000 tokens,
      //   - Carol bids 0.000008 ether per token for 600,000 tokens,
      //   - David bids 0.00000000001 per token for 1,000,000 tokens.
      // Resolution:
      //   - Carol gets 600,000 tokens,
      //   - Bob gets 400,000 tokens (min((1,000,000 - 600,000), 500,000) = 400,000),
      //   - David gets 0 token.
      //   - The settlement price is 0.000002 ether.
      //   - Alice collects 0.000002 * 1,000,000 = 2 ethers.
      const expectedUniformPrice = 2_000_000_000_000n;
      const expectedBeneficiaryCollect = hre.ethers.parseUnits("2.0", "ether");
      const bids: FHEBids = [
        {
          bidder: bidders[0],
          id: 1n,
          price: 2_000_000_000_000n, //0.000002 ETH
          quantity: 500_000n,
          startPaymentBalance: 2_000_000_000_000n * 500_000n,
          paymentDeposit: 2_000_000_000_000n * 500_000n,
          wonQuantity: 400_000n,
        },
        {
          bidder: bidders[1],
          id: 2n,
          price: 8_000_000_000_000n, //0.000008 ETH
          quantity: 600_000n,
          startPaymentBalance: 8_000_000_000_000n * 600_000n,
          paymentDeposit: 8_000_000_000_000n * 600_000n,
          wonQuantity: 600_000n,
        },
        {
          bidder: bidders[2],
          id: 3n,
          price: 10_000_000n, //0.00000000001 ETH
          quantity: 1_000_000n,
          startPaymentBalance: 10_000_000n * 1_000_000n,
          endPaymentBalance: 10_000_000n * 1_000_000n,
          paymentDeposit: 10_000_000n * 1_000_000n,
          wonQuantity: 0n,
        },
      ];
      await ctx.runBlindUsingComputeAuction(
        bids,
        expectedUniformPrice,
        undefined,
        expectedBeneficiaryCollect
      );
    });
  });

  describe("auction.priceid.erc20", () => {
    let ctx: FHEAuctionERC20MockTestCtx;
    let bidders: Array<HardhatEthersSigner>;

    //quantity = 1000000
    function threeBids(bidders: HardhatEthersSigner[]): {
      expectedUniformPrice: bigint;
      bids: FHEBids;
    } {
      return {
        expectedUniformPrice: 200000000000n,
        bids: [
          {
            bidder: bidders[0],
            price: 200000000000n,
            quantity: 500000n,
            wonQuantity: 1000000n - 600000n,
          },
          {
            bidder: bidders[1],
            price: 800000000000n,
            quantity: 600000n,
            wonQuantity: 600000n,
          },
          {
            bidder: bidders[2],
            price: 1000000n,
            quantity: 1000000n,
            wonQuantity: 0n,
          },
        ],
      };
    }

    async function fixture() {
      return deployERC20AuctionWithMaxBiddersFixture(
        1000000n,
        100000n,
        3n,
        0n,
        1000000n,
        500n,
        true,
        true /* start */,
        0n,
        1_000_000_000_000_000_000_000n
      );
    }

    beforeEach(async function () {
      const res = await loadFixture(fixture);
      ctx = res.ctx;
      bidders = res.bidders;
    });

    it("non-uniform iterations: 3 valid bids: p(2) > p(1) > p(3)", async () => {
      // 1 (w4), 2 (w3), 1 (w3), 1 (w3), 1 (w3), 1 (w3), 1 (3), 5 (w5)
      const three = threeBids(bidders);
      await ctx.runComputeAuctionIters(
        three.bids,
        three.expectedUniformPrice,
        [1, 2, 1, 1, 1, 1, 1, 5]
      );
    });
  });
}
