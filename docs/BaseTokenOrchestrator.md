### Adding transactions

1) Use the truffle console to encode the function call as follows.

```
# Sync tx
web3.eth.abi.encodeFunctionCall({
  name: 'sync',
  type: 'function',
  inputs: [],
}, []);


# Gulp tx
web3.eth.abi.encodeFunctionCall({
  name: 'gulp',
  type: 'function',
  inputs: [{
      type: 'address',
      name: 'token'
  }],
}, ['0xD46bA6D942050d489DBd938a2C909A5d5039A161']);
```

2) Admin invokes `addTransaction` with the destination contract address and `bytes`
as encoded from step 1.

### Current list of transactions

N/A

