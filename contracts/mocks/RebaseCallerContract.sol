pragma solidity 0.4.24;

import "../BaseTokenOrchestrator.sol";


contract RebaseCallerContract {

    function callRebase(address orchestrator) public returns (bool) {
        // Take out a flash loan.
        // Do something funky...
        BaseTokenOrchestrator(orchestrator).rebase();  // should fail
        // pay back flash loan.
        return true;
    }
}
