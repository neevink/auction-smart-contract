const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NFT Auction", function () {
  let SimpleNFT;
  let simpleNFT;
  let Auction;
  let auction;
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
    Auction = await ethers.getContractFactory("Auction");
    
    // Получаем аккаунты участников
    [owner, bidder1, bidder2] = await ethers.getSigners();
    
    // Деплоим NFT контракт
    simpleNFT = await SimpleNFT.deploy();
    await simpleNFT.deployed();
    
    // Минтим NFT для владельца
    const metadataURI = "ipfs://bafkreiggcjna3azdjwj3fye7rohxrcitc573mykvz2wtocd73qgvwgz5v4";
    const tx = await simpleNFT.mintNFT(
      owner.address, 
      metadataURI
    );
    const receipt = await tx.wait();
    // Получаем ID только что созданного NFT
    const event = receipt.events.find(e => e.event === "Transfer");
    nftId = event.args.tokenId;
    
    // Деплоим контракт аукциона
    auction = await Auction.deploy(
      simpleNFT.address,
      nftId,
      startingPrice,
      auctionDuration
    );
    await auction.deployed();
    
    // Одобряем контракт аукциона для использования NFT
    await simpleNFT.approve(auction.address, nftId);
  });

  // Тестируем создание и запуск аукциона
  describe("Auction Creation and Start", function () {
    it("Should create auction with correct parameters", async function () {
      expect(await auction.owner()).to.equal(owner.address);
      expect(await auction.nftContract()).to.equal(simpleNFT.address);
      expect(await auction.nftId()).to.equal(nftId);
      expect(await auction.startingPrice()).to.equal(startingPrice);
      expect(await auction.duration()).to.equal(auctionDuration);
      expect(await auction.state()).to.equal(0); // Created
    });

    it("Should start auction correctly", async function () {
      await auction.start();
      
      expect(await auction.state()).to.equal(1); // Active
      expect(await simpleNFT.ownerOf(nftId)).to.equal(auction.address);
      
      const endAt = await auction.endAt();
      const startAt = await auction.startAt();
      expect(endAt.sub(startAt)).to.equal(auctionDuration);
    });

    it("Should not allow owner to start auction twice", async function () {
      await auction.start();
      await expect(auction.start()).to.be.revertedWith("Auction already started");
    });
  });

  // Тестируем процесс размещения ставок
  describe("Bidding Process", function () {
    beforeEach(async function () {
      // Запускаем аукцион перед каждым тестом
      await auction.start();
    });

    it("Should allow users to place valid bids", async function () {
      const bidAmount = ethers.utils.parseEther("0.2"); // 0.2 ETH
      
      await auction.connect(bidder1).bid({ value: bidAmount });
      
      expect(await auction.highestBidder()).to.equal(bidder1.address);
      expect(await auction.highestBid()).to.equal(bidAmount);
    });

    it("Should reject bids below starting price", async function () {
      const lowBid = ethers.utils.parseEther("0.05"); // 0.05 ETH
      
      await expect(
        auction.connect(bidder1).bid({ value: lowBid })
      ).to.be.revertedWith("Bid below starting price");
    });

    it("Should reject bids not higher than current highest", async function () {
      const bid1 = ethers.utils.parseEther("0.2"); // 0.2 ETH
      const bid2 = ethers.utils.parseEther("0.2"); // 0.2 ETH
      
      await auction.connect(bidder1).bid({ value: bid1 });
      
      await expect(
        auction.connect(bidder2).bid({ value: bid2 })
      ).to.be.revertedWith("Bid not high enough");
    });

    it("Should handle multiple bids correctly", async function () {
      const bid1 = ethers.utils.parseEther("0.2"); // 0.2 ETH
      const bid2 = ethers.utils.parseEther("0.3"); // 0.3 ETH
      
      await auction.connect(bidder1).bid({ value: bid1 });
      await auction.connect(bidder2).bid({ value: bid2 });
      
      expect(await auction.highestBidder()).to.equal(bidder2.address);
      expect(await auction.highestBid()).to.equal(bid2);
      expect(await auction.pendingReturns(bidder1.address)).to.equal(bid1);
    });

    it("Should not allow owner to bid", async function () {
      const bid = ethers.utils.parseEther("0.2"); // 0.2 ETH
      
      await expect(
        auction.connect(owner).bid({ value: bid })
      ).to.be.revertedWith("Owner cannot bid");
    });
  });

  // Тест на возможность вывода средств
  describe("Funds Withdrawal", function() {
    it("Should allow users to withdraw their outbid amounts", async function() {
      await auction.start();
      
      // Делаем две ставки
      await auction.connect(bidder1).bid({ value: ethers.utils.parseEther("0.2") });
      await auction.connect(bidder2).bid({ value: ethers.utils.parseEther("0.3") });
      
      // Проверяем доступные для возврата средства
      expect(await auction.pendingReturns(bidder1.address)).to.equal(ethers.utils.parseEther("0.2"));
      
      // Сохраняем баланс перед возвратом
      const balanceBefore = await ethers.provider.getBalance(bidder1.address);
      
      // Выполняем возврат
      await auction.connect(bidder1).withdraw();
      
      // Проверяем, что средства возвращены, а pendingReturns обнулился
      expect(await auction.pendingReturns(bidder1.address)).to.equal(0);
      
      // Проверяем увеличение баланса (с учетом затраченного газа)
      const balanceAfter = await ethers.provider.getBalance(bidder1.address);
      expect(balanceAfter.gt(balanceBefore)).to.be.true;
    });
  });

  // Тестируем завершение аукциона с коротким временем для Remix IDE
  describe("Auction End", function() {
    // Деплоим аукцион с очень коротким временем для тестирования
    it("Should correctly end auction with a winning bid", async function() {
      // Создаем отдельный аукцион с очень коротким временем
      const shortDuration = 2; // 2 секунды
      
      const shortAuction = await Auction.deploy(
        simpleNFT.address,
        nftId,
        startingPrice,
        shortDuration
      );
      await shortAuction.deployed();
      
      // Одобряем для этого аукциона
      await simpleNFT.approve(shortAuction.address, nftId);
      
      // Запускаем аукцион
      await shortAuction.start();
      
      // Делаем ставку
      const bid = ethers.utils.parseEther("0.2");
      await shortAuction.connect(bidder1).bid({ value: bid });
      
      // Ждем реальное время вместо манипуляции с блокчейном
      // Функция замедления для Remix
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Проверяем возможность завершения (должно работать после паузы)
      await shortAuction.end();
      
      // Проверяем статус
      expect(await shortAuction.state()).to.equal(2); // Ended
      
      // Проверяем владельца NFT
      expect(await simpleNFT.ownerOf(nftId)).to.equal(bidder1.address);
    });
    
    // Тест возврата NFT при отсутствии ставок
    it("Should return NFT to owner if no bids were made", async function() {
      // Используем отдельный аукцион с коротким временем
      const shortDuration = 2; // 2 секунды
      
      const noBidsAuction = await Auction.deploy(
        simpleNFT.address,
        nftId,
        startingPrice,
        shortDuration
      );
      await noBidsAuction.deployed();
      
      await simpleNFT.approve(noBidsAuction.address, nftId);
      await noBidsAuction.start();
      
      // Ждем реальное время
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Завершаем аукцион
      await noBidsAuction.end();
      
      // Проверяем статус
      expect(await noBidsAuction.state()).to.equal(2); // Ended
      
      // Проверяем, что NFT вернулся владельцу
      expect(await simpleNFT.ownerOf(nftId)).to.equal(owner.address);
    });
  });
});
