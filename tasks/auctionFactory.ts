import { task, types, scope } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import {
  FHEAuctionERC20Factory,
  FHEAuctionNativeFactory,
  Ownable,
} from "../types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { convertToAddress, logGas } from "./utils";
import { ethers } from "ethers";
import { SCOPE_AUCTION, SCOPE_AUCTION_TASK_CREATE } from "./task-names";
import { FHEAuctionError } from "./error";

const auctionScope = scope(SCOPE_AUCTION, "Auction related commands");

/**
 * Example:
 * npx hardhat auction create
 *      --type erc20
 *      --salt MyFHEAuctionERC20
 *      --beneficiary 1
 *      --quantity 123
 *      --minimum-payment-deposit 1000
 *      --payment-penalty 500
 *      --network localhost
 */
auctionScope
  .task(SCOPE_AUCTION_TASK_CREATE, "Creates a new ERC20 auction")
  .addParam("type", "Auction type 'erc20' or 'native'", undefined, types.string)
  .addOptionalParam("owner", "Auction owner (default: beneficiary)")
  .addOptionalParam("deployer", "Deployer address (default: owner)")
  .addOptionalParam("salt", "New auction salt", undefined, types.string)
  .addParam("beneficiary", "Address of the beneficiary")
  .addParam(
    "quantity",
    "Quantity of auction ERC20 tokens beeing sold",
    undefined,
    types.bigint
  )
  .addOptionalParam("auctionToken", "Address of the auction ERC20 token")
  .addOptionalParam("paymentToken", "Address of the payment ERC20 token")
  .addOptionalParam(
    "tieBreakingRule",
    "Auction tie-breaking rule",
    0,
    types.int
  )
  .addParam(
    "minimumPaymentDeposit",
    "Minimum payment token deposit",
    undefined,
    types.bigint
  )
  .addParam("paymentPenalty", "Payment token penalty", undefined, types.bigint)
  .addParam("maxBidCount", "Maximum number of bids", undefined, types.bigint)
  .addFlag("dryRun")
  .setAction(async function (
    taskArguments: TaskArguments,
    hre: HardhatRuntimeEnvironment
  ) {
    const { deployments } = hre;

    const theType: string = taskArguments.type;
    if (theType !== "erc20" && theType !== "native") {
      console.error(
        `Invalid auction type '${theType}', expecting 'erc20' or 'native'`
      );
      return;
    }

    const tieBreakingRule: number = taskArguments.tieBreakingRule;
    // ProRata is not yet implemented
    if (tieBreakingRule < 0n || tieBreakingRule > 2) {
      console.error(
        "Invalid tie breaking rule, expecting '0'=(Price,ID), '1'=(Price, Quantity, ID), '2'=(Price, Random)"
      );
      return;
    }

    const quantity: bigint = taskArguments.quantity;
    if (quantity === 0n) {
      console.error("Invalid quantity");
      return;
    }

    let maxBidCount: bigint = taskArguments.maxBidCount;
    if (maxBidCount <= 1n) {
      console.error("Invalid maximum bid count");
      return;
    }
    if (maxBidCount > BigInt("0xffffffff")) {
      maxBidCount = BigInt("0xffffffff");
    }

    const beneficiary = await convertToAddress(hre, taskArguments.beneficiary);
    if (!beneficiary) {
      console.error("Invalid beneficiary");
      return;
    }

    let ownerAddr;
    if (taskArguments.owner === undefined) {
      ownerAddr = beneficiary;
    } else {
      ownerAddr = await convertToAddress(hre, taskArguments.owner);
    }

    if (!ownerAddr) {
      console.error("Invalid owner");
      return;
    }

    let deployerAddr;
    if (!taskArguments.deployer) {
      deployerAddr = ownerAddr;
    } else {
      deployerAddr = await convertToAddress(hre, taskArguments.deployer);
      if (!deployerAddr) {
        console.error("Invalid deployer");
        return;
      }
    }

    const deployer: HardhatEthersSigner = await HardhatEthersSigner.create(
      hre.ethers.provider,
      deployerAddr
    );

    let salt: string;
    if (taskArguments.salt === undefined) {
      salt = hre.ethers.toBeHex(
        hre.ethers.toBigInt(hre.ethers.randomBytes(32))
      );
    } else if (hre.ethers.isHexString(taskArguments.salt, 32)) {
      salt = taskArguments.salt;
    } else {
      salt = hre.ethers.keccak256(Buffer.from(taskArguments.salt));
    }
    const saltBytes32 = hre.ethers.toBeArray(salt);

    let auctionTokenAddr: string;
    try {
      auctionTokenAddr = !taskArguments.auctionToken
        ? (await deployments.get("AuctionERC20")).address
        : ethers.getAddress(taskArguments.auctionToken);
    } catch {
      console.error("Invalid auction token");
      return;
    }

    let paymentTokenAddr: string;
    try {
      paymentTokenAddr = !taskArguments.paymentToken
        ? (await deployments.get("PaymentERC20")).address
        : ethers.getAddress(taskArguments.paymentToken);
    } catch {
      console.error("Invalid payment token");
      return;
    }

    const minimumPaymentDeposit = taskArguments.minimumPaymentDeposit;
    const paymentPenalty = taskArguments.paymentPenalty;

    console.info(`Auction deployer                : ${deployerAddr}`);
    console.info(`Auction owner                   : ${ownerAddr}`);
    console.info(`Auction beneficiary             : ${beneficiary}`);
    console.info(`Auction max bid count           : ${maxBidCount}`);
    console.info(`Auction salt                    : ${salt}`);
    console.info(`Auction quantity                : ${quantity}`);
    console.info(`Auction token                   : ${auctionTokenAddr}`);
    console.info(`Auction payment token           : ${paymentTokenAddr}`);
    console.info(`Auction payment minimum deposit : ${minimumPaymentDeposit}`);
    console.info(`Auction payment penalty         : ${paymentPenalty}`);
    console.info(`Auction tie breaking rule       : ${tieBreakingRule}`);

    let auctionAddr: string | undefined;

    if (theType === "erc20") {
      const factoryAddr = (await deployments.get("FHEAuctionERC20Factory"))
        .address;
      const factory: FHEAuctionERC20Factory = await hre.ethers.getContractAt(
        "FHEAuctionERC20Factory",
        factoryAddr
      );

      // Check if already exists
      auctionAddr = await factory.getAuction(
        salt,
        beneficiary,
        auctionTokenAddr,
        paymentTokenAddr
      );

      if (auctionAddr === undefined) {
        throw new FHEAuctionError("Factory.getAuction failed");
      }

      if (taskArguments.dryRun) {
        console.info(`Auction existing address        : ${auctionAddr}`);
        return auctionAddr;
      }

      if (auctionAddr === hre.ethers.ZeroAddress) {
        // create engine ~= 4_000_000
        //   create iterator ~= 1_000_000
        //   create engine ~= 3_000_000 (constructor 300_000)
        // initialize 100_000
        // transfer 3_000
        let tx = await factory
          .connect(deployer)
          .createNewAuction(
            ownerAddr,
            saltBytes32,
            beneficiary,
            quantity,
            auctionTokenAddr,
            maxBidCount,
            tieBreakingRule,
            paymentTokenAddr,
            minimumPaymentDeposit,
            paymentPenalty
          );

        let receipt = await tx.wait(1);

        logGas(hre, receipt);

        auctionAddr = await factory.getAuction(
          saltBytes32,
          beneficiary,
          auctionTokenAddr,
          paymentTokenAddr
        );

        if (auctionAddr === hre.ethers.ZeroAddress) {
          console.error("Create new ERC20 auction failed");
          return;
        }

        console.info(
          `🚀 New ERC20 auction at address ${auctionAddr} has been successfully created.`
        );
      } else {
        console.info(
          `🍔 ERC20 auction at address ${auctionAddr} is already deployed.`
        );
      }
    } else {
      const factoryAddr = (await deployments.get("FHEAuctionNativeFactory"))
        .address;
      const factory: FHEAuctionNativeFactory = await hre.ethers.getContractAt(
        "FHEAuctionNativeFactory",
        factoryAddr
      );

      // Check if already exists
      auctionAddr = await factory.getAuction(
        salt,
        beneficiary,
        auctionTokenAddr
      );

      if (taskArguments.dryRun) {
        console.info(`Auction existing address        : ${auctionAddr}`);
        return auctionAddr;
      }

      if (auctionAddr === hre.ethers.ZeroAddress) {
        let tx = await factory
          .connect(deployer)
          .createNewAuction(
            ownerAddr,
            saltBytes32,
            beneficiary,
            quantity,
            auctionTokenAddr,
            tieBreakingRule,
            paymentTokenAddr,
            minimumPaymentDeposit,
            paymentPenalty
          );

        let receipt = await tx.wait(1);

        logGas(hre, receipt);

        auctionAddr = await factory.getAuction(
          saltBytes32,
          beneficiary,
          auctionTokenAddr
        );

        if (auctionAddr === hre.ethers.ZeroAddress) {
          console.error("Create new native auction failed");
          return;
        }

        console.info(
          `🚀 New native auction at address ${auctionAddr} has been successfully created.`
        );
      } else {
        console.info(
          `🍔 Native auction at address ${auctionAddr} is already deployed.`
        );
      }
    }

    return auctionAddr;
  });
