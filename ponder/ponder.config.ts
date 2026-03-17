import { createConfig } from "ponder";
import { RegisterAbi } from "./abis/Register";
import { BattleAbi } from "./abis/Battle";
import { MarketAbi } from "./abis/Market";
import { CultivationAbi } from "./abis/Cultivation";
import { HuntAbi } from "./abis/Hunt";
import { TreasureAbi } from "./abis/Treasure";
import { EquipmentAbi } from "./abis/Equipment";
import { BeastAbi } from "./abis/Beast";
import { CaveHeavenAbi } from "./abis/CaveHeaven";
import { TaoAbi } from "./abis/Tao";
import { SectAbi } from "./abis/Sect";
import { SecretRealmAbi } from "./abis/SecretRealm";
import { TreasuryAbi } from "./abis/Treasury";

export default createConfig({
  database: {
    kind: "postgres",
    connectionString: process.env.DATABASE_URL,
  },
  chains: {
    bscTestnet: {
      id: 97,
      rpc: process.env.PONDER_RPC_URL_97,
    },
  },
  contracts: {
    Register: {
      abi: RegisterAbi.abi,
      chain: "bscTestnet",
      address: "0xFEceDB3796DA00F43B3C8189007182607240f532",
      startBlock: 93292939,
    },
    Battle: {
      abi: BattleAbi.abi,
      chain: "bscTestnet",
      address: "0xC5e4e7F50C4DB5F07623C90B37eb2AD80DF40347",
      startBlock: 93292939,
    },
    Market: {
      abi: MarketAbi.abi,
      chain: "bscTestnet",
      address: "0x9eefd9fBEE25Edc23483FF4eba4ee5324d7F2896",
      startBlock: 93292939,
    },
    Cultivation: {
      abi: CultivationAbi.abi,
      chain: "bscTestnet",
      address: "0xB8D4f0f1BC9691dA59661b2d36B5123ACB8b0AaD",
      startBlock: 93292939,
    },
    Hunt: {
      abi: HuntAbi.abi,
      chain: "bscTestnet",
      address: "0x7D926A55581398028a49A98eC9D57F1a9BFe89D6",
      startBlock: 94844073,
    },
    Treasure: {
      abi: TreasureAbi.abi,
      chain: "bscTestnet",
      address: "0xc5d583C2fdF23033c959652567A83c798b71121a",
      startBlock: 93292939,
    },
    Equipment: {
      abi: EquipmentAbi.abi,
      chain: "bscTestnet",
      address: "0x9e4DAAe0B1Fd884dC42Cd48f5CB00D1AA7573d15",
      startBlock: 93292939,
    },
    Beast: {
      abi: BeastAbi.abi,
      chain: "bscTestnet",
      address: "0x826345248f15c01513Fc53ed17bC2cb03BCC35A5",
      startBlock: 93292939,
    },
    CaveHeaven: {
      abi: CaveHeavenAbi.abi,
      chain: "bscTestnet",
      address: "0xF8d04475Ef8c3F9f490E9365eC16Fd2e20843f4F",
      startBlock: 93292939,
    },
    Tao: {
      abi: TaoAbi.abi,
      chain: "bscTestnet",
      address: "0x0dAE949Cb62E5C3685EE2e4640D768e9900ED928",
      startBlock: 93292939,
    },
    Sect: {
      abi: SectAbi.abi,
      chain: "bscTestnet",
      address: "0x0091C43E7951859713d7a61480965A1Aac9C6b14",
      startBlock: 93292939,
    },
    SecretRealm: {
      abi: SecretRealmAbi.abi,
      chain: "bscTestnet",
      address: "0xA856860f5912999e8D9847E79c022C390ad89ac5",
      startBlock: 93292939,
    },
    Treasury: {
      abi: TreasuryAbi.abi,
      chain: "bscTestnet",
      address: "0xdF29944e7e300296256cFa748b569691868Faa66",
      startBlock: 93292939,
    },
  },
});
