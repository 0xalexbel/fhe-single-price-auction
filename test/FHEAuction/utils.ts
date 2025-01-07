import { expect } from "chai";
import hre from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { reencryptEuint16, reencryptEuint256 } from "../reencrypt";
import { FhevmInstance } from "fhevmjs/node";
import { awaitCoprocessor } from "../coprocessorUtils";
import {
  AuctionERC20,
  FHEAuctionEngineMock,
  PaymentERC20,
  FHEAuctionNativeMock,
  FHEAuction,
  FHEAuctionERC20Mock,
} from "../../types";

////////////////////////////////////////////////////////////////////////////////

export type FHEAuctionParams = {
  quantity: bigint;
  durationSeconds: bigint;
  tieBreakingRule: bigint;
  minimumPaymentDeposit: bigint;
  paymentPenalty: bigint;
  stoppable: boolean;
};

export type FHEAuctionMockTestBaseParams = {
  auctionAddr: string;
  engine: FHEAuctionEngineMock;
  engineAddr: string;
  auctionToken: AuctionERC20;
  auctionTokenAddr: string;
  auctionTokenOwner: HardhatEthersSigner;
  owner: HardhatEthersSigner;
  beneficiary: HardhatEthersSigner;
  fhevm: FhevmInstance;
  params: FHEAuctionParams;
};

export type FHEAuctionMockTestParams = FHEAuctionMockTestBaseParams & {
  auction: FHEAuction;
};

export type FHEAuctionMockNativeTestParams = FHEAuctionMockTestBaseParams & {
  auction: FHEAuctionNativeMock;
};

export type FHEAuctionMockERC20TestParams = FHEAuctionMockTestBaseParams & {
  auction: FHEAuctionERC20Mock;
  paymentToken: PaymentERC20;
  paymentTokenAddr: string;
  paymentTokenOwner: HardhatEthersSigner;
};

export type FHEBid = {
  bidder: HardhatEthersSigner;
  id: bigint;
  price: bigint;
  quantity: bigint;
};

export type FHEBids = Array<FHEBid>;

////////////////////////////////////////////////////////////////////////////////
// FHEAuctionMockTestCtx
////////////////////////////////////////////////////////////////////////////////

export abstract class FHEAuctionMockTestCtx {
  auction: FHEAuction;
  auctionAddr: string;
  engine: FHEAuctionEngineMock;
  engineAddr: string;
  auctionToken: AuctionERC20;
  auctionTokenAddr: string;
  auctionTokenOwner: HardhatEthersSigner;
  owner: HardhatEthersSigner;
  beneficiary: HardhatEthersSigner;
  fhevm: FhevmInstance;
  params: FHEAuctionParams;

  constructor(params: FHEAuctionMockTestParams) {
    this.auction = params.auction;
    this.auctionAddr = params.auctionAddr;
    this.engine = params.engine;
    this.engineAddr = params.engineAddr;
    this.auctionToken = params.auctionToken;
    this.auctionTokenAddr = params.auctionTokenAddr;
    this.auctionTokenOwner = params.auctionTokenOwner;
    this.owner = params.owner;
    this.beneficiary = params.beneficiary;
    this.fhevm = params.fhevm;
    this.params = params.params;
  }

  async getClearBidByBidder(
    bidder: HardhatEthersSigner
  ): Promise<{ price: bigint; quantity: bigint; id: number }> {
    const bid = await this.engine.getBidByBidder(bidder);
    const price = await reencryptEuint256(
      this.owner,
      this.fhevm,
      bid.price,
      this.engineAddr
    );
    const quantity = await reencryptEuint256(
      this.owner,
      this.fhevm,
      bid.quantity,
      this.engineAddr
    );
    return { id: Number(bid.id), price, quantity };
  }

  async allowBids() {
    await this.engine.connect(this.owner).allowBids();
  }

  async expectBidsToEqual(bids: FHEBids) {
    const bidCount = await this.engine.getBidCount();
    expect(bidCount).to.equal(bids.length);

    for (let i = 0; i < bids.length; ++i) {
      const bid = await this.getClearBidByBidder(bids[i].bidder);
      expect(bid.id).to.equal(bids[i].id);
      expect(bid.price).to.equal(bids[i].price);
      expect(bid.quantity).to.equal(bids[i].quantity);
    }
  }

  async bid(bidder: HardhatEthersSigner, price: bigint, quantity: bigint) {
    const input = this.fhevm.createEncryptedInput(
      this.auctionAddr,
      bidder.address
    );
    input.add256(price);
    input.add256(quantity);
    const enc = await input.encrypt();

    await this.auction
      .connect(bidder)
      .bid(enc.handles[0], enc.handles[1], enc.inputProof);
  }

  abstract placeBids(
    bids: FHEBids,
    deposit: boolean,
    stop: boolean
  ): Promise<void>;

  async bidDepositStop(bids: FHEBids) {
    await this.placeBids(bids, true, true);
  }

  async placeBidsWithoutDeposit(bids: FHEBids, stop: boolean) {
    return this.placeBids(bids, false, stop);
  }

  async placeBidsWithDeposit(bids: FHEBids, stop: boolean) {
    return this.placeBids(bids, true, stop);
  }

  async auctionQuantity() {
    return await this.auction.auctionQuantity();
  }

  async start(durationSeconds: bigint, stoppable: boolean) {
    await this.auction.connect(this.owner).start(durationSeconds, stoppable);
  }

  async cancelBid(bidder: HardhatEthersSigner) {
    await this.auction.connect(bidder).cancelBid();
  }

  async expectRankedBidsToEqual(rankedBids: FHEBids) {
    const bidCount = await this.engine.getBidCount();
    expect(bidCount).to.equal(rankedBids.length);

    for (let i = 0; i < rankedBids.length; ++i) {
      const bid = await this.getClearBidByRank(i);
      expect(bid.id).to.equal(rankedBids[i].id);
      expect(bid.price).to.equal(rankedBids[i].price);
      expect(bid.quantity).to.equal(rankedBids[i].quantity);
    }
  }

  async getClearBidByIndex(
    idx: bigint
  ): Promise<{ id: bigint; price: bigint; quantity: bigint }> {
    const bid = await this.engine.getBidByIndex(idx);
    const price = await reencryptEuint256(
      this.owner,
      this.fhevm,
      bid.price,
      this.engineAddr
    );
    const quantity = await reencryptEuint256(
      this.owner,
      this.fhevm,
      bid.quantity,
      this.engineAddr
    );
    return { id: bid.id, price, quantity };
  }

  async getClearBidByRank(
    rank: number
  ): Promise<{ price: bigint; quantity: bigint; id: number }> {
    const bid = await this.engine.getBidByRank(rank);
    const price = await reencryptEuint256(
      this.owner,
      this.fhevm,
      bid.price,
      this.engineAddr
    );
    const quantity = await reencryptEuint256(
      this.owner,
      this.fhevm,
      bid.quantity,
      this.engineAddr
    );
    const id = await reencryptEuint16(
      this.owner,
      this.fhevm,
      bid.id,
      this.engineAddr
    );
    return { id: Number(id), price, quantity };
  }

  async getClearUniformPrice(): Promise<bigint> {
    await this.engine.connect(this.owner).allowUniformPrice();
    return await reencryptEuint256(
      this.owner,
      this.fhevm,
      await this.engine.getUniformPrice(),
      this.engineAddr
    );
  }

  async iterBidsValidation() {
    expect(await this.engine.isBidsValidationComplete()).to.be.false;

    const max: bigint = await this.engine.bidsValidationProgressMax();
    expect(await this.engine.bidsValidationProgress()).to.equal(0);

    for (let i = 0; i < max; ++i) {
      await this.engine.iterBidsValidation(1n, { gasLimit: 250_000n });
      expect(await this.engine.bidsValidationProgress()).to.equal(i + 1);
    }

    expect(await this.engine.isBidsValidationComplete()).to.be.true;

    await this.engine.connect(this.owner).allowBids();
    awaitCoprocessor();
  }

  async iterRankedBids() {
    const n = await this.engine.getBidCount();
    const N = n < 2 ? 1n : (n * (n - 1n)) / 2n;

    const total = await this.engine.rankedBidsProgressMax();
    expect(await this.engine.rankedBidsProgressMax()).to.equal(N);

    for (let i = 0; i < total; ++i) {
      await this.engine.iterRankedBids(1n); //N(N-1)/2
      await awaitCoprocessor();
      expect(await this.engine.rankedBidsProgress()).to.equal(i + 1);
    }

    expect(await this.engine.isRankedBidsComplete()).to.be.true;
    expect(await this.engine.rankedBidsProgress()).to.equal(total);
    await this.engine.connect(this.owner).allowRankedBids();
    await awaitCoprocessor();

    expect(await this.engine.canClaim()).to.be.false;
  }

  async iterRankedWonQuantities() {
    const n = await this.engine.getBidCount();
    expect(await this.engine.rankedWonQuantitiesProgress()).to.equal(0n);
    expect(await this.engine.isRankedWonQuantitiesComplete()).to.be.false;
    for (let i = 0; i < n; ++i) {
      expect(await this.engine.isRankedWonQuantitiesComplete()).to.be.false;
      // Gas cost ~= 250_000
      await this.engine.iterRankedWonQuantities(1n);
      awaitCoprocessor();
      expect(await this.engine.rankedWonQuantitiesProgress()).to.equal(
        BigInt(i + 1)
      );
    }
    expect(await this.engine.isRankedWonQuantitiesComplete()).to.be.true;
    expect(await this.engine.canClaim()).to.be.false;
  }

  async iterWonQuantities() {
    expect(await this.engine.wonQuantitiesProgress()).to.equal(0);
    expect(await this.engine.isWonQuantitiesComplete()).to.be.false;
    const n = await this.engine.getBidCount();
    for (let i = 0; i < n * n; ++i) {
      await this.engine.iterWonQuantities(1n);
      awaitCoprocessor();
      expect(await this.engine.wonQuantitiesProgress()).to.equal(BigInt(i + 1));
    }
    expect(await this.engine.isWonQuantitiesComplete()).to.be.true;
    expect(await this.engine.canClaim()).to.be.true;
  }

  async logRankedBids() {
    const bidCount = await this.engine.getBidCount();
    for (let i = 0; i < bidCount; ++i) {
      const bid = await this.getClearBidByRank(i);
      console.log(
        `rankedBid[${i}] = { id: ${bid.id}, price: ${bid.price}, quantity: ${bid.quantity} }`
      );
    }
  }

  async depositSingleMinimum(bidder: HardhatEthersSigner) {
    await this.approvePaymentDeposit(bidder, this.params.minimumPaymentDeposit);
    await this.depositSingle(bidder, this.params.minimumPaymentDeposit);
  }

  async auctionTokenBalanceOf(signer: HardhatEthersSigner) {
    return await this.auctionToken.balanceOf(signer);
  }

  async paymentTokenBalanceOf(signer: HardhatEthersSigner) {
    return await hre.ethers.provider.getBalance(signer);
  }

  abstract depositSingle(
    bidder: HardhatEthersSigner,
    amount: bigint
  ): Promise<void>;

  abstract approvePaymentDeposit(
    bidder: HardhatEthersSigner,
    amount: bigint
  ): Promise<void>;
}

////////////////////////////////////////////////////////////////////////////////
// FHEAuctionNativeMockTestCtx
////////////////////////////////////////////////////////////////////////////////

export class FHEAuctionNativeMockTestCtx extends FHEAuctionMockTestCtx {
  auctionNative: FHEAuctionNativeMock;

  constructor(params: FHEAuctionMockNativeTestParams) {
    super(params);
    this.auctionNative = params.auction;
  }

  async depositSingle(bidder: HardhatEthersSigner, amount: bigint) {
    await this.auctionNative.connect(bidder).deposit({
      value: amount,
    });
  }

  async deposit(bids: FHEBids, amount: bigint) {
    for (let i = 0; i < bids.length; ++i) {
      await this.auctionNative.connect(bids[i].bidder).deposit({
        value: amount,
      });
    }
  }

  async bidWithDeposit(
    bidder: HardhatEthersSigner,
    price: bigint,
    quantity: bigint,
    deposit: bigint
  ) {
    const input = this.fhevm.createEncryptedInput(
      this.auctionAddr,
      bidder.address
    );
    input.add256(price);
    input.add256(quantity);
    const enc = await input.encrypt();

    return await this.auctionNative
      .connect(bidder)
      .bidWithDeposit(enc.handles[0], enc.handles[1], enc.inputProof, {
        value: deposit,
      });
  }

  async placeBids(bids: FHEBids, deposit: boolean, stop: boolean) {
    if (deposit) {
      const minimumDeposit = await this.auction.minimumDeposit();
      for (let i = 0; i < bids.length; ++i) {
        let deposit = bids[i].price * bids[i].quantity;
        if (deposit < minimumDeposit) {
          deposit = minimumDeposit;
        }
        await this.approvePaymentDeposit(bids[i].bidder, deposit);
        await this.auctionNative.connect(bids[i].bidder).deposit({
          value: deposit,
        });
      }
    }

    for (let i = 0; i < bids.length; ++i) {
      await this.bid(bids[i].bidder, bids[i].price, bids[i].quantity);
    }

    if (stop) {
      await this.auction.connect(this.owner).stop();
    }
  }

  async approvePaymentDeposit(bidder: HardhatEthersSigner, amount: bigint) {}
}

////////////////////////////////////////////////////////////////////////////////
// FHEAuctionERC20MockTestCtx
////////////////////////////////////////////////////////////////////////////////

export class FHEAuctionERC20MockTestCtx extends FHEAuctionMockTestCtx {
  auctionERC20: FHEAuctionERC20Mock;
  paymentToken: PaymentERC20;
  paymentTokenAddr: string;
  paymentTokenOwner: HardhatEthersSigner;

  constructor(params: FHEAuctionMockERC20TestParams) {
    super(params);
    this.auctionERC20 = params.auction;
    this.paymentToken = params.paymentToken;
    this.paymentTokenAddr = params.paymentTokenAddr;
    this.paymentTokenOwner = params.paymentTokenOwner;
  }

  async depositSingle(bidder: HardhatEthersSigner, amount: bigint) {
    await this.approvePaymentDeposit(bidder, amount);
    await this.auctionERC20.connect(bidder).deposit(amount);
  }

  async deposit(bids: FHEBids, amount: bigint, approve: boolean) {
    for (let i = 0; i < bids.length; ++i) {
      if (approve) {
        await this.approvePaymentDeposit(bids[i].bidder, amount);
      }
      await this.auctionERC20.connect(bids[i].bidder).deposit(amount);
    }
  }

  async bidWithDeposit(
    bidder: HardhatEthersSigner,
    price: bigint,
    quantity: bigint,
    deposit: bigint
  ) {
    const input = this.fhevm.createEncryptedInput(
      this.auctionAddr,
      bidder.address
    );
    input.add256(price);
    input.add256(quantity);
    const enc = await input.encrypt();

    return await this.auctionERC20
      .connect(bidder)
      .bidWithDeposit(enc.handles[0], enc.handles[1], enc.inputProof, deposit);
  }

  async placeBids(bids: FHEBids, deposit: boolean, stop: boolean) {
    if (deposit) {
      const minimumDeposit = await this.auction.minimumDeposit();
      for (let i = 0; i < bids.length; ++i) {
        let deposit = bids[i].price * bids[i].quantity;
        if (deposit < minimumDeposit) {
          deposit = minimumDeposit;
        }
        await this.approvePaymentDeposit(bids[i].bidder, deposit);
        await this.auctionERC20.connect(bids[i].bidder).deposit(deposit);
      }
    }

    for (let i = 0; i < bids.length; ++i) {
      await this.bid(bids[i].bidder, bids[i].price, bids[i].quantity);
    }

    if (stop) {
      await this.auction.connect(this.owner).stop();
    }
  }

  async approvePaymentDeposit(bidder: HardhatEthersSigner, amount: bigint) {
    await this.paymentToken.connect(bidder).approve(this.auctionAddr, amount);
  }

  async minePaymentTokenSingle(
    bidder: HardhatEthersSigner,
    amount: bigint = 100_000_000n
  ) {
    await this.paymentToken
      .connect(this.paymentTokenOwner)
      .transfer(bidder, amount);
  }

  async minePaymentToken(bids: FHEBids) {
    for (let i = 0; i < bids.length; ++i) {
      await this.minePaymentTokenSingle(
        bids[i].bidder,
        bids[i].price * bids[i].quantity
      );
    }
  }
}
