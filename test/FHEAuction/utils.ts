import { expect } from "chai";
import hre from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { reencryptEuint16, reencryptEuint256 } from "../reencrypt";
import { FhevmInstance } from "fhevmjs/node";
import { awaitCoprocessor } from "../coprocessorUtils";
import {
  AuctionERC20,
  PaymentERC20,
  FHEAuctionNativeMock,
  FHEAuction,
  FHEAuctionERC20Mock,
  FHEAuctionEngineBaseMock,
  FHEAuctionEngineIterator,
} from "../../types";
import { awaitAllDecryptionResults } from "../asyncDecrypt";
import { ContractTransactionResponse } from "ethers";

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
  engine: FHEAuctionEngineBaseMock;
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
  id?: bigint;
  price: bigint;
  quantity: bigint;
  startPaymentBalance?: bigint;
  endPaymentBalance?: bigint;
  paymentDeposit?: bigint;
  wonQuantity?: bigint;
};

export type FHEBids = Array<FHEBid>;

export const TieBreakingRulePriceId = 0n;
export const TieBreakingRulePriceQuantityId = 1n;
export const TieBreakingRuleRandom = 2n;
export const TieBreakingRuleProRata = 3n;

////////////////////////////////////////////////////////////////////////////////
// FHEAuctionMockTestCtx
////////////////////////////////////////////////////////////////////////////////

export abstract class FHEAuctionMockTestCtx {
  auction: FHEAuction;
  auctionAddr: string;
  engine: FHEAuctionEngineBaseMock;
  engineAddr: string;
  auctionToken: AuctionERC20;
  auctionTokenAddr: string;
  auctionTokenOwner: HardhatEthersSigner;
  owner: HardhatEthersSigner;
  beneficiary: HardhatEthersSigner;
  fhevm: FhevmInstance;
  params: FHEAuctionParams;
  iteratorAddr: string;
  iterator: FHEAuctionEngineIterator | undefined;

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
    this.iteratorAddr = hre.ethers.ZeroAddress;
    this.iterator = undefined;
  }

  async init() {
    this.iteratorAddr = await this.engine.iterator();
    this.iterator = await hre.ethers.getContractAt(
      "FHEAuctionEngineIterator",
      this.iteratorAddr
    );
  }

  getParams(): FHEAuctionParams {
    return { ...this.params };
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

  engineIterator(): FHEAuctionEngineIterator {
    return this.iterator!;
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

  async bid(
    bidder: HardhatEthersSigner,
    price: bigint,
    quantity: bigint
  ): Promise<ContractTransactionResponse> {
    const input = this.fhevm.createEncryptedInput(
      this.auctionAddr,
      bidder.address
    );
    input.add256(price);
    input.add256(quantity);
    const enc = await input.encrypt();

    const tx = await this.auction
      .connect(bidder)
      .bid(enc.handles[0], enc.handles[1], enc.inputProof);

    return tx;
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

  async cancelBid(
    bidder: HardhatEthersSigner
  ): Promise<ContractTransactionResponse> {
    const tx = await this.auction.connect(bidder).cancelBid();
    return tx;
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

  // Step 1
  async computeValidation() {
    expect(await this.engine.validationCompleted()).to.be.false;

    const max: bigint = await this.engine.validationProgressMax();
    expect(await this.engine.validationProgress()).to.equal(0);

    let gasLimit: bigint | undefined = 270_000n;
    //@ts-ignore
    if (hre.__SOLIDITY_COVERAGE_RUNNING) {
      gasLimit = undefined;
    }

    for (let i = 0; i < max; ++i) {
      await this.engine.computeValidation(1n, { gasLimit });
      await awaitCoprocessor(hre);
      expect(await this.engine.validationProgress()).to.equal(i + 1);
    }

    expect(await this.engine.validationCompleted()).to.be.true;

    await this.engine.connect(this.owner).allowBids();
    await awaitCoprocessor(hre);
  }

  // Step 2
  async computeSort() {
    const n = await this.engine.getBidCount();
    const N = n < 2 ? 1n : (n * (n - 1n)) / 2n;

    const total = await this.engine.sortProgressMax();
    expect(total).to.equal(N);

    for (let i = 0; i < total; ++i) {
      await this.engine.computeSort(1n); //N(N-1)/2
      await awaitCoprocessor(hre);
      expect(await this.engine.sortProgress()).to.equal(i + 1);
    }

    expect(await this.engine.sortCompleted()).to.be.true;
    expect(await this.engine.sortProgress()).to.equal(total);
    await this.engine.connect(this.owner).allowRankedBids();
    await awaitCoprocessor(hre);

    expect(await this.engine.canClaim()).to.be.false;
  }

  // Step 3
  async computeWonQuantitiesByRank() {
    const n = await this.engine.getBidCount();
    expect(await this.engine.wonQuantitiesByRankProgress()).to.equal(0n);
    expect(await this.engine.wonQuantitiesByRankReady()).to.be.false;
    for (let i = 0; i < n; ++i) {
      expect(await this.engine.wonQuantitiesByRankReady()).to.be.false;
      // Gas cost ~= 250_000
      await this.engine.computeWonQuantitiesByRank(1n);
      await awaitCoprocessor(hre);
      expect(await this.engine.wonQuantitiesByRankProgress()).to.equal(
        BigInt(i + 1)
      );
    }
    expect(await this.engine.wonQuantitiesByRankReady()).to.be.true;
    expect(await this.engine.canClaim()).to.be.false;
  }

  async computeWonQuantitiesById() {
    expect(await this.engine.wonQuantitiesByIdProgress()).to.equal(0);
    expect(await this.engine.wonQuantitiesByIdReady()).to.be.false;
    const n = await this.engine.getBidCount();
    expect(await this.engine.wonQuantitiesByIdProgressMax()).to.equal(n * n);
    for (let i = 0; i < n * n; ++i) {
      await this.engine.computeWonQuantitiesById(1n);
      await awaitCoprocessor(hre);
      expect(await this.engine.wonQuantitiesByIdProgress()).to.equal(
        BigInt(i + 1)
      );
    }
    expect(await this.engine.wonQuantitiesByIdReady()).to.be.true;
    expect(await this.engine.canClaim()).to.be.true;
  }

  async iterUntilBlindClaimReady(iters?: number[]) {
    const n = await this.engine.getBidCount();
    const iterator: FHEAuctionEngineIterator = await hre.ethers.getContractAt(
      "FHEAuctionEngineIterator",
      await this.engine.iterator()
    );
    const minIter = await iterator.minIterationsForPrizeAward();
    expect(await this.engine.canAward()).to.be.false;
    expect(minIter).to.equal(n * (n + 1n));

    if (iters !== undefined) {
      for (let i = 0; i < iters.length; i++) {
        await this.auction.computeAuction(iters[i], true);
      }
    } else {
      for (let i = 0; i < minIter; i++) {
        await this.auction.computeAuction(1, true);
      }
    }

    expect(await this.engine.canAward()).to.be.true;
    expect(await this.engineIterator().step()).to.equal(3);
    expect(await this.engineIterator().stepProgress()).to.equal(0);
  }

  async computeAuctionIters(iters: number[]) {
    const n = await this.engine.getBidCount();
    const iterator: FHEAuctionEngineIterator = await hre.ethers.getContractAt(
      "FHEAuctionEngineIterator",
      await this.engine.iterator()
    );
    const maxIter = await iterator.iterProgressMax();
    expect(await this.engine.canClaim()).to.be.false;
    expect(maxIter).to.equal(n * (2n * n + 1n));

    const minIter = await iterator.minIterationsForPrizeAward();
    expect(await this.engine.canAward()).to.be.false;
    expect(minIter).to.equal(n * (n + 1n));

    for (let i = 0; i < iters.length; i++) {
      await this.auction.computeAuction(iters[i], false);
    }
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

  async depositSingleMinimum(bidder: HardhatEthersSigner, approve: boolean) {
    await this.depositSingle(
      bidder,
      this.params.minimumPaymentDeposit,
      approve
    );
  }

  async auctionTokenBalanceOf(signer: HardhatEthersSigner) {
    return await this.auctionToken.balanceOf(signer);
  }

  async approvePaymentDeposits(bids: FHEBids) {
    for (let i = 0; i < bids.length; ++i) {
      const d = bids[i].paymentDeposit ?? bids[i].price * bids[i].quantity;
      await this.approvePaymentDeposit(bids[i].bidder, d);
    }
  }

  abstract paymentTokenBalanceOf(signer: HardhatEthersSigner): Promise<bigint>;
  abstract minePaymentToken(bids: FHEBids): Promise<void>;

  abstract depositSingle(
    bidder: HardhatEthersSigner,
    amount: bigint,
    approve: boolean
  ): Promise<void>;

  abstract approvePaymentDeposit(
    bidder: HardhatEthersSigner,
    amount: bigint
  ): Promise<void>;

  async expectPaymentBalanceToEqualStart(bids: FHEBids) {
    for (let i = 0; i < bids.length; ++i) {
      expect(await this.paymentTokenBalanceOf(bids[i].bidder)).to.equal(
        bids[i].startPaymentBalance
      );
    }
  }

  async expectPaymentBalanceToEqualEnd(
    bids: FHEBids,
    expectedUniformPrice: bigint
  ) {
    for (let i = 0; i < bids.length; ++i) {
      const e =
        bids[i].endPaymentBalance ??
        bids[i].startPaymentBalance! -
          bids[i].wonQuantity! * expectedUniformPrice;
      expect(await this.paymentTokenBalanceOf(bids[i].bidder)).to.equal(e);
    }
  }

  async expectPaymentBalancePlusDepositToEqual(bids: FHEBids) {
    for (let i = 0; i < bids.length; ++i) {
      const b = await this.paymentTokenBalanceOf(bids[i].bidder);
      const d = bids[i].paymentDeposit ?? bids[i].price * bids[i].quantity;
      const startBalance = bids[i].startPaymentBalance ?? 0n;
      expect(b + d).to.equal(startBalance);
    }
  }

  async expectCanClaim(bids: FHEBids, blindYes: boolean, directYes: boolean) {
    for (let i = 0; i < bids.length; ++i) {
      expect(await this.auction.canAwardPrizeAtRank(i)).to.equal(blindYes);
      expect(await this.auction.connect(bids[i].bidder).canClaim()).to.equal(
        directYes
      );
    }
  }

  async expectWonQuantities(bids: FHEBids) {
    for (let i = 0; i < bids.length; ++i) {
      expect(await this.auctionTokenBalanceOf(bids[i].bidder)).to.equal(
        bids[i].wonQuantity!
      );
    }
  }

  fillBidsWithDefault(bids: FHEBids, expectedUniformPrice: bigint): FHEBids {
    const newBids: FHEBids = [];
    for (let i = 0; i < bids.length; ++i) {
      newBids.push({ ...bids[i] });
      if (newBids[i].id === undefined) {
        newBids[i].id = BigInt(i + 1);
      }
      if (newBids[i].startPaymentBalance === undefined) {
        newBids[i].startPaymentBalance = newBids[i].price * newBids[i].quantity;
      }
      if (newBids[i].paymentDeposit === undefined) {
        newBids[i].paymentDeposit = newBids[i].price * newBids[i].quantity;
      }
      if (newBids[i].wonQuantity === undefined) {
        newBids[i].wonQuantity = newBids[i].quantity;
      }
      if (newBids[i].endPaymentBalance === undefined) {
        newBids[i].endPaymentBalance =
          newBids[i].startPaymentBalance! -
          newBids[i].wonQuantity! * expectedUniformPrice;
      }
    }
    return newBids;
  }

  async run(
    bids: FHEBids,
    expectedUniformPrice: bigint,
    expectedBeneficiaryCollect?: bigint,
    skipDecryptUniformPrice?: boolean
  ) {
    bids = this.fillBidsWithDefault(bids, expectedUniformPrice);
    const beneficiaryBalanceBefore = await this.paymentTokenBalanceOf(
      this.beneficiary
    );
    await this.minePaymentToken(bids);
    await this.expectPaymentBalanceToEqualStart(bids);
    await this.placeBidsWithDeposit(bids, true);
    await this.expectPaymentBalancePlusDepositToEqual(bids);
    await this.computeValidation();
    await this.computeSort();
    await this.computeWonQuantitiesByRank();
    await this.computeWonQuantitiesById();
    await this.expectCanClaim(bids, false, false);
    if (skipDecryptUniformPrice === true) {
      return;
    }

    await this.auction.connect(this.owner).decryptUniformPrice();
    await awaitAllDecryptionResults(hre);
    expect(await this.auction.clearUniformPrice()).to.equal(
      expectedUniformPrice
    );
    await this.expectCanClaim(bids, true, true);

    for (let i = 0; i < bids.length; ++i) {
      expect(await this.auction.connect(bids[i].bidder).claim());
    }
    await awaitAllDecryptionResults(hre);
    await this.expectWonQuantities(bids);
    await this.expectPaymentBalanceToEqualEnd(bids, expectedUniformPrice);
    const beneficiaryBalanceAfter = await this.paymentTokenBalanceOf(
      this.beneficiary
    );
    if (expectedBeneficiaryCollect != undefined) {
      expect(beneficiaryBalanceAfter - beneficiaryBalanceBefore).to.equal(
        expectedBeneficiaryCollect
      );
    }
  }

  async runUpToUniformPrice(
    bids: FHEBids,
    expectedUniformPrice: bigint,
    expectedBeneficiaryCollect?: bigint,
    skipDecryptUniformPrice?: boolean
  ) {
    bids = this.fillBidsWithDefault(bids, expectedUniformPrice);
    const beneficiaryBalanceBefore = await this.paymentTokenBalanceOf(
      this.beneficiary
    );
    await this.minePaymentToken(bids);
    await this.expectPaymentBalanceToEqualStart(bids);
    await this.placeBidsWithDeposit(bids, true);
    await this.expectPaymentBalancePlusDepositToEqual(bids);
    await this.computeValidation();
    await this.computeSort();
    await this.computeWonQuantitiesByRank();
    await this.expectCanClaim(bids, false, false);
    if (skipDecryptUniformPrice === true) {
      return { bids, beneficiaryBalanceBefore };
    }

    await this.auction.connect(this.owner).decryptUniformPrice();
    await awaitAllDecryptionResults(hre);
    expect(await this.auction.clearUniformPrice()).to.equal(
      expectedUniformPrice
    );
    await this.expectCanClaim(bids, true, false);
    return { bids, beneficiaryBalanceBefore };
  }

  async runUsingAward(
    _bids: FHEBids,
    expectedUniformPrice: bigint,
    expectedBeneficiaryCollect?: bigint,
    skipDecryptUniformPrice?: boolean
  ) {
    const { bids, beneficiaryBalanceBefore } = await this.runUpToUniformPrice(
      _bids,
      expectedUniformPrice,
      expectedBeneficiaryCollect,
      skipDecryptUniformPrice
    );

    for (let i = 0; i < bids.length; ++i) {
      expect(await this.auction.connect(bids[i].bidder).awardPrizeAtRank(i));
    }

    await this.expectRunResult(
      bids,
      beneficiaryBalanceBefore,
      expectedUniformPrice,
      expectedBeneficiaryCollect
    );
  }

  async expectRunResult(
    bids: FHEBids,
    beneficiaryBalanceBefore?: bigint,
    expectedUniformPrice?: bigint,
    expectedBeneficiaryCollect?: bigint
  ) {
    await awaitAllDecryptionResults(hre);
    await this.expectWonQuantities(bids);
    if (expectedUniformPrice !== undefined) {
      await this.expectPaymentBalanceToEqualEnd(bids, expectedUniformPrice);
    }
    if (
      expectedBeneficiaryCollect != undefined &&
      beneficiaryBalanceBefore != undefined
    ) {
      const beneficiaryBalanceAfter = await this.paymentTokenBalanceOf(
        this.beneficiary
      );
      expect(beneficiaryBalanceAfter - beneficiaryBalanceBefore).to.equal(
        expectedBeneficiaryCollect
      );
    }
  }

  async runComputeAuctionIters(
    bids: FHEBids,
    expectedUniformPrice: bigint,
    iters: number[]
  ) {
    bids = this.fillBidsWithDefault(bids, expectedUniformPrice);
    await this.minePaymentToken(bids);
    await this.expectPaymentBalanceToEqualStart(bids);
    await this.placeBidsWithDeposit(bids, true);
    await this.expectPaymentBalancePlusDepositToEqual(bids);

    await this.computeAuctionIters(iters);
  }

  async runBlindUsingComputeAuction(
    bids: FHEBids,
    expectedUniformPrice: bigint,
    iters?: number[],
    expectedBeneficiaryCollect?: bigint
  ) {
    bids = this.fillBidsWithDefault(bids, expectedUniformPrice);
    const beneficiaryBalanceBefore = await this.paymentTokenBalanceOf(
      this.beneficiary
    );
    await this.minePaymentToken(bids);
    await this.expectPaymentBalanceToEqualStart(bids);
    await this.placeBidsWithDeposit(bids, true);
    await this.expectPaymentBalancePlusDepositToEqual(bids);

    await this.iterUntilBlindClaimReady(iters);
    await this.auction.connect(this.owner).decryptUniformPrice();
    await awaitAllDecryptionResults(hre);
    expect(await this.auction.clearUniformPrice()).to.equal(
      expectedUniformPrice
    );
    for (let i = 0; i < bids.length; ++i) {
      expect(await this.auction.connect(bids[i].bidder).awardPrizeAtRank(i));
    }
    await awaitAllDecryptionResults(hre);
    await this.expectWonQuantities(bids);
    await this.expectPaymentBalanceToEqualEnd(bids, expectedUniformPrice);
    const beneficiaryBalanceAfter = await this.paymentTokenBalanceOf(
      this.beneficiary
    );
    if (expectedBeneficiaryCollect != undefined) {
      expect(beneficiaryBalanceAfter - beneficiaryBalanceBefore).to.equal(
        expectedBeneficiaryCollect
      );
    }
  }
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

  async expectCanClaim(bids: FHEBids, blindYes: boolean, directYes: boolean) {
    super.expectCanClaim(bids, blindYes, directYes);
    for (let i = 0; i < bids.length; ++i) {
      expect(
        await this.auctionNative.connect(bids[i].bidder).canBlindClaim()
      ).to.equal(blindYes);
    }
  }

  async runUsingBlindClaim(
    _bids: FHEBids,
    expectedUniformPrice: bigint,
    expectedBeneficiaryCollect?: bigint,
    skipDecryptUniformPrice?: boolean
  ) {
    const { bids, beneficiaryBalanceBefore } = await this.runUpToUniformPrice(
      _bids,
      expectedUniformPrice,
      expectedBeneficiaryCollect,
      skipDecryptUniformPrice
    );

    for (let i = 0; i < bids.length; ++i) {
      expect(await this.auctionNative.connect(bids[i].bidder).blindClaim());
    }

    await this.expectRunResult(
      bids,
      beneficiaryBalanceBefore,
      expectedUniformPrice,
      expectedBeneficiaryCollect
    );
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

  async placeSingleBid(bid: FHEBid, deposit: boolean, stop: boolean) {
    if (deposit) {
      const minimumDeposit = await this.auction.minimumDeposit();
      let deposit = bid.price * bid.quantity;
      if (deposit < minimumDeposit) {
        deposit = minimumDeposit;
      }
      await this.approvePaymentDeposit(bid.bidder, deposit);
      await this.auctionNative.connect(bid.bidder).deposit({
        value: deposit,
      });
    }

    await this.bid(bid.bidder, bid.price, bid.quantity);

    if (stop) {
      await this.auction.connect(this.owner).stop();
    }
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

  async paymentTokenBalanceOf(signer: HardhatEthersSigner) {
    return await hre.ethers.provider.getBalance(signer);
  }

  async approvePaymentDeposit(bidder: HardhatEthersSigner, amount: bigint) {}
  async minePaymentToken(bids: FHEBids) {}
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

  async expectCanClaim(bids: FHEBids, blindYes: boolean, directYes: boolean) {
    super.expectCanClaim(bids, blindYes, directYes);
    for (let i = 0; i < bids.length; ++i) {
      expect(
        await this.auctionERC20.connect(bids[i].bidder).canBlindClaim()
      ).to.equal(blindYes);
    }
  }

  async runUsingBlindClaim(
    _bids: FHEBids,
    expectedUniformPrice: bigint,
    expectedBeneficiaryCollect?: bigint,
    skipDecryptUniformPrice?: boolean
  ) {
    const { bids, beneficiaryBalanceBefore } = await this.runUpToUniformPrice(
      _bids,
      expectedUniformPrice,
      expectedBeneficiaryCollect,
      skipDecryptUniformPrice
    );

    for (let i = 0; i < bids.length; ++i) {
      expect(await this.auctionERC20.connect(bids[i].bidder).blindClaim());
    }

    await this.expectRunResult(
      bids,
      beneficiaryBalanceBefore,
      expectedUniformPrice,
      expectedBeneficiaryCollect
    );
  }

  async depositSingle(
    bidder: HardhatEthersSigner,
    amount: bigint,
    approve: boolean
  ) {
    if (approve) {
      await this.approvePaymentDeposit(bidder, amount);
    }
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
        let deposit = bids[i].paymentDeposit;
        if (deposit == undefined) {
          deposit = bids[i].price * bids[i].quantity;
          if (deposit < minimumDeposit) {
            deposit = minimumDeposit;
          }
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
      const amount =
        bids[i].startPaymentBalance ?? bids[i].price * bids[i].quantity;
      await this.minePaymentTokenSingle(bids[i].bidder, amount);
    }
  }

  async paymentTokenBalanceOf(signer: HardhatEthersSigner) {
    return await this.paymentToken.balanceOf(signer);
  }
}
