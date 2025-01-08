import hre from "hardhat";
import { expect } from "chai";
import {
  loadFixture,
  time,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { FHEBids, FHEAuctionERC20MockTestCtx } from "./utils";
import { deployERC20AuctionFixture } from "./fixtures";
import { reencryptEuint256 } from "../reencrypt";
import { awaitCoprocessor } from "../coprocessorUtils";
import { awaitAllDecryptionResults } from "../asyncDecrypt";

const DEFAULT_QUANTITY = 12345n;
const DEFAULT_DURATION = 86400n;
const DEFAULT_TIE_BREAKING_RULE = 2n; //PriceId
const DEFAULT_MIN_PAYMENT_DEPOSIT = 100n;
const DEFAULT_PAYMENT_PENALTY = 70n;
const DEFAULT_STOPPABLE = true;
const DEFAULT_PAYMENT_TOKEN_BALANCE = 100_000_000n;

describe("engine.erc20", () => {
  let ctx: FHEAuctionERC20MockTestCtx;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let charlie: HardhatEthersSigner;

  async function fixture() {
    return deployERC20AuctionFixture(
      DEFAULT_QUANTITY,
      DEFAULT_DURATION,
      DEFAULT_TIE_BREAKING_RULE,
      DEFAULT_MIN_PAYMENT_DEPOSIT,
      DEFAULT_PAYMENT_PENALTY,
      DEFAULT_STOPPABLE,
      true /* start */,
      DEFAULT_PAYMENT_TOKEN_BALANCE
    );
  }

  beforeEach(async function () {
    const res = await loadFixture(fixture);
    ctx = res.ctx;
    alice = res.alice;
    bob = res.bob;
    charlie = res.charlie;
  });

  it("should return the total auction quantity", async () => {
    expect(await ctx.auctionQuantity()).to.equal(ctx.params.quantity);
  });

  it("one single bid with valid argument should be registered", async () => {
    expect(await ctx.auction.owner()).to.equal(ctx.owner);

    const bidPrice = 1337n;
    const bidQuantity = ctx.params.quantity - 1n;

    await ctx.depositSingle(alice, bidPrice * bidQuantity);

    const input = ctx.fhevm.createEncryptedInput(
      ctx.auctionAddr,
      alice.address
    );
    input.add256(bidPrice);
    input.add256(bidQuantity);
    const enc = await input.encrypt();

    await ctx.auction
      .connect(alice)
      .bid(enc.handles[0], enc.handles[1], enc.inputProof);

    const bid = await ctx.auction.connect(alice).getBid();
    const _bidPrice = await reencryptEuint256(
      alice,
      ctx.fhevm,
      bid.price,
      ctx.auctionAddr
    );
    expect(_bidPrice).to.equal(bidPrice);

    const _bidQuantity = await reencryptEuint256(
      alice,
      ctx.fhevm,
      bid.quantity,
      ctx.auctionAddr
    );
    expect(_bidQuantity).to.equal(bidQuantity);
  });

  it("bidCount should be zero after cancel all bids", async () => {
    const bids: FHEBids = [
      { bidder: alice, id: 1n, price: 1234n, quantity: 1n },
      { bidder: bob, id: 2n, price: 1235n, quantity: 2n },
      { bidder: charlie, id: 3n, price: 1236n, quantity: 3n },
    ];

    await ctx.placeBidsWithDeposit(bids, false);

    await ctx.cancelBid(alice);
    expect(await ctx.auction.bidCount()).to.equal(2n);
    await ctx.cancelBid(bob);
    expect(await ctx.auction.bidCount()).to.equal(1n);
    await ctx.cancelBid(charlie);
    expect(await ctx.auction.bidCount()).to.equal(0n);
  });

  it("bidder cannot decrypt engine bid data", async () => {
    const bids: FHEBids = [
      { bidder: alice, id: 1n, price: 1234n, quantity: 1n },
    ];

    await ctx.placeBidsWithDeposit(bids, false);

    const bid = await ctx.engine.connect(alice).getBidByBidder(alice);
    await expect(
      reencryptEuint256(alice, ctx.fhevm, bid.price, ctx.engineAddr)
    ).to.be.rejectedWith("User is not authorized to reencrypt this handle!");
  });

  it("three bids with valid argument should be registered", async () => {
    const bids: FHEBids = [
      { bidder: alice, id: 1n, price: 1234n, quantity: 1n },
      { bidder: bob, id: 2n, price: 1235n, quantity: 2n },
      { bidder: charlie, id: 3n, price: 1236n, quantity: 3n },
    ];

    await ctx.placeBidsWithDeposit(bids, false);
    await ctx.allowBids();
    await ctx.expectBidsToEqual(bids);
  });

  it("three bids not yet sorted, sort should not be completed", async () => {
    const bids: FHEBids = [
      { bidder: alice, id: 1n, price: 1234n, quantity: 1n },
      { bidder: bob, id: 2n, price: 1235n, quantity: 2n },
      { bidder: charlie, id: 3n, price: 1236n, quantity: 3n },
    ];

    await ctx.placeBidsWithDeposit(bids, false);

    expect(await ctx.engine.isRankedBidsComplete()).to.be.false;
  });

  it("three bids validation", async () => {
    const bids: FHEBids = [
      { bidder: alice, id: 1n, price: 1234n, quantity: 1n },
      { bidder: bob, id: 2n, price: 1235n, quantity: 2n },
      { bidder: charlie, id: 3n, price: 1236n, quantity: 3n },
    ];

    await ctx.placeBidsWithDeposit(bids, false);

    expect(await ctx.engine.bidsValidationProgressMax()).to.equal(3);

    await ctx.auction.connect(ctx.owner).stop();
    await ctx.iterBidsValidation();
  });

  it("three bids validation with unsufficiant deposit, should be zero", async () => {
    const minimumDeposit = await ctx.auction.minimumDeposit();

    const bids: FHEBids = [
      { bidder: alice, id: 1n, price: minimumDeposit + 1n, quantity: 1n },
      { bidder: bob, id: 2n, price: minimumDeposit + 2n, quantity: 2n },
      { bidder: charlie, id: 3n, price: minimumDeposit + 3n, quantity: 3n },
    ];

    const validatedBids: FHEBids = [
      { bidder: alice, id: 1n, price: 0n, quantity: 0n },
      { bidder: bob, id: 2n, price: 0n, quantity: 0n },
      { bidder: charlie, id: 3n, price: 0n, quantity: 0n },
    ];

    await ctx.deposit(bids, minimumDeposit, true);
    await ctx.placeBidsWithoutDeposit(bids, true);
    await ctx.iterBidsValidation();
    await ctx.expectBidsToEqual(validatedBids);
  });

  it("three bids validation with deposit, should be valid", async () => {
    const bids: FHEBids = [
      { bidder: alice, id: 1n, price: 1234n, quantity: 1n },
      { bidder: bob, id: 2n, price: 1235n, quantity: 2n },
      { bidder: charlie, id: 3n, price: 1236n, quantity: 3n },
    ];

    await ctx.placeBidsWithDeposit(bids, true);
    await ctx.iterBidsValidation();
    await ctx.expectBidsToEqual(bids);
  });

  it("one second before end time, auction should be open", async () => {
    const endTime = await ctx.auction.endTime();
    expect(await ctx.auction.closed()).to.be.false;
    await time.increaseTo(endTime - 1n);
    expect(await ctx.auction.closed()).to.be.false;
  });

  it("at end time, auction should be closed", async () => {
    const endTime = await ctx.auction.endTime();
    expect(await ctx.auction.closed()).to.be.false;
    await time.increaseTo(endTime);
    expect(await ctx.auction.closed()).to.be.true;
  });

  it("one second after end time, auction should be closed", async () => {
    const endTime = await ctx.auction.endTime();
    expect(await ctx.auction.closed()).to.be.false;
    await time.increaseTo(endTime + 1n);
    expect(await ctx.auction.closed()).to.be.true;
  });

  it("one bid: should sort successfully", async () => {
    const bids: FHEBids = [
      { bidder: alice, id: 1n, price: 1235n, quantity: 1n },
    ];

    const rankedBids: FHEBids = [
      { bidder: alice, id: 1n, price: 1235n, quantity: 1n },
    ];

    await ctx.bidDepositStop(bids);
    await ctx.iterBidsValidation();
    await ctx.iterRankedBids();
    await ctx.expectRankedBidsToEqual(rankedBids);
  });

  it("one bid, sort multiple chuncks should succeed", async () => {
    const bids: FHEBids = [
      { bidder: alice, id: 1n, price: 1235n, quantity: 1n },
    ];

    const rankedBids: FHEBids = [
      { bidder: alice, id: 1n, price: 1235n, quantity: 1n },
    ];

    await ctx.bidDepositStop(bids);
    await ctx.iterBidsValidation();

    expect(await ctx.engine.isRankedBidsComplete()).to.be.false;
    await ctx.engine.iterRankedBids(100);
    await ctx.engine.iterRankedBids(100);
    expect(await ctx.engine.isRankedBidsComplete()).to.be.true;
    expect(await ctx.engine.rankedBidsProgress()).to.equal(1);
    expect(await ctx.engine.rankedBidsProgressMax()).to.equal(1);

    await ctx.engine.connect(ctx.owner).allowRankedBids();
    await awaitCoprocessor();

    await ctx.expectRankedBidsToEqual(rankedBids);
  });

  it("2 bids: p(1) > p(2)", async () => {
    const bids: FHEBids = [
      { bidder: alice, id: 1n, price: 1235n, quantity: 1n },
      { bidder: bob, id: 2n, price: 1234n, quantity: 2n },
    ];

    const rankedBids: FHEBids = [
      { bidder: alice, id: 1n, price: 1235n, quantity: 1n },
      { bidder: bob, id: 2n, price: 1234n, quantity: 2n },
    ];

    await ctx.bidDepositStop(bids);
    await ctx.iterBidsValidation();
    await ctx.iterRankedBids();
    await ctx.expectRankedBidsToEqual(rankedBids);
  });

  it("2 bids: p(1) < p(2)", async () => {
    const bids: FHEBids = [
      { bidder: alice, id: 1n, price: 1234n, quantity: 1n },
      { bidder: bob, id: 2n, price: 1235n, quantity: 2n },
    ];

    const rankedBids: FHEBids = [
      { bidder: bob, id: 2n, price: 1235n, quantity: 2n },
      { bidder: alice, id: 1n, price: 1234n, quantity: 1n },
    ];

    await ctx.bidDepositStop(bids);
    await ctx.iterBidsValidation();
    await ctx.iterRankedBids();
    await ctx.expectRankedBidsToEqual(rankedBids);
  });

  it("2 bids: p(1) = p(2)", async () => {
    const bids: FHEBids = [
      { bidder: alice, id: 1n, price: 1234n, quantity: 1n },
      { bidder: bob, id: 2n, price: 1234n, quantity: 2n },
    ];

    const rankedBids: FHEBids = [
      { bidder: alice, id: 1n, price: 1234n, quantity: 1n },
      { bidder: bob, id: 2n, price: 1234n, quantity: 2n },
    ];

    await ctx.bidDepositStop(bids);
    await ctx.iterBidsValidation();
    await ctx.iterRankedBids();
    await ctx.expectRankedBidsToEqual(rankedBids);
  });

  it("3 bids: p(1) = p(2), p(2) < p(3)", async () => {
    const bids: FHEBids = [
      { bidder: alice, id: 1n, price: 1234n, quantity: 1n },
      { bidder: bob, id: 2n, price: 1234n, quantity: 2n },
      { bidder: charlie, id: 3n, price: 1236n, quantity: 3n },
    ];

    const rankedBids: FHEBids = [
      { bidder: charlie, id: 3n, price: 1236n, quantity: 3n },
      { bidder: alice, id: 1n, price: 1234n, quantity: 1n },
      { bidder: bob, id: 2n, price: 1234n, quantity: 2n },
    ];

    await ctx.bidDepositStop(bids);
    await ctx.iterBidsValidation();
    await ctx.iterRankedBids();
    await ctx.expectRankedBidsToEqual(rankedBids);
  });

  it("3 bids: p(1) < p(2) < p(3)", async () => {
    const bids: FHEBids = [
      { bidder: alice, id: 1n, price: 1234n, quantity: 1n },
      { bidder: bob, id: 2n, price: 1235n, quantity: 2n },
      { bidder: charlie, id: 3n, price: 1236n, quantity: 3n },
    ];

    const rankedBids: FHEBids = [
      { bidder: charlie, id: 3n, price: 1236n, quantity: 3n },
      { bidder: bob, id: 2n, price: 1235n, quantity: 2n },
      { bidder: alice, id: 1n, price: 1234n, quantity: 1n },
    ];

    await ctx.bidDepositStop(bids);
    await ctx.iterBidsValidation();
    await ctx.iterRankedBids();
    await ctx.expectRankedBidsToEqual(rankedBids);
  });

  it("3 bids: p(1) > p(2) > p(3)", async () => {
    const bids: FHEBids = [
      { bidder: alice, id: 1n, price: 1236n, quantity: 1n },
      { bidder: bob, id: 2n, price: 1235n, quantity: 2n },
      { bidder: charlie, id: 3n, price: 1234n, quantity: 3n },
    ];

    const rankedBids: FHEBids = [
      { bidder: alice, id: 1n, price: 1236n, quantity: 1n },
      { bidder: bob, id: 2n, price: 1235n, quantity: 2n },
      { bidder: charlie, id: 3n, price: 1234n, quantity: 3n },
    ];

    await ctx.bidDepositStop(bids);
    await ctx.iterBidsValidation();
    await ctx.iterRankedBids();
    await ctx.expectRankedBidsToEqual(rankedBids);
  });

  it("3 bids: p(1) = p(2) = p(3)", async () => {
    const bids: FHEBids = [
      { bidder: alice, id: 1n, price: 1234n, quantity: 1n },
      { bidder: bob, id: 2n, price: 1234n, quantity: 2n },
      { bidder: charlie, id: 3n, price: 1234n, quantity: 3n },
    ];

    const rankedBids: FHEBids = [
      { bidder: alice, id: 1n, price: 1234n, quantity: 1n },
      { bidder: bob, id: 2n, price: 1234n, quantity: 2n },
      { bidder: charlie, id: 3n, price: 1234n, quantity: 3n },
    ];

    await ctx.bidDepositStop(bids);
    await ctx.iterBidsValidation();
    await ctx.iterRankedBids();
    await ctx.expectRankedBidsToEqual(rankedBids);
  });

  it("N bids: p(i) < p(i+1)", async () => {
    const signers = await hre.ethers.getSigners();
    const n: number = signers.length;

    const p0 = 1234n;
    const bids: FHEBids = [];
    const rankedBids: FHEBids = [];
    for (let i = 0; i < n; ++i) {
      bids.push({
        bidder: signers[i],
        id: BigInt(i + 1),
        price: p0 + BigInt(i),
        quantity: 1n + BigInt(i),
      });
      const j = n - 1 - i;
      rankedBids.push({
        bidder: signers[j],
        id: BigInt(j + 1),
        price: p0 + BigInt(j),
        quantity: 1n + BigInt(j),
      });
    }

    await ctx.minePaymentToken(bids);
    await ctx.bidDepositStop(bids);
    await ctx.iterBidsValidation();
    await ctx.iterRankedBids();
    await ctx.expectRankedBidsToEqual(rankedBids);
    await ctx.iterRankedWonQuantities();

    const uniformPrice = await ctx.getClearUniformPrice();
    expect(uniformPrice).to.equal(p0);

    await ctx.iterWonQuantities();
  });

  it("N bids: p(i) > p(i+1)", async () => {
    const signers = await hre.ethers.getSigners();
    const n: number = signers.length;

    const p0 = 1234n;
    const bids: FHEBids = [];
    const rankedBids: FHEBids = [];
    for (let i = 0; i < n; ++i) {
      bids.push({
        bidder: signers[i],
        id: BigInt(i + 1),
        price: p0 + BigInt(n - 1 - i),
        quantity: 1n + BigInt(i),
      });
      rankedBids.push({
        bidder: signers[i],
        id: BigInt(i + 1),
        price: p0 + BigInt(n - 1 - i),
        quantity: 1n + BigInt(i),
      });
    }

    await ctx.minePaymentToken(bids);
    await ctx.bidDepositStop(bids);
    await ctx.iterBidsValidation();
    await ctx.iterRankedBids();
    await ctx.expectRankedBidsToEqual(rankedBids);
    await ctx.iterRankedWonQuantities();

    const uniformPrice = await ctx.getClearUniformPrice();
    expect(uniformPrice).to.equal(p0);

    await ctx.iterWonQuantities();
  });

  it("N bids: p(i) = p(i+1)", async () => {
    const signers = await hre.ethers.getSigners();
    const n: number = signers.length;

    const p0 = 1234n;
    const bids: FHEBids = [];
    const rankedBids: FHEBids = [];
    for (let i = 0; i < n; ++i) {
      bids.push({
        bidder: signers[i],
        id: BigInt(i + 1),
        price: p0,
        quantity: 1n + BigInt(i),
      });
      rankedBids.push({
        bidder: signers[i],
        id: BigInt(i + 1),
        price: p0,
        quantity: 1n + BigInt(i),
      });
    }

    await ctx.minePaymentToken(bids);
    await ctx.bidDepositStop(bids);
    await ctx.iterBidsValidation();
    await ctx.iterRankedBids();
    await ctx.expectRankedBidsToEqual(rankedBids);
    await ctx.iterRankedWonQuantities();

    const uniformPrice = await ctx.getClearUniformPrice();
    expect(uniformPrice).to.equal(p0);

    await ctx.iterWonQuantities();
  });

  it("Uniform price, 2 bids: p(1) < p(2)", async () => {
    const bids: FHEBids = [
      { bidder: alice, id: 1n, price: 1234n, quantity: 1n },
      { bidder: bob, id: 2n, price: 1235n, quantity: 2n },
    ];

    const rankedBids: FHEBids = [
      { bidder: bob, id: 2n, price: 1235n, quantity: 2n },
      { bidder: alice, id: 1n, price: 1234n, quantity: 1n },
    ];

    await ctx.bidDepositStop(bids);
    await ctx.iterBidsValidation();
    await ctx.iterRankedBids();
    await ctx.expectRankedBidsToEqual(rankedBids);
    // cannot decrypt uniform price
    expect(await ctx.auction.canDecryptUniformPrice()).to.be.false;
    await ctx.iterRankedWonQuantities();
    // can decrypt uniform price
    expect(await ctx.auction.canDecryptUniformPrice()).to.be.true;

    await ctx.auction.connect(ctx.owner).decryptUniformPrice();
    await awaitAllDecryptionResults();

    expect(await ctx.auction.clearUniformPrice()).to.equal(bids[0].price);
    expect(await ctx.auction.connect(alice).canClaim()).to.be.false;
    expect(await ctx.auction.connect(bob).canClaim()).to.be.false;

    await ctx.iterWonQuantities();

    expect(await ctx.auction.connect(alice).canClaim()).to.be.true;
    expect(await ctx.auction.connect(bob).canClaim()).to.be.true;

    const aliceAuctionBalanceBefore = await ctx.auctionTokenBalanceOf(alice);
    await ctx.auction.connect(alice).claim();
    await awaitAllDecryptionResults();
    const aliceAuctionBalanceAfter = await ctx.auctionTokenBalanceOf(alice);
    expect(aliceAuctionBalanceAfter - aliceAuctionBalanceBefore).to.equal(
      bids[0].quantity
    );

    const bobAuctionBalanceBefore = await ctx.auctionTokenBalanceOf(bob);
    await ctx.auction.connect(bob).claim();
    await awaitAllDecryptionResults();
    const bobAuctionBalanceAfter = await ctx.auctionTokenBalanceOf(bob);
    expect(bobAuctionBalanceAfter - bobAuctionBalanceBefore).to.equal(
      bids[1].quantity
    );
  });

  it("Uniform price, 2 bids: p(1) < p(2), with penalty", async () => {
    const bids: FHEBids = [
      { bidder: alice, id: 1n, price: 1234n, quantity: 1n },
      { bidder: bob, id: 2n, price: 1235n, quantity: 2n },
    ];

    const rankedBids: FHEBids = [
      { bidder: alice, id: 1n, price: 1234n, quantity: 1n },
      // bob's bid is set to zero because of unsufficient deposit
      { bidder: bob, id: 2n, price: 0n, quantity: 0n },
    ];

    const aliceDeposit = bids[0].price * bids[0].quantity;
    const bobDeposit = (bids[1].price * bids[1].quantity) / 2n;

    await ctx.depositSingle(bids[0].bidder, aliceDeposit);
    await ctx.depositSingle(bids[1].bidder, bobDeposit);

    await ctx.placeBidsWithoutDeposit(bids, true);
    await ctx.iterBidsValidation();
    await ctx.iterRankedBids();
    await ctx.expectRankedBidsToEqual(rankedBids);
    await ctx.iterRankedWonQuantities();

    await ctx.auction.connect(ctx.owner).decryptUniformPrice();
    await awaitAllDecryptionResults();

    expect(await ctx.auction.clearUniformPrice()).to.equal(bids[0].price);

    await ctx.iterWonQuantities();

    expect(await ctx.auction.connect(alice).canClaim()).to.be.true;
    expect(await ctx.auction.connect(bob).canClaim()).to.be.true;

    await ctx.auction.connect(alice).claim();
    await ctx.auction.connect(bob).claim();

    const aliceAuctionBalanceBefore = await ctx.auctionTokenBalanceOf(alice);
    const bobAuctionBalanceBefore = await ctx.auctionTokenBalanceOf(bob);
    const bobPaymentBalanceBefore = await ctx.paymentTokenBalanceOf(bob);

    await awaitAllDecryptionResults();

    const aliceAuctionBalanceAfter = await ctx.auctionTokenBalanceOf(alice);
    const bobAuctionBalanceAfter = await ctx.auctionTokenBalanceOf(bob);
    const bobPaymentBalanceAfter = await ctx.paymentTokenBalanceOf(bob);

    expect(aliceAuctionBalanceAfter - aliceAuctionBalanceBefore).to.equal(
      rankedBids[0].quantity
    );

    expect(bobAuctionBalanceAfter - bobAuctionBalanceBefore).to.equal(
      rankedBids[1].quantity
    );
    expect(bobPaymentBalanceAfter - bobPaymentBalanceBefore).to.equal(
      bobDeposit - DEFAULT_PAYMENT_PENALTY
    );
  });

  it("Deposit from bidder with insufficient payment token balance should revert.", async () => {
    await ctx.approvePaymentDeposit(bob, DEFAULT_PAYMENT_TOKEN_BALANCE);
    await ctx.paymentToken.connect(bob).transfer(alice, 100n);
    await expect(
      ctx.depositSingle(bob, DEFAULT_PAYMENT_TOKEN_BALANCE)
    ).to.be.revertedWithCustomError(
      ctx.paymentToken,
      "ERC20InsufficientBalance"
    );
  });
});
