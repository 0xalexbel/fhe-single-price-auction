import { types, scope } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { IERC20, IERC20Metadata } from "../types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { convertToAddress, convertToToken, logGas, toWei } from "./utils";
import {
  TASK_ALLOWANCE,
  TASK_APPROVE,
  TASK_BALANCE,
  TASK_SET_BALANCE,
  TASK_SET_MIN_BALANCE,
  TASK_TRANSFER,
} from "./task-names";
import assert from "assert";
import { FHEAuctionError } from "./error";

const erc20Scope = scope("erc20", "ERC20 related commands");

////////////////////////////////////////////////////////////////////////////////
// Transfer
////////////////////////////////////////////////////////////////////////////////

erc20Scope
  .task(TASK_TRANSFER, "Transfers erc20 tokens")
  .addOptionalParam("amount", "Amount of erc20 tokens to transfer")
  .addOptionalParam("price", "Bid price (amount = price * quantity)")
  .addOptionalParam(
    "quantity",
    "Bid quantity (amount = price * quantity)",
    undefined,
    types.bigint
  )
  .addOptionalParam("from", "From address or account index (default: deployer)")
  .addParam("to", "To address or account index")
  .addParam("token", "'payment', 'auction' or a token address")
  .addFlag("dryRun")
  .setAction(async function (
    taskArguments: TaskArguments,
    hre: HardhatRuntimeEnvironment
  ) {
    const { deployer } = await hre.getNamedAccounts();

    const _price = toWei(hre, taskArguments.price, undefined);
    const _quantity = taskArguments.quantity;
    const _amount = toWei(hre, taskArguments.amount, undefined);

    let amount;
    if (_amount !== undefined) {
      amount = _amount;
    } else if (_price !== undefined && _quantity !== undefined) {
      amount = _price * _quantity;
    } else {
      console.error(`Unable to compute amount`);
      return;
    }

    let fromAddr;
    if (!taskArguments.from) {
      fromAddr = deployer;
    } else {
      fromAddr = await convertToAddress(hre, taskArguments.from);
      if (!fromAddr) {
        console.error(
          `From: '${taskArguments.from}' not an address or a signer index`
        );
        return;
      }
    }

    const toAddr = await convertToAddress(hre, taskArguments.to);
    if (!toAddr) {
      console.error(
        `To: '${taskArguments.to}' not an address or a signer index`
      );
      return;
    }

    const tokenAddr = await convertToToken(hre, taskArguments.token);

    if (!tokenAddr) {
      console.error(`Unable to resolve token address`);
      return;
    }

    const fromSigner: HardhatEthersSigner = await HardhatEthersSigner.create(
      hre.ethers.provider,
      fromAddr
    );

    const erc20Meta: IERC20Metadata = await hre.ethers.getContractAt(
      "IERC20Metadata",
      tokenAddr
    );
    const sym = await erc20Meta.symbol();
    const erc20: IERC20 = await hre.ethers.getContractAt("IERC20", tokenAddr);

    if (taskArguments.dryRun) {
      const fromBalance = await erc20.balanceOf(fromAddr);
      const toBalance = await erc20.balanceOf(toAddr);

      console.info(`ERC20 address     : ${tokenAddr}`);
      console.info(`ERC20 symbol      : ${sym}`);
      console.info(`from address      : ${fromAddr}`);
      console.info(`to address        : ${toAddr}`);
      console.info(`from balance      : ${fromBalance}`);
      console.info(`to balance        : ${toBalance}`);
      console.info(`amount            : ${amount}`);
      console.info(`from new balance  : ${fromBalance - amount}`);
      console.info(`to new balance    : ${toBalance + amount}`);
      return;
    }

    const tx = await erc20.connect(fromSigner).transfer(toAddr, amount);
    const receipt = await tx.wait(1);

    logGas(hre, receipt, "Transfer");

    console.info(
      `Transfer erc20 tokens ${tokenAddr} from: ${fromAddr} to: ${toAddr} amount: ${amount} (${sym})`
    );
  });

////////////////////////////////////////////////////////////////////////////////
// Balance
////////////////////////////////////////////////////////////////////////////////

erc20Scope
  .task(TASK_BALANCE, "Prints the erc20 token balance of a specified account")
  .addParam("account", "account address or index")
  .addParam("token", "'payment', 'auction' or a token address")
  .setAction(async function (
    taskArguments: TaskArguments,
    hre: HardhatRuntimeEnvironment
  ) {
    const accountAddr = await convertToAddress(hre, taskArguments.account);
    if (!accountAddr) {
      console.error(
        `'${taskArguments.account}' not an address or a signer index`
      );
      return;
    }

    const tokenAddr = await convertToToken(hre, taskArguments.token);

    if (!tokenAddr) {
      console.error(`Unable to resolve token address`);
      return;
    }

    const erc20Meta: IERC20Metadata = await hre.ethers.getContractAt(
      "IERC20Metadata",
      tokenAddr
    );
    const sym = await erc20Meta.symbol();

    const erc20: IERC20 = await hre.ethers.getContractAt("IERC20", tokenAddr);

    const b = await erc20.balanceOf(accountAddr);

    console.info(`ERC20 Balance : ${b} (${sym}) (account: ${accountAddr})`);

    return b;
  });

////////////////////////////////////////////////////////////////////////////////
// Allowance
////////////////////////////////////////////////////////////////////////////////

erc20Scope
  .task(
    TASK_ALLOWANCE,
    "Prints the erc20 token allowance of a given (owner, spender) pair"
  )
  .addParam("owner", "owner address or index")
  .addParam("spender", "spender address or index")
  .addParam("token", "'payment', 'auction' or a token address")
  .setAction(async function (
    taskArguments: TaskArguments,
    hre: HardhatRuntimeEnvironment
  ) {
    const ownerAddr = await convertToAddress(hre, taskArguments.owner);
    if (!ownerAddr) {
      console.error(
        `'${taskArguments.owner}' not an address or a signer index`
      );
      return;
    }

    const spenderAddr = await convertToAddress(hre, taskArguments.spender);
    if (!spenderAddr) {
      console.error(
        `'${taskArguments.spender}' not an address or a signer index`
      );
      return;
    }

    const tokenAddr = await convertToToken(hre, taskArguments.token);
    if (!tokenAddr) {
      console.error(`Unable to resolve token address`);
      return;
    }

    const erc20: IERC20 = await hre.ethers.getContractAt("IERC20", tokenAddr);

    const a = await erc20.allowance(ownerAddr, spenderAddr);

    console.info(
      `Allowance : ${a} (owner: ${ownerAddr}, spender: ${spenderAddr}, token: ${tokenAddr})`
    );

    return a;
  });

////////////////////////////////////////////////////////////////////////////////
// Approve
////////////////////////////////////////////////////////////////////////////////

erc20Scope
  .task(TASK_APPROVE, "Approve erc20 tokens")
  .addParam(
    "amount",
    "Amount of erc20 tokens to allow",
    undefined,
    types.bigint
  )
  .addOptionalParam("owner", "owner address or index (default: deployer)")
  .addParam("spender", "spender address or index")
  .addParam("token", "'payment', 'auction' or a token address")
  .setAction(async function (
    taskArguments: TaskArguments,
    hre: HardhatRuntimeEnvironment
  ) {
    const { deployer } = await hre.getNamedAccounts();

    let ownerAddr;
    if (!taskArguments.owner) {
      ownerAddr = deployer;
    } else {
      ownerAddr = await convertToAddress(hre, taskArguments.owner);
      if (!ownerAddr) {
        console.error(
          `Owner: '${taskArguments.owner}' not an address or a signer index`
        );
        return;
      }
    }

    const spenderAddr = await convertToAddress(hre, taskArguments.spender);
    if (!spenderAddr) {
      console.error(
        `Spender: '${taskArguments.spender}' not an address or a signer index`
      );
      return;
    }

    const tokenAddr = await convertToToken(hre, taskArguments.token);
    if (!tokenAddr) {
      console.error(`Unable to resolve token address`);
      return;
    }

    const ownerSigner: HardhatEthersSigner = await HardhatEthersSigner.create(
      hre.ethers.provider,
      ownerAddr
    );

    const erc20: IERC20 = await hre.ethers.getContractAt("IERC20", tokenAddr);

    const tx = await erc20
      .connect(ownerSigner)
      .approve(spenderAddr, taskArguments.amount);
    const receipt = await tx.wait(1);

    console.info("Approve tx hash: ", receipt!.hash);
    console.info(
      `Approve erc20 tokens ${tokenAddr} owner: ${ownerAddr} spender: ${spenderAddr} amount: ${taskArguments.amount}`
    );
  });

////////////////////////////////////////////////////////////////////////////////
// Set min balance
////////////////////////////////////////////////////////////////////////////////

erc20Scope
  .task(TASK_SET_BALANCE, "Sets the specified account balance to a given value")
  .addParam("token", "'payment', 'auction' or a token address")
  .addParam("account", "account address or index")
  .addOptionalParam(
    "amount",
    "Amount of erc20 tokens to transfer",
    undefined,
    types.bigint
  )
  .addOptionalParam(
    "price",
    "Bid price (amount = price * quantity)",
    undefined,
    types.bigint
  )
  .addOptionalParam(
    "quantity",
    "Bid quantity (amount = price * quantity)",
    undefined,
    types.bigint
  )
  .addFlag("dryRun")
  .setAction(async function (
    taskArguments: TaskArguments,
    hre: HardhatRuntimeEnvironment
  ) {
    const { deployer } = await hre.getNamedAccounts();

    const tokenAddr = await convertToToken(hre, taskArguments.token);
    if (!tokenAddr) {
      console.error(`Unable to resolve token address`);
      return;
    }

    const erc20Meta: IERC20Metadata = await hre.ethers.getContractAt(
      "IERC20Metadata",
      tokenAddr
    );
    const sym = await erc20Meta.symbol();

    const _price = taskArguments.price;
    const _quantity = taskArguments.quantity;
    const _amount = taskArguments.amount;

    let amount;
    if (_amount !== undefined) {
      amount = _amount;
    } else if (_price !== undefined && _quantity !== undefined) {
      amount = _price * _quantity;
    } else {
      console.error(`Unable to compute amount`);
      return;
    }

    const accountAddr = await convertToAddress(hre, taskArguments.account);
    if (!accountAddr) {
      console.error(
        `'${taskArguments.account}' not an address or a signer index`
      );
      return;
    }

    const erc20: IERC20 = await hre.ethers.getContractAt("IERC20", tokenAddr);

    const b = await erc20.balanceOf(accountAddr);

    if (b === amount) {
      console.info(
        `👍 No ERC20 to transfer. Balance : ${b} ${sym} (account: ${accountAddr})`
      );
      return;
    }

    let senderSigner: HardhatEthersSigner;
    let toAddr;
    let diff;

    if (b < amount) {
      senderSigner = await HardhatEthersSigner.create(
        hre.ethers.provider,
        deployer
      );
      toAddr = accountAddr;
      diff = amount - b;
    } else {
      senderSigner = await HardhatEthersSigner.create(
        hre.ethers.provider,
        accountAddr
      );
      toAddr = deployer;
      diff = b - amount;
    }

    const receiverBalance = await erc20.balanceOf(toAddr);
    const senderBalance = await erc20.balanceOf(senderSigner.address);

    if (senderBalance < diff) {
      console.info(`sender balance : ${senderBalance} ${sym}`);
      console.info(`amount         : ${diff} ${sym}`);
      console.error(`Not enough founds!`);
      return;
    }

    if (receiverBalance + diff === amount) {
      assert(toAddr === accountAddr);
    } else if (senderBalance - diff === amount) {
      assert(toAddr === deployer);
    } else {
      throw new FHEAuctionError("Internal error");
    }

    if (taskArguments.dryRun) {
      console.info(`token address         : ${tokenAddr}`);
      console.info(`sender address        : ${senderSigner.address}`);
      console.info(`receiver address      : ${toAddr}`);
      console.info(`receiver balance      : ${receiverBalance} ${sym}`);
      console.info(`receiver new balance  : ${receiverBalance + diff} ${sym}`);
      console.info(`amount to send        : ${diff} ${sym}`);
      console.info(`sender balance        : ${senderBalance} ${sym}`);
      console.info(`sender new balance    : ${senderBalance - diff} ${sym}`);
      return;
    }

    const tx = await erc20.connect(senderSigner).transfer(toAddr, diff);
    const receipt = await tx.wait(1);

    logGas(hre, receipt, "Transfer");

    const newFromBalance = await erc20.balanceOf(senderSigner.address);
    const newToBalance = await erc20.balanceOf(toAddr);

    console.info(
      `ERC20 Balance : ${newToBalance} ${sym} (account: ${toAddr}), ${newFromBalance} ${sym} (account: ${senderSigner.address})`
    );
  });
