pragma solidity 0.4.24;


contract ERC677 {
    function transfer(address to, uint256 value) public returns (bool);
    function transferAndCall(address to, uint value, bytes data) public returns (bool success);

    event Transfer(address indexed from, address indexed to, uint value, bytes data);
}
