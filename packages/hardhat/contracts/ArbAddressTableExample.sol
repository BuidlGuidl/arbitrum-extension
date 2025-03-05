//SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

// Arbitrum precompile contract for address table
import "@arbitrum/nitro-contracts/src/precompiles/ArbAddressTable.sol";

/**
 * A smart contract that allows changing a state variable of the contract and tracking the changes
 * It also allows the owner to withdraw the Ether in the contract
 * @author BuidlGuidl
 */
contract ArbAddressTableExample {
    // State Variables
    mapping(address => uint) public userBalances;
    ArbAddressTable arbAddressTable;

    // Events: a way to emit log statements from smart contract that can be listened to by external parties
    event MessageSent(address indexed sender, address indexed recipient, string message, uint256 value);

    // Constructor: Called once on contract deployment
    // Check packages/hardhat/deploy/00_deploy_your_contract.ts
    constructor() {
        // connect to precompiled address table contract
        arbAddressTable = ArbAddressTable(address(102));
    }

    // Modifier: used to define a set of rules that must be met before or after a function is executed
    // Check the withdraw() function
    modifier isAddress(uint256 addressIndex) {
        // retrieve address from address table
        address addressFromTable = arbAddressTable.lookupIndex(addressIndex);
        // msg.sender: predefined variable that represents address of the account that called the current function
        require(msg.sender == addressFromTable, "Not the authorized address");
        _;
    }

    function registerAddress(address _address) public returns (uint256) {
        return arbAddressTable.register(_address);
    }

    function getAddressIndex(address _address) public view returns (uint256) {
        return arbAddressTable.lookup(_address);
    }

    /**
     * Function that allows anyone to send a message to an address
     *
     * @param _message (string memory) - new message to send
     * @param _addressIndex (uint256) - the index of the address to which the message will be sent
     */
    function sendMessageToAddress(string memory _message, uint256 _addressIndex) public payable {
        // Print data to the hardhat chain console. Remove when deploying to a live network.
        address _recipient = arbAddressTable.lookupIndex(_addressIndex);

        // msg.value: built-in global variable that represents the amount of ether sent with the transaction
        if (msg.value > 0) {
            // Add value to the recipients balance
            userBalances[_recipient] += msg.value;
        } 

        // emit: keyword used to trigger an event
        emit MessageSent(msg.sender, _recipient, _message, msg.value);
    }

    /**
     * Function that allows the owner to withdraw all the Ether in the contract
     * The function can only be called by the owner of the contract as defined by the isOwner modifier
     */
    function withdraw() public {
        uint256 usersBalance = userBalances[msg.sender];
        require(usersBalance > 0, "No balance to withdraw");
        userBalances[msg.sender] = 0;
        (bool success, ) = msg.sender.call{ value: userBalances[msg.sender] }("");
        require(success, "Failed to send Ether");
    }

    /**
     * Function that allows the contract to receive ETH
     */
    receive() external payable {}
}