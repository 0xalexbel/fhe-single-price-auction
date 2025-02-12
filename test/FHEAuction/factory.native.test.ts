import { expect } from "chai";
import hre from "hardhat";
import { ethers as EthersT } from "ethers";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import {
  deployNativeAuctionFactoryFixture,
  deployNativeAuctionMockFactoryFixture,
} from "./fixtures";
import { FhevmInstance } from "fhevmjs/node";
import {
  AuctionERC20,
  FHEAuctionERC20,
  FHEAuctionERC20Mock,
  FHEAuctionNativeMockFactory,
} from "../../types";
import { TieBreakingRulePriceId } from "./utils";

const DEFAULT_MAX_BID_COUNT = 10000n;
const DEFAULT_QUANTITY = 12345n;
const DEFAULT_TIE_BREAKING_RULE = TieBreakingRulePriceId;
const DEFAULT_MIN_PAYMENT_DEPOSIT = 100n;
const DEFAULT_PAYMENT_PENALTY = 70n;

describe("factory.native.mock", () => {
  async function fixture() {
    return deployNativeAuctionMockFactoryFixture(DEFAULT_QUANTITY * 10n);
  }

  let fhevm: FhevmInstance;
  let auctionNativeFactory: FHEAuctionNativeMockFactory;
  let auctionNativeFactoryAddr: string;
  let auctionToken: AuctionERC20;
  let auctionTokenAddr: string;
  let auctionTokenOwner: HardhatEthersSigner;
  let factoryOwner: HardhatEthersSigner;
  let auctionOwner: HardhatEthersSigner;
  let beneficiary: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let charlie: HardhatEthersSigner;
  let other: HardhatEthersSigner;

  beforeEach(async function () {
    const res = await loadFixture(fixture);
    factoryOwner = res.factoryOwner;
    auctionOwner = res.auctionOwner;
    fhevm = res.fhevm;
    auctionNativeFactory = res.auctionNativeFactory;
    auctionNativeFactoryAddr = res.auctionNativeFactoryAddr;
    auctionToken = res.auctionToken;
    auctionTokenAddr = res.auctionTokenAddr;
    auctionTokenOwner = res.auctionTokenOwner;
    beneficiary = res.beneficiary;
    alice = res.alice;
    bob = res.bob;
    charlie = res.charlie;
    other = res.other;
  });

  describe("Ownable2Step", () => {
    it("has an owner", async () => {
      expect(await auctionNativeFactory.owner()).to.equal(factoryOwner);
    });

    it("should be native", async () => {
      expect(await auctionNativeFactory.isNative()).to.be.true;
    });

    it("should revert when a non-owner is starting a transfer", async () => {
      await expect(auctionNativeFactory.connect(other).transferOwnership(alice))
        .to.be.revertedWithCustomError(
          auctionNativeFactory,
          "OwnableUnauthorizedAccount"
        )
        .withArgs(other);
    });

    it("changes owner after transfer", async function () {
      await auctionNativeFactory.connect(factoryOwner).transferOwnership(alice);

      await expect(auctionNativeFactory.connect(alice).acceptOwnership())
        .to.emit(auctionNativeFactory, "OwnershipTransferred")
        .withArgs(factoryOwner, alice);

      expect(await auctionNativeFactory.owner()).to.equal(alice);
      expect(await auctionNativeFactory.pendingOwner()).to.equal(
        EthersT.ZeroAddress
      );
    });
  });

  describe(".deployAuction()", () => {
    it("should succeed when called by owner with valid arguments", async () => {
      const saltOne: string =
        "0x0000000000000000000000000000000000000000000000000000000000000001";

      const computedAuctionAddr =
        await auctionNativeFactory.computeAuctionAddress(
          saltOne,
          beneficiary,
          auctionToken,
          DEFAULT_MIN_PAYMENT_DEPOSIT, // constructor args
          DEFAULT_PAYMENT_PENALTY
        );
      await auctionNativeFactory
        .connect(factoryOwner)
        .createNewAuction(
          auctionOwner,
          saltOne,
          beneficiary,
          DEFAULT_QUANTITY,
          auctionToken,
          DEFAULT_MAX_BID_COUNT,
          DEFAULT_TIE_BREAKING_RULE,
          DEFAULT_MIN_PAYMENT_DEPOSIT,
          DEFAULT_PAYMENT_PENALTY
        );
      const auctionAddr = await auctionNativeFactory.getAuction(
        saltOne,
        beneficiary,
        auctionTokenAddr
      );
      expect(auctionAddr).equal(computedAuctionAddr);
      const auction: FHEAuctionERC20Mock = await hre.ethers.getContractAt(
        "FHEAuctionERC20Mock",
        auctionAddr
      );
      expect(await auction.owner()).equal(auctionOwner);
    });

    it("should revert if auction salt is already registered", async () => {
      const saltOne: string =
        "0x0000000000000000000000000000000000000000000000000000000000000001";

      await auctionNativeFactory
        .connect(factoryOwner)
        .createNewAuction(
          auctionOwner,
          saltOne,
          beneficiary,
          DEFAULT_QUANTITY,
          auctionToken,
          DEFAULT_MAX_BID_COUNT,
          DEFAULT_TIE_BREAKING_RULE,
          DEFAULT_MIN_PAYMENT_DEPOSIT,
          DEFAULT_PAYMENT_PENALTY
        );
      await expect(
        auctionNativeFactory
          .connect(factoryOwner)
          .createNewAuction(
            auctionOwner,
            saltOne,
            beneficiary,
            DEFAULT_QUANTITY,
            auctionToken,
            DEFAULT_MAX_BID_COUNT,
            DEFAULT_TIE_BREAKING_RULE,
            DEFAULT_MIN_PAYMENT_DEPOSIT,
            DEFAULT_PAYMENT_PENALTY
          )
      ).to.be.revertedWith("auction already deployed");
    });
  });
});

describe("factory.native", () => {
  async function fixture() {
    return deployNativeAuctionFactoryFixture(DEFAULT_QUANTITY * 10n);
  }

  let fhevm: FhevmInstance;
  let auctionNativeFactory: FHEAuctionNativeMockFactory;
  let auctionNativeFactoryAddr: string;
  let auctionToken: AuctionERC20;
  let auctionTokenAddr: string;
  let auctionTokenOwner: HardhatEthersSigner;
  let factoryOwner: HardhatEthersSigner;
  let auctionOwner: HardhatEthersSigner;
  let beneficiary: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let charlie: HardhatEthersSigner;
  let other: HardhatEthersSigner;

  beforeEach(async function () {
    const res = await loadFixture(fixture);
    factoryOwner = res.factoryOwner;
    auctionOwner = res.auctionOwner;
    fhevm = res.fhevm;
    auctionNativeFactory = res.auctionNativeFactory;
    auctionNativeFactoryAddr = res.auctionNativeFactoryAddr;
    auctionToken = res.auctionToken;
    auctionTokenAddr = res.auctionTokenAddr;
    auctionTokenOwner = res.auctionTokenOwner;
    beneficiary = res.beneficiary;
    alice = res.alice;
    bob = res.bob;
    charlie = res.charlie;
    other = res.other;
  });

  describe("Ownable2Step", () => {
    it("has an owner", async () => {
      expect(await auctionNativeFactory.owner()).to.equal(factoryOwner);
    });

    it("should be native", async () => {
      expect(await auctionNativeFactory.isNative()).to.be.true;
    });

    it("should revert when a non-owner is starting a transfer", async () => {
      await expect(auctionNativeFactory.connect(other).transferOwnership(alice))
        .to.be.revertedWithCustomError(
          auctionNativeFactory,
          "OwnableUnauthorizedAccount"
        )
        .withArgs(other);
    });

    it("changes owner after transfer", async function () {
      await auctionNativeFactory.connect(factoryOwner).transferOwnership(alice);

      await expect(auctionNativeFactory.connect(alice).acceptOwnership())
        .to.emit(auctionNativeFactory, "OwnershipTransferred")
        .withArgs(factoryOwner, alice);

      expect(await auctionNativeFactory.owner()).to.equal(alice);
      expect(await auctionNativeFactory.pendingOwner()).to.equal(
        EthersT.ZeroAddress
      );
    });
  });

  describe(".deployAuction()", () => {
    it("should succeed when called by any account with valid arguments", async () => {
      const saltOne: string =
        "0x0000000000000000000000000000000000000000000000000000000000000001";

      const computedAuctionAddr =
        await auctionNativeFactory.computeAuctionAddress(
          saltOne,
          beneficiary,
          auctionToken,
          DEFAULT_MIN_PAYMENT_DEPOSIT, // constructor args
          DEFAULT_PAYMENT_PENALTY
        );
      await auctionNativeFactory
        .connect(other)
        .createNewAuction(
          auctionOwner,
          saltOne,
          beneficiary,
          DEFAULT_QUANTITY,
          auctionToken,
          DEFAULT_MAX_BID_COUNT,
          DEFAULT_TIE_BREAKING_RULE,
          DEFAULT_MIN_PAYMENT_DEPOSIT,
          DEFAULT_PAYMENT_PENALTY
        );
      const auctionAddr = await auctionNativeFactory.getAuction(
        saltOne,
        beneficiary,
        auctionTokenAddr
      );
      expect(auctionAddr).equal(computedAuctionAddr);
      const auction: FHEAuctionERC20 = await hre.ethers.getContractAt(
        "FHEAuctionERC20",
        auctionAddr
      );
      expect(await auction.owner()).equal(auctionOwner);
    });

    it("should revert if auction salt is already registered", async () => {
      const saltOne: string =
        "0x0000000000000000000000000000000000000000000000000000000000000001";

      await auctionNativeFactory
        .connect(other)
        .createNewAuction(
          auctionOwner,
          saltOne,
          beneficiary,
          DEFAULT_QUANTITY,
          auctionToken,
          DEFAULT_MAX_BID_COUNT,
          DEFAULT_TIE_BREAKING_RULE,
          DEFAULT_MIN_PAYMENT_DEPOSIT,
          DEFAULT_PAYMENT_PENALTY
        );
      await expect(
        auctionNativeFactory
          .connect(other)
          .createNewAuction(
            auctionOwner,
            saltOne,
            beneficiary,
            DEFAULT_QUANTITY,
            auctionToken,
            DEFAULT_MAX_BID_COUNT,
            DEFAULT_TIE_BREAKING_RULE,
            DEFAULT_MIN_PAYMENT_DEPOSIT,
            DEFAULT_PAYMENT_PENALTY
          )
      ).to.be.revertedWith("auction already deployed");
    });
  });
});
