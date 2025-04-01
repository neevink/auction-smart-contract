// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/**
 * @title EnglishAuction
 * @dev Реализация английского аукциона для продажи NFT
 */
contract EnglishAuction {
    // Структура для отслеживания состояния аукциона
    enum AuctionState { Created, Active, Ended }
    
    // Параметры аукциона
    address public immutable owner;          // Владелец аукциона
    address public immutable nftContract;    // Адрес контракта NFT
    uint256 public immutable nftId;          // ID токена NFT
    uint256 public immutable startingPrice;  // Минимальная цена
    uint256 public immutable duration;       // Продолжительность аукциона
    uint256 public startAt;                  // Время начала аукциона
    uint256 public endAt;                    // Время окончания аукциона
    AuctionState public state;               // Текущее состояние
    
    // Информация о ставках
    address public highestBidder;            // Адрес участника с максимальной ставкой
    uint256 public highestBid;               // Сумма максимальной ставки
    mapping(address => uint256) public pendingReturns; // Возвраты участникам
    
    // События для логирования
    event Start();
    event Bid(address indexed bidder, uint256 amount);
    event Withdraw(address indexed bidder, uint256 amount);
    event End(address winner, uint256 amount);
    
    // Модификаторы
    modifier onlyOwner() {
        require(msg.sender == owner, "Not the auction owner");
        _;
    }
    
    modifier notOwner() {
        require(msg.sender != owner, "Owner cannot bid");
        _;
    }
    
    modifier notStarted() {
        require(state == AuctionState.Created, "Auction already started");
        _;
    }
    
    modifier inProgress() {
        require(state == AuctionState.Active, "Auction not active");
        require(block.timestamp < endAt, "Auction already ended");
        _;
    }
    
    modifier auctionEnded() {
        require(block.timestamp >= endAt || state == AuctionState.Ended, 
                "Auction still in progress");
        _;
    }
    
    constructor(
        address _nftContract,
        uint256 _nftId,
        uint256 _startingPrice,
        uint256 _duration
    ) {
        owner = msg.sender;
        nftContract = _nftContract;
        nftId = _nftId;
        startingPrice = _startingPrice;
        duration = _duration;
        state = AuctionState.Created;
    }
    
    function start() external onlyOwner notStarted {
        IERC721(nftContract).transferFrom(msg.sender, address(this), nftId);
        
        startAt = block.timestamp;
        endAt = startAt + duration;
        
        state = AuctionState.Active;
        
        emit Start();
    }
    
    function bid() external payable notOwner inProgress {
        require(msg.value > startingPrice, "Bid below starting price");
        require(msg.value > highestBid, "Bid not high enough");
        
        if (highestBidder != address(0)) {
            pendingReturns[highestBidder] += highestBid;
        }
        
        highestBidder = msg.sender;
        highestBid = msg.value;
        
        emit Bid(msg.sender, msg.value);
    }
    
    function withdraw() external {
        uint256 amount = pendingReturns[msg.sender];
        require(amount > 0, "No funds to withdraw");
        
        pendingReturns[msg.sender] = 0;
        
        payable(msg.sender).transfer(amount);
        
        emit Withdraw(msg.sender, amount);
    }
    
    function end() external auctionEnded {
        if (state == AuctionState.Ended) return;
        
        state = AuctionState.Ended;
        
        if (highestBidder != address(0)) {
            IERC721(nftContract).transferFrom(address(this), highestBidder, nftId);
            payable(owner).transfer(highestBid);
        } else {
            IERC721(nftContract).transferFrom(address(this), owner, nftId);
        }
        
        emit End(highestBidder, highestBid);
    }
}
