import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { AuctionERC20 } from "../types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { convertToAddress } from "./utils";

task(
  "transfer-auction-erc20-token",
  "Transfers auction erc20 tokens from the deployer address to a specified user"
)
  .addParam("amount", "Amount of auction erc20 tokens to transfer")
  .addParam("to", "To address")
  .setAction(async function (
    taskArguments: TaskArguments,
    hre: HardhatRuntimeEnvironment
  ) {
    const { deployments } = hre;
    const { deployer } = await hre.getNamedAccounts();

    const toAddr = await convertToAddress(hre, taskArguments.to);
    if (!toAddr) {
      console.error(`'${taskArguments.to}' not an address or a signer index`);
      return;
    }

    const signer: HardhatEthersSigner = await HardhatEthersSigner.create(
      hre.ethers.provider,
      deployer
    );

    const ERC20 = await deployments.get("AuctionERC20");
    const erc20: AuctionERC20 = await hre.ethers.getContractAt(
      "AuctionERC20",
      ERC20.address
    );

    const tx = await erc20
      .connect(signer)
      .transfer(toAddr, +taskArguments.amount);
    const receipt = await tx.wait(1);

    console.info("Transfer tx hash: ", receipt!.hash);
    console.info(
      `Transfer auction erc20 tokens from ${deployer} to: ${toAddr} amount: ${taskArguments.amount}`
    );
  });

task(
  "balance-auction-erc20-token",
  "Prints the auction erc20 token balance of a specified account"
)
  .addParam("account", "account address or index")
  .setAction(async function (
    taskArguments: TaskArguments,
    hre: HardhatRuntimeEnvironment
  ) {
    const { deployments } = hre;

    const accountAddr = await convertToAddress(hre, taskArguments.account);
    if (!accountAddr) {
      console.error(`'${taskArguments.user}' not an address or a signer index`);
      return;
    }

    const ERC20 = await deployments.get("AuctionERC20");
    const erc20: AuctionERC20 = await hre.ethers.getContractAt(
      "AuctionERC20",
      ERC20.address
    );

    const b = await erc20.balanceOf(accountAddr);

    console.info(`Balance of ${accountAddr} : ${b}`);
  });
