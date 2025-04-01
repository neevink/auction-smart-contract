const hre = require("hardhat");

async function main() {
  // Деплоим NFT контракт
  const SimpleNFT = await hre.ethers.getContractFactory("SimpleNFT");
  const simpleNFT = await SimpleNFT.deploy();
  await simpleNFT.deployed();
  console.log("SimpleNFT deployed to:", simpleNFT.address);

  // Используем URI метаданных с IPFS
  // Замените на CID вашего JSON файла метаданных
  const metadataURI = "ipfs://bafkreiea4huwnawmaqdbq3kawds5ivyuwl2nbdb5xsm3gcagssxtdbizgy"; 
  const [deployer] = await hre.ethers.getSigners();
  
  // Минтим NFT с указанными метаданными
  const mintTx = await simpleNFT.mintNFT(
    deployer.address,
    metadataURI
  );
  const receipt = await mintTx.wait();
  const event = receipt.events.find(e => e.event === "Transfer");
  const nftId = event.args.tokenId;
  console.log("NFT minted with ID:", nftId.toString());
  console.log("Metadata URI:", metadataURI);

  // Остальная часть скрипта (для аукциона)...
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
