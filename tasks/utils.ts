import { ContractTransactionReceipt } from "ethers";
import { HardhatRuntimeEnvironment, HttpNetworkConfig } from "hardhat/types";
import {
  createEIP712,
  createInstance as createFhevmInstance,
  FhevmInstance,
  generateKeypair,
} from "fhevmjs/node";
import {
  ACL_ADDRESS,
  GATEWAY_URL,
  KMSVERIFIER_ADDRESS,
  TFHEEXECUTOR_ADDRESS,
} from "../test/constants";
import {
  createEncryptedInputMocked,
  reencryptRequestMocked,
} from "../test/fhevmjsMocked";
import {
  FHEAuctionBase,
  FHEAuctionERC20,
  FHEAuctionERC20Factory,
  FHEAuctionFactory,
  FHEAuctionNative,
  FHEAuctionNativeFactory,
  IERC20,
} from "../types";
import { FHEAuctionError } from "./error";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

export interface FHEAuctionResolution {
  address: string;
  isNative: boolean;
  base: FHEAuctionBase;
  erc20?: FHEAuctionERC20;
  native?: FHEAuctionNative;
  auction: FHEAuctionERC20 | FHEAuctionNative;
  factory: FHEAuctionFactory;
  factoryERC20?: FHEAuctionERC20Factory;
  factoryNative?: FHEAuctionNativeFactory;
  auctionTokenAddress: string;
  auctionToken: IERC20;
  paymentTokenAddress?: string;
  paymentToken?: IERC20;
}

export async function resolveDeployedAddressOrThrow(
  hre: HardhatRuntimeEnvironment,
  name: string,
  contractAddr: any,
  messagePrefix?: string
) {
  try {
    return !contractAddr
      ? (await hre.deployments.get(name)).address
      : hre.ethers.getAddress(contractAddr);
  } catch {
    throw new FHEAuctionError(
      `Unable to resolve deployed address '${contractAddr}'.`,
      messagePrefix
    );
  }
}

export async function convertToAddressOrThrow(
  hre: HardhatRuntimeEnvironment,
  addrOrIndex: any,
  messagePrefix?: string
): Promise<string> {
  const addr = await convertToAddress(hre, addrOrIndex);
  if (!addr) {
    throw new FHEAuctionError(
      `Unable to resolve address '${addrOrIndex}', expecting a valid address or a valid signer index.`,
      messagePrefix
    );
  }
  return addr;
}

export async function resolveSignerOrThrow(
  hre: HardhatRuntimeEnvironment,
  addrOrIndex: any,
  messagePrefix?: string
) {
  const address = await convertToAddressOrThrow(
    hre,
    addrOrIndex,
    messagePrefix
  );

  const signer: HardhatEthersSigner = await HardhatEthersSigner.create(
    hre.ethers.provider,
    address
  );

  return signer;
}

export function convertToSaltBytes32OrThrow(
  hre: HardhatRuntimeEnvironment,
  salt: any,
  messagePrefix?: string
): Uint8Array {
  try {
    if (salt === undefined) {
      salt = hre.ethers.toBeHex(
        hre.ethers.toBigInt(hre.ethers.randomBytes(32))
      );
    } else if (!hre.ethers.isHexString(salt, 32)) {
      salt = hre.ethers.keccak256(Buffer.from(salt));
    }
    return hre.ethers.toBeArray(salt);
  } catch {
    throw new FHEAuctionError(`Invalid salt value.`, messagePrefix);
  }
}

export async function convertToAddress(
  hre: HardhatRuntimeEnvironment,
  addrOrIndex: any
): Promise<string | undefined> {
  const signers = await hre.ethers.getSigners();
  if (typeof addrOrIndex !== "string") {
    return undefined;
  }
  let address = undefined;
  try {
    address = hre.ethers.getAddress(addrOrIndex);
  } catch {}
  if (!address) {
    const signerIndex = Number.parseInt(addrOrIndex, 10);
    if (Number.isNaN(signerIndex)) {
      return undefined;
    }
    address = signers[signerIndex].address;
  }
  return address;
}

export async function convertToToken(
  hre: HardhatRuntimeEnvironment,
  token: any
) {
  let tokenAddr;
  if (token === "payment") {
    tokenAddr = (await hre.deployments.get("PaymentERC20")).address;
  } else if (token === "auction") {
    tokenAddr = (await hre.deployments.get("AuctionERC20")).address;
  } else {
    tokenAddr = await convertToAddress(hre, token);
  }

  if (!tokenAddr) {
    return undefined;
  }

  return tokenAddr;
}

export function logGas(
  hre: HardhatRuntimeEnvironment,
  receipt: ContractTransactionReceipt | null,
  prefix?: string
) {
  if (!receipt) {
    return 0n;
  }

  if (!prefix) {
    prefix = "";
  } else {
    prefix = prefix + " : ";
  }

  console.info(`${prefix}Tx        : ${receipt?.hash}`);
  console.info(`${prefix}Gas used  : ${receipt?.gasUsed}`);

  if (receipt?.gasUsed !== undefined && receipt?.gasPrice !== undefined) {
    const gwei = hre.ethers.formatUnits(receipt.gasPrice, "gwei");
    console.info(`${prefix}Gas price : ${receipt.gasPrice} (${gwei} Gwei)`);

    const eth = hre.ethers.formatUnits(
      receipt.gasPrice * receipt.gasUsed,
      "ether"
    );
    console.info(
      `${prefix}Tx fee    : ${receipt.gasPrice * receipt.gasUsed} (${eth} ETH)`
    );
    return receipt.gasPrice * receipt.gasUsed;
  }

  return 0n;
}

export function toWei(
  hre: HardhatRuntimeEnvironment,
  num: any,
  defaultValue: bigint | undefined
): bigint | undefined {
  if (num === null || num === undefined) {
    return defaultValue;
  }
  if (typeof num === "bigint") {
    return num;
  }
  if (typeof num === "number") {
    if (num < 0) {
      return undefined;
    }
    return BigInt(Math.floor(num));
  }
  if (typeof num !== "string") {
    return undefined;
  }

  num = num.toLowerCase();
  let unit: string = "wei";
  if (num.endsWith("gwei")) {
    num = num.slice(undefined, num.length - 4);
    unit = "gwei";
  } else if (num.endsWith("wei")) {
    num = num.slice(undefined, num.length - 4);
    unit = "wei";
  } else if (num.endsWith("eth")) {
    num = num.slice(undefined, num.length - 3);
    unit = "ether";
  } else if (num.endsWith("ether")) {
    num = num.slice(undefined, num.length - 5);
    unit = "ether";
  } else {
    unit = "wei";
  }

  return hre.ethers.parseUnits(num, unit);
}

export async function createInstance(
  hre: HardhatRuntimeEnvironment
): Promise<FhevmInstance> {
  if (hre.network.name === "hardhat" || hre.network.name === "localhost") {
    const instance = {
      reencrypt: async (
        handle: bigint,
        privateKey: string,
        publicKey: string,
        signature: string,
        contractAddress: string,
        userAddress: string
      ) => {
        return reencryptRequestMocked(
          hre,
          handle,
          privateKey,
          publicKey,
          signature,
          contractAddress,
          userAddress
        );
      },
      createEncryptedInput: (contractAddress: string, userAddress: string) => {
        return createEncryptedInputMocked(hre, contractAddress, userAddress);
      },
      getPublicKey: () => "0xFFAA44433",
      generateKeypair: generateKeypair,
      createEIP712: createEIP712(hre.network.config.chainId!),
    };
    //@ts-ignore
    return instance;
  } else {
    const httpNetworkConfig: HttpNetworkConfig = hre.network
      .config as HttpNetworkConfig;
    const instance = await createFhevmInstance({
      kmsContractAddress: KMSVERIFIER_ADDRESS,
      aclContractAddress: ACL_ADDRESS,
      networkUrl: httpNetworkConfig.url,
      gatewayUrl: GATEWAY_URL,
    });
    return instance;
  }
}

export async function checkNonZeroAddressOrThrow(
  hre: HardhatRuntimeEnvironment,
  address: any,
  messagePrefix?: string
) {
  try {
    const addr = hre.ethers.getAddress(address);
    if (addr === hre.ethers.ZeroAddress) {
      throw Error;
    }
    return addr;
  } catch {
    throw new FHEAuctionError("Invalid non-zero address.", messagePrefix);
  }
}

export async function resolveAuctionAddressOrThrow(
  hre: HardhatRuntimeEnvironment,
  auctionType?: any,
  salt?: any,
  beneficiary?: any,
  auctionToken?: any,
  paymentToken?: any
) {
  if (auctionType !== "erc20" && auctionType !== "native") {
    throw new FHEAuctionError(
      "Invalid --type argument, expecting 'erc20' or 'native'"
    );
  }

  beneficiary = await convertToAddressOrThrow(
    hre,
    beneficiary,
    "Invalid --beneficiary argument."
  );

  const saltBytes32 = convertToSaltBytes32OrThrow(
    hre,
    salt,
    "Invalid --salt argument."
  );

  const paymentTokenAddress = await resolveDeployedAddressOrThrow(
    hre,
    "PaymentERC20",
    paymentToken,
    "Invalid --payment-token argument."
  );

  const auctionTokenAddress = await resolveDeployedAddressOrThrow(
    hre,
    "AuctionERC20",
    auctionToken,
    "Invalid --auction-token argument."
  );

  let factory: FHEAuctionERC20Factory | FHEAuctionNativeFactory;
  let auctionAddr: string;

  if (auctionType === "erc20") {
    const erc20Factory: FHEAuctionERC20Factory = await hre.ethers.getContractAt(
      "FHEAuctionERC20Factory",
      (
        await hre.deployments.get("FHEAuctionERC20Factory")
      ).address
    );
    factory = erc20Factory;
    auctionAddr = await erc20Factory.getAuction(
      saltBytes32,
      beneficiary,
      auctionTokenAddress,
      paymentTokenAddress
    );
    if (auctionAddr === hre.ethers.ZeroAddress) {
      throw new FHEAuctionError(`ERC20 auction ${auctionAddr} does not exist.`);
    }
  } else {
    const nativeFactory: FHEAuctionNativeFactory =
      await hre.ethers.getContractAt(
        "FHEAuctionNativeFactory",
        (
          await hre.deployments.get("FHEAuctionNativeFactory")
        ).address
      );
    factory = nativeFactory;
    auctionAddr = await nativeFactory.getAuction(
      saltBytes32,
      beneficiary,
      auctionTokenAddress
    );
    if (auctionAddr === hre.ethers.ZeroAddress) {
      throw new FHEAuctionError(
        `Native auction ${auctionAddr} does not exist.`
      );
    }
  }

  return {
    address: auctionAddr,
    beneficiary,
    saltBytes32,
    paymentTokenAddress,
    auctionTokenAddress,
    factory,
  };
}

export async function resolveAuctionOrThrow(
  hre: HardhatRuntimeEnvironment,
  address?: any,
  auctionType?: any,
  salt?: any,
  beneficiary?: any,
  auctionToken?: any,
  paymentToken?: any
) {
  let auctionAddr: string;
  let paymentTokenAddress: string | undefined = undefined;
  let auctionTokenAddress: string = hre.ethers.ZeroAddress;

  if (address) {
    auctionAddr = await checkNonZeroAddressOrThrow(hre, address);
  } else {
    if (auctionType === undefined) {
      throw new FHEAuctionError(
        `Unable to resolve auction address. Either use the --address argument or the 5 arguments together: --beneficiary, --type, --salt, --auction-token and --payment-token`
      );
    }
    const res = await resolveAuctionAddressOrThrow(
      hre,
      auctionType,
      salt,
      beneficiary,
      auctionToken,
      paymentToken
    );
    auctionAddr = res.address;
    auctionTokenAddress = res.auctionTokenAddress;
    paymentTokenAddress = res.paymentTokenAddress
      ? res.paymentTokenAddress
      : hre.ethers.ZeroAddress;
  }

  const auctionBase: FHEAuctionBase = await hre.ethers.getContractAt(
    "FHEAuctionBase",
    auctionAddr
  );

  try {
    const code = await auctionBase.getDeployedCode();
    if (!code) {
      throw Error;
    }
  } catch {
    throw new FHEAuctionError(
      `Auction at address ${auctionAddr} is not deployed.`
    );
  }

  let resolvedAuctionType: "erc20" | "native";
  let auctionERC20: FHEAuctionERC20 | undefined = undefined;
  let auctionNative: FHEAuctionNative | undefined = undefined;
  let auction: FHEAuctionERC20 | FHEAuctionNative;
  let factoryERC20: FHEAuctionERC20Factory | undefined;
  let factoryNative: FHEAuctionNativeFactory | undefined;
  let factory: FHEAuctionERC20Factory | FHEAuctionNativeFactory;
  let auctionTokenIERC20: IERC20;
  let paymentTokenIERC20: IERC20 | undefined = undefined;

  const isNative = await auctionBase.isNative();
  if (isNative) {
    resolvedAuctionType = "native";
    auctionNative = await hre.ethers.getContractAt(
      "FHEAuctionNative",
      auctionAddr
    );
    factoryNative = await hre.ethers.getContractAt(
      "FHEAuctionNativeFactory",
      (
        await hre.deployments.get("FHEAuctionNativeFactory")
      ).address
    );
    auction = auctionNative;
    factory = factoryNative;
    paymentTokenAddress = undefined;
  } else {
    resolvedAuctionType = "erc20";
    auctionERC20 = await hre.ethers.getContractAt(
      "FHEAuctionERC20",
      auctionAddr
    );
    factoryERC20 = await hre.ethers.getContractAt(
      "FHEAuctionERC20Factory",
      (
        await hre.deployments.get("FHEAuctionERC20Factory")
      ).address
    );
    auction = auctionERC20;
    factory = factoryERC20;
    paymentTokenAddress = await auction.paymentToken();
    paymentTokenIERC20 = await hre.ethers.getContractAt(
      "IERC20",
      paymentTokenAddress
    );
  }

  auctionTokenAddress = await auction.auctionToken();

  auctionTokenIERC20 = await hre.ethers.getContractAt(
    "IERC20",
    auctionTokenAddress
  );

  return {
    isNative,
    auctionType: resolvedAuctionType,
    address: auctionAddr,
    base: auctionBase,
    auction,
    erc20: auctionERC20,
    native: auctionNative,
    factoryERC20,
    factoryNative,
    factory,
    auctionTokenAddress,
    auctionToken: auctionTokenIERC20,
    paymentTokenAddress,
    paymentToken: paymentTokenIERC20,
  };
}

export async function resolveAuctionSigners(
  hre: HardhatRuntimeEnvironment,
  auction: FHEAuctionBase
) {
  const ownerAddress = await auction.owner();
  const beneficiaryAddress = await auction.beneficiary();

  const beneficiary: HardhatEthersSigner = await HardhatEthersSigner.create(
    hre.ethers.provider,
    beneficiaryAddress
  );
  const owner: HardhatEthersSigner = await HardhatEthersSigner.create(
    hre.ethers.provider,
    ownerAddress
  );

  return {
    owner,
    beneficiary,
  };
}

export async function resolveBidderOrThrow(
  hre: HardhatRuntimeEnvironment,
  auction: FHEAuctionBase,
  bidder: any
) {
  const bidderAddress = await convertToAddressOrThrow(
    hre,
    bidder,
    "Invalid --bidder argument."
  );

  const bidderSigner: HardhatEthersSigner = await HardhatEthersSigner.create(
    hre.ethers.provider,
    bidderAddress
  );

  return {
    address: bidderAddress,
    signer: bidderSigner,
    registered: await auction.connect(bidderSigner).registered(),
  };
}

export async function approveOrThrow(
  auctionAddress: string,
  token: IERC20,
  minAmountToAllow: bigint,
  owner: HardhatEthersSigner,
  approveIfNeeded: boolean
) {
  const quantity = minAmountToAllow;
  const balance = await token.balanceOf(owner);
  if (balance < quantity) {
    throw new FHEAuctionError(
      `Account ${owner.address} does not own enough ERC20 tokens (${token.target}). Balance is ${balance}, expecting at least ${minAmountToAllow}.`
    );
  }

  let allowance = await token.allowance(owner, auctionAddress);

  if (allowance >= minAmountToAllow) {
    return null;
  }

  if (!approveIfNeeded) {
    throw new FHEAuctionError(
      `Account ${owner.address} has not approved enough tokens to be transfered to auction ${auctionAddress}. Allowance is ${allowance}, expecting ${minAmountToAllow}.`
    );
  }

  // Try to approve
  const tx = await token
    .connect(owner)
    .approve(auctionAddress, minAmountToAllow);
  const receipt = await tx.wait(1);

  // Verify
  allowance = await token.allowance(owner, auctionAddress);

  if (allowance < minAmountToAllow) {
    throw new FHEAuctionError(
      `Account ${owner.address} allowance verification failed. (auction = ${auctionAddress})`
    );
  }

  return receipt;
}

export async function checkBeneficiaryAuctionTokenApproval(
  auction: FHEAuctionResolution,
  beneficiary: HardhatEthersSigner,
  approveIfNeeded: boolean
) {
  const quantity = await auction.base.auctionQuantity();
  const balance = await auction.auctionToken.balanceOf(beneficiary);
  if (balance < quantity) {
    throw new FHEAuctionError(
      `Auction beneficiary ${beneficiary} does not own enough ERC20 auction tokens. Balance is ${balance}, expecting at least the auction quantity = ${quantity}.`
    );
  }

  let allowance = await auction.auctionToken.allowance(
    beneficiary,
    auction.address
  );

  if (allowance >= quantity) {
    return null;
  }

  if (!approveIfNeeded) {
    throw new FHEAuctionError(
      `Beneficiary ${beneficiary.address} has not approved enough auction tokens to be transfered to auction ${auction.address}. Allowance is ${allowance}, expecting ${quantity}.`
    );
  }

  // Try to approve
  const tx = await auction.auctionToken
    .connect(beneficiary)
    .approve(auction.address, quantity);
  const receipt = await tx.wait(1);

  // Verify
  allowance = await auction.auctionToken.allowance(
    beneficiary,
    auction.address
  );

  if (allowance < quantity) {
    throw new FHEAuctionError(
      `Beneficiary ${beneficiary.address} allowance verification failed. (auction = ${auction.address})`
    );
  }

  return receipt;
}

export async function depositOrThrow(
  auction: FHEAuctionResolution,
  bidder: HardhatEthersSigner,
  currentBalance: bigint,
  amount: bigint
) {
  if (amount === 0n) {
    return null;
  }

  let receipt: null | ContractTransactionReceipt;

  if (auction.isNative) {
    const tx = await (auction.auction as FHEAuctionNative)
      .connect(bidder)
      .deposit({
        value: amount,
      });
    receipt = await tx.wait(1);
  } else {
    const tx = await (auction.auction as FHEAuctionERC20)
      .connect(bidder)
      .deposit(amount);
    receipt = await tx.wait(1);
  }

  // Verify
  const balance = await auction.auction.balanceOf(bidder);
  if (balance !== currentBalance + amount) {
    throw new FHEAuctionError(
      `Deposit transaction succeeded but the new deposit balance is ${balance}. Expecting ${
        currentBalance + amount
      }.`
    );
  }

  return receipt;
}

export async function canBidOrThrow(
  hre: HardhatRuntimeEnvironment,
  auction: FHEAuctionResolution,
  checkPriceAndQuantity: boolean,
  bidder: any,
  price?: bigint,
  quantity?: bigint
) {
  if (price === undefined && checkPriceAndQuantity) {
    throw new FHEAuctionError(
      "Missing price value",
      "Invalid --price argument."
    );
  }
  if (quantity === undefined && checkPriceAndQuantity) {
    throw new FHEAuctionError(
      "Missing quantity value",
      "Invalid --quantity argument."
    );
  }

  const statusCode = await auction.base.statusCode();
  if (statusCode >= BigInt("0x7")) {
    throw new FHEAuctionError(
      `Cannot place/cancel bid because auction ${auction.address} is closed.`
    );
  }

  if (statusCode < BigInt("0x3")) {
    throw new FHEAuctionError(
      `Cannot place/cancel bid because auction ${auction.address} is not open. Run 'auction start' before.`
    );
  }

  const resolvedBidder = await resolveBidderOrThrow(hre, auction.base, bidder);
  if (resolvedBidder.registered) {
    throw new FHEAuctionError(
      `Bidder ${resolvedBidder.address} has already placed a bid`
    );
  }

  const maxBidCount = await auction.base.maximumBidCount();
  const bidCount = await auction.base.bidCount();
  if (bidCount >= maxBidCount) {
    throw new FHEAuctionError(
      `Maximum number of bidders reached (max=${maxBidCount})`
    );
  }

  if (price === undefined || quantity === undefined) {
    return {
      bidder: resolvedBidder,
      requiredDeposit: undefined,
      depositBalance: undefined,
      missingDeposit: undefined,
    };
  }

  const requiredDeposit: bigint = price * quantity;

  const minimumPaymentDeposit = await auction.base.minimumDeposit();
  const bidderDepositBalance = await auction.auction.balanceOf(
    resolvedBidder.address
  );

  const finalDeposit =
    requiredDeposit < minimumPaymentDeposit
      ? minimumPaymentDeposit
      : requiredDeposit;
  if (finalDeposit < bidderDepositBalance) {
    throw new FHEAuctionError(
      `Not enough deposit. Bidder ${resolvedBidder.address} must deposit at least ${finalDeposit} to place the specified bid.`
    );
  }

  return {
    bidder: resolvedBidder,
    requiredDeposit: finalDeposit,
    depositBalance: bidderDepositBalance,
    missingDeposit: finalDeposit - bidderDepositBalance,
  };
}

export function parseComputeEvents(
  receipt: ContractTransactionReceipt,
  auction: FHEAuctionBase
) {
  // Parse logs using the contract's interface
  const parsedLogs = receipt.logs
    .map((log) => {
      try {
        return auction.interface.parseLog(log);
      } catch (error) {
        return null; // Ignore logs that do not match any event
      }
    })
    .filter((event) => event !== null); // Remove null values

  const ComputeAuctionCyclesEvent = parsedLogs.find(
    (event) => event.name === "ComputeAuctionCycles"
  );

  const requestedCycles = ComputeAuctionCyclesEvent?.args[0] as bigint;
  const statusCode = ComputeAuctionCyclesEvent?.args[1] as bigint;
  const startIterProgress = ComputeAuctionCyclesEvent?.args[2] as bigint;
  const endIterProgress = ComputeAuctionCyclesEvent?.args[3] as bigint;

  return {
    requestedCycles,
    statusCode,
    computedCycles: endIterProgress - startIterProgress,
    startProgress: startIterProgress,
    endProgress: endIterProgress,
  };
}

export async function parseAllEvents(hre: HardhatRuntimeEnvironment) {
  const abi = [
    "event FheAdd(uint256 lhs, uint256 rhs, bytes1 scalarByte, uint256 result)",
    "event FheSub(uint256 lhs, uint256 rhs, bytes1 scalarByte, uint256 result)",
    "event FheMul(uint256 lhs, uint256 rhs, bytes1 scalarByte, uint256 result)",
    "event FheDiv(uint256 lhs, uint256 rhs, bytes1 scalarByte, uint256 result)",
    "event FheRem(uint256 lhs, uint256 rhs, bytes1 scalarByte, uint256 result)",
    "event FheBitAnd(uint256 lhs, uint256 rhs, bytes1 scalarByte, uint256 result)",
    "event FheBitOr(uint256 lhs, uint256 rhs, bytes1 scalarByte, uint256 result)",
    "event FheBitXor(uint256 lhs, uint256 rhs, bytes1 scalarByte, uint256 result)",
    "event FheShl(uint256 lhs, uint256 rhs, bytes1 scalarByte, uint256 result)",
    "event FheShr(uint256 lhs, uint256 rhs, bytes1 scalarByte, uint256 result)",
    "event FheRotl(uint256 lhs, uint256 rhs, bytes1 scalarByte, uint256 result)",
    "event FheRotr(uint256 lhs, uint256 rhs, bytes1 scalarByte, uint256 result)",
    "event FheEq(uint256 lhs, uint256 rhs, bytes1 scalarByte, uint256 result)",
    "event FheEqBytes(uint256 lhs, bytes rhs, bytes1 scalarByte, uint256 result)",
    "event FheNe(uint256 lhs, uint256 rhs, bytes1 scalarByte, uint256 result)",
    "event FheNeBytes(uint256 lhs, bytes rhs, bytes1 scalarByte, uint256 result)",
    "event FheGe(uint256 lhs, uint256 rhs, bytes1 scalarByte, uint256 result)",
    "event FheGt(uint256 lhs, uint256 rhs, bytes1 scalarByte, uint256 result)",
    "event FheLe(uint256 lhs, uint256 rhs, bytes1 scalarByte, uint256 result)",
    "event FheLt(uint256 lhs, uint256 rhs, bytes1 scalarByte, uint256 result)",
    "event FheMin(uint256 lhs, uint256 rhs, bytes1 scalarByte, uint256 result)",
    "event FheMax(uint256 lhs, uint256 rhs, bytes1 scalarByte, uint256 result)",
    "event FheNeg(uint256 ct, uint256 result)",
    "event FheNot(uint256 ct, uint256 result)",
    "event VerifyCiphertext(bytes32 inputHandle,address userAddress,bytes inputProof,bytes1 inputType,uint256 result)",
    "event Cast(uint256 ct, bytes1 toType, uint256 result)",
    "event TrivialEncrypt(uint256 pt, bytes1 toType, uint256 result)",
    "event TrivialEncryptBytes(bytes pt, bytes1 toType, uint256 result)",
    "event FheIfThenElse(uint256 control, uint256 ifTrue, uint256 ifFalse, uint256 result)",
    "event FheRand(bytes1 randType, uint256 result)",
    "event FheRandBounded(uint256 upperBound, bytes1 randType, uint256 result)",
  ];

  const contract = new hre.ethers.Contract(
    TFHEEXECUTOR_ADDRESS,
    abi,
    hre.ethers.provider
  );

  console.log("TFHEEXECUTOR_ADDRESS=" + TFHEEXECUTOR_ADDRESS);
  // Fetch all events emitted by the contract
  const filter = {
    //address: TFHEEXECUTOR_ADDRESS,
    fromBlock: 0,
    toBlock: "latest",
  };

  const logs = await hre.ethers.provider.getLogs(filter);

  const events = logs
    .map((log) => {
      try {
        const parsedLog = contract.interface.parseLog(log);
        return {
          eventName: parsedLog!.name,
          args: parsedLog!.args,
        };
      } catch {
        // If the log cannot be parsed, skip it
        console.log("NULL");
        return null;
      }
    })
    .filter((event) => event !== null);

  for (let i = 0; i < events.length; ++i) {
    if (events[i].eventName === "FheIfThenElse") {
      console.log(
        `${i + 1}/${events.length} EVENT ${events[i].eventName} args[3]:${
          events[i].args[3]
        }`
      );
    } else {
      console.log(
        `${i + 1}/${events.length} EVENT ${events[i].eventName} args[0]:${
          events[i].args[0]
        }`
      );
    }
  }
}
