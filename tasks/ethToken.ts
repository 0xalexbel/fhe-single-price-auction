import { scope } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { convertToAddress, toWei } from "./utils";
import {
  SCOPE_ETH,
  TASK_BALANCE,
  TASK_SET_MIN_BALANCE,
  TASK_TRANSFER,
} from "./task-names";

const ethScope = scope(SCOPE_ETH, "ETH token related commands");

/**
 * npx hardhat eth transfer --amount 10 --to-index 2
 */
ethScope
  .task(
    TASK_TRANSFER,
    "Transfers ETH from the deployer address to a specified signer index"
  )
  .addParam("amount", "Amount of eth to transfer")
  .addOptionalParam(
    "fromIndex",
    "Index of the ether signer (default: deployer)"
  )
  .addParam("toIndex", "Index of the ether signer")
  .setAction(async function (
    taskArguments: TaskArguments,
    hre: HardhatRuntimeEnvironment
  ) {
    const { deployer } = await hre.getNamedAccounts();

    const amount = toWei(hre, taskArguments.amount, undefined);
    if (amount === undefined) {
      console.error(`Invalid amount`);
      return;
    }

    const toIndex = Number.parseInt(taskArguments.toIndex, 10);
    if (Number.isNaN(toIndex)) {
      console.error(`'${taskArguments.toIndex}' is not a signer index`);
      return;
    }

    let fromIndex = 0;
    if (taskArguments.fromIndex !== undefined) {
      fromIndex = Number.parseInt(taskArguments.fromIndex, 10);
      if (Number.isNaN(toIndex)) {
        console.error(`'${taskArguments.fromIndex}' is not a signer index`);
        return;
      }
    }

    const toAddr = await convertToAddress(hre, toIndex.toString());
    if (!toAddr) {
      console.error(
        `'${taskArguments.toIndex}' not an address or a signer index`
      );
      return;
    }

    const fromAddr = await convertToAddress(hre, fromIndex.toString());
    if (!fromAddr) {
      console.error(
        `'${taskArguments.fromIndex}' not an address or a signer index`
      );
      return;
    }

    const signer: HardhatEthersSigner = await HardhatEthersSigner.create(
      hre.ethers.provider,
      fromAddr
    );

    const tx = await signer.sendTransaction({
      to: toAddr,
      value: amount,
    });
    const receipt = await tx.wait(1);

    const eth = hre.ethers.formatUnits(amount, "ether");

    console.info("Transfer tx hash: ", receipt!.hash);
    console.info(
      `ETH Transfer from: ${deployer} to: ${toAddr} amount: ${amount} (${eth} ETH)`
    );
  });

ethScope
  .task(
    TASK_BALANCE,
    "Prints the ETH balance of a specified account or signer index"
  )
  .addParam("account", "account address or index")
  .setAction(async function (
    taskArguments: TaskArguments,
    hre: HardhatRuntimeEnvironment
  ) {
    const accountAddr = await convertToAddress(hre, taskArguments.account);
    if (!accountAddr) {
      console.error(`'${taskArguments.user}' not an address or a signer index`);
      return;
    }

    const b = await hre.ethers.provider.getBalance(accountAddr);
    const eth = hre.ethers.formatUnits(b, "ether");

    console.info(`ETH Balance : ${b} (${eth} ETH) (account: ${accountAddr})`);
  });

ethScope
  .task(
    TASK_SET_MIN_BALANCE,
    "Sets the specified account balance to a minimum value"
  )
  .addParam("account", "account address or index")
  .addParam("min", "minimum balance")
  .addFlag("dryRun")
  .setAction(async function (
    taskArguments: TaskArguments,
    hre: HardhatRuntimeEnvironment
  ) {
    const { deployer } = await hre.getNamedAccounts();

    const min = toWei(hre, taskArguments.min, undefined);
    if (min === undefined) {
      console.error(`Invalid minimum balance`);
      return;
    }

    const accountAddr = await convertToAddress(hre, taskArguments.account);
    if (!accountAddr) {
      console.error(`'${taskArguments.user}' not an address or a signer index`);
      return;
    }

    const b = await hre.ethers.provider.getBalance(accountAddr);
    const eth = hre.ethers.formatUnits(b, "ether");

    if (b >= min) {
      console.info(
        `👍 No ETH to transfer. Balance : ${b} (${eth} ETH) (account: ${accountAddr})`
      );
      return;
    }

    const signer: HardhatEthersSigner = await HardhatEthersSigner.create(
      hre.ethers.provider,
      deployer
    );

    const senderBalance = await hre.ethers.provider.getBalance(deployer);
    if (senderBalance < min - b) {
      console.info(`sender balance : ${senderBalance}`);
      console.info(`amount         : ${min - b}`);
      console.error(`Not enough founds!`);
      return;
    }

    if (taskArguments.dryRun) {
      console.info(
        `receiver balance      : ${b} (${hre.ethers.formatUnits(
          b,
          "ether"
        )} ETH)`
      );
      console.info(
        `receiver min balance  : ${min} (${hre.ethers.formatUnits(
          min,
          "ether"
        )} ETH)`
      );
      console.info(
        `amount to send        : ${min - b} (${hre.ethers.formatUnits(
          min - b,
          "ether"
        )} ETH)`
      );
      console.info(
        `sender balance        : ${senderBalance} (${hre.ethers.formatUnits(
          senderBalance,
          "ether"
        )} ETH)`
      );
      console.info(
        `sender new balance    : ${
          senderBalance - (min - b)
        } (${hre.ethers.formatUnits(senderBalance - (min - b), "ether")} ETH)`
      );
      return;
    }

    const tx = await signer.sendTransaction({
      to: accountAddr,
      value: min - b,
    });
    const receipt = await tx.wait(1);

    const newB = await hre.ethers.provider.getBalance(accountAddr);
    const newEth = hre.ethers.formatUnits(newB, "ether");

    console.info(
      `ETH Balance : ${newB} (${newEth} ETH) (account: ${accountAddr})`
    );
  });
