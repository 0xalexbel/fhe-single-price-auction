import hre from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { FHEBids, FHEAuctionERC20MockTestCtx } from "./utils";
import { deployERC20AuctionWithMaxBiddersFixture } from "./fixtures";
import { awaitAllDecryptionResults } from "../asyncDecrypt";
import { HardhatNetworkHDAccountsConfig } from "hardhat/types";

const DEFAULT_QUANTITY = 1_000_000n;
const DEFAULT_DURATION = 86400n;
const DEFAULT_TIE_BREAKING_RULE = 2n; //PriceId
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

async function run(
  ctx: FHEAuctionERC20MockTestCtx,
  bids: FHEBids,
  expectedUniformPrice: bigint,
  expectedBeneficiaryCollect?: bigint
) {
  const beneficiaryBalanceBefore = await ctx.paymentTokenBalanceOf(
    ctx.beneficiary
  );
  await ctx.minePaymentToken(bids);
  await ctx.expectPaymentBalanceToEqualStart(bids);
  await ctx.placeBidsWithDeposit(bids, true);
  await ctx.expectPaymentBalancePlusDepositToEqual(bids);
  await ctx.iterBidsValidation();
  await ctx.iterRankedBids();
  await ctx.iterRankedWonQuantities();
  await ctx.iterWonQuantities();
  await ctx.auction.connect(ctx.owner).decryptUniformPrice();
  await awaitAllDecryptionResults();
  expect(await ctx.auction.clearUniformPrice()).to.equal(expectedUniformPrice);
  for (let i = 0; i < bids.length; ++i) {
    expect(await ctx.auction.connect(bids[i].bidder).claim());
  }
  await awaitAllDecryptionResults();
  await ctx.expectWonQuantities(bids);
  await ctx.expectPaymentBalanceToEqualEnd(bids, expectedUniformPrice);
  const beneficiaryBalanceAfter = await ctx.paymentTokenBalanceOf(
    ctx.beneficiary
  );
  if (expectedBeneficiaryCollect != undefined) {
    expect(beneficiaryBalanceAfter - beneficiaryBalanceBefore).to.equal(
      expectedBeneficiaryCollect
    );
  }
}

if (checkEnv()) {
  describe("auction.erc20", () => {
    let ctx: FHEAuctionERC20MockTestCtx;
    let bidders: Array<HardhatEthersSigner>;

    async function fixture() {
      return deployERC20AuctionWithMaxBiddersFixture(
        DEFAULT_QUANTITY,
        DEFAULT_DURATION,
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

    it("2 valid bids: p(1) < p(2)", async () => {
      const expectedUniformPrice = 1000n;
      const bids: FHEBids = [
        {
          bidder: bidders[0],
          id: 1n,
          price: 1000n,
          quantity: 1n,
          startPaymentBalance: 1000n * 1n + 1500n,
          endPaymentBalance: 1500n,
          paymentDeposit: 1000n * 1n,
          wonQuantity: 1n,
        },
        {
          bidder: bidders[1],
          id: 2n,
          price: 2000n,
          quantity: 2n,
          startPaymentBalance: 2000n * 2n,
          paymentDeposit: 2000n * 2n,
          wonQuantity: 2n,
        },
      ];
      await run(ctx, bids, expectedUniformPrice);
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
      await run(ctx, bids, expectedUniformPrice);
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
      await run(ctx, bids, expectedUniformPrice);
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
      await run(ctx, bids, expectedUniformPrice);
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
      await run(ctx, bids, expectedUniformPrice);
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
      await run(ctx, bids, expectedUniformPrice);
    });
  });

  describe("auction.erc20", () => {
    let ctx: FHEAuctionERC20MockTestCtx;
    let bidders: Array<HardhatEthersSigner>;

    async function fixture() {
      return deployERC20AuctionWithMaxBiddersFixture(
        1_000_000n,
        DEFAULT_DURATION,
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
      await run(ctx, bids, expectedUniformPrice, expectedBeneficiaryCollect);
    });
  });
}
