import { DeployFunction, DeployResult } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { AuctionERC20 } from "../types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployed: DeployResult = await deploy("AuctionERC20", {
    contract: "AuctionERC20",
    from: deployer,
    args: ["AuctionERC20", "AUC"],
    log: true,
    waitConfirmations: 1,
  });

  const signer: HardhatEthersSigner = await HardhatEthersSigner.create(
    hre.ethers.provider,
    deployer
  );

  const token: AuctionERC20 = await hre.ethers.getContractAt(
    "AuctionERC20",
    deployed.address,
    signer
  );

  if ((await token.totalSupply()) == 0n) {
    const tx = await token.mint(signer, 1_000_000_000_000_000_000_000n);
    await tx.wait(1);
  }

  console.info(`AuctionERC20 contract: `, deployed.address);
};
export default func;
func.id = "deploy_AuctionERC20"; // id required to prevent reexecution
func.tags = ["AuctionERC20"];
