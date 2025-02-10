import hre from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import {
  FHEBids,
  FHEAuctionNativeMockTestCtx,
  TieBreakingRulePriceId,
} from "./utils";
import { deployNativeAuctionMockFixture } from "./fixtures";

const DEFAULT_MAX_BID_COUNT = 10000n;
const DEFAULT_QUANTITY = 12345n;
const DEFAULT_DURATION = 86400n;
const DEFAULT_TIE_BREAKING_RULE = TieBreakingRulePriceId;
const DEFAULT_MIN_PAYMENT_DEPOSIT = 100n;
const DEFAULT_PAYMENT_PENALTY = 70n;
const DEFAULT_STOPPABLE = true;

describe("cancel.native", () => {
  let ctx: FHEAuctionNativeMockTestCtx;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let charlie: HardhatEthersSigner;

  async function fixture() {
    return deployNativeAuctionMockFixture(
      DEFAULT_QUANTITY,
      DEFAULT_DURATION,
      DEFAULT_MAX_BID_COUNT,
      DEFAULT_TIE_BREAKING_RULE,
      DEFAULT_MIN_PAYMENT_DEPOSIT,
      DEFAULT_PAYMENT_PENALTY,
      DEFAULT_STOPPABLE,
      true /* start */
    );
  }

  beforeEach(async function () {
    const res = await loadFixture(fixture);
    ctx = res.ctx;
    alice = res.alice;
    bob = res.bob;
    charlie = res.charlie;
  });

  it("single bid gas cost", async () => {
    // Bid cost ~= 900_000 gas
    const b0 = await hre.ethers.provider.getBalance(alice);

    const tx0 = await ctx.auctionNative.connect(alice).deposit({
      value: 1000n,
    });
    const receipt0 = await tx0.wait(1);
    const cost0 = receipt0?.gasUsed! * receipt0?.gasPrice!;

    const b1 = await hre.ethers.provider.getBalance(alice);
    expect(cost0 + 1000n).to.equal(b0 - b1);

    const tx1 = await ctx.bid(alice, 1234n, 1n);
    const receipt1 = await tx1.wait(1);
    const cost1 = receipt1?.gasUsed! * receipt1?.gasPrice!;

    console.log(
      `Deposit        : ${receipt0?.gasUsed!} (Gas price: ${receipt0?.gasPrice!}) (Tx fee: ${cost0})`
    );
    console.log(
      `Bid            : ${receipt1?.gasUsed!} (Gas price: ${receipt1?.gasPrice!}) (Tx fee: ${cost1})`
    );
    console.log(
      "Total Gas used : " + (receipt0?.gasUsed! + receipt1?.gasUsed!)
    );
    console.log("Total Fee      : " + (cost1 + cost0));

    const b2 = await hre.ethers.provider.getBalance(alice);
    expect(cost1).to.equal(b1 - b2);
  });

  async function testPlaceBidThenCancelBid(
    bidder: HardhatEthersSigner,
    deposit: bigint,
    price: bigint,
    quantity: bigint
  ) {
    expect(await ctx.auction.bidCount()).to.equal(0);

    const b0 = await hre.ethers.provider.getBalance(alice);

    const tx0 = await ctx.auctionNative.connect(bidder).deposit({
      value: deposit,
    });
    const receipt0 = await tx0.wait(1);
    const cost0 = receipt0?.gasUsed! * receipt0?.gasPrice!;

    expect(await ctx.auction.bidCount()).to.equal(0);

    const b1 = await hre.ethers.provider.getBalance(alice);
    expect(cost0 + deposit).to.equal(b0 - b1);

    const tx1 = await ctx.bid(bidder, price, quantity);
    const receipt1 = await tx1.wait(1);
    const cost1 = receipt1?.gasUsed! * receipt1?.gasPrice!;

    const b2 = await hre.ethers.provider.getBalance(bidder);
    expect(cost1).to.equal(b1 - b2);

    expect(await ctx.auction.bidCount()).to.equal(1);

    const tx2 = await ctx.cancelBid(alice);
    const receipt2 = await tx2.wait(1);
    const cost2 = receipt2?.gasUsed! * receipt2?.gasPrice!;

    const b3 = await hre.ethers.provider.getBalance(alice);
    expect(b3).to.equal(b2 - cost2 + deposit);

    expect(await ctx.auction.bidCount()).to.equal(0);
  }

  it("3x(place bid + cancel bid + place bid)", async () => {
    // Bid cost ~= 900_000 gas
    await testPlaceBidThenCancelBid(alice, 1_000_000n, 1234n, 1n);
    await testPlaceBidThenCancelBid(alice, 1_000_000n, 1234n, 1n);
    await testPlaceBidThenCancelBid(alice, 1_000_000n, 1234n, 1n);
  });

  it("bidCount should be zero after cancel all bids", async () => {
    const bids: FHEBids = [
      { bidder: alice, id: 1n, price: 1234n, quantity: 1n },
      { bidder: bob, id: 2n, price: 1235n, quantity: 2n },
      { bidder: charlie, id: 3n, price: 1236n, quantity: 3n },
    ];

    await ctx.placeBids(bids, true, false);

    await ctx.cancelBid(alice);
    expect(await ctx.auction.bidCount()).to.equal(2n);
    await ctx.cancelBid(bob);
    expect(await ctx.auction.bidCount()).to.equal(1n);
    await ctx.cancelBid(charlie);
    expect(await ctx.auction.bidCount()).to.equal(0n);
  });

  it("3 bids, cancel first bid should succeed", async () => {
    const bids: FHEBids = [
      { bidder: alice, id: 1n, price: 1234n, quantity: 1n },
      { bidder: bob, id: 2n, price: 1235n, quantity: 2n },
      { bidder: charlie, id: 3n, price: 1236n, quantity: 3n },
    ];

    const expectedBids: FHEBids = [
      { bidder: bob, id: 2n, price: 1235n, quantity: 2n },
      { bidder: charlie, id: 3n, price: 1236n, quantity: 3n },
    ];

    await ctx.placeBids(bids, true, false);
    await ctx.cancelBid(alice);
    await ctx.allowBids();
    await ctx.expectBidsToEqual(expectedBids);
  });

  it("3 bids, cancel second bid should succeed", async () => {
    const bids: FHEBids = [
      { bidder: alice, id: 1n, price: 1234n, quantity: 1n },
      { bidder: bob, id: 2n, price: 1235n, quantity: 2n },
      { bidder: charlie, id: 3n, price: 1236n, quantity: 3n },
    ];

    const expectedBids: FHEBids = [
      { bidder: alice, id: 1n, price: 1234n, quantity: 1n },
      { bidder: charlie, id: 3n, price: 1236n, quantity: 3n },
    ];

    await ctx.placeBids(bids, true, false);
    await ctx.cancelBid(bob);
    await ctx.allowBids();
    await ctx.expectBidsToEqual(expectedBids);
  });

  it("3 bids, cancel third bid should succeed", async () => {
    const bids: FHEBids = [
      { bidder: alice, id: 1n, price: 1234n, quantity: 1n },
      { bidder: bob, id: 2n, price: 1235n, quantity: 2n },
      { bidder: charlie, id: 3n, price: 1236n, quantity: 3n },
    ];

    const expectedBids: FHEBids = [
      { bidder: alice, id: 1n, price: 1234n, quantity: 1n },
      { bidder: bob, id: 2n, price: 1235n, quantity: 2n },
    ];

    await ctx.placeBids(bids, true, false);
    await ctx.cancelBid(charlie);
    await ctx.allowBids();
    await ctx.expectBidsToEqual(expectedBids);
  });
});
