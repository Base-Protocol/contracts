/*
  In this truffle script, we generate random cycles of BASE growth and contraction
  and test the precision of BASE transfers

  During every iteration; percentageGrowth is sampled from a unifrom distribution between [-50%,250%]
  and the BASE total supply grows/contracts.

  In each cycle we test the following guarantees:
  - If address 'A' transfers x BASE to address 'B'. A's resulting external balance will
  be decreased by precisely x BASE, and B's external balance will be precisely
  increased by x BASE.

  USAGE:
  npx truffle --network ganacheUnitTest exec ./test/simulation/transfer_precision.js
*/

const expect = require('chai').expect;
const BaseToken = artifacts.require('BaseToken.sol');
const _require = require('app-root-path').require;
const BlockchainCaller = _require('/util/blockchain_caller');
const chain = new BlockchainCaller(web3);
const encodeCall = require('zos-lib/lib/helpers/encodeCall').default;
const Stochasm = require('stochasm');
const BigNumber = web3.BigNumber;

const endSupply = new BigNumber(2).pow(128).minus(1);
const baseTokenGrowth = new Stochasm({ min: -0.5, max: 2.5, seed: 'baseprotocol.org' });

let baseToken, rebaseAmt, inflation, preRebaseSupply, postRebaseSupply;
rebaseAmt = new BigNumber(0);
preRebaseSupply = new BigNumber(0);
postRebaseSupply = new BigNumber(0);

async function checkBalancesAfterOperation (users, op, chk) {
  const _bals = [ ];
  const bals = [ ];
  let u;
  for (u in users) {
    if (Object.prototype.hasOwnProperty.call(users, u)) {
      _bals.push(await baseToken.balanceOf.call(users[u]));
    }
  }
  await op();
  for (u in users) {
    if (Object.prototype.hasOwnProperty.call(users, u)) {
      bals.push(await baseToken.balanceOf.call(users[u]));
    }
  }
  chk(_bals, bals);
}

async function checkBalancesAfterTransfer (users, tAmt) {
  await checkBalancesAfterOperation(users, async function () {
    await baseToken.transfer(users[1], tAmt, { from: users[0] });
  }, function ([_u0Bal, _u1Bal], [u0Bal, u1Bal]) {
    const _sum = _u0Bal.plus(_u1Bal);
    const sum = u0Bal.plus(u1Bal);
    expect(_sum.eq(sum)).to.be.true;
    expect(_u0Bal.minus(tAmt).eq(u0Bal)).to.be.true;
    expect(_u1Bal.plus(tAmt).eq(u1Bal)).to.be.true;
  });
}

async function exec () {
  const accounts = await chain.getUserAccounts();
  const deployer = accounts[0];
  const user = accounts[1];
  baseToken = await BaseToken.new();
  await baseToken.sendTransaction({
    data: encodeCall('initialize', ['address'], [deployer]),
    from: deployer
  });
  await baseToken.setMonetaryPolicy(deployer, {from: deployer});

  let i = 0;
  do {
    await baseToken.rebase(i + 1, rebaseAmt, {from: deployer});
    postRebaseSupply = await baseToken.totalSupply.call();
    i++;

    console.log('Rebased iteration', i);
    console.log('Rebased by', (rebaseAmt.toString()), 'BASE');
    console.log('Total supply is now', postRebaseSupply.toString(), 'BASE');

    console.log('Testing precision of 1c transfer');
    await checkBalancesAfterTransfer([deployer, user], 1);
    await checkBalancesAfterTransfer([user, deployer], 1);

    console.log('Testing precision of max denomination');
    const tAmt = (await baseToken.balanceOf.call(deployer));
    await checkBalancesAfterTransfer([deployer, user], tAmt);
    await checkBalancesAfterTransfer([user, deployer], tAmt);

    preRebaseSupply = await baseToken.totalSupply.call();
    inflation = baseTokenGrowth.next().toFixed(5);
    rebaseAmt = preRebaseSupply.mul(inflation).dividedToIntegerBy(1);
  } while ((await baseToken.totalSupply.call()).plus(rebaseAmt).lt(endSupply));
}

module.exports = function (done) {
  exec().then(done).catch(e => {
    console.error(e);
    process.exit(1);
  });
};
