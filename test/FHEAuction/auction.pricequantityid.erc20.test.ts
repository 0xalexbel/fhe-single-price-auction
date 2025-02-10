import hre from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import {
  FHEBids,
  FHEAuctionERC20MockTestCtx,
  TieBreakingRulePriceQuantityId,
} from "./utils";
import { deployERC20AuctionWithMaxBiddersFixture } from "./fixtures";
import { HardhatNetworkHDAccountsConfig } from "hardhat/types";

const DEFAULT_QUANTITY = 1_000_000n;
const DEFAULT_DURATION = 86400n;
const DEFAULT_MAX_BID_COUNT = 10000n;
const DEFAULT_TIE_BREAKING_RULE = TieBreakingRulePriceQuantityId;
const DEFAULT_MIN_PAYMENT_DEPOSIT = 100n;
const DEFAULT_PAYMENT_PENALTY = 70n;
const DEFAULT_STOPPABLE = true;
const DEFAULT_PAYMENT_TOKEN_BALANCE = 0n;
const DEFAULT_PAYMENT_TOKEN_TOTAL_SUPPLY = 1_000_000_000_000_000_000_000n;

function checkEnv() {
  return (
    hre.network.name == "hardhat" &&
    (hre.network.config.accounts as HardhatNetworkHDAccountsConfig).count == 15
  );
}

if (checkEnv()) {
  describe("auction.pricequantityid.erc20", () => {
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

    it("2 valid bids: p(1) < p(2) and q(1) < q(2)", async () => {
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

    it("2 valid bids: p(1) < p(2) and q(1) > q(2)", async () => {
      const expectedUniformPrice = 1000n;
      const bids: FHEBids = [
        {
          bidder: bidders[0],
          id: 1n,
          price: 1000n,
          quantity: 2n,
          startPaymentBalance: 3500n, // price x quantity + extra
          endPaymentBalance: 1500n, // extra
          paymentDeposit: 2000n,
          wonQuantity: 2n,
        },
        {
          bidder: bidders[1],
          id: 2n,
          price: 2000n,
          quantity: 1n,
          startPaymentBalance: 2000n,
          endPaymentBalance: 1000n,
          paymentDeposit: 2000n,
          wonQuantity: 1n,
        },
      ];
      await ctx.run(bids, expectedUniformPrice);
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

    it("2 valid bids: p(1) = p(2) and q(1) < q(2)", async () => {
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

    it("2 valid bids: p(1) = p(2) and q(1) > q(2)", async () => {
      const expectedUniformPrice = 1000n;
      const totalQuantity = ctx.getParams().quantity;

      const p1 = 1000n;
      const q1 = totalQuantity - 1n;
      const wq1 = q1;

      const p2 = 1000n;
      const q2 = totalQuantity - 2n;
      const wq2 = totalQuantity - q1;

      const bids: FHEBids = [
        {
          bidder: bidders[0],
          id: 1n,
          price: p1,
          quantity: q1,
          startPaymentBalance: p1 * q1,
          endPaymentBalance: p1 * q1 - expectedUniformPrice * wq1,
          paymentDeposit: p1 * q1,
          wonQuantity: wq1,
        },
        {
          bidder: bidders[1],
          id: 2n,
          price: p2,
          quantity: q2,
          startPaymentBalance: p2 * q2,
          endPaymentBalance: p2 * q2 - expectedUniformPrice * wq2,
          paymentDeposit: p2 * q2,
          wonQuantity: wq2,
        },
      ];
      await ctx.run(bids, expectedUniformPrice);
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

    it("3 valid bids: p(1) = p(2) = p(3), q(1) > q(2) > q(3)", async () => {
      const expectedUniformPrice = 3000n;
      const bids: FHEBids = [
        {
          bidder: bidders[0],
          price: 3000n,
          quantity: 3n,
          wonQuantity: 3n,
        },
        {
          bidder: bidders[1],
          price: 3000n,
          quantity: 2n,
          wonQuantity: 2n,
        },
        {
          bidder: bidders[2],
          price: 3000n,
          quantity: 1n,
          wonQuantity: 1n,
        },
      ];
      await ctx.run(bids, expectedUniformPrice);
    });

    it("Not Enough Quantity: 3 valid bids: p(1) = p(2) = p(3), q(1) > q(2) = q(3), 1 winner", async () => {
      const expectedUniformPrice = 3000n;
      const bids: FHEBids = [
        {
          bidder: bidders[0],
          price: 3000n,
          quantity: DEFAULT_QUANTITY,
          wonQuantity: DEFAULT_QUANTITY,
        },
        {
          bidder: bidders[1],
          price: 3000n,
          quantity: DEFAULT_QUANTITY - 1n,
          wonQuantity: 0n,
        },
        {
          bidder: bidders[2],
          price: 3000n,
          quantity: DEFAULT_QUANTITY - 2n,
          wonQuantity: 0n,
        },
      ];
      await ctx.run(bids, expectedUniformPrice);
    });

    it("Not Enough Quantity: 3 valid bids: p(1) = p(2) = p(3), q(1) > q(2) = q(3), 2 winners", async () => {
      expect(await ctx.auctionQuantity()).to.equal(DEFAULT_QUANTITY);
      const expectedUniformPrice = 3000n;
      const bids: FHEBids = [
        {
          bidder: bidders[0],
          price: 3000n,
          quantity: DEFAULT_QUANTITY - 1n,
          wonQuantity: DEFAULT_QUANTITY - 1n,
        },
        {
          bidder: bidders[1],
          price: 3000n,
          quantity: DEFAULT_QUANTITY - 2n,
          wonQuantity: 1n,
        },
        {
          bidder: bidders[2],
          price: 3000n,
          quantity: DEFAULT_QUANTITY - 2n,
          wonQuantity: 0n,
        },
      ];
      await ctx.run(bids, expectedUniformPrice);
    });

    it("Not Enough Quantity: 3 valid bids: p(1) = p(2) = p(3), q(1) > q(2) = q(3), 3 winners", async () => {
      expect(await ctx.auctionQuantity()).to.equal(DEFAULT_QUANTITY);
      const expectedUniformPrice = 3000n;
      const bids: FHEBids = [
        {
          bidder: bidders[0],
          price: 3000n,
          quantity: DEFAULT_QUANTITY - 3n,
          wonQuantity: DEFAULT_QUANTITY - 3n,
        },
        {
          bidder: bidders[1],
          price: 3000n,
          quantity: 2n,
          wonQuantity: 2n,
        },
        {
          bidder: bidders[2],
          price: 3000n,
          quantity: 1n,
          wonQuantity: 1n,
        },
      ];
      await ctx.run(bids, expectedUniformPrice);
    });

    it("Not Enough Quantity: 3 valid bids: p(1) = p(2) = p(3), q(1) = q(2) = q(3), 1 winner", async () => {
      expect(await ctx.auctionQuantity()).to.equal(DEFAULT_QUANTITY);
      const expectedUniformPrice = 3000n;
      const bids: FHEBids = [
        {
          bidder: bidders[0],
          price: 3000n,
          quantity: DEFAULT_QUANTITY,
          wonQuantity: DEFAULT_QUANTITY,
        },
        {
          bidder: bidders[1],
          price: 3000n,
          quantity: DEFAULT_QUANTITY,
          wonQuantity: 0n,
        },
        {
          bidder: bidders[2],
          price: 3000n,
          quantity: DEFAULT_QUANTITY,
          wonQuantity: 0n,
        },
      ];
      await ctx.run(bids, expectedUniformPrice);
    });

    it("Not Enough Quantity: 3 valid bids: p(1) = p(2) = p(3), q(1) = q(2) = q(3), 2 winners", async () => {
      expect(await ctx.auctionQuantity()).to.equal(DEFAULT_QUANTITY);
      const expectedUniformPrice = 3000n;
      const bids: FHEBids = [
        {
          bidder: bidders[0],
          price: 3000n,
          quantity: DEFAULT_QUANTITY - 3n,
          wonQuantity: DEFAULT_QUANTITY - 3n,
        },
        {
          bidder: bidders[1],
          price: 3000n,
          quantity: DEFAULT_QUANTITY - 3n,
          wonQuantity: 3n,
        },
        {
          bidder: bidders[2],
          price: 3000n,
          quantity: DEFAULT_QUANTITY - 3n,
          wonQuantity: 0n,
        },
      ];
      await ctx.run(bids, expectedUniformPrice);
    });

    it("Enough Quantity: 3 valid bids: p(1) = p(2) = p(3), q(1) = q(2) = q(3), 3 winners", async () => {
      const expectedUniformPrice = 3000n;
      const bids: FHEBids = [
        {
          bidder: bidders[0],
          price: 3000n,
          quantity: 10n,
          wonQuantity: 10n,
        },
        {
          bidder: bidders[1],
          price: 3000n,
          quantity: 10n,
          wonQuantity: 10n,
        },
        {
          bidder: bidders[2],
          price: 3000n,
          quantity: 10n,
          wonQuantity: 10n,
        },
      ];
      await ctx.run(bids, expectedUniformPrice);
    });

    it("Not Enough Quantity: 3 valid bids: p(1) = p(2) = p(3), q(1) = q(2) = q(3), 3 winners", async () => {
      expect(await ctx.auctionQuantity()).to.equal(1_000_000n);
      const expectedUniformPrice = 3000n;
      const bids: FHEBids = [
        {
          bidder: bidders[0],
          price: 3000n,
          quantity: 400_000n,
          wonQuantity: 400_000n,
        },
        {
          bidder: bidders[1],
          price: 3000n,
          quantity: 400_000n,
          wonQuantity: 400_000n,
        },
        {
          bidder: bidders[2],
          price: 3000n,
          quantity: 400_000n,
          wonQuantity: 200_000n,
        },
      ];
      await ctx.run(bids, expectedUniformPrice);
    });

    it("3 valid bids: p(2) > p(1) > p(3)", async () => {
      const expectedUniformPrice = 1000n;
      const bids: FHEBids = [
        {
          bidder: bidders[0],
          price: 2000n,
          quantity: 2n,
          wonQuantity: 2n,
        },
        {
          bidder: bidders[1],
          price: 3000n,
          quantity: 3n,
          wonQuantity: 3n,
        },
        {
          bidder: bidders[2],
          price: 1000n,
          quantity: 1n,
          wonQuantity: 1n,
        },
      ];
      await ctx.run(bids, expectedUniformPrice);
    });
  });

  describe("auction.pricequantityid.erc20", () => {
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

    it("Not enough quantity: beneficiary: Alice, bidders: p(Carol) > p(Bob) > p(David), q(David) > q(Carol) > q(Bob): ", async () => {
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
      expect(await ctx.auctionQuantity()).to.equal(1_000_000n);

      const expectedUniformPrice = 2_000_000_000_000n;
      const expectedBeneficiaryCollect = hre.ethers.parseUnits("2.0", "ether");
      const bids: FHEBids = [
        {
          bidder: bidders[0],
          price: 2_000_000_000_000n, //0.000002 ETH
          quantity: 500_000n,
          wonQuantity: 400_000n,
        },
        {
          bidder: bidders[1],
          price: 8_000_000_000_000n, //0.000008 ETH
          quantity: 600_000n,
          wonQuantity: 600_000n,
        },
        {
          bidder: bidders[2],
          price: 10_000_000n, //0.00000000001 ETH
          quantity: 1_000_000n,
          wonQuantity: 0n,
        },
      ];
      await ctx.run(bids, expectedUniformPrice, expectedBeneficiaryCollect);
    });

    it("Not enough quantity: beneficiary: Alice, bidders: p(Carol) > p(Bob) = p(David), q(David) > q(Carol) > q(Bob): ", async () => {
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
      expect(await ctx.auctionQuantity()).to.equal(1_000_000n);

      const expectedUniformPrice = 2_000_000_000_000n;
      const expectedBeneficiaryCollect = hre.ethers.parseUnits("2.0", "ether");
      const bids: FHEBids = [
        // Bob
        {
          bidder: bidders[0],
          price: 2_000_000_000_000n, //0.000002 ETH
          quantity: 500_000n,
          wonQuantity: 0n,
        },
        // Carol
        {
          bidder: bidders[1],
          price: 8_000_000_000_000n, //0.000008 ETH
          quantity: 600_000n,
          wonQuantity: 600_000n,
        },
        // David
        {
          bidder: bidders[2],
          price: 2_000_000_000_000n, //0.00000000001 ETH
          quantity: 1_000_000n,
          wonQuantity: 400_000n,
        },
      ];
      await ctx.run(bids, expectedUniformPrice, expectedBeneficiaryCollect);
    });
  });
}
