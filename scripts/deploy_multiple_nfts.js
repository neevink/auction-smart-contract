// Script for deploying contracts and creating multiple NFTs
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // Деплоим NFT контракт
  const SimpleNFT = await hre.ethers.getContractFactory("SimpleNFT");
  const simpleNFT = await SimpleNFT.deploy();
  await simpleNFT.deployed();
  console.log("SimpleNFT deployed to:", simpleNFT.address);

  // Список метаданных для всех 4 NFT
  const metadataURIs = [
    "ipfs://bafkreiggcjna3azdjwj3fye7rohxrcitc573mykvz2wtocd73qgvwgz5v4",
    "ipfs://bafkreia4srehxxamu53s3dkskremjjkkm4teoxonkorx6hfxms6jindppy",
    "ipfs://bafkreic7ezgbgdhcrulkg2y7622jkd2amwb3iwnop3phog5u6rmgm7i6jq",
    "ipfs://bafkreidlthctjr3q67gv36axwj5bfnfa43wno7bvomnc46s3c37dyrjmvi"
  ];

  // Создаем все NFT
  const nftIds = [];
  for (let i = 0; i < metadataURIs.length; i++) {
    const mintTx = await simpleNFT.mintNFT(deployer.address, metadataURIs[i]);
    const receipt = await mintTx.wait();
    const event = receipt.events.find(e => e.event === "Transfer");
    const nftId = event.args.tokenId;
    nftIds.push(nftId);
    console.log(`NFT #${nftId.toString()} created with metadata: ${metadataURIs[i]}`);
  }

  // Деплоим аукционы для каждого NFT
  const startingPrice = hre.ethers.utils.parseEther("0.1"); // 0.1 ETH
  const auctionDuration = 86400; // 1 день в секундах

  const Auction = await hre.ethers.getContractFactory("Auction");
  
  for (let i = 0; i < nftIds.length; i++) {
    // Деплоим аукцион для текущего NFT
    const auction = await Auction.deploy(
      simpleNFT.address,
      nftIds[i],
      startingPrice,
      auctionDuration
    );
    await auction.deployed();
    console.log(`Auction for NFT #${nftIds[i].toString()} deployed to: ${auction.address}`);

    // Одобряем NFT для аукциона
    await simpleNFT.approve(auction.address, nftIds[i]);
    
    // Запускаем аукцион
    await auction.start();
    console.log(`Auction for NFT #${nftIds[i].toString()} successfully started`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
