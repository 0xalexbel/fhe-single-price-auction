import { types, scope } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { IERC20, IERC20Metadata, PaymentERC20 } from "../types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { convertToAddress, convertToToken, logGas, toWei } from "./utils";

const erc20Scope = scope("erc20", "ERC20 related commands");

erc20Scope
  .task("ttest")
  .addOptionalParam("amount", "Amount of erc20 tokens to transfer")
  .setAction(async function (
    taskArguments: TaskArguments,
    hre: HardhatRuntimeEnvironment
  ) {
    console.log(toWei(hre, taskArguments.amount, 0n));
  });

erc20Scope
  .task("transfer", "Transfers erc20 tokens")
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

erc20Scope
  .task("balance", "Prints the erc20 token balance of a specified account")
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
  });

erc20Scope
  .task(
    "allowance",
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
  });

erc20Scope
  .task("approve", "Approve erc20 tokens")
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
