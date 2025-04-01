// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/**
 * @title Auction
 * @dev Реализация английского аукциона для NFT токенов
 */
contract Auction {
    // Перечисление для отслеживания состояния аукциона
    enum AuctionState { Created, Active, Ended }
    
    // Параметры аукциона
    address public immutable owner;          // Владелец аукциона
    address public immutable nftContract;    // Адрес контракта NFT
    uint256 public immutable nftId;          // ID токена NFT
    uint256 public immutable startingPrice;  // Минимальная начальная цена
    uint256 public immutable duration;       // Продолжительность аукциона в секундах
    uint256 public startAt;                  // Время начала аукциона
    uint256 public endAt;                    // Время окончания аукциона
    AuctionState public state;               // Текущее состояние аукциона
    
    // Информация о ставках
    address public highestBidder;            // Адрес участника с максимальной ставкой
    uint256 public highestBid;               // Сумма максимальной ставки
    mapping(address => uint256) public pendingReturns; // Возвраты средств участникам
    
    // События для логирования активности
    event Start();
    event Bid(address indexed bidder, uint256 amount);
    event Withdraw(address indexed bidder, uint256 amount);
    event End(address winner, uint256 amount);
    
    // Модификаторы для проверки условий
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
    
    /**
     * @dev Конструктор устанавливает параметры аукциона
     * @param _nftContract Адрес контракта NFT
     * @param _nftId ID токена NFT
     * @param _startingPrice Начальная цена аукциона в wei
     * @param _duration Продолжительность аукциона в секундах
     */
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
    
    /**
     * @dev Запускает аукцион
     * NFT должен быть предварительно одобрен для использования этим контрактом
     */
    function start() external onlyOwner notStarted {
        // Передаем NFT от владельца на контракт аукциона
        IERC721(nftContract).transferFrom(msg.sender, address(this), nftId);
        
        // Устанавливаем временные рамки аукциона
        startAt = block.timestamp;
        endAt = startAt + duration;
        
        // Меняем статус аукциона
        state = AuctionState.Active;
        
        emit Start();
    }
    
    /**
     * @dev Размещение ставки в аукционе
     * Ставка должна быть выше начальной цены и текущей высшей ставки
     */
    function bid() external payable notOwner inProgress {
        require(msg.value > startingPrice, "Bid below starting price");
        require(msg.value > highestBid, "Bid not high enough");
        
        // Если уже есть ставки, возвращаем предыдущему лидеру деньги
        if (highestBidder != address(0)) {
            pendingReturns[highestBidder] += highestBid;
        }
        
        // Обновляем информацию о текущем лидере и его ставке
        highestBidder = msg.sender;
        highestBid = msg.value;
        
        emit Bid(msg.sender, msg.value);
    }
    
    /**
     * @dev Позволяет участникам вернуть свои средства, если их ставка перебита
     */
    function withdraw() external {
        uint256 amount = pendingReturns[msg.sender];
        require(amount > 0, "No funds to withdraw");
        
        // Защита от повторного входа (re-entrancy)
        pendingReturns[msg.sender] = 0;
        
        // Возвращаем средства участнику
        payable(msg.sender).transfer(amount);
        
        emit Withdraw(msg.sender, amount);
    }
    
    /**
     * @dev Завершает аукцион и выполняет необходимые переводы
     * Может быть вызвана после истечения времени аукциона
     */
    function end() external auctionEnded {
        // Защита от повторного вызова
        if (state == AuctionState.Ended) return;
        
        state = AuctionState.Ended;
        
        if (highestBidder != address(0)) {
            // Если была ставка, передаем NFT победителю
            IERC721(nftContract).transferFrom(address(this), highestBidder, nftId);
            // Отправляем деньги владельцу аукциона
            payable(owner).transfer(highestBid);
        } else {
            // Если ставок не было, возвращаем NFT владельцу
            IERC721(nftContract).transferFrom(address(this), owner, nftId);
        }
        
        emit End(highestBidder, highestBid);
    }
}
