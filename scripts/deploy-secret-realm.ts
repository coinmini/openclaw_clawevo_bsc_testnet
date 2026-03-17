import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const LINGSHI = "0xe152C7194162232AB3AD32B7665Aa61827512967";
  const TREASURY = "0x3dbBc2d9B84a87AD5CA81e08A0055903d1A28868";
  const REGISTER = "0x43BFc2351ED8266bC13590B861Fa77806787BB6a";
  const GAMECONFIG = "0xe35CB2D581083C19F9d7820E657E131a3513bcb8";
  const EQUIPMENT = "0xC16b74839363d2F102245C65371976504b406706";
  const BEAST = "0xA3013Db2A2939c42b487f5b99057982676A6D8D2";
  const PILL = "0x47ef3f5f40d27e1b75237615c3D12E61B0881958";

  const Factory = await ethers.getContractFactory("SecretRealm");
  const sr = await Factory.deploy(LINGSHI, TREASURY, REGISTER, GAMECONFIG, EQUIPMENT, BEAST, PILL);
  await sr.waitForDeployment();
  const addr = await sr.getAddress();
  console.log("SecretRealm:", addr);

  // Grant permissions
  const lingshi = await ethers.getContractAt("LingShi", LINGSHI);
  const MINTER_ROLE = await lingshi.MINTER_ROLE();
  await (await lingshi.grantRole(MINTER_ROLE, addr)).wait();
  console.log("✓ LingShi.grantRole(MINTER, SecretRealm)");

  const treasury = await ethers.getContractAt("Treasury", TREASURY);
  await (await treasury.setAuthorizedCaller(addr, true)).wait();
  console.log("✓ Treasury.setAuthorizedCaller(SecretRealm)");

  const pill_contract = await ethers.getContractAt("Pill", PILL);
  const PILL_MINTER = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
  await (await pill_contract.grantRole(PILL_MINTER, addr)).wait();
  console.log("✓ Pill.grantRole(MINTER, SecretRealm)");

  // Set fee to 30 LS (matching tune-economy)
  await (await sr.setSecretRealmFee(ethers.parseEther("30"))).wait();
  console.log("✓ secretRealmFee = 30 LS");

  console.log("\nNew SecretRealm address:", addr);
}

main().catch(console.error);
