const BaseTokenMonetaryPolicy = artifacts.require('BaseTokenMonetaryPolicy.sol');
const MockBaseToken = artifacts.require('MockBaseToken.sol');
const MockOracle = artifacts.require('MockOracle.sol');

const encodeCall = require('zos-lib/lib/helpers/encodeCall').default;
const BigNumber = web3.BigNumber;
const _require = require('app-root-path').require;
const BlockchainCaller = _require('/util/blockchain_caller');
const chain = new BlockchainCaller(web3);

require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

let baseTokenMonetaryPolicy, mockBaseToken, mockTokenPriceOracle, mockMcapOracle;
let r, prevEpoch, prevTime;
let deployer, user, orchestrator;

const MAX_RATE = (new BigNumber('1')).mul(10 ** 6 * 10 ** 18);
const MAX_SUPPLY = (new BigNumber(2).pow(255).minus(1)).div(MAX_RATE);
const BASE_MCAP = new BigNumber(100e18);
const INITIAL_MCAP = new BigNumber(251.712e18);
const INITIAL_MCAP_25P_MORE = INITIAL_MCAP.mul(1.25).dividedToIntegerBy(1);
const INITIAL_MCAP_25P_LESS = INITIAL_MCAP.mul(0.77).dividedToIntegerBy(1);
const INITIAL_RATE = INITIAL_MCAP.mul(1e18).dividedToIntegerBy(BASE_MCAP);
const INITIAL_RATE_30P_MORE = INITIAL_RATE.mul(1.3).dividedToIntegerBy(1);
const INITIAL_RATE_30P_LESS = INITIAL_RATE.mul(0.7).dividedToIntegerBy(1);
const INITIAL_RATE_5P_MORE = INITIAL_RATE.mul(1.05).dividedToIntegerBy(1);
const INITIAL_RATE_5P_LESS = INITIAL_RATE.mul(0.95).dividedToIntegerBy(1);
const INITIAL_RATE_60P_MORE = INITIAL_RATE.mul(1.6).dividedToIntegerBy(1);
const INITIAL_RATE_2X = INITIAL_RATE.mul(2);

async function setupContracts () {
  await chain.waitForSomeTime(86400);
  const accounts = await chain.getUserAccounts();
  deployer = accounts[0];
  user = accounts[1];
  orchestrator = accounts[2];
  mockBaseToken = await MockBaseToken.new();
  mockTokenPriceOracle = await MockOracle.new('TokenPriceOracle');
  mockMcapOracle = await MockOracle.new('McapOracle');
  baseTokenMonetaryPolicy = await BaseTokenMonetaryPolicy.new();
  await baseTokenMonetaryPolicy.sendTransaction({
    data: encodeCall('initialize', ['address', 'address', 'uint256'], [deployer, mockBaseToken.address, BASE_MCAP.toString()]),
    from: deployer
  });
  await baseTokenMonetaryPolicy.setTokenPriceOracle(mockTokenPriceOracle.address);
  await baseTokenMonetaryPolicy.setMcapOracle(mockMcapOracle.address);
  await baseTokenMonetaryPolicy.setOrchestrator(orchestrator);
}

async function setupContractsWithOpenRebaseWindow () {
  await setupContracts();
  await baseTokenMonetaryPolicy.setRebaseTimingParameters(60, 0, 60);
}

async function mockExternalData (rate, mcap, baseSupply, rateValidity = true, mcapValidity = true) {
  await mockTokenPriceOracle.storeData(rate);
  await mockTokenPriceOracle.storeValidity(rateValidity);
  await mockMcapOracle.storeData(mcap);
  await mockMcapOracle.storeValidity(mcapValidity);
  await mockBaseToken.storeSupply(baseSupply);
}

contract('BaseTokenMonetaryPolicy', function (accounts) {
  before('setup BaseTokenMonetaryPolicy contract', setupContracts);

  it('should reject any ether sent to it', async function () {
    expect(
      await chain.isEthException(baseTokenMonetaryPolicy.sendTransaction({ from: user, value: 1 }))
    ).to.be.true;
  });
});

contract('BaseTokenMonetaryPolicy:initialize', async function (accounts) {
  describe('initial values set correctly', function () {
    before('setup BaseTokenMonetaryPolicy contract', setupContracts);

    it('deviationThreshold', async function () {
      (await baseTokenMonetaryPolicy.deviationThreshold.call()).should.be.bignumber.eq(0.05e18);
    });
    it('rebaseLag', async function () {
      (await baseTokenMonetaryPolicy.rebaseLag.call()).should.be.bignumber.eq(30);
    });
    it('minRebaseTimeIntervalSec', async function () {
      (await baseTokenMonetaryPolicy.minRebaseTimeIntervalSec.call()).should.be.bignumber.eq(24 * 60 * 60);
    });
    it('epoch', async function () {
      (await baseTokenMonetaryPolicy.epoch.call()).should.be.bignumber.eq(0);
    });
    it('rebaseWindowOffsetSec', async function () {
      (await baseTokenMonetaryPolicy.rebaseWindowOffsetSec.call()).should.be.bignumber.eq(72000);
    });
    it('rebaseWindowLengthSec', async function () {
      (await baseTokenMonetaryPolicy.rebaseWindowLengthSec.call()).should.be.bignumber.eq(900);
    });
    it('should set owner', async function () {
      expect(await baseTokenMonetaryPolicy.owner.call()).to.eq(deployer);
    });
    it('should set reference to BASE', async function () {
      expect(await baseTokenMonetaryPolicy.BASE.call()).to.eq(mockBaseToken.address);
    });
  });
});

contract('BaseTokenMonetaryPolicy:setTokenPriceOracle', async function (accounts) {
  before('setup BaseTokenMonetaryPolicy contract', setupContracts);

  it('should set tokenPriceOracle', async function () {
    await baseTokenMonetaryPolicy.setTokenPriceOracle(deployer);
    expect(await baseTokenMonetaryPolicy.tokenPriceOracle.call()).to.eq(deployer);
  });
});

contract('BaseToken:setTokenPriceOracle:accessControl', function (accounts) {
  before('setup BaseTokenMonetaryPolicy contract', setupContracts);

  it('should be callable by owner', async function () {
    expect(
      await chain.isEthException(baseTokenMonetaryPolicy.setTokenPriceOracle(deployer, { from: deployer }))
    ).to.be.false;
  });

  it('should NOT be callable by non-owner', async function () {
    expect(
      await chain.isEthException(baseTokenMonetaryPolicy.setTokenPriceOracle(deployer, { from: user }))
    ).to.be.true;
  });
});

contract('BaseTokenMonetaryPolicy:setMcapOracle', async function (accounts) {
  before('setup BaseTokenMonetaryPolicy contract', setupContracts);

  it('should set mcapOracle', async function () {
    await baseTokenMonetaryPolicy.setMcapOracle(deployer);
    expect(await baseTokenMonetaryPolicy.mcapOracle.call()).to.eq(deployer);
  });
});

contract('BaseToken:setMcapOracle:accessControl', function (accounts) {
  before('setup BaseTokenMonetaryPolicy contract', setupContracts);

  it('should be callable by owner', async function () {
    expect(
      await chain.isEthException(baseTokenMonetaryPolicy.setMcapOracle(deployer, { from: deployer }))
    ).to.be.false;
  });

  it('should NOT be callable by non-owner', async function () {
    expect(
      await chain.isEthException(baseTokenMonetaryPolicy.setMcapOracle(deployer, { from: user }))
    ).to.be.true;
  });
});

contract('BaseTokenMonetaryPolicy:setOrchestrator', async function (accounts) {
  before('setup BaseTokenMonetaryPolicy contract', setupContracts);

  it('should set orchestrator', async function () {
    await baseTokenMonetaryPolicy.setOrchestrator(user, {from: deployer});
    expect(await baseTokenMonetaryPolicy.orchestrator.call()).to.eq(user);
  });
});

contract('BaseToken:setOrchestrator:accessControl', function (accounts) {
  before('setup BaseTokenMonetaryPolicy contract', setupContracts);

  it('should be callable by owner', async function () {
    expect(
      await chain.isEthException(baseTokenMonetaryPolicy.setOrchestrator(deployer, { from: deployer }))
    ).to.be.false;
  });

  it('should NOT be callable by non-owner', async function () {
    expect(
      await chain.isEthException(baseTokenMonetaryPolicy.setOrchestrator(deployer, { from: user }))
    ).to.be.true;
  });
});

contract('BaseTokenMonetaryPolicy:setDeviationThreshold', async function (accounts) {
  let prevThreshold, threshold;
  before('setup BaseTokenMonetaryPolicy contract', async function () {
    await setupContracts();
    prevThreshold = await baseTokenMonetaryPolicy.deviationThreshold.call();
    threshold = prevThreshold.plus(0.01e18);
    await baseTokenMonetaryPolicy.setDeviationThreshold(threshold);
  });

  it('should set deviationThreshold', async function () {
    (await baseTokenMonetaryPolicy.deviationThreshold.call()).should.be.bignumber.eq(threshold);
  });
});

contract('BaseToken:setDeviationThreshold:accessControl', function (accounts) {
  before('setup BaseTokenMonetaryPolicy contract', setupContracts);

  it('should be callable by owner', async function () {
    expect(
      await chain.isEthException(baseTokenMonetaryPolicy.setDeviationThreshold(0, { from: deployer }))
    ).to.be.false;
  });

  it('should NOT be callable by non-owner', async function () {
    expect(
      await chain.isEthException(baseTokenMonetaryPolicy.setDeviationThreshold(0, { from: user }))
    ).to.be.true;
  });
});

contract('BaseTokenMonetaryPolicy:setRebaseLag', async function (accounts) {
  let prevLag;
  before('setup BaseTokenMonetaryPolicy contract', async function () {
    await setupContracts();
    prevLag = await baseTokenMonetaryPolicy.rebaseLag.call();
  });

  describe('when rebaseLag is more than 0', async function () {
    it('should setRebaseLag', async function () {
      const lag = prevLag.plus(1);
      await baseTokenMonetaryPolicy.setRebaseLag(lag);
      (await baseTokenMonetaryPolicy.rebaseLag.call()).should.be.bignumber.eq(lag);
    });
  });

  describe('when rebaseLag is 0', async function () {
    it('should fail', async function () {
      expect(
        await chain.isEthException(baseTokenMonetaryPolicy.setRebaseLag(0))
      ).to.be.true;
    });
  });
});

contract('BaseToken:setRebaseLag:accessControl', function (accounts) {
  before('setup BaseTokenMonetaryPolicy contract', setupContracts);

  it('should be callable by owner', async function () {
    expect(
      await chain.isEthException(baseTokenMonetaryPolicy.setRebaseLag(1, { from: deployer }))
    ).to.be.false;
  });

  it('should NOT be callable by non-owner', async function () {
    expect(
      await chain.isEthException(baseTokenMonetaryPolicy.setRebaseLag(1, { from: user }))
    ).to.be.true;
  });
});

contract('BaseTokenMonetaryPolicy:setRebaseTimingParameters', async function (accounts) {
  before('setup BaseTokenMonetaryPolicy contract', async function () {
    await setupContracts();
  });

  describe('when interval=0', function () {
    it('should fail', async function () {
      expect(
        await chain.isEthException(baseTokenMonetaryPolicy.setRebaseTimingParameters(0, 0, 0))
      ).to.be.true;
    });
  });

  describe('when offset > interval', function () {
    it('should fail', async function () {
      expect(
        await chain.isEthException(baseTokenMonetaryPolicy.setRebaseTimingParameters(300, 3600, 300))
      ).to.be.true;
    });
  });

  describe('when params are valid', function () {
    it('should setRebaseTimingParameters', async function () {
      await baseTokenMonetaryPolicy.setRebaseTimingParameters(600, 60, 300);
      (await baseTokenMonetaryPolicy.minRebaseTimeIntervalSec.call()).should.be.bignumber.eq(600);
      (await baseTokenMonetaryPolicy.rebaseWindowOffsetSec.call()).should.be.bignumber.eq(60);
      (await baseTokenMonetaryPolicy.rebaseWindowLengthSec.call()).should.be.bignumber.eq(300);
    });
  });
});

contract('BaseToken:setRebaseTimingParameters:accessControl', function (accounts) {
  before('setup BaseTokenMonetaryPolicy contract', setupContracts);

  it('should be callable by owner', async function () {
    expect(
      await chain.isEthException(baseTokenMonetaryPolicy.setRebaseTimingParameters(600, 60, 300, { from: deployer }))
    ).to.be.false;
  });

  it('should NOT be callable by non-owner', async function () {
    expect(
      await chain.isEthException(baseTokenMonetaryPolicy.setRebaseTimingParameters(600, 60, 300, { from: user }))
    ).to.be.true;
  });
});

contract('BaseTokenMonetaryPolicy:Rebase:accessControl', async function (accounts) {
  beforeEach('setup BaseTokenMonetaryPolicy contract', async function () {
    await setupContractsWithOpenRebaseWindow();
    await mockExternalData(INITIAL_RATE_30P_MORE, INITIAL_MCAP, 1000, true);
    await chain.waitForSomeTime(60);
  });

  describe('when rebase called by orchestrator', function () {
    it('should succeed', async function () {
      expect(
        await chain.isEthException(baseTokenMonetaryPolicy.rebase({from: orchestrator}))
      ).to.be.false;
    });
  });

  describe('when rebase called by non-orchestrator', function () {
    it('should fail', async function () {
      expect(
        await chain.isEthException(baseTokenMonetaryPolicy.rebase({from: user}))
      ).to.be.true;
    });
  });
});

contract('BaseTokenMonetaryPolicy:Rebase', async function (accounts) {
  before('setup BaseTokenMonetaryPolicy contract', setupContractsWithOpenRebaseWindow);

  describe('when minRebaseTimeIntervalSec has NOT passed since the previous rebase', function () {
    before(async function () {
      await mockExternalData(INITIAL_RATE_30P_MORE, INITIAL_MCAP, 1010);
      await chain.waitForSomeTime(60);
      await baseTokenMonetaryPolicy.rebase({from: orchestrator});
    });

    it('should fail', async function () {
      expect(
        await chain.isEthException(baseTokenMonetaryPolicy.rebase({from: orchestrator}))
      ).to.be.true;
    });
  });
});

contract('BaseTokenMonetaryPolicy:Rebase', async function (accounts) {
  before('setup BaseTokenMonetaryPolicy contract', setupContractsWithOpenRebaseWindow);

  describe('when rate is within deviationThreshold', function () {
    before(async function () {
      await baseTokenMonetaryPolicy.setRebaseTimingParameters(60, 0, 60);
    });

    it('should return 0', async function () {
      await mockExternalData(INITIAL_RATE.minus(1), INITIAL_MCAP, 1000);
      await chain.waitForSomeTime(60);
      r = await baseTokenMonetaryPolicy.rebase({from: orchestrator});
      r.logs[0].args.requestedSupplyAdjustment.should.be.bignumber.eq(0);
      await chain.waitForSomeTime(60);

      await mockExternalData(INITIAL_RATE.plus(1), INITIAL_MCAP, 1000);
      r = await baseTokenMonetaryPolicy.rebase({from: orchestrator});
      r.logs[0].args.requestedSupplyAdjustment.should.be.bignumber.eq(0);
      await chain.waitForSomeTime(60);

      await mockExternalData(INITIAL_RATE_5P_MORE.minus(2), INITIAL_MCAP, 1000);
      r = await baseTokenMonetaryPolicy.rebase({from: orchestrator});
      r.logs[0].args.requestedSupplyAdjustment.should.be.bignumber.eq(0);
      await chain.waitForSomeTime(60);

      await mockExternalData(INITIAL_RATE_5P_LESS.plus(2), INITIAL_MCAP, 1000);
      r = await baseTokenMonetaryPolicy.rebase({from: orchestrator});
      r.logs[0].args.requestedSupplyAdjustment.should.be.bignumber.eq(0);
      await chain.waitForSomeTime(60);
    });
  });
});

contract('BaseTokenMonetaryPolicy:Rebase', async function (accounts) {
  before('setup BaseTokenMonetaryPolicy contract', setupContractsWithOpenRebaseWindow);

  describe('when rate is more than MAX_RATE', function () {
    it('should return same supply delta as delta for MAX_RATE', async function () {
      // Any exchangeRate >= (MAX_RATE=100x) would result in the same supply increase
      await mockExternalData(MAX_RATE, INITIAL_MCAP, 1000);
      await chain.waitForSomeTime(60);
      r = await baseTokenMonetaryPolicy.rebase({from: orchestrator});
      const supplyChange = r.logs[0].args.requestedSupplyAdjustment;

      await chain.waitForSomeTime(60);

      await mockExternalData(MAX_RATE.add(1e17), INITIAL_MCAP, 1000);
      r = await baseTokenMonetaryPolicy.rebase({from: orchestrator});
      r.logs[0].args.requestedSupplyAdjustment.should.be.bignumber.eq(supplyChange);

      await chain.waitForSomeTime(60);

      await mockExternalData(MAX_RATE.mul(2), INITIAL_MCAP, 1000);
      r = await baseTokenMonetaryPolicy.rebase({from: orchestrator});
      r.logs[0].args.requestedSupplyAdjustment.should.be.bignumber.eq(supplyChange);
    });
  });
});

contract('BaseTokenMonetaryPolicy:Rebase', async function (accounts) {
  before('setup BaseTokenMonetaryPolicy contract', setupContractsWithOpenRebaseWindow);

  describe('when baseToken grows beyond MAX_SUPPLY', function () {
    before(async function () {
      await mockExternalData(INITIAL_RATE_2X, INITIAL_MCAP, MAX_SUPPLY.minus(1));
      await chain.waitForSomeTime(60);
    });

    it('should apply SupplyAdjustment {MAX_SUPPLY - totalSupply}', async function () {
      // Supply is MAX_SUPPLY-1, exchangeRate is 2x; resulting in a new supply more than MAX_SUPPLY
      // However, supply is ONLY increased by 1 to MAX_SUPPLY
      r = await baseTokenMonetaryPolicy.rebase({from: orchestrator});
      r.logs[0].args.requestedSupplyAdjustment.should.be.bignumber.eq(1);
    });
  });
});

contract('BaseTokenMonetaryPolicy:Rebase', async function (accounts) {
  before('setup BaseTokenMonetaryPolicy contract', setupContractsWithOpenRebaseWindow);

  describe('when baseToken supply equals MAX_SUPPLY and rebase attempts to grow', function () {
    before(async function () {
      await mockExternalData(INITIAL_RATE_2X, INITIAL_MCAP, MAX_SUPPLY);
      await chain.waitForSomeTime(60);
    });

    it('should not grow', async function () {
      r = await baseTokenMonetaryPolicy.rebase({from: orchestrator});
      r.logs[0].args.requestedSupplyAdjustment.should.be.bignumber.eq(0);
    });
  });
});

contract('BaseTokenMonetaryPolicy:Rebase', async function (accounts) {
  before('setup BaseTokenMonetaryPolicy contract', setupContractsWithOpenRebaseWindow);

  describe('when the market oracle returns invalid data', function () {
    it('should fail', async function () {
      await mockExternalData(INITIAL_RATE_30P_MORE, INITIAL_MCAP, 1000, false);
      await chain.waitForSomeTime(60);
      expect(
        await chain.isEthException(baseTokenMonetaryPolicy.rebase({from: orchestrator}))
      ).to.be.true;
    });
  });

  describe('when the market oracle returns valid data', function () {
    it('should NOT fail', async function () {
      await mockExternalData(INITIAL_RATE_30P_MORE, INITIAL_MCAP, 1000, true);
      await chain.waitForSomeTime(60);
      expect(
        await chain.isEthException(baseTokenMonetaryPolicy.rebase({from: orchestrator}))
      ).to.be.false;
    });
  });
});

contract('BaseTokenMonetaryPolicy:Rebase', async function (accounts) {
  before('setup BaseTokenMonetaryPolicy contract', setupContractsWithOpenRebaseWindow);

  describe('when the mcap oracle returns invalid data', function () {
    it('should fail', async function () {
      await mockExternalData(INITIAL_RATE_30P_MORE, INITIAL_MCAP, 1000, true, false);
      await chain.waitForSomeTime(60);
      expect(
        await chain.isEthException(baseTokenMonetaryPolicy.rebase({from: orchestrator}))
      ).to.be.true;
    });
  });

  describe('when the mcap oracle returns valid data', function () {
    it('should NOT fail', async function () {
      await mockExternalData(INITIAL_RATE_30P_MORE, INITIAL_MCAP, 1000, true, true);
      await chain.waitForSomeTime(60);
      expect(
        await chain.isEthException(baseTokenMonetaryPolicy.rebase({from: orchestrator}))
      ).to.be.false;
    });
  });
});

contract('BaseTokenMonetaryPolicy:Rebase', async function (accounts) {
  before('setup BaseTokenMonetaryPolicy contract', setupContractsWithOpenRebaseWindow);

  describe('positive rate and no change MCAP', function () {
    before(async function () {
      await mockExternalData(INITIAL_RATE_30P_MORE, INITIAL_MCAP, 1000);
      await baseTokenMonetaryPolicy.setRebaseTimingParameters(60, 0, 60);
      await chain.waitForSomeTime(60);
      await baseTokenMonetaryPolicy.rebase({from: orchestrator});
      await chain.waitForSomeTime(59);
      prevEpoch = await baseTokenMonetaryPolicy.epoch.call();
      prevTime = await baseTokenMonetaryPolicy.lastRebaseTimestampSec.call();
      await mockExternalData(INITIAL_RATE_60P_MORE, INITIAL_MCAP, 1010);
      r = await baseTokenMonetaryPolicy.rebase({from: orchestrator});
    });

    it('should increment epoch', async function () {
      const epoch = await baseTokenMonetaryPolicy.epoch.call();
      expect(prevEpoch.plus(1).eq(epoch));
    });

    it('should update lastRebaseTimestamp', async function () {
      const time = await baseTokenMonetaryPolicy.lastRebaseTimestampSec.call();
      expect(time.minus(prevTime).eq(60)).to.be.true;
    });

    it('should emit Rebase with positive requestedSupplyAdjustment', async function () {
      const log = r.logs[0];
      expect(log.event).to.eq('LogRebase');
      expect(log.args.epoch.eq(prevEpoch.plus(1))).to.be.true;
      log.args.exchangeRate.should.be.bignumber.eq(INITIAL_RATE_60P_MORE);
      log.args.mcap.should.be.bignumber.eq(INITIAL_MCAP);
      log.args.requestedSupplyAdjustment.should.be.bignumber.eq(20);
    });

    it('should call getData from the market oracle', async function () {
      const fnCalled = mockTokenPriceOracle.FunctionCalled().formatter(r.receipt.logs[2]);
      expect(fnCalled.args.instanceName).to.eq('TokenPriceOracle');
      expect(fnCalled.args.functionName).to.eq('getData');
      expect(fnCalled.args.caller).to.eq(baseTokenMonetaryPolicy.address);
    });

    it('should call getData from the mcap oracle', async function () {
      const fnCalled = mockMcapOracle.FunctionCalled().formatter(r.receipt.logs[0]);
      expect(fnCalled.args.instanceName).to.eq('McapOracle');
      expect(fnCalled.args.functionName).to.eq('getData');
      expect(fnCalled.args.caller).to.eq(baseTokenMonetaryPolicy.address);
    });

    it('should call BaseToken Rebase', async function () {
      prevEpoch = await baseTokenMonetaryPolicy.epoch.call();
      const fnCalled = mockBaseToken.FunctionCalled().formatter(r.receipt.logs[4]);
      expect(fnCalled.args.instanceName).to.eq('BaseToken');
      expect(fnCalled.args.functionName).to.eq('rebase');
      expect(fnCalled.args.caller).to.eq(baseTokenMonetaryPolicy.address);
      const fnArgs = mockBaseToken.FunctionArguments().formatter(r.receipt.logs[5]);
      const parsedFnArgs = Object.keys(fnArgs.args).reduce((m, k) => {
        return fnArgs.args[k].map(d => d.toNumber()).concat(m);
      }, [ ]);
      expect(parsedFnArgs).to.include.members([prevEpoch.toNumber(), 20]);
    });
  });
});

contract('BaseTokenMonetaryPolicy:Rebase', async function (accounts) {
  before('setup BaseTokenMonetaryPolicy contract', setupContractsWithOpenRebaseWindow);

  describe('negative rate', function () {
    before(async function () {
      await mockExternalData(INITIAL_RATE_30P_LESS, INITIAL_MCAP, 1000);
      await chain.waitForSomeTime(60);
      r = await baseTokenMonetaryPolicy.rebase({from: orchestrator});
    });

    it('should emit Rebase with negative requestedSupplyAdjustment', async function () {
      const log = r.logs[0];
      expect(log.event).to.eq('LogRebase');
      log.args.requestedSupplyAdjustment.should.be.bignumber.eq(-10);
    });
  });
});

contract('BaseTokenMonetaryPolicy:Rebase', async function (accounts) {
  before('setup BaseTokenMonetaryPolicy contract', setupContractsWithOpenRebaseWindow);

  describe('when mcap increases', function () {
    before(async function () {
      await mockExternalData(INITIAL_RATE, INITIAL_MCAP_25P_MORE, 1000);
      await chain.waitForSomeTime(60);
      await baseTokenMonetaryPolicy.setDeviationThreshold(0);
      r = await baseTokenMonetaryPolicy.rebase({from: orchestrator});
    });

    it('should emit Rebase with negative requestedSupplyAdjustment', async function () {
      const log = r.logs[0];
      expect(log.event).to.eq('LogRebase');
      log.args.requestedSupplyAdjustment.should.be.bignumber.eq(-6);
    });
  });
});

contract('BaseTokenMonetaryPolicy:Rebase', async function (accounts) {
  before('setup BaseTokenMonetaryPolicy contract', setupContractsWithOpenRebaseWindow);

  describe('when mcap decreases', function () {
    before(async function () {
      await mockExternalData(INITIAL_RATE, INITIAL_MCAP_25P_LESS, 1000);
      await chain.waitForSomeTime(60);
      await baseTokenMonetaryPolicy.setDeviationThreshold(0);
      r = await baseTokenMonetaryPolicy.rebase({from: orchestrator});
    });

    it('should emit Rebase with positive requestedSupplyAdjustment', async function () {
      const log = r.logs[0];
      expect(log.event).to.eq('LogRebase');
      log.args.requestedSupplyAdjustment.should.be.bignumber.eq(9);
    });
  });
});

contract('BaseTokenMonetaryPolicy:Rebase', async function (accounts) {
  before('setup BaseTokenMonetaryPolicy contract', setupContractsWithOpenRebaseWindow);

  describe('rate=TARGET_RATE', function () {
    before(async function () {
      await mockExternalData(INITIAL_RATE, INITIAL_MCAP, 1000);
      await baseTokenMonetaryPolicy.setDeviationThreshold(0);
      await chain.waitForSomeTime(60);
      r = await baseTokenMonetaryPolicy.rebase({from: orchestrator});
    });

    it('should emit Rebase with 0 requestedSupplyAdjustment', async function () {
      const log = r.logs[0];
      expect(log.event).to.eq('LogRebase');
      log.args.requestedSupplyAdjustment.should.be.bignumber.eq(0);
    });
  });
});

contract('BaseTokenMonetaryPolicy:Rebase', async function (accounts) {
  let rbTime, rbWindow, minRebaseTimeIntervalSec, now, prevRebaseTime, nextRebaseWindowOpenTime,
    timeToWait, lastRebaseTimestamp;

  beforeEach('setup BaseTokenMonetaryPolicy contract', async function () {
    await setupContracts();
    await baseTokenMonetaryPolicy.setRebaseTimingParameters(86400, 72000, 900);
    rbTime = await baseTokenMonetaryPolicy.rebaseWindowOffsetSec.call();
    rbWindow = await baseTokenMonetaryPolicy.rebaseWindowLengthSec.call();
    minRebaseTimeIntervalSec = await baseTokenMonetaryPolicy.minRebaseTimeIntervalSec.call();
    now = new BigNumber(await chain.currentTime());
    prevRebaseTime = now.minus(now.mod(minRebaseTimeIntervalSec)).plus(rbTime);
    nextRebaseWindowOpenTime = prevRebaseTime.plus(minRebaseTimeIntervalSec);
  });

  describe('when its 5s after the rebase window closes', function () {
    it('should fail', async function () {
      timeToWait = nextRebaseWindowOpenTime.minus(now).plus(rbWindow).plus(5);
      await chain.waitForSomeTime(timeToWait.toNumber());
      await mockExternalData(INITIAL_RATE, INITIAL_MCAP, 1000);
      expect(await baseTokenMonetaryPolicy.inRebaseWindow.call()).to.be.false;
      expect(
        await chain.isEthException(baseTokenMonetaryPolicy.rebase({from: orchestrator}))
      ).to.be.true;
    });
  });

  describe('when its 5s before the rebase window opens', function () {
    it('should fail', async function () {
      timeToWait = nextRebaseWindowOpenTime.minus(now).minus(5);
      await chain.waitForSomeTime(timeToWait.toNumber());
      await mockExternalData(INITIAL_RATE, INITIAL_MCAP, 1000);
      expect(await baseTokenMonetaryPolicy.inRebaseWindow.call()).to.be.false;
      expect(
        await chain.isEthException(baseTokenMonetaryPolicy.rebase({from: orchestrator}))
      ).to.be.true;
    });
  });

  describe('when its 5s after the rebase window opens', function () {
    it('should NOT fail', async function () {
      timeToWait = nextRebaseWindowOpenTime.minus(now).plus(5);
      await chain.waitForSomeTime(timeToWait.toNumber());
      await mockExternalData(INITIAL_RATE, INITIAL_MCAP, 1000);
      expect(await baseTokenMonetaryPolicy.inRebaseWindow.call()).to.be.true;
      expect(
        await chain.isEthException(baseTokenMonetaryPolicy.rebase({from: orchestrator}))
      ).to.be.false;
      lastRebaseTimestamp = await baseTokenMonetaryPolicy.lastRebaseTimestampSec.call();
      expect(lastRebaseTimestamp.eq(nextRebaseWindowOpenTime)).to.be.true;
    });
  });

  describe('when its 5s before the rebase window closes', function () {
    it('should NOT fail', async function () {
      timeToWait = nextRebaseWindowOpenTime.minus(now).plus(rbWindow).minus(5);
      await chain.waitForSomeTime(timeToWait.toNumber());
      await mockExternalData(INITIAL_RATE, INITIAL_MCAP, 1000);
      expect(await baseTokenMonetaryPolicy.inRebaseWindow.call()).to.be.true;
      expect(
        await chain.isEthException(baseTokenMonetaryPolicy.rebase({from: orchestrator}))
      ).to.be.false;
      lastRebaseTimestamp = await baseTokenMonetaryPolicy.lastRebaseTimestampSec.call();
      expect(lastRebaseTimestamp.eq(nextRebaseWindowOpenTime)).to.be.true;
    });
  });
});
