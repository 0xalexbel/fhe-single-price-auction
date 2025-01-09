import hre from "hardhat";
import {
  AuctionERC20,
  FHEAuctionEngineMock,
  PaymentERC20,
  FHEAuctionNativeMock,
  FHEAuctionERC20Mock,
} from "../../types";
import { createInstance } from "../instance";
import {
  FHEAuctionERC20MockTestCtx,
  FHEAuctionNativeMockTestCtx,
  FHEAuctionParams,
} from "./utils";
import { expect } from "chai";

export async function deployNativeAuctionFixture(
  quantity: bigint,
  durationSeconds: bigint,
  tieBreakingRule: bigint,
  minimumPaymentDeposit: bigint,
  paymentPenalty: bigint,
  stoppable: boolean,
  start: boolean
) {
  const [
    dummy, //owner should not be signers[0]
    owner,
    beneficiary,
    alice,
    bob,
    charlie,
    other,
    auctionTokenOwner,
  ] = await hre.ethers.getSigners();

  const auctionToken: AuctionERC20 = await hre.ethers.deployContract(
    "AuctionERC20",
    ["AuctionToken", "AT"],
    auctionTokenOwner
  );
  const auctionTokenAddr = await auctionToken.getAddress();

  const auction = await hre.ethers.deployContract(
    "FHEAuctionNativeMock",
    [minimumPaymentDeposit, paymentPenalty],
    owner
  );
  const auctionAddr = await auction.getAddress();

  const engineContract = await hre.ethers.deployContract(
    "FHEAuctionEngineMock",
    [auctionAddr],
    owner
  );
  const engineAddr = await engineContract.getAddress();
  const engine: FHEAuctionEngineMock = await hre.ethers.getContractAt(
    "FHEAuctionEngineMock",
    engineAddr
  );

  await auctionToken.connect(auctionTokenOwner).transfer(beneficiary, 100000n);
  await auctionToken.connect(beneficiary).approve(auctionAddr, quantity);

  await auction
    .connect(owner)
    .initialize(
      engineAddr,
      beneficiary,
      auctionTokenAddr,
      quantity,
      tieBreakingRule
    );

  if (start) {
    await auction.connect(owner).start(durationSeconds, stoppable);
  }

  const fhevm = await createInstance();
  const auctionParams: FHEAuctionParams = {
    tieBreakingRule,
    quantity,
    durationSeconds,
    stoppable,
    minimumPaymentDeposit,
    paymentPenalty,
  };

  const ctx = new FHEAuctionNativeMockTestCtx({
    auction,
    auctionAddr,
    engine,
    engineAddr,
    auctionToken,
    auctionTokenAddr,
    auctionTokenOwner,
    owner,
    beneficiary,
    fhevm,
    params: auctionParams,
  });

  return {
    ctx,
    alice,
    bob,
    charlie,
    other,
  };
}

export async function deployERC20AuctionFixture(
  quantity: bigint,
  durationSeconds: bigint,
  tieBreakingRule: bigint,
  minimumPaymentDeposit: bigint,
  paymentPenalty: bigint,
  stoppable: boolean,
  start: boolean,
  paymentTokenDefaultBalance: bigint,
  paymentTokenTotalSupply: bigint
) {
  const [
    dummy, //owner should not be signers[0]
    owner,
    beneficiary,
    alice,
    bob,
    charlie,
    other,
    auctionTokenOwner,
    paymentTokenOwner,
  ] = await hre.ethers.getSigners();

  const auctionToken: AuctionERC20 = await hre.ethers.deployContract(
    "AuctionERC20",
    ["AuctionToken", "AT"],
    auctionTokenOwner
  );
  const auctionTokenAddr = await auctionToken.getAddress();

  const paymentToken: PaymentERC20 = await hre.ethers.deployContract(
    "PaymentERC20",
    ["PaymentERC20", "PT"],
    paymentTokenOwner
  );
  const paymentTokenAddr = await paymentToken.getAddress();

  await paymentToken
    .connect(paymentTokenOwner)
    .mint(paymentTokenOwner, paymentTokenTotalSupply);

  await paymentToken
    .connect(paymentTokenOwner)
    .transfer(alice, paymentTokenDefaultBalance);
  await paymentToken
    .connect(paymentTokenOwner)
    .transfer(bob, paymentTokenDefaultBalance);
  await paymentToken
    .connect(paymentTokenOwner)
    .transfer(charlie, paymentTokenDefaultBalance);

  const auction: FHEAuctionERC20Mock = await hre.ethers.deployContract(
    "FHEAuctionERC20Mock",
    [minimumPaymentDeposit, paymentPenalty, paymentToken],
    owner
  );
  const auctionAddr = await auction.getAddress();

  const engineContract = await hre.ethers.deployContract(
    "FHEAuctionEngineMock",
    [auctionAddr],
    owner
  );
  const engineAddr = await engineContract.getAddress();
  const engine: FHEAuctionEngineMock = await hre.ethers.getContractAt(
    "FHEAuctionEngineMock",
    engineAddr
  );

  await auctionToken.connect(auctionTokenOwner).transfer(beneficiary, 100000n);
  await auctionToken.connect(beneficiary).approve(auctionAddr, quantity);

  await auction
    .connect(owner)
    .initialize(
      engineAddr,
      beneficiary,
      auctionTokenAddr,
      quantity,
      tieBreakingRule
    );

  if (start) {
    await auction.connect(owner).start(durationSeconds, stoppable);
  }

  const fhevm = await createInstance();
  const auctionParams: FHEAuctionParams = {
    tieBreakingRule,
    quantity,
    durationSeconds,
    stoppable,
    minimumPaymentDeposit,
    paymentPenalty,
  };

  const ctx = new FHEAuctionERC20MockTestCtx({
    auction,
    auctionAddr,
    engine,
    engineAddr,
    auctionToken,
    auctionTokenAddr,
    auctionTokenOwner,
    paymentToken,
    paymentTokenAddr,
    paymentTokenOwner,
    owner,
    beneficiary,
    fhevm,
    params: auctionParams,
  });

  return {
    ctx,
    alice,
    bob,
    charlie,
    other,
  };
}
