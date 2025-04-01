// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

/**
 * @title SimpleNFT
 * @dev Контракт для создания NFT-токенов, которые будут использоваться в аукционе
 */
contract SimpleNFT is ERC721URIStorage {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIds;

    // Конструктор указывает имя и символ токенов коллекции
    constructor() ERC721("AuctionCollection", "ANFT") {}

    /**
     * @dev Создает новый NFT токен
     * @param recipient Адрес получателя токена
     * @param tokenURI URI метаданных токена (ссылка на JSON в IPFS)
     * @return uint256 ID созданного токена
     */
    function mintNFT(address recipient, string memory tokenURI)
        public
        returns (uint256)
    {
        // Увеличиваем счетчик токенов
        _tokenIds.increment();
        uint256 newItemId = _tokenIds.current();
        
        // Создаем токен и присваиваем получателю
        _mint(recipient, newItemId);
        
        // Связываем токен с метаданными
        _setTokenURI(newItemId, tokenURI);

        return newItemId;
    }
}
