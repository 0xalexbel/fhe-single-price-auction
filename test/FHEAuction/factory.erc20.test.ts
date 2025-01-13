import { expect } from "chai";
import hre from "hardhat";
import { ethers as EthersT } from "ethers";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { deployERC20AuctionFactoryFixture } from "./fixtures";
import { FhevmInstance } from "fhevmjs/node";
import {
  AuctionERC20,
  FHEAuctionEngineFactory,
  FHEAuctionERC20Mock,
  FHEAuctionERC20MockFactory,
  PaymentERC20,
} from "../../types";

const DEFAULT_QUANTITY = 12345n;
const DEFAULT_TIE_BREAKING_RULE = 2n; //PriceId
const DEFAULT_MIN_PAYMENT_DEPOSIT = 100n;
const DEFAULT_PAYMENT_PENALTY = 70n;
const DEFAULT_PAYMENT_TOKEN_BALANCE = 0n;
const DEFAULT_PAYMENT_TOKEN_TOTAL_SUPPLY = 1_000_000_000_000_000_000_000n;

describe("factory", () => {
  async function fixture() {
    return deployERC20AuctionFactoryFixture(
      DEFAULT_PAYMENT_TOKEN_BALANCE,
      DEFAULT_PAYMENT_TOKEN_TOTAL_SUPPLY
    );
  }

  let fhevm: FhevmInstance;
  let auctionERC20Factory: FHEAuctionERC20MockFactory;
  let auctionERC20FactoryAddr: string;
  let engineFactory: FHEAuctionEngineFactory;
  let engineFactoryAddr: string;
  let auctionToken: AuctionERC20;
  let auctionTokenAddr: string;
  let auctionTokenOwner: HardhatEthersSigner;
  let paymentToken: PaymentERC20;
  let paymentTokenAddr: string;
  let paymentTokenOwner: HardhatEthersSigner;
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
    auctionERC20Factory = res.auctionERC20Factory;
    auctionERC20FactoryAddr = res.auctionERC20FactoryAddr;
    engineFactory = res.engineFactory;
    engineFactoryAddr = res.engineFactoryAddr;
    auctionToken = res.auctionToken;
    auctionTokenAddr = res.auctionTokenAddr;
    auctionTokenOwner = res.auctionTokenOwner;
    paymentToken = res.paymentToken;
    paymentTokenAddr = res.paymentTokenAddr;
    paymentTokenOwner = res.paymentTokenOwner;
    beneficiary = res.beneficiary;
    alice = res.alice;
    bob = res.bob;
    charlie = res.charlie;
    other = res.other;
  });

  describe("Ownable2Step", () => {
    it("has an owner", async () => {
      expect(await auctionERC20Factory.owner()).to.equal(factoryOwner);
    });

    it("should not be native", async () => {
      expect(await auctionERC20Factory.isNative()).to.be.false;
    });

    it("should revert when a non-owner is starting a transfer", async () => {
      await expect(auctionERC20Factory.connect(other).transferOwnership(alice))
        .to.be.revertedWithCustomError(
          auctionERC20Factory,
          "OwnableUnauthorizedAccount"
        )
        .withArgs(other);
    });

    it("changes owner after transfer", async function () {
      await auctionERC20Factory.connect(factoryOwner).transferOwnership(alice);

      await expect(auctionERC20Factory.connect(alice).acceptOwnership())
        .to.emit(auctionERC20Factory, "OwnershipTransferred")
        .withArgs(factoryOwner, alice);

      expect(await auctionERC20Factory.owner()).to.equal(alice);
      expect(await auctionERC20Factory.pendingOwner()).to.equal(
        EthersT.ZeroAddress
      );
    });
  });

  describe(".deployAuction()", () => {
    it("should revert when called by a non-owner", async () => {
      const saltOne: string =
        "0x0000000000000000000000000000000000000000000000000000000000000001";

      await expect(
        auctionERC20Factory
          .connect(other)
          .createNewAuction(
            auctionOwner,
            saltOne,
            beneficiary,
            DEFAULT_QUANTITY,
            auctionToken,
            DEFAULT_TIE_BREAKING_RULE,
            DEFAULT_MIN_PAYMENT_DEPOSIT,
            DEFAULT_PAYMENT_PENALTY
          )
      )
        .to.be.revertedWithCustomError(
          auctionERC20Factory,
          "OwnableUnauthorizedAccount"
        )
        .withArgs(other);
    });
  });

  it("should succeed when called by owner with valid arguments", async () => {
    const saltOne: string =
      "0x0000000000000000000000000000000000000000000000000000000000000001";

    const computedAuctionAddr = await auctionERC20Factory.computeAuctionAddress(
      saltOne,
      beneficiary,
      auctionToken,
      DEFAULT_MIN_PAYMENT_DEPOSIT,
      DEFAULT_PAYMENT_PENALTY
    );
    await auctionERC20Factory
      .connect(factoryOwner)
      .createNewAuction(
        auctionOwner,
        saltOne,
        beneficiary,
        DEFAULT_QUANTITY,
        auctionToken,
        DEFAULT_TIE_BREAKING_RULE,
        DEFAULT_MIN_PAYMENT_DEPOSIT,
        DEFAULT_PAYMENT_PENALTY
      );
    const auctionAddr = await auctionERC20Factory.getAuction(
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

    await auctionERC20Factory
      .connect(factoryOwner)
      .createNewAuction(
        auctionOwner,
        saltOne,
        beneficiary,
        DEFAULT_QUANTITY,
        auctionToken,
        DEFAULT_TIE_BREAKING_RULE,
        DEFAULT_MIN_PAYMENT_DEPOSIT,
        DEFAULT_PAYMENT_PENALTY
      );
    await expect(
      auctionERC20Factory
        .connect(factoryOwner)
        .createNewAuction(
          auctionOwner,
          saltOne,
          beneficiary,
          DEFAULT_QUANTITY,
          auctionToken,
          DEFAULT_TIE_BREAKING_RULE,
          DEFAULT_MIN_PAYMENT_DEPOSIT,
          DEFAULT_PAYMENT_PENALTY
        )
    ).to.be.revertedWith("auction already deployed");
  });
});
