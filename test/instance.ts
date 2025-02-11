import {
  createEIP712,
  createInstance as createFhevmInstance,
  generateKeypair,
} from "fhevmjs/node";
import { FhevmInstance } from "fhevmjs/node";
import { network } from "hardhat";

import { ACL_ADDRESS, GATEWAY_URL, KMSVERIFIER_ADDRESS } from "./constants";
import {
  createEncryptedInputMocked,
  reencryptRequestMocked,
} from "./fhevmjsMocked";
import { HardhatRuntimeEnvironment, HttpNetworkConfig } from "hardhat/types";

const kmsAdd = KMSVERIFIER_ADDRESS;
const aclAdd = ACL_ADDRESS;

// export const createInstance = async (): Promise<FhevmInstance> => {
//   if (network.name === "hardhat") {
//     const instance = {
//       reencrypt: reencryptRequestMocked,
//       createEncryptedInput: createEncryptedInputMocked,
//       getPublicKey: () => "0xFFAA44433",
//       generateKeypair: generateKeypair,
//       createEIP712: createEIP712(network.config.chainId),
//     };
//     return instance;
//   } else {
//     const instance = await createFhevmInstance({
//       kmsContractAddress: kmsAdd,
//       aclContractAddress: aclAdd,
//       networkUrl: network.config.url,
//       gatewayUrl: GATEWAY_URL,
//     });
//     return instance;
//   }
// };

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
