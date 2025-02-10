import { DeployFunction, DeployResult } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { PaymentERC20 } from "../types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployed: DeployResult = await deploy("PaymentERC20", {
    contract: "PaymentERC20",
    from: deployer,
    args: ["PaymentERC20", "PAY"],
    log: true,
    waitConfirmations: 1,
  });

  const signer: HardhatEthersSigner = await HardhatEthersSigner.create(
    hre.ethers.provider,
    deployer
  );

  const token: PaymentERC20 = await hre.ethers.getContractAt(
    "PaymentERC20",
    deployed.address,
    signer
  );

  if ((await token.totalSupply()) == 0n) {
    const tx = await token.mint(signer, 1_000_000_000_000_000_000_000n);
    await tx.wait(1);
  }

  console.info(`PaymentERC20 contract: `, deployed.address);
};
export default func;
func.id = "deploy_PaymentERC20"; // id required to prevent reexecution
func.tags = ["PaymentERC20"];
