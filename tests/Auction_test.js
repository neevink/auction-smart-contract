const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NFT Auction", function () {
  let SimpleNFT;
  let simpleNFT;
  let EnglishAuction;
  let englishAuction;
  let owner;
  let bidder1;
  let bidder2;
  let nftId;
  const startingPrice = ethers.utils.parseEther("0.1"); // 0.1 ETH
  const auctionDuration = 86400; // 1 день в секундах

  // Подготавливаем все перед каждым тестом
  beforeEach(async function () {
    // Получаем контракты
    SimpleNFT = await ethers.getContractFactory("SimpleNFT");
    EnglishAuction = await ethers.getContractFactory("EnglishAuction");
    
    // Получаем аккаунты участников
    [owner, bidder1, bidder2] = await ethers.getSigners();
    
    // Деплоим NFT контракт
    simpleNFT = await SimpleNFT.deploy();
    await simpleNFT.deployed();
    
    // Минтим NFT для владельца
    const tx = await simpleNFT.mintNFT(
      owner.address, 
      "https://example.com/nft-metadata.json"
    );
    const receipt = await tx.wait();
    // Получаем ID только что созданного NFT
    const event = receipt.events.find(e => e.event === "Transfer");
    nftId = event.args.tokenId;
    
    // Деплоим контракт аукциона
    englishAuction = await EnglishAuction.deploy(
      simpleNFT.address,
      nftId,
      startingPrice,
      auctionDuration
    );
    await englishAuction.deployed();
    
    // Одобряем контракт аукциона для использования NFT
    await simpleNFT.approve(englishAuction.address, nftId);
  });

  // Тестируем создание и запуск аукциона
  describe("Auction Creation and Start", function () {
    it("Should create auction with correct parameters", async function () {
      expect(await englishAuction.owner()).to.equal(owner.address);
      expect(await englishAuction.nftContract()).to.equal(simpleNFT.address);
      expect(await englishAuction.nftId()).to.equal(nftId);
      expect(await englishAuction.startingPrice()).to.equal(startingPrice);
      expect(await englishAuction.duration()).to.equal(auctionDuration);
      expect(await englishAuction.state()).to.equal(0); // Created
    });

    it("Should start auction correctly", async function () {
      await englishAuction.start();
      
      expect(await englishAuction.state()).to.equal(1); // Active
      expect(await simpleNFT.ownerOf(nftId)).to.equal(englishAuction.address);
      
      const endAt = await englishAuction.endAt();
      const startAt = await englishAuction.startAt();
      expect(endAt.sub(startAt)).to.equal(auctionDuration);
    });

    it("Should not allow owner to start auction twice", async function () {
      await englishAuction.start();
      await expect(englishAuction.start()).to.be.revertedWith("Auction already started");
    });
  });

  // Тестируем процесс размещения ставок
  describe("Bidding Process", function () {
    beforeEach(async function () {
      // Запускаем аукцион перед каждым тестом
      await englishAuction.start();
    });

    it("Should allow users to place valid bids", async function () {
      const bidAmount = ethers.utils.parseEther("0.2"); // 0.2 ETH
      
      await englishAuction.connect(bidder1).bid({ value: bidAmount });
      
      expect(await englishAuction.highestBidder()).to.equal(bidder1.address);
      expect(await englishAuction.highestBid()).to.equal(bidAmount);
    });

    it("Should reject bids below starting price", async function () {
      const lowBid = ethers.utils.parseEther("0.05"); // 0.05 ETH
      
      await expect(
        englishAuction.connect(bidder1).bid({ value: lowBid })
      ).to.be.revertedWith("Bid below starting price");
    });

    it("Should reject bids not higher than current highest", async function () {
      const bid1 = ethers.utils.parseEther("0.2"); // 0.2 ETH
      const bid2 = ethers.utils.parseEther("0.2"); // 0.2 ETH
      
      await englishAuction.connect(bidder1).bid({ value: bid1 });
      
      await expect(
        englishAuction.connect(bidder2).bid({ value: bid2 })
      ).to.be.revertedWith("Bid not high enough");
    });

    it("Should handle multiple bids correctly", async function () {
      const bid1 = ethers.utils.parseEther("0.2"); // 0.2 ETH
      const bid2 = ethers.utils.parseEther("0.3"); // 0.3 ETH
      
      await englishAuction.connect(bidder1).bid({ value: bid1 });
      await englishAuction.connect(bidder2).bid({ value: bid2 });
      
      expect(await englishAuction.highestBidder()).to.equal(bidder2.address);
      expect(await englishAuction.highestBid()).to.equal(bid2);
      expect(await englishAuction.pendingReturns(bidder1.address)).to.equal(bid1);
    });

    it("Should not allow owner to bid", async function () {
      const bid = ethers.utils.parseEther("0.2"); // 0.2 ETH
      
      await expect(
        englishAuction.connect(owner).bid({ value: bid })
      ).to.be.revertedWith("Owner cannot bid");
    });
  });

  // Тестируем завершение аукциона и выплаты
  describe("Auction End and Settlement", function () {
    beforeEach(async function () {
      // Запускаем аукцион перед каждым тестом
      await englishAuction.start();
    });

    it("Should allow users to withdraw their outbid amounts", async function () {
      const bid1 = ethers.utils.parseEther("0.2"); // 0.2 ETH
      const bid2 = ethers.utils.parseEther("0.3"); // 0.3 ETH
      
      await englishAuction.connect(bidder1).bid({ value: bid1 });
      await englishAuction.connect(bidder2).bid({ value: bid2 });
      
      const bidder1BalanceBefore = await ethers.provider.getBalance(bidder1.address);
      
      await englishAuction.connect(bidder1).withdraw();
      
      const bidder1BalanceAfter = await ethers.provider.getBalance(bidder1.address);
      
      // Проверяем, что bidder1 получил свою ставку обратно (с учетом газа)
      expect(bidder1BalanceAfter.sub(bidder1BalanceBefore)).to.be.closeTo(
        bid1,
        ethers.utils.parseEther("0.01") // Допускаем небольшую погрешность на газ
      );
      
      // Проверяем, что pendingReturns обнулился
      expect(await englishAuction.pendingReturns(bidder1.address)).to.equal(0);
    });

it("Should correctly end auction with a winning bid", async function () {
  // Настройка более короткого аукциона для теста
  const shortDuration = 2; // 2 секунды
  
  // Деплоим новый аукцион с коротким периодом
  const shortAuction = await EnglishAuction.deploy(
    simpleNFT.address,
    nftId,
    startingPrice,
    shortDuration
  );
  await shortAuction.deployed();
  
  // Одобряем передачу NFT для короткого аукциона
  await simpleNFT.approve(shortAuction.address, nftId);
  
  // Запускаем аукцион
  await shortAuction.start();
  
  // Делаем ставку
  const bid = ethers.utils.parseEther("0.2"); // 0.2 ETH
  await shortAuction.connect(bidder1).bid({ value: bid });
  
  // Записываем начальный баланс владельца
  const ownerBalanceBefore = await ethers.provider.getBalance(owner.address);
  
  // Ждем реальное время вместо манипуляций с блокчейном
  await new Promise(resolve => setTimeout(resolve, 3000)); // ждем 3 секунды
  
  // Завершаем аукцион
  await shortAuction.end();
  
  // Проверяем, что NFT передан победителю
  expect(await simpleNFT.ownerOf(nftId)).to.equal(bidder1.address);
  
  // Проверяем статус аукциона
  expect(await shortAuction.state()).to.equal(2); // Ended
});

it("Should return NFT to owner if no bids", async function () {
      // Перематываем время вперед, чтобы аукцион завершился
      await ethers.provider.send("evm_increaseTime", [auctionDuration + 1]);
      await ethers.provider.send("evm_mine");
      
      await englishAuction.end();
      
      // Проверяем, что NFT вернулся владельцу
      expect(await simpleNFT.ownerOf(nftId)).to.equal(owner.address);
      
      // Проверяем статус аукциона
      expect(await englishAuction.state()).to.equal(2); // Ended
    });
  });
});
