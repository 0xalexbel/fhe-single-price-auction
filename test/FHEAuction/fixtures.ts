import hre from "hardhat";
import {
  AuctionERC20,
  FHEAuctionEngineMock,
  PaymentERC20,
  FHEAuctionNativeMock,
  FHEAuctionERC20Mock,
  FHEAuctionEngineFactory,
  FHEAuctionERC20MockFactory,
  FHEAuctionNativeMockFactory,
} from "../../types";
import { createInstance } from "../instance";
import {
  FHEAuctionERC20MockTestCtx,
  FHEAuctionNativeMockTestCtx,
  FHEAuctionParams,
} from "./utils";

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
    auctionTokenOwner,
    alice,
    bob,
    charlie,
    other,
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

  const engine = await hre.ethers.deployContract(
    "FHEAuctionEngineMock",
    [auctionAddr],
    owner
  );
  const engineAddr = await engine.getAddress();

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
    auctionTokenOwner,
    paymentTokenOwner,
    alice,
    bob,
    charlie,
    other,
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

  if (paymentTokenDefaultBalance > 0) {
    await paymentToken
      .connect(paymentTokenOwner)
      .transfer(alice, paymentTokenDefaultBalance);
    await paymentToken
      .connect(paymentTokenOwner)
      .transfer(bob, paymentTokenDefaultBalance);
    await paymentToken
      .connect(paymentTokenOwner)
      .transfer(charlie, paymentTokenDefaultBalance);
  }

  const auction: FHEAuctionERC20Mock = await hre.ethers.deployContract(
    "FHEAuctionERC20Mock",
    [minimumPaymentDeposit, paymentPenalty, paymentToken],
    owner
  );
  const auctionAddr = await auction.getAddress();

  const engine = await hre.ethers.deployContract(
    "FHEAuctionEngineMock",
    [auctionAddr],
    owner
  );
  const engineAddr = await engine.getAddress();

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

export async function deployERC20AuctionFactoryFixture(
  paymentTokenDefaultBalance: bigint,
  paymentTokenTotalSupply: bigint
) {
  const [
    dummy, //owner should not be signers[0]
    factoryOwner,
    auctionOwner,
    beneficiary,
    auctionTokenOwner,
    paymentTokenOwner,
    alice,
    bob,
    charlie,
    other,
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

  if (paymentTokenDefaultBalance > 0) {
    await paymentToken
      .connect(paymentTokenOwner)
      .transfer(alice, paymentTokenDefaultBalance);
    await paymentToken
      .connect(paymentTokenOwner)
      .transfer(bob, paymentTokenDefaultBalance);
    await paymentToken
      .connect(paymentTokenOwner)
      .transfer(charlie, paymentTokenDefaultBalance);
  }

  const engineFactory: FHEAuctionEngineFactory =
    await hre.ethers.deployContract("FHEAuctionEngineFactory", factoryOwner);
  const engineFactoryAddr = await engineFactory.getAddress();

  const auctionERC20Factory: FHEAuctionERC20MockFactory =
    await hre.ethers.deployContract(
      "FHEAuctionERC20MockFactory",
      [paymentToken, engineFactory],
      factoryOwner
    );
  const auctionERC20FactoryAddr = await auctionERC20Factory.getAddress();

  await auctionToken.connect(auctionTokenOwner).transfer(beneficiary, 100000n);
  const fhevm = await createInstance();

  return {
    fhevm,
    auctionERC20Factory,
    auctionERC20FactoryAddr,
    engineFactory,
    engineFactoryAddr,
    auctionToken,
    auctionTokenAddr,
    auctionTokenOwner,
    paymentToken,
    paymentTokenAddr,
    paymentTokenOwner,
    factoryOwner,
    auctionOwner,
    beneficiary,
    alice,
    bob,
    charlie,
    other,
  };
  // const auction: FHEAuctionERC20Mock = await hre.ethers.deployContract(
  //   "FHEAuctionERC20Mock",
  //   [minimumPaymentDeposit, paymentPenalty, paymentToken],
  //   owner
  // );
  // const auctionAddr = await auction.getAddress();

  // const engine = await hre.ethers.deployContract(
  //   "FHEAuctionEngineMock",
  //   [auctionAddr],
  //   owner
  // );
  // const engineAddr = await engine.getAddress();

  // await auctionToken.connect(auctionTokenOwner).transfer(beneficiary, 100000n);
  // await auctionToken.connect(beneficiary).approve(auctionAddr, quantity);

  // await auction
  //   .connect(owner)
  //   .initialize(
  //     engineAddr,
  //     beneficiary,
  //     auctionTokenAddr,
  //     quantity,
  //     tieBreakingRule
  //   );

  // if (start) {
  //   await auction.connect(owner).start(durationSeconds, stoppable);
  // }

  // const fhevm = await createInstance();
  // const auctionParams: FHEAuctionParams = {
  //   tieBreakingRule,
  //   quantity,
  //   durationSeconds,
  //   stoppable,
  //   minimumPaymentDeposit,
  //   paymentPenalty,
  // };

  // const ctx = new FHEAuctionERC20MockTestCtx({
  //   auction,
  //   auctionAddr,
  //   engine,
  //   engineAddr,
  //   auctionToken,
  //   auctionTokenAddr,
  //   auctionTokenOwner,
  //   paymentToken,
  //   paymentTokenAddr,
  //   paymentTokenOwner,
  //   owner,
  //   beneficiary,
  //   fhevm,
  //   params: auctionParams,
  // });

  // return {
  //   ctx,
  //   alice,
  //   bob,
  //   charlie,
  //   other,
  // };
}

export async function deployNativeAuctionFactoryFixture() {
  const [
    dummy, //owner should not be signers[0]
    factoryOwner,
    auctionOwner,
    beneficiary,
    auctionTokenOwner,
    alice,
    bob,
    charlie,
    other,
  ] = await hre.ethers.getSigners();

  const auctionToken: AuctionERC20 = await hre.ethers.deployContract(
    "AuctionERC20",
    ["AuctionToken", "AT"],
    auctionTokenOwner
  );
  const auctionTokenAddr = await auctionToken.getAddress();

  const engineFactory: FHEAuctionEngineFactory =
    await hre.ethers.deployContract("FHEAuctionEngineFactory", factoryOwner);
  const engineFactoryAddr = await engineFactory.getAddress();

  const auctionNativeFactory: FHEAuctionNativeMockFactory =
    await hre.ethers.deployContract(
      "FHEAuctionNativeMockFactory",
      [engineFactory],
      factoryOwner
    );
  const auctionNativeFactoryAddr = await auctionNativeFactory.getAddress();

  await auctionToken.connect(auctionTokenOwner).transfer(beneficiary, 100000n);
  const fhevm = await createInstance();

  return {
    fhevm,
    auctionNativeFactory,
    auctionNativeFactoryAddr,
    engineFactory,
    engineFactoryAddr,
    auctionToken,
    auctionTokenAddr,
    auctionTokenOwner,
    factoryOwner,
    auctionOwner,
    beneficiary,
    alice,
    bob,
    charlie,
    other,
  };
}

export async function deployERC20AuctionWithMaxBiddersFixture(
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
  const allSigners = await hre.ethers.getSigners();
  const [
    dummy, //owner should not be signers[0]
    owner,
    beneficiary,
    auctionTokenOwner,
    paymentTokenOwner,
  ] = allSigners;
  const bidders = allSigners.slice(5);

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

  if (paymentTokenDefaultBalance > 0) {
    for (let i = 0; i < bidders.length; ++i) {
      await paymentToken
        .connect(paymentTokenOwner)
        .transfer(bidders[i], paymentTokenDefaultBalance);
    }
  }

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

  await auctionToken
    .connect(auctionTokenOwner)
    .transfer(beneficiary, quantity * 10n);
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
    bidders,
  };
}
