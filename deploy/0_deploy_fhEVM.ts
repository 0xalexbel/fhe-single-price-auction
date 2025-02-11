import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import {
  ACL_ADDRESS,
  FHEPAYMENT_ADDRESS,
  GATEWAYCONTRACT_ADDRESS,
  INPUTVERIFIER_ADDRESS,
  KMSVERIFIER_ADDRESS,
  PRIVATE_KEY_KMS_SIGNER,
  TFHEEXECUTOR_ADDRESS,
} from "../test/constants";

const OneAddress = "0x0000000000000000000000000000000000000001";

async function impersonateAddress(
  hre: HardhatRuntimeEnvironment,
  address: string,
  amount: bigint
) {
  // for mocked mode
  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [address],
  });
  await hre.network.provider.send("hardhat_setBalance", [
    address,
    hre.ethers.toBeHex(amount),
  ]);
  const impersonatedSigner = await hre.ethers.getSigner(address);
  return impersonatedSigner;
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (hre.network.name === "sepolia") {
    return;
  }

  const aclCode = await hre.ethers.provider.getCode(ACL_ADDRESS);

  const aclArtifact = await import(
    "fhevm-core-contracts/artifacts/contracts/ACL.sol/ACL.json"
  );
  const aclBytecode = aclArtifact.deployedBytecode;

  if (aclCode !== "0x") {
    if (aclArtifact.deployedBytecode !== aclCode) {
      console.error(`ACL bytecode differs`);
      throw new Error("ACL bytecode differs");
    } else {
      console.log(`ACL already deployed at ${ACL_ADDRESS}`);
    }
    return;
  }

  await hre.network.provider.send("hardhat_setCode", [
    ACL_ADDRESS,
    aclBytecode,
  ]);
  const acl = await hre.ethers.getContractAt(aclArtifact.abi, ACL_ADDRESS);

  const execArtifact = await import(
    "fhevm-core-contracts/artifacts/contracts/TFHEExecutorWithEvents.sol/TFHEExecutorWithEvents.json"
  );
  const execBytecode = execArtifact.deployedBytecode;
  await hre.network.provider.send("hardhat_setCode", [
    TFHEEXECUTOR_ADDRESS,
    execBytecode,
  ]);
  const tfheExecutor = await hre.ethers.getContractAt(
    execArtifact.abi,
    TFHEEXECUTOR_ADDRESS
  );

  const kmsArtifact = await import(
    "fhevm-core-contracts/artifacts/contracts/KMSVerifier.sol/KMSVerifier.json"
  );
  const kmsBytecode = kmsArtifact.deployedBytecode;
  await hre.network.provider.send("hardhat_setCode", [
    KMSVERIFIER_ADDRESS,
    kmsBytecode,
  ]);
  const inputArtifact = await import(
    "fhevm-core-contracts/artifacts/contracts/InputVerifier.coprocessor.sol/InputVerifier.json"
  );
  const inputBytecode = inputArtifact.deployedBytecode;
  await hre.network.provider.send("hardhat_setCode", [
    INPUTVERIFIER_ADDRESS,
    inputBytecode,
  ]);
  const fhepaymentArtifact = await import(
    "fhevm-core-contracts/artifacts/contracts/FHEPayment.sol/FHEPayment.json"
  );
  const fhepaymentBytecode = fhepaymentArtifact.deployedBytecode;
  await hre.network.provider.send("hardhat_setCode", [
    FHEPAYMENT_ADDRESS,
    fhepaymentBytecode,
  ]);
  const gatewayArtifact = await import(
    "fhevm-core-contracts/artifacts/gateway/GatewayContract.sol/GatewayContract.json"
  );
  const gatewayBytecode = gatewayArtifact.deployedBytecode;
  await hre.network.provider.send("hardhat_setCode", [
    GATEWAYCONTRACT_ADDRESS,
    gatewayBytecode,
  ]);
  const zero = await impersonateAddress(
    hre,
    hre.ethers.ZeroAddress,
    hre.ethers.parseEther("100")
  );
  const one = await impersonateAddress(
    hre,
    OneAddress,
    hre.ethers.parseEther("100")
  );
  const kmsSigner = new hre.ethers.Wallet(PRIVATE_KEY_KMS_SIGNER);
  const kms = await hre.ethers.getContractAt(
    kmsArtifact.abi,
    KMSVERIFIER_ADDRESS
  );
  //@ts-ignore
  await kms.connect(zero).initialize(OneAddress);
  //@ts-ignore
  await kms.connect(one).addSigner(kmsSigner);
  const input = await hre.ethers.getContractAt(
    inputArtifact.abi,
    INPUTVERIFIER_ADDRESS
  );
  //@ts-ignore
  await input.connect(zero).initialize(OneAddress);
  const gateway = await hre.ethers.getContractAt(
    gatewayArtifact.abi,
    GATEWAYCONTRACT_ADDRESS
  );
  //@ts-ignore
  await gateway.connect(zero).addRelayer(hre.ethers.ZeroAddress);

  console.info(`==============================================`);
  console.info(
    `✅ ACL contract           : ${ACL_ADDRESS} version: ${await acl.getVersion()}`
  );
  console.info(
    `✅ TFHEExectuor contract  : ${TFHEEXECUTOR_ADDRESS} version: ${await tfheExecutor.getVersion()}`
  );
  console.info(
    `✅ KMSVerifier contract   : ${KMSVERIFIER_ADDRESS} version: ${await kms.getVersion()}`
  );
  console.info(
    `✅ InputVerifier contract : ${INPUTVERIFIER_ADDRESS} version: ${await input.getVersion()}`
  );
  console.info(
    `✅ Gateway contract       : ${GATEWAYCONTRACT_ADDRESS} version: ${await gateway.getVersion()}`
  );
  console.info(`==============================================`);
};
export default func;
func.id = "deploy_fhEVM"; // id required to prevent reexecution
func.tags = ["fhEVM"];
