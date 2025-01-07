import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { FHEBids, FHEAuctionERC20MockTestCtx } from "./utils";
import { deployERC20AuctionFixture } from "./fixtures";

const DEFAULT_QUANTITY = 12345n;
const DEFAULT_DURATION = 86400n;
const DEFAULT_TIE_BREAKING_RULE = 2n; //PriceId
const DEFAULT_MIN_PAYMENT_DEPOSIT = 100n;
const DEFAULT_PAYMENT_PENALTY = 70n;
const DEFAULT_STOPPABLE = true;

describe("cancel.erc20", () => {
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
});
