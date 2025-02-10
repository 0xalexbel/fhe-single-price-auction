import { NomicLabsHardhatPluginError } from "hardhat/plugins";

export class FHEAuctionError extends NomicLabsHardhatPluginError {
  constructor(message: string, prefix?: string, parent?: Error) {
    if (prefix) {
      message = prefix + message;
    }
    super("FHEAuction", message, parent);
  }
}
