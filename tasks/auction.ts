import { types, scope } from "hardhat/config";
import type {
  ConfigurableTaskDefinition,
  RunSuperFunction,
  TaskArguments,
} from "hardhat/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import {
  approveOrThrow,
  canBidOrThrow,
  checkBeneficiaryAuctionTokenApproval,
  createInstance,
  depositOrThrow,
  FHEAuctionResolution,
  logGas,
  parseComputeEvents,
  resolveAuctionOrThrow,
  resolveAuctionSigners,
  resolveBidderOrThrow,
  resolveSignerOrThrow,
} from "./utils";
import { FHEAuctionError } from "./error";
import {
  SCOPE_AUCTION_TASK_BID,
  SCOPE_AUCTION_TASK_BLINDCLAIM,
  SCOPE_AUCTION_TASK_CANBID,
  SCOPE_AUCTION_TASK_CLAIM_INFO,
  SCOPE_AUCTION_TASK_COMPUTE,
  SCOPE_AUCTION_TASK_INFO,
} from "./task-names";

const auctionScope = scope("auction", "Auction related commands");

////////////////////////////////////////////////////////////////////////////////
// Infos
////////////////////////////////////////////////////////////////////////////////

export type FHEAuctionActionType<TaskArgumentsT extends TaskArguments> = (
  auction: FHEAuctionResolution,
  taskArgs: TaskArgumentsT,
  env: HardhatRuntimeEnvironment,
  runSuper: RunSuperFunction<TaskArgumentsT>
) => Promise<any>;

function declareAuctionTask(
  taskDef: ConfigurableTaskDefinition,
  auctionAction: FHEAuctionActionType<TaskArguments>
): ConfigurableTaskDefinition {
  return taskDef
    .addOptionalParam("address", "Auction address", undefined, types.string)
    .addOptionalParam(
      "type",
      "Auction type 'erc20' or 'native'",
      undefined,
      types.string
    )
    .addOptionalParam("salt", "Auction salt", undefined, types.string)
    .addOptionalParam(
      "beneficiary",
      "Address or index of the auction beneficiary"
    )
    .addOptionalParam(
      "auctionToken",
      "Address of the ERC20 token sold in the auction (default: the pre-deployed AuctionERC20 contract address)"
    )
    .addOptionalParam(
      "paymentToken",
      "Address of the auction's payment ERC20 token (default: the pre-deployed PaymentERC20 contract address)"
    )
    .setAction(async function (
      taskArgs: TaskArguments,
      env: HardhatRuntimeEnvironment,
      runSuper
    ) {
      const res = await resolveAuctionOrThrow(
        env,
        taskArgs.address,
        taskArgs.type,
        taskArgs.salt,
        taskArgs.beneficiary,
        taskArgs.auctionToken,
        taskArgs.paymentToken
      );
      if (!res) {
        console.error(`Unable to retrieve auction address.`);
        return;
      }
      return auctionAction(res, taskArgs, env, runSuper);
    });
}

////////////////////////////////////////////////////////////////////////////////
// auction info
////////////////////////////////////////////////////////////////////////////////

declareAuctionTask(
  auctionScope.task(SCOPE_AUCTION_TASK_INFO, "Show auction infos"),
  async function (
    auction: FHEAuctionResolution,
    taskArguments: TaskArguments,
    hre: HardhatRuntimeEnvironment
  ) {
    console.info(`Address                 : ${auction.address}`);
    console.info(
      `Beneficiary             : ${await auction.base.beneficiary()}`
    );
    console.info(
      `Quantity                : ${await auction.base.auctionQuantity()}`
    );
    console.info(
      `Auction token           : ${await auction.base.auctionToken()}`
    );

    if (!auction.isNative) {
      console.info(
        `Payment token           : ${await auction.erc20!.paymentToken()}`
      );
    }

    console.info(
      `Payment penalty         : ${await auction.base.paymentPenalty()}`
    );

    const open = await auction.base.isOpen();
    if (open) {
      console.info(
        `Stoppable               : ${await auction.base.stoppable()}`
      );
    }
    console.info(
      `Bid count                      : ${await auction.base.bidCount()}`
    );
    console.info(
      `Maximum bid count              : ${await auction.base.maximumBidCount()}`
    );
    console.info(
      `Min iterations for blind claim : ${await auction.base.minIterationsForBlindClaim()}`
    );
    console.info(
      `Computed iterations            : ${await auction.base.computedIterations()}`
    );
    console.info(
      `Initialized                    : ${await auction.base.initialized()}`
    );
    console.info(`Open                           : ${open}`);
    console.info(
      `Closed                         : ${await auction.base.closed()}`
    );
    console.info(
      `Terminated                     : ${await auction.base.terminated()}`
    );
  }
);

////////////////////////////////////////////////////////////////////////////////
// Start auction (accept new bids)
////////////////////////////////////////////////////////////////////////////////

declareAuctionTask(
  auctionScope
    .task("start", "Start auction")
    .addFlag(
      "noApproval",
      "Does not perform any beneficiary missing ERC20 auction token approval."
    )
    .addFlag(
      "nonStoppable",
      "Speficies that the auction should not be manually stoppable."
    )
    .addParam(
      "duration",
      "Duration in seconds of the auction",
      undefined,
      types.bigint
    ),
  async function (
    auction: FHEAuctionResolution,
    taskArguments: TaskArguments,
    hre: HardhatRuntimeEnvironment
  ) {
    const durationSeconds = taskArguments.duration as bigint;
    if (durationSeconds == 0n) {
      throw new FHEAuctionError(
        "Expecting a non-zero value.",
        "Invalid --duration argument."
      );
    }

    if ((await auction.base.statusCode()) >= BigInt("0x3")) {
      console.info(`Auction at address ${auction.address} is already started.`);
      return;
    }

    const signers = await resolveAuctionSigners(hre, auction.base);

    // Checks if the beneficiary owns enough auction tokens to be sold during the auction.
    let receipt = await checkBeneficiaryAuctionTokenApproval(
      auction,
      signers.beneficiary,
      !taskArguments.noApproval
    );

    let totalFee = logGas(hre, receipt, "Token approval");

    // Starts auction
    const tx = await auction.base
      .connect(signers.owner)
      .start(durationSeconds, !taskArguments.nonStoppable);
    receipt = await tx.wait(1);

    totalFee += logGas(hre, receipt, "Auction start");

    const eth = hre.ethers.formatUnits(totalFee, "ether");

    // Verify
    if (await auction.base.isOpen()) {
      console.info(
        `Auction at address ${auction.address} is now open. (Total fee: ${eth} ETH)`
      );
    } else {
      console.info(
        `Auction at address ${auction.address} has been started successfully, but is not yet open. (Total fee: ${eth} ETH)`
      );
    }
  }
);

////////////////////////////////////////////////////////////////////////////////
// Stop auction (stop accepting new bids)
////////////////////////////////////////////////////////////////////////////////

declareAuctionTask(
  auctionScope.task("stop", "Stop auction"),
  async function (
    auction: FHEAuctionResolution,
    taskArguments: TaskArguments,
    hre: HardhatRuntimeEnvironment
  ) {
    // First, check status
    const statusCode = await auction.base.statusCode();
    if (statusCode >= BigInt("0x7")) {
      console.info(`Auction at address ${auction.address} is already stopped.`);
      return;
    }

    // Second, check if can be stopped
    const canStop = await auction.base.canStop();
    if (!canStop) {
      console.info(`Auction at address ${auction.address} cannot be stopped.`);
      return;
    }

    const signers = await resolveAuctionSigners(hre, auction.base);

    // Stops auction
    const tx = await auction.base.connect(signers.owner).stop();
    const receipt = await tx.wait(1);

    const totalFee = logGas(hre, receipt, "Auction start");

    const eth = hre.ethers.formatUnits(totalFee, "ether");

    // Verify
    if (!(await auction.base.closed())) {
      console.error(
        `Auction at address ${auction.address} has been stopped successfully, but is not yet closed. (Total fee: ${eth} ETH)`
      );
      return;
    }

    console.info(
      `Auction at address ${auction.address} is now closed and is ready for computation. (Total fee: ${eth} ETH)`
    );
  }
);

////////////////////////////////////////////////////////////////////////////////
// can-bid (test if a bidder can place a bid)
////////////////////////////////////////////////////////////////////////////////

declareAuctionTask(
  auctionScope
    .task(SCOPE_AUCTION_TASK_CANBID, "checks if bidder can place a bid")
    .addParam("bidder", "Bidder address")
    .addOptionalParam("price", "Bid price", undefined, types.bigint)
    .addOptionalParam("quantity", "Bid quantity", undefined, types.bigint),
  async function (
    auction: FHEAuctionResolution,
    taskArguments: TaskArguments,
    hre: HardhatRuntimeEnvironment
  ) {
    const res = await canBidOrThrow(
      hre,
      auction,
      false,
      taskArguments.bidder,
      taskArguments.price,
      taskArguments.quantity
    );

    if (res.requiredDeposit === undefined) {
      console.info(`Bidder ${res.bidder.address} can place a bid.`);
    } else {
      console.info(
        `Bidder ${res.bidder.address} can place the bid = [price: ${taskArguments.price}, quantity: ${taskArguments.quantity}], with ${res.requiredDeposit} as a required minimum deposit.`
      );
    }
  }
);

////////////////////////////////////////////////////////////////////////////////
// Bid
////////////////////////////////////////////////////////////////////////////////

declareAuctionTask(
  auctionScope
    .task(SCOPE_AUCTION_TASK_BID, "Place a new bid")
    .addParam("bidder", "Bidder address")
    .addParam("price", "Bid price", undefined, types.bigint)
    .addParam("quantity", "Bid quantity", undefined, types.bigint),
  async function (
    auction: FHEAuctionResolution,
    taskArguments: TaskArguments,
    hre: HardhatRuntimeEnvironment
  ) {
    const res = await canBidOrThrow(
      hre,
      auction,
      true,
      taskArguments.bidder,
      taskArguments.price,
      taskArguments.quantity
    );

    let receipt;
    let totalFee = 0n;

    // If deposit is needed
    if (res.missingDeposit! > 0) {
      // Approval (only when using ERC20 payment token)
      if (auction.paymentToken) {
        receipt = await approveOrThrow(
          auction.address,
          auction.paymentToken,
          res.missingDeposit!,
          res.bidder.signer,
          true
        );
        totalFee += logGas(hre, receipt, "Approve payment token");
      }
      // Deposit
      receipt = await depositOrThrow(
        auction,
        res.bidder.signer,
        res.depositBalance!,
        res.missingDeposit!
      );

      totalFee += logGas(hre, receipt, "Deposit");
    }

    const fhevm = await createInstance(hre);

    const input = fhevm.createEncryptedInput(
      auction.address,
      res.bidder.address
    );
    input.add256(taskArguments.price);
    input.add256(taskArguments.quantity);
    const enc = await input.encrypt();

    const tx = await auction.base
      .connect(res.bidder.signer)
      .bid(enc.handles[0], enc.handles[1], enc.inputProof);
    receipt = await tx.wait(1);

    totalFee += logGas(hre, receipt, "Bid");

    console.info(`Auction address           : ${auction.address}`);
    console.info(`Bidder address            : ${res.bidder.address}`);
    console.info(`Bid price                 : ${taskArguments.price}`);
    console.info(`Bid quantity              : ${taskArguments.quantity}`);
    console.info(`Bidder additional deposit : ${res.missingDeposit!}`);
    console.info(
      `Bid total fee          : ${hre.ethers.formatUnits(
        totalFee,
        "ether"
      )} ETH`
    );
  }
);

////////////////////////////////////////////////////////////////////////////////
// Compute
////////////////////////////////////////////////////////////////////////////////

declareAuctionTask(
  auctionScope
    .task(SCOPE_AUCTION_TASK_COMPUTE, "Compute auction")
    .addParam("worker", "Worker address")
    .addOptionalParam("gasLimit", "Gas limit", undefined, types.bigint)
    .addFlag("blindClaim", "Stops when the auction is ready for blind claim")
    .addOptionalParam(
      "count",
      "Number of working cycles",
      BigInt(1),
      types.bigint
    ),
  async function (
    auction: FHEAuctionResolution,
    taskArguments: TaskArguments,
    hre: HardhatRuntimeEnvironment
  ) {
    if (taskArguments.count < 1n) {
      throw new FHEAuctionError(
        `Minimum value is 1`,
        "Invalid --count argument"
      );
    }

    const minIterForBlindClaim =
      await auction.base.minIterationsForBlindClaim();
    const minIterForClaim = await auction.base.minIterationsForClaim();
    const computedIter = await auction.base.computedIterations();

    const maxIter = taskArguments.blindClaim
      ? minIterForBlindClaim
      : minIterForClaim;

    if (computedIter >= maxIter) {
      if (taskArguments.blindClaim) {
        console.info(`✅ Auction ${auction.address} is ready for blind claim`);
      } else {
        console.info(`✅ Auction ${auction.address} is ready for claim`);
      }
      return;
    }

    const worker = await resolveSignerOrThrow(
      hre,
      auction.base,
      taskArguments.worker,
      "Invalid --worker argument."
    );

    if (!(await auction.base.closed())) {
      const endTime = await auction.base.endTime();
      const blockTimeStamp = (await hre.ethers.provider.getBlock("latest"))
        ?.timestamp;

      throw new FHEAuctionError(
        `Auction is not closed. Wait for the ${
          endTime - BigInt(blockTimeStamp!)
        }s`
      );
    }

    const tx = await auction.base
      .connect(worker)
      .computeAuction(taskArguments.count, taskArguments.blindClaim, {
        gasLimit: taskArguments.gasLimit,
      });

    const receipt = await tx.wait(1);
    const report = parseComputeEvents(receipt!, auction.base);

    logGas(hre, receipt, `Compute`);

    console.info(`Compute : Num cycles : ${report.computedCycles}`);
    if (taskArguments.blindClaim) {
      console.info(
        `Compute : Progress   : ${
          (report.endProgress * 100n) / maxIter
        }% (before ready for blind claim)`
      );
    } else {
      console.info(
        `Compute : Progress   : ${
          (report.endProgress * 100n) / maxIter
        }% (before ready for claim)`
      );
    }

    if (report.endProgress >= maxIter) {
      if (taskArguments.blindClaim) {
        console.info(`✅ Auction ${auction.address} is ready for blind claim`);
      } else {
        console.info(`✅ Auction ${auction.address} is ready for claim`);
      }
    }
  }
);

////////////////////////////////////////////////////////////////////////////////
// Blind claim
////////////////////////////////////////////////////////////////////////////////

declareAuctionTask(
  auctionScope
    .task(
      SCOPE_AUCTION_TASK_BLINDCLAIM,
      "Blind claim. Each registered bidder can perform a blind claim. (Beta version)"
    )
    .addParam("bidder", "Bidder address")
    .addOptionalParam("gasLimit", "Gas limit", undefined, types.bigint)
    .addFlag("forceClaimAgain", "Force re-execute a blind claim."),
  async function (
    auction: FHEAuctionResolution,
    taskArguments: TaskArguments,
    hre: HardhatRuntimeEnvironment
  ) {
    const resolvedBidder = await resolveBidderOrThrow(
      hre,
      auction.base,
      taskArguments.bidder
    );

    if (!resolvedBidder.registered) {
      throw new FHEAuctionError(
        `Bidder ${resolvedBidder.address} is not a registered bidder`,
        "Invalid --bidder argument."
      );
    }

    if (!(await auction.base.connect(resolvedBidder.signer).canBlindClaim())) {
      throw new FHEAuctionError("Auction is not ready for blind claim");
    }

    if (!taskArguments.forceClaimAgain) {
      if (await auction.base.connect(resolvedBidder.signer).hasBlindClaimed()) {
        console.info(
          `✅ Bidder ${resolvedBidder.address} has already sent a blind claim.`
        );
        return;
      }
    }

    if (
      await auction.base.connect(resolvedBidder.signer).blindClaimCompleted()
    ) {
      console.info(
        `✅ Bidder ${resolvedBidder.address} has successfully completed their assigned blind claim.`
      );
      return;
    }

    const tx = await auction.base
      .connect(resolvedBidder.signer)
      .blindClaim({ gasLimit: taskArguments.gasLimit });
    const receipt = await tx.wait(1);

    logGas(hre, receipt, `Blind claim`);
  }
);

////////////////////////////////////////////////////////////////////////////////
// Count
////////////////////////////////////////////////////////////////////////////////

declareAuctionTask(
  auctionScope.task(
    SCOPE_AUCTION_TASK_CLAIM_INFO,
    "Prints auction claim infos."
  ),
  async function (
    auction: FHEAuctionResolution,
    taskArguments: TaskArguments,
    hre: HardhatRuntimeEnvironment
  ) {
    const bidCount = await auction.base.bidCount();
    const totalClaimsCompleted = await auction.base.totalClaimsCompleted();
    const totalBlindClaimsRequested =
      await auction.base.totalBlindClaimsRequested();

    console.info(
      `Total claims completed       : ${totalClaimsCompleted} / ${bidCount}`
    );
    console.info(
      `Total blind claims requested : ${totalBlindClaimsRequested} / ${bidCount}`
    );
  }
);
