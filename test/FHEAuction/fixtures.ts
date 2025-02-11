import hre from "hardhat";
import {
  AuctionERC20,
  PaymentERC20,
  FHEAuctionERC20Mock,
  FHEAuctionERC20MockFactory,
  FHEAuctionNativeMockFactory,
  FHEAuctionNativeMock,
  FHEAuctionEngineBaseMock,
  FHEAuctionEnginePriceIdMockFactory,
  FHEAuctionEnginePriceQuantityIdMockFactory,
  FHEAuctionEnginePriceRandomMockFactory,
  FHEAuctionEngineProRataMockFactory,
  FHEAuctionEngineIteratorFactory,
  FHEAuctionEngineIterator,
  FHEAuctionEnginePriceIdFactory,
  FHEAuctionEnginePriceQuantityIdFactory,
  FHEAuctionEnginePriceRandomFactory,
  FHEAuctionEngineProRataFactory,
  FHEAuctionNativeFactory,
  FHEAuctionERC20Factory,
} from "../../types";
import { createInstance } from "../instance";
import {
  FHEAuctionERC20MockTestCtx,
  FHEAuctionNativeMockTestCtx,
  FHEAuctionParams,
  TieBreakingRulePriceId,
  TieBreakingRulePriceQuantityId,
  TieBreakingRuleRandom,
  TieBreakingRuleProRata,
} from "./utils";
import assert from "assert";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";

const SALT_ONE =
  "0x0000000000000000000000000000000000000000000000000000000000000001";

export async function deployEngine(
  tieBreakingRule: bigint,
  auctionAddr: string,
  auctionOwner: HardhatEthersSigner
): Promise<FHEAuctionEngineBaseMock> {
  const iterator: FHEAuctionEngineIterator = await hre.ethers.deployContract(
    "FHEAuctionEngineIterator",
    [auctionOwner],
    auctionOwner
  );
  const iteratorAddr = await iterator.getAddress();

  let engine: FHEAuctionEngineBaseMock;

  if (tieBreakingRule == TieBreakingRulePriceId) {
    engine = await hre.ethers.deployContract(
      "FHEAuctionEnginePriceIdMock",
      [auctionOwner, iteratorAddr],
      auctionOwner
    );
  } else if (tieBreakingRule == TieBreakingRulePriceQuantityId) {
    engine = await hre.ethers.deployContract(
      "FHEAuctionEnginePriceQuantityIdMock",
      [auctionOwner, iteratorAddr],
      auctionOwner
    );
  } else if (tieBreakingRule == TieBreakingRuleRandom) {
    engine = await hre.ethers.deployContract(
      "FHEAuctionEnginePriceRandomMock",
      [auctionOwner, iteratorAddr],
      auctionOwner
    );
  } else if (tieBreakingRule == TieBreakingRuleProRata) {
    engine = await hre.ethers.deployContract(
      "FHEAuctionEngineProRataMock",
      [auctionOwner, iteratorAddr],
      auctionOwner
    );
  } else {
    throw new Error("Unkwnown tie braking rule");
  }

  await iterator.connect(auctionOwner).transferOwnership(engine);
  await engine.connect(auctionOwner).transferOwnership(auctionAddr);

  const engineAddr = await engine.getAddress();

  expect(await iterator.owner()).to.equal(engineAddr);
  expect(await engine.owner()).to.equal(auctionAddr);

  return engine;
}

export async function deployEngineMockFactories(
  factoryOwner: HardhatEthersSigner
) {
  const iteratorFactory: FHEAuctionEngineIteratorFactory =
    await hre.ethers.deployContract(
      "FHEAuctionEngineIteratorFactory",
      factoryOwner
    );

  const enginePriceIdFactory: FHEAuctionEnginePriceIdMockFactory =
    await hre.ethers.deployContract(
      "FHEAuctionEnginePriceIdMockFactory",
      [iteratorFactory],
      factoryOwner
    );

  const enginePriceQuantityIdFactory: FHEAuctionEnginePriceQuantityIdMockFactory =
    await hre.ethers.deployContract(
      "FHEAuctionEnginePriceQuantityIdMockFactory",
      [iteratorFactory],
      factoryOwner
    );

  const enginePriceRandomFactory: FHEAuctionEnginePriceRandomMockFactory =
    await hre.ethers.deployContract(
      "FHEAuctionEnginePriceRandomMockFactory",
      [iteratorFactory],
      factoryOwner
    );

  const engineProRataFactory: FHEAuctionEngineProRataMockFactory =
    await hre.ethers.deployContract(
      "FHEAuctionEngineProRataMockFactory",
      [iteratorFactory],
      factoryOwner
    );

  return {
    enginePriceIdFactory,
    enginePriceQuantityIdFactory,
    enginePriceRandomFactory,
    engineProRataFactory,
  };
}

export async function deployEngineFactories(factoryOwner: HardhatEthersSigner) {
  const iteratorFactory: FHEAuctionEngineIteratorFactory =
    await hre.ethers.deployContract(
      "FHEAuctionEngineIteratorFactory",
      factoryOwner
    );

  const enginePriceIdFactory: FHEAuctionEnginePriceIdFactory =
    await hre.ethers.deployContract(
      "FHEAuctionEnginePriceIdFactory",
      [iteratorFactory],
      factoryOwner
    );

  const enginePriceQuantityIdFactory: FHEAuctionEnginePriceQuantityIdFactory =
    await hre.ethers.deployContract(
      "FHEAuctionEnginePriceQuantityIdFactory",
      [iteratorFactory],
      factoryOwner
    );

  const enginePriceRandomFactory: FHEAuctionEnginePriceRandomFactory =
    await hre.ethers.deployContract(
      "FHEAuctionEnginePriceRandomFactory",
      [iteratorFactory],
      factoryOwner
    );

  const engineProRataFactory: FHEAuctionEngineProRataFactory =
    await hre.ethers.deployContract(
      "FHEAuctionEngineProRataFactory",
      [iteratorFactory],
      factoryOwner
    );

  return {
    enginePriceIdFactory,
    enginePriceQuantityIdFactory,
    enginePriceRandomFactory,
    engineProRataFactory,
  };
}

export async function deployNativeAuctionMockFixture(
  quantity: bigint,
  durationSeconds: bigint,
  maxBidCount: bigint,
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

  const { auctionToken, auctionTokenAddr } = await deployAuctionERC20Token(
    auctionTokenOwner,
    1_000_000_000n
  );

  const auction: FHEAuctionNativeMock = await hre.ethers.deployContract(
    "FHEAuctionNativeMock",
    [minimumPaymentDeposit, paymentPenalty],
    owner
  );
  const auctionAddr = await auction.getAddress();

  const engine = await deployEngine(tieBreakingRule, auctionAddr, owner);
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
      maxBidCount
    );

  if (start) {
    await auction.connect(owner).start(durationSeconds, stoppable);
  }

  const fhevm = await createInstance(hre);
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

  await ctx.init();

  return {
    ctx,
    alice,
    bob,
    charlie,
    other,
  };
}

export async function deployERC20AuctionMockFixture(
  quantity: bigint,
  durationSeconds: bigint,
  maxBidCount: bigint,
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

  const { auctionToken, auctionTokenAddr } = await deployAuctionERC20Token(
    auctionTokenOwner,
    1_000_000_000n
  );

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

  const engine = await deployEngine(tieBreakingRule, auctionAddr, owner);
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
      maxBidCount
    );

  if (start) {
    await auction.connect(owner).start(durationSeconds, stoppable);
  }

  const fhevm = await createInstance(hre);
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

  await ctx.init();

  return {
    ctx,
    alice,
    bob,
    charlie,
    other,
  };
}

export async function deployERC20AuctionUsingFactoryFixture(
  quantity: bigint,
  durationSeconds: bigint,
  maxBidCount: bigint,
  tieBreakingRule: bigint,
  minimumPaymentDeposit: bigint,
  paymentPenalty: bigint,
  stoppable: boolean,
  start: boolean,
  paymentTokenDefaultBalance: bigint,
  paymentTokenTotalSupply: bigint
) {
  const res = await deployERC20AuctionMockFactoryFixture(
    paymentTokenDefaultBalance,
    paymentTokenTotalSupply,
    quantity * 10n
  );

  const saltOne: string = SALT_ONE;

  const computedAuctionAddr =
    await res.auctionERC20Factory.computeAuctionAddress(
      saltOne,
      res.beneficiary,
      res.auctionToken,
      res.paymentToken,
      minimumPaymentDeposit,
      paymentPenalty
    );

  await res.auctionERC20Factory
    .connect(res.factoryOwner)
    .createNewAuction(
      res.auctionOwner,
      saltOne,
      res.beneficiary,
      quantity,
      res.auctionToken,
      maxBidCount,
      tieBreakingRule,
      res.paymentToken,
      minimumPaymentDeposit,
      paymentPenalty
    );

  const auctionAddr = await res.auctionERC20Factory.getAuction(
    saltOne,
    res.beneficiary,
    res.auctionTokenAddr,
    res.paymentTokenAddr
  );
  assert(auctionAddr === computedAuctionAddr);

  const auction: FHEAuctionERC20Mock = await hre.ethers.getContractAt(
    "FHEAuctionERC20Mock",
    auctionAddr
  );

  const engineAddr = await auction.engine();

  const engine: FHEAuctionEngineBaseMock = await hre.ethers.getContractAt(
    "FHEAuctionEngineBaseMock",
    engineAddr
  );

  await res.auctionToken
    .connect(res.beneficiary)
    .approve(auctionAddr, quantity);

  if (start) {
    await auction.connect(res.auctionOwner).start(durationSeconds, stoppable);
  }

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
    auctionToken: res.auctionToken,
    auctionTokenAddr: res.auctionTokenAddr,
    auctionTokenOwner: res.auctionTokenOwner,
    paymentToken: res.paymentToken,
    paymentTokenAddr: res.paymentTokenAddr,
    paymentTokenOwner: res.paymentTokenOwner,
    owner: res.auctionOwner,
    beneficiary: res.beneficiary,
    fhevm: res.fhevm,
    params: auctionParams,
  });

  await ctx.init();

  return {
    ctx,
    alice: res.alice,
    bob: res.bob,
    charlie: res.charlie,
    other: res.other,
  };
}

export async function deployNativeAuctionUsingFactoryFixture(
  quantity: bigint,
  durationSeconds: bigint,
  maxBidCount: bigint,
  tieBreakingRule: bigint,
  minimumPaymentDeposit: bigint,
  paymentPenalty: bigint,
  stoppable: boolean,
  start: boolean
) {
  const res = await deployNativeAuctionMockFactoryFixture(quantity * 10n);

  const saltOne: string = SALT_ONE;

  const computedAuctionAddr =
    await res.auctionNativeFactory.computeAuctionAddress(
      saltOne,
      res.beneficiary,
      res.auctionToken,
      minimumPaymentDeposit,
      paymentPenalty
    );

  await res.auctionNativeFactory
    .connect(res.factoryOwner)
    .createNewAuction(
      res.auctionOwner,
      saltOne,
      res.beneficiary,
      quantity,
      res.auctionToken,
      maxBidCount,
      tieBreakingRule,
      minimumPaymentDeposit,
      paymentPenalty
    );

  const auctionAddr = await res.auctionNativeFactory.getAuction(
    saltOne,
    res.beneficiary,
    res.auctionTokenAddr
  );
  assert(auctionAddr === computedAuctionAddr);

  const auction: FHEAuctionNativeMock = await hre.ethers.getContractAt(
    "FHEAuctionNativeMock",
    auctionAddr
  );

  const engineAddr = await auction.engine();

  const engine: FHEAuctionEngineBaseMock = await hre.ethers.getContractAt(
    "FHEAuctionEngineBaseMock",
    engineAddr
  );

  await res.auctionToken
    .connect(res.beneficiary)
    .approve(auctionAddr, quantity);

  if (start) {
    await auction.connect(res.auctionOwner).start(durationSeconds, stoppable);
  }

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
    auctionToken: res.auctionToken,
    auctionTokenAddr: res.auctionTokenAddr,
    auctionTokenOwner: res.auctionTokenOwner,
    owner: res.auctionOwner,
    beneficiary: res.beneficiary,
    fhevm: res.fhevm,
    params: auctionParams,
  });

  await ctx.init();

  return {
    ctx,
    alice: res.alice,
    bob: res.bob,
    charlie: res.charlie,
    other: res.other,
  };
}

export async function deployERC20AuctionMockFactoryFixture(
  paymentTokenDefaultBalance: bigint,
  paymentTokenTotalSupply: bigint,
  beneficiaryAuctionTokenBalance: bigint
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

  const { auctionToken, auctionTokenAddr } = await deployAuctionERC20Token(
    auctionTokenOwner,
    1_000_000_000n
  );

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

  const details = await deployEngineMockFactories(factoryOwner);

  const auctionERC20Factory: FHEAuctionERC20MockFactory =
    await hre.ethers.deployContract(
      "FHEAuctionERC20MockFactory",
      [details],
      factoryOwner
    );
  const auctionERC20FactoryAddr = await auctionERC20Factory.getAddress();

  await auctionToken
    .connect(auctionTokenOwner)
    .transfer(beneficiary, beneficiaryAuctionTokenBalance);
  const fhevm = await createInstance(hre);

  return {
    fhevm,
    auctionERC20Factory,
    auctionERC20FactoryAddr,
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
}

export async function deployERC20AuctionFactoryFixture(
  paymentTokenDefaultBalance: bigint,
  paymentTokenTotalSupply: bigint,
  beneficiaryAuctionTokenBalance: bigint
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

  const { auctionToken, auctionTokenAddr } = await deployAuctionERC20Token(
    auctionTokenOwner,
    1_000_000_000n
  );

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

  const details = await deployEngineFactories(factoryOwner);

  const auctionERC20Factory: FHEAuctionERC20Factory =
    await hre.ethers.deployContract(
      "FHEAuctionERC20Factory",
      [details],
      factoryOwner
    );
  const auctionERC20FactoryAddr = await auctionERC20Factory.getAddress();

  await auctionToken
    .connect(auctionTokenOwner)
    .transfer(beneficiary, beneficiaryAuctionTokenBalance);
  const fhevm = await createInstance(hre);

  return {
    fhevm,
    auctionERC20Factory,
    auctionERC20FactoryAddr,
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
}

export async function deployNativeAuctionMockFactoryFixture(
  beneficiaryAuctionTokenBalance: bigint
) {
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

  const { auctionToken, auctionTokenAddr } = await deployAuctionERC20Token(
    auctionTokenOwner,
    1_000_000_000n
  );

  const details = await deployEngineMockFactories(factoryOwner);

  const auctionNativeFactory: FHEAuctionNativeMockFactory =
    await hre.ethers.deployContract(
      "FHEAuctionNativeMockFactory",
      [details],
      factoryOwner
    );
  const auctionNativeFactoryAddr = await auctionNativeFactory.getAddress();

  await auctionToken
    .connect(auctionTokenOwner)
    .transfer(beneficiary, beneficiaryAuctionTokenBalance);
  const fhevm = await createInstance(hre);

  return {
    fhevm,
    auctionNativeFactory,
    auctionNativeFactoryAddr,
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

export async function deployNativeAuctionFactoryFixture(
  beneficiaryAuctionTokenBalance: bigint
) {
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

  const { auctionToken, auctionTokenAddr } = await deployAuctionERC20Token(
    auctionTokenOwner,
    1_000_000_000n
  );

  const details = await deployEngineFactories(factoryOwner);

  const auctionNativeFactory: FHEAuctionNativeFactory =
    await hre.ethers.deployContract(
      "FHEAuctionNativeFactory",
      [details],
      factoryOwner
    );
  const auctionNativeFactoryAddr = await auctionNativeFactory.getAddress();

  await auctionToken
    .connect(auctionTokenOwner)
    .transfer(beneficiary, beneficiaryAuctionTokenBalance);
  const fhevm = await createInstance(hre);

  return {
    fhevm,
    auctionNativeFactory,
    auctionNativeFactoryAddr,
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

export async function deployPayementERC20Token(
  paymentTokenOwner: HardhatEthersSigner,
  paymentTokenTotalSupply: bigint
) {
  const paymentToken: AuctionERC20 = await hre.ethers.deployContract(
    "PaymentERC20",
    ["PaymentToken", "PAY"],
    paymentTokenOwner
  );

  const paymentTokenAddr = await paymentToken.getAddress();

  await paymentToken
    .connect(paymentTokenOwner)
    .mint(paymentTokenOwner, paymentTokenTotalSupply);

  return {
    paymentToken,
    paymentTokenAddr,
  };
}

export async function deployAuctionERC20Token(
  auctionTokenOwner: HardhatEthersSigner,
  auctionTokenTotalSupply: bigint
) {
  const auctionToken: AuctionERC20 = await hre.ethers.deployContract(
    "AuctionERC20",
    ["AuctionToken", "AUC"],
    auctionTokenOwner
  );

  const auctionTokenAddr = await auctionToken.getAddress();

  await auctionToken
    .connect(auctionTokenOwner)
    .mint(auctionTokenOwner, auctionTokenTotalSupply);

  return {
    auctionToken,
    auctionTokenAddr,
  };
}

export async function deployERC20AuctionWithMaxBiddersFixture(
  quantity: bigint,
  durationSeconds: bigint,
  maxBidCount: bigint,
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
  // bidders are the all the remaining signers
  const bidders = allSigners.slice(5);

  const { auctionToken, auctionTokenAddr } = await deployAuctionERC20Token(
    auctionTokenOwner,
    1_000_000_000n
  );

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

  const engine = await deployEngine(tieBreakingRule, auctionAddr, owner);
  const engineAddr = await engine.getAddress();

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
      maxBidCount
    );

  if (start) {
    await auction.connect(owner).start(durationSeconds, stoppable);
  }

  const fhevm = await createInstance(hre);
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

  await ctx.init();

  return {
    ctx,
    bidders,
  };
}
