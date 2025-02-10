import { DeployFunction, DeployResult } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
// Total deploy : 27_460_688
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const iteratorFactory: DeployResult = await deploy(
    "FHEAuctionEngineIteratorFactory",
    {
      contract: "FHEAuctionEngineIteratorFactory",
      from: deployer,
      log: true,
      waitConfirmations: 1,
    }
  );

  const enginePriceIdFactory: DeployResult = await deploy(
    "FHEAuctionEnginePriceIdFactory",
    {
      contract: "FHEAuctionEnginePriceIdFactory",
      from: deployer,
      args: [iteratorFactory.address],
      log: true,
      waitConfirmations: 1,
    }
  );

  const enginePriceQuantityIdFactory: DeployResult = await deploy(
    "FHEAuctionEnginePriceQuantityIdFactory",
    {
      contract: "FHEAuctionEnginePriceQuantityIdFactory",
      from: deployer,
      args: [iteratorFactory.address],
      log: true,
      waitConfirmations: 1,
    }
  );

  const enginePriceRandomFactory: DeployResult = await deploy(
    "FHEAuctionEnginePriceRandomFactory",
    {
      contract: "FHEAuctionEnginePriceRandomFactory",
      from: deployer,
      args: [iteratorFactory.address],
      log: true,
      waitConfirmations: 1,
    }
  );

  const engineProRataFactory: DeployResult = await deploy(
    "FHEAuctionEngineProRataFactory",
    {
      contract: "FHEAuctionEngineProRataFactory",
      from: deployer,
      args: [iteratorFactory.address],
      log: true,
      waitConfirmations: 1,
    }
  );

  const details = {
    enginePriceIdFactory: enginePriceIdFactory.address,
    enginePriceQuantityIdFactory: enginePriceQuantityIdFactory.address,
    enginePriceRandomFactory: enginePriceRandomFactory.address,
    engineProRataFactory: engineProRataFactory.address,
  };

  const auctionERC20Factory: DeployResult = await deploy(
    "FHEAuctionERC20Factory",
    {
      contract: "FHEAuctionERC20Factory",
      from: deployer,
      args: [details],
      log: true,
      waitConfirmations: 1,
    }
  );

  const auctionNativeFactory: DeployResult = await deploy(
    "FHEAuctionNativeFactory",
    {
      contract: "FHEAuctionNativeFactory",
      from: deployer,
      args: [details],
      log: true,
      waitConfirmations: 1,
    }
  );
};

export default func;
func.id = "deploy_auctionFactories"; // id required to prevent reexecution
func.tags = ["AuctionFactories"];
