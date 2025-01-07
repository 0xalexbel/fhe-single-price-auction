import { expect } from "chai";
import hre from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ERC20 } from "../../types";
import { FHEBids, FHEAuctionERC20MockTestCtx } from "./utils";
import { deployERC20AuctionFixture } from "./fixtures";

const DEFAULT_QUANTITY = 12345n;
const DEFAULT_DURATION = 86400n;
const DEFAULT_TIE_BREAKING_RULE = 2n; //PriceId
const DEFAULT_MIN_PAYMENT_DEPOSIT = 100n;
const DEFAULT_PAYMENT_PENALTY = 70n;
const DEFAULT_STOPPABLE = true;

describe("deploy.erc20", () => {
  let ctx: FHEAuctionERC20MockTestCtx;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let charlie: HardhatEthersSigner;
  let other: HardhatEthersSigner;

  async function fixture() {
    return deployERC20AuctionFixture(
      DEFAULT_QUANTITY,
      DEFAULT_DURATION,
      DEFAULT_TIE_BREAKING_RULE,
      DEFAULT_MIN_PAYMENT_DEPOSIT,
      DEFAULT_PAYMENT_PENALTY,
      DEFAULT_STOPPABLE,
      false /* start */
    );
  }

  beforeEach(async function () {
    const res = await loadFixture(fixture);
    ctx = res.ctx;
    alice = res.alice;
    bob = res.bob;
    charlie = res.charlie;
    other = res.other;
  });

  it("should return the minimum deposit", async () => {
    expect(await ctx.auction.minimumDeposit()).to.equal(
      ctx.params.minimumPaymentDeposit
    );
  });

  it("should return the owner", async () => {
    expect(await ctx.auction.owner()).to.equal(ctx.owner);
  });

  it("auction token should be valid", async () => {
    expect(await ctx.auction.auctionToken()).to.equal(ctx.auctionTokenAddr);
  });

  it("auction beneficiary should be valid", async () => {
    expect(await ctx.auction.beneficiary()).to.equal(ctx.beneficiary);
  });

  it("auction quantity should be valid", async () => {
    expect(await ctx.auction.auctionQuantity()).to.equal(ctx.params.quantity);
  });

  it("auction should have own the right amount of auction token", async () => {
    const erc20Addr = await ctx.auction.auctionToken();
    const erc20: ERC20 = await hre.ethers.getContractAt("ERC20", erc20Addr);
    expect(await erc20.balanceOf(ctx.auctionAddr)).to.equal(
      ctx.params.quantity
    );
  });

  it("auction has not started, should be terminable", async () => {
    expect(await ctx.auction.isOpen()).to.be.false;
    expect(await ctx.auction.closed()).to.be.false;
    expect(await ctx.auction.terminated()).to.be.false;
    expect(await ctx.auction.canTerminate()).to.be.true;
  });

  it("non-started auction, terminate call should succeed", async () => {
    const auctionErc20Addr = await ctx.auction.auctionToken();
    const auctionErc20: ERC20 = await hre.ethers.getContractAt(
      "ERC20",
      auctionErc20Addr
    );

    const balanceOfAuctionBefore = await auctionErc20.balanceOf(
      ctx.auctionAddr
    );
    const balanceOfBeneficiaryBefore = await auctionErc20.balanceOf(
      ctx.beneficiary
    );

    expect(await ctx.auction.canTerminate()).to.be.true;
    await ctx.auction.connect(ctx.owner).terminate();

    expect(await ctx.auction.isOpen()).to.be.false;
    expect(await ctx.auction.closed()).to.be.false;
    expect(await ctx.auction.terminated()).to.be.true;
    expect(await ctx.auction.canTerminate()).to.be.false;

    // verify that all the auction token are transfered back to beneficiary
    const balanceOfAuctionAfter = await auctionErc20.balanceOf(ctx.auctionAddr);
    const balanceOfBeneficiaryAfter = await auctionErc20.balanceOf(
      ctx.beneficiary
    );

    expect(balanceOfAuctionAfter).to.equal(0);
    expect(balanceOfBeneficiaryAfter).to.equal(
      balanceOfBeneficiaryBefore + balanceOfAuctionBefore
    );
  });

  it("a not-started auction cannot be stopped", async () => {
    expect(await ctx.auction.canStop()).to.be.false;
    await expect(
      ctx.auction.connect(ctx.owner).stop()
    ).to.be.revertedWithCustomError(ctx.auction, "NotStoppable");
  });

  it("should revert when stopped manually by a non-owner", async () => {
    await ctx.auction.connect(ctx.owner).start(10000n, true);
    await expect(ctx.auction.connect(other).stop())
      .to.be.revertedWithCustomError(ctx.auction, "OwnableUnauthorizedAccount")
      .withArgs(other);
  });

  it("a stopped auction cannot be stopped", async () => {
    await ctx.auction.connect(ctx.owner).start(10000n, true);
    await ctx.auction.connect(ctx.owner).stop();
    expect(await ctx.auction.canStop()).to.be.false;
    await expect(
      ctx.auction.connect(ctx.owner).stop()
    ).to.be.revertedWithCustomError(ctx.auction, "NotStoppable");
  });

  it("a started auction cannot be started", async () => {
    await ctx.auction.connect(ctx.owner).start(10000n, true);
    expect(await ctx.auction.canStart()).to.be.false;
    await expect(
      ctx.auction.connect(ctx.owner).start(10000n, true)
    ).to.be.revertedWithCustomError(ctx.auction, "NotStartable");
  });

  it("a stopped auction cannot be started", async () => {
    await ctx.auction.connect(ctx.owner).start(10000n, true);
    await ctx.auction.connect(ctx.owner).stop();
    expect(await ctx.auction.canStart()).to.be.false;
    await expect(
      ctx.auction.connect(ctx.owner).start(10000n, true)
    ).to.be.revertedWithCustomError(ctx.auction, "NotStartable");
  });

  it("a terminated auction cannot be started", async () => {
    await ctx.auction.connect(ctx.owner).terminate();
    expect(await ctx.auction.canStart()).to.be.false;
    await expect(
      ctx.auction.connect(ctx.owner).start(10000n, true)
    ).to.be.revertedWithCustomError(ctx.auction, "NotStartable");
  });

  it("a started auction can be stopped if stoppable", async () => {
    await ctx.auction.connect(ctx.owner).start(10000n, true);

    expect(await ctx.auction.isOpen()).to.be.true;
    expect(await ctx.auction.closed()).to.be.false;
    expect(await ctx.auction.terminated()).to.be.false;
    expect(await ctx.auction.canStart()).to.be.false;
    expect(await ctx.auction.canStop()).to.be.true;
    expect(await ctx.auction.canTerminate()).to.be.true;

    await ctx.auction.connect(ctx.owner).stop();

    expect(await ctx.auction.isOpen()).to.be.false;
    expect(await ctx.auction.closed()).to.be.true;
    expect(await ctx.auction.terminated()).to.be.false;
    expect(await ctx.auction.canStart()).to.be.false;
    expect(await ctx.auction.canStop()).to.be.false;
    expect(await ctx.auction.canTerminate()).to.be.true;

    await ctx.auction.connect(ctx.owner).terminate();

    expect(await ctx.auction.isOpen()).to.be.false;
    expect(await ctx.auction.closed()).to.be.false;
    expect(await ctx.auction.terminated()).to.be.true;
    expect(await ctx.auction.canStart()).to.be.false;
    expect(await ctx.auction.canStop()).to.be.false;
    expect(await ctx.auction.canTerminate()).to.be.false;
  });

  it("a not-started auction can be terminated if initialized", async () => {
    expect(await ctx.auction.canTerminate()).to.be.true;
    expect(await ctx.auction.canStop()).to.be.false;

    await ctx.auction.connect(ctx.owner).terminate();

    expect(await ctx.auction.canStop()).to.be.false;
    expect(await ctx.auction.canTerminate()).to.be.false;
  });

  it("a not-open auction cannot accept bid", async () => {
    await expect(ctx.bid(alice, 100n, 12n)).to.be.revertedWithCustomError(
      ctx.auction,
      "NotOpen"
    );
  });

  it("a started auction with at least one non-claimed bid cannot be terminated", async () => {
    await ctx.auction.connect(ctx.owner).start(10000n, true);
    await ctx.depositSingleMinimum(alice);
    await ctx.bid(alice, 100n, 12n);
    expect(await ctx.auction.bidCount()).to.equal(1n);
    expect(await ctx.auction.canTerminate()).to.be.false;
    await expect(
      ctx.auction.connect(ctx.owner).terminate()
    ).to.be.revertedWithCustomError(ctx.auction, "NotTerminable");
  });

  it("a started auction with zero non-claimed bid can be terminated", async () => {
    await ctx.auction.connect(ctx.owner).start(10000n, true);
    await ctx.depositSingleMinimum(alice);
    await ctx.bid(alice, 100n, 12n);
    await ctx.cancelBid(alice);
    expect(await ctx.auction.bidCount()).to.equal(0n);
    expect(await ctx.auction.canTerminate()).to.be.true;
    await ctx.auction.connect(ctx.owner).terminate();
  });

  it("bidCount should be three after three bids", async () => {
    const bids: FHEBids = [
      { bidder: alice, id: 1n, price: 1234n, quantity: 1n },
      { bidder: bob, id: 2n, price: 1235n, quantity: 2n },
      { bidder: charlie, id: 3n, price: 1236n, quantity: 3n },
    ];

    await ctx.auction.connect(ctx.owner).start(10000n, true);
    await ctx.placeBids(bids, true, false);
    expect(await ctx.auction.bidCount()).to.equal(3n);
  });

  it("bidCount should be zero after cancel all bids", async () => {
    const bids: FHEBids = [
      { bidder: alice, id: 1n, price: 1234n, quantity: 1n },
      { bidder: bob, id: 2n, price: 1235n, quantity: 2n },
      { bidder: charlie, id: 3n, price: 1236n, quantity: 3n },
    ];

    await ctx.auction.connect(ctx.owner).start(10000n, true);
    await ctx.placeBids(bids, true, false);

    await ctx.cancelBid(alice);
    expect(await ctx.auction.bidCount()).to.equal(2n);
    await ctx.cancelBid(bob);
    expect(await ctx.auction.bidCount()).to.equal(1n);
    await ctx.cancelBid(charlie);
    expect(await ctx.auction.bidCount()).to.equal(0n);
  });
});
