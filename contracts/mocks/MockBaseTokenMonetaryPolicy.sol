pragma solidity 0.4.24;

import "./Mock.sol";


contract MockBaseTokenMonetaryPolicy is Mock {

    function rebase() external {
        emit FunctionCalled("BaseTokenMonetaryPolicy", "rebase", msg.sender);
    }
}
