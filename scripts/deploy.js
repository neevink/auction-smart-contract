// Script for deploying contracts and creating one NFT
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // Деплоим NFT контракт
  const SimpleNFT = await hre.ethers.getContractFactory("SimpleNFT");
  const simpleNFT = await SimpleNFT.deploy();
  await simpleNFT.deployed();
  console.log("SimpleNFT deployed to:", simpleNFT.address);

  // Создаем (минтим) NFT с метаданными первой картинки
  const metadataURI = "ipfs://bafkreiggcjna3azdjwj3fye7rohxrcitc573mykvz2wtocd73qgvwgz5v4";
  const mintTx = await simpleNFT.mintNFT(deployer.address, metadataURI);
  const receipt = await mintTx.wait();
  
  // Получаем ID созданного NFT из событий
  const event = receipt.events.find(e => e.event === "Transfer");
  const nftId = event.args.tokenId;
  console.log("NFT created with ID:", nftId.toString());
  console.log("NFT metadata:", metadataURI);

  // Деплоим контракт аукциона
  const startingPrice = hre.ethers.utils.parseEther("0.1"); // 0.1 ETH
  const auctionDuration = 300; // 5 минут в секундах

  const Auction = await hre.ethers.getContractFactory("Auction");
  const auction = await Auction.deploy(
    simpleNFT.address,
    nftId,
    startingPrice,
    auctionDuration
  );
  await auction.deployed();
  console.log("Auction deployed to:", auction.address);

  // Одобряем NFT для использования в аукционе
  await simpleNFT.approve(auction.address, nftId);
  console.log("NFT approved for auction");

  // Запускаем аукцион
  await auction.start();
  console.log("Auction successfully started");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
