import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Interface } from '@ethersproject/abi';
import * as votingProxyModule from '../snapshot-strategies/voting-proxy/index.ts';
import { _createVotingProxyStrategy, strategy } from '../snapshot-strategies/voting-proxy/index.ts';
import { resetGetScoresDirectHandler, setGetScoresDirectHandler } from '../utils.ts';

const proxy = address('11');
const direct = address('10');
const source = address('22');
const zeroSource = address('00');
const factory = address('44');
const multicall3Address = '0xcA11bde05977b3631167028862bE2a173976CA11';
const aggregateInterface = new Interface([
  'function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) view returns (tuple(bool success, bytes returnData)[] returnData)'
]);
const factoryInterface = new Interface(['function source(address proxy) view returns (address)']);
type SourceResult = string | 'failed' | 'malformed';

function address(byte: string): string {
  return `0x${byte.repeat(20)}`;
}

describe('voting-proxy strategy source resolution', () => {
  it('keeps source resolution helpers internal', () => {
    assert.equal('decodeAddress' in votingProxyModule, false);
    assert.equal('resolveProxySources' in votingProxyModule, false);
    assert.equal('validateOptions' in votingProxyModule, false);
    assert.equal('createVotingProxyStrategy' in votingProxyModule, false);
  });

  it('resolves sources through one multicall at the snapshot block', async () => {
    const provider = {};
    const fixture = createFixedScoreFixture({ sourceResponses: [source] });

    const result = await fixture.strategy(
      'space',
      '1',
      provider,
      [proxy],
      { factory, strategies: [{ name: 'fixed-score', params: { scores: { [source]: 12 } } }] },
      123
    );

    assert.deepEqual(result, { [proxy]: 12 });
    assert.deepEqual(fixture.multicallCalls, [
      {
        factory,
        provider,
        addresses: [proxy],
        calls: [proxy],
        blockTag: 123
      }
    ]);
  });

  it('resolves zero-vp proxy sources through the exported strategy', async () => {
    const provider = createProvider([source]);
    const calls: Array<{
      addresses: string[];
      network: string;
      snapshot: number | string;
      strategies: Array<{ name: string }>;
    }> = [];
    setGetScoresDirectHandler(async (_space, strategies, network, _provider, addresses, snapshot) => {
      calls.push({ addresses, network, snapshot, strategies });

      return calls.length === 1
        ? [{ [proxy]: 0 }]
        : [{ [source]: 12 }];
    });

    const result = await strategy(
      'space',
      '1',
      provider,
      [proxy],
      { factory, strategies: [{ name: 'fixed-score' }] },
      123
    );

    assert.deepEqual(result, { [proxy]: 12 });
    assert.equal(provider.calls.length, 1);
    assert.equal(provider.calls[0][0].to, multicall3Address);
    assert.equal(provider.calls[0][1], 123);
    assert.deepEqual(decodeAggregateCalls(provider), [
      [factory, true, factorySourceCalldata(proxy)]
    ]);
    assert.deepEqual(calls[1], {
      addresses: [source],
      network: '1',
      snapshot: 123,
      strategies: [{ name: 'fixed-score' }]
    });
    resetGetScoresDirectHandler();
  });

  it('keeps malformed, zero, failed, and missing provider sources unresolved in the exported strategy', async () => {
    setGetScoresDirectHandler(async () => [{ [proxy]: 0, [direct]: 0 }]);
    assert.deepEqual(
      await strategy(
        'space',
        '1',
        createProvider(['malformed', zeroSource]),
        [proxy, direct],
        { factory, strategies: [{ name: 'fixed-score' }] },
        123
      ),
      { [proxy]: 0, [direct]: 0 }
    );
    assert.deepEqual(
      await strategy(
        'space',
        '1',
        createProvider(['failed', source]),
        [proxy, direct],
        { factory, strategies: [{ name: 'fixed-score' }] },
        123
      ),
      { [proxy]: 0, [direct]: 0 }
    );
    assert.deepEqual(
      await strategy(
        'space',
        '1',
        null,
        [proxy],
        { factory, strategies: [{ name: 'fixed-score' }] },
        123
      ),
      { [proxy]: 0 }
    );
    resetGetScoresDirectHandler();
  });

  it('uses latest for non-number snapshots in the exported strategy', async () => {
    const provider = createProvider([source]);
    setGetScoresDirectHandler(async (_space, _strategies, _network, _provider, addresses) =>
      addresses[0] === proxy ? [{ [proxy]: 0 }] : [{ [source]: 12 }]
    );

    assert.deepEqual(
      await strategy(
        'space',
        '1',
        provider,
        [proxy],
        { factory, strategies: [{ name: 'fixed-score' }] },
        'latest'
      ),
      { [proxy]: 12 }
    );
    assert.equal(provider.calls[0][1], 'latest');
    resetGetScoresDirectHandler();
  });

  it('rejects malformed source() return data', async () => {
    const { result } = await scoreWithProvider(['malformed']);

    assert.deepEqual(result, { [proxy]: 0 });
  });

  it('keeps resolved sources and drops unresolved sources in the same batch', async () => {
    const unresolvedProxy = address('33');

    const { result, multicallCalls } = await scoreWithProvider(
      [source, '0x1234'],
      [proxy, unresolvedProxy]
    );

    assert.deepEqual(result, { [proxy]: 12, [unresolvedProxy]: 0 });
    assert.deepEqual(multicallCalls[0].calls, [
      proxy,
      unresolvedProxy
    ]);
  });

  it(
    'accepts array-shaped multicall results and uses latest for non-number snapshots',
    async () => {
      const provider = {};
      const fixture = createFixedScoreFixture({ sourceResponses: [[source]] });

      const result = await fixture.strategy(
        'space',
        '1',
        provider,
        [proxy],
        { factory, strategies: [{ name: 'fixed-score', params: { scores: { [source]: 12 } } }] },
        'latest'
      );

      assert.deepEqual(result, { [proxy]: 12 });
      assert.equal(fixture.multicallCalls[0].blockTag, 'latest');
    }
  );

  it('ignores zero sources, failed multicalls, and missing providers', async () => {
    assert.deepEqual((await scoreWithProvider([zeroSource])).result, { [proxy]: 0 });
    assert.deepEqual((await scoreWithProvider([], [proxy], new Error('not a contract'))).result, {
      [proxy]: 0
    });
    assert.deepEqual((await scoreWithProvider([source], [proxy], undefined, null)).result, {
      [proxy]: 0
    });
  });

  it('validates required inner strategy options', async () => {
    const fixture = createFixedScoreFixture();

    await assert.rejects(
      () => strategy('space', '1', {}, [proxy], { factory, strategies: [] }, 123),
      /requires at least one inner strategy/
    );
    await assert.rejects(
      () => strategy('space', '1', {}, [proxy], {}, 123),
      /requires at least one inner strategy/
    );
    await assert.rejects(
      () => fixture.strategy('space', '1', {}, [proxy], { strategies: [] }, 123),
      /requires at least one inner strategy/
    );
  });

  it('uses the configured factory independent of the strategy network', async () => {
    const provider = createProvider([source]);
    setGetScoresDirectHandler(async (_space, _strategies, _network, _provider, addresses) =>
      addresses[0] === proxy ? [{ [proxy]: 0 }] : [{ [source]: 12 }]
    );

    assert.deepEqual(
      await strategy(
        'space',
        'unsupported',
        provider,
        [proxy],
        { factory, strategies: [{ name: 'fixed-score' }] },
        123
      ),
      { [proxy]: 12 }
    );
    assert.equal(provider.calls.length, 1);
    resetGetScoresDirectHandler();
  });

  it('scores voters before and after resolving proxy sources through getScoresDirect', async () => {
    const fixture = createFixedScoreFixture({ sourceResponses: [source] });
    const provider = {};

    const result = await fixture.strategy(
      'space',
      '1',
      provider,
      [direct, proxy],
      {
        factory,
        strategies: [
          {
            name: 'fixed-score',
            network: '2',
            params: {
              scores: {
                [direct]: 7,
                [source]: 12
              }
            }
          }
        ]
      },
      123
    );

    assert.deepEqual(result, { [direct]: 7, [proxy]: 12 });
    assert.deepEqual(fixture.calls, [
      {
        addresses: [direct, proxy],
        network: '1',
        snapshot: 123,
        strategies: [
          {
            name: 'fixed-score',
            network: '2',
            params: {
              scores: {
                [direct]: 7,
                [source]: 12
              }
            }
          }
        ]
      },
      {
        addresses: [source],
        network: '1',
        snapshot: 123,
        strategies: [
          {
            name: 'fixed-score',
            network: '2',
            params: {
              scores: {
                [direct]: 7,
                [source]: 12
              }
            }
          }
        ]
      }
    ]);
  });

  it('sums score maps returned for multiple configured inner strategies', async () => {
    const fixture = createFixedScoreFixture();

    assert.deepEqual(
      await fixture.strategy(
        'space',
        '1',
        {},
        [direct],
        {
          factory,
          strategies: [
            { name: 'fixed-score', params: { scores: { [direct]: 2 } } },
            { name: 'fixed-score', params: { scores: { [direct]: 3 } } }
          ]
        },
        123
      ),
      { [direct]: 5 }
    );
  });

  it('sums and ignores extra score keys in the exported strategy', async () => {
    setGetScoresDirectHandler(async () => [
      { [direct]: 2, [source]: 3 },
      { [direct]: 4 }
    ]);

    assert.deepEqual(
      await strategy(
        'space',
        '1',
        {},
        [direct],
        {
          factory,
          strategies: [
            { name: 'fixed-score' },
            { name: 'fixed-score' }
          ]
        },
        123
      ),
      { [direct]: 6 }
    );
    resetGetScoresDirectHandler();
  });

  it('propagates exported strategy scoring failures', async () => {
    setGetScoresDirectHandler(async () => {
      throw new Error('score api unavailable');
    });

    await assert.rejects(
      () =>
        strategy(
          'space',
          '1',
          {},
          [direct],
          { factory, strategies: [{ name: 'fixed-score' }] },
          123
        ),
      /score api unavailable/
    );
    resetGetScoresDirectHandler();
  });

  it('handles extra score keys emitted by getScoresDirect without returning them', async () => {
    const strategyWithExtraScores = _createVotingProxyStrategy({
      getScoresDirect: async () => [{ [direct]: 2, [source]: 3 }],
      callSourceMulticall: async () => []
    });

    assert.deepEqual(
      await strategyWithExtraScores(
        'space',
        '1',
        {},
        [direct],
        { factory, strategies: [{ name: 'fixed-score' }] },
        123
      ),
      { [direct]: 2 }
    );
  });

  it('passes strategy options through to getScoresDirect', async () => {
    const fixture = createFixedScoreFixture();

    assert.deepEqual(
      await fixture.strategy(
        'space',
        '1',
        {},
        [direct],
        {
          factory,
          strategies: [{ name: 'fixed-score' }]
        },
        123
      ),
      { [direct]: 0 }
    );
    assert.deepEqual(fixture.calls[0], {
      addresses: [direct],
      network: '1',
      snapshot: 123,
      strategies: [{ name: 'fixed-score' }]
    });
  });
});

function createProvider(sourceResults: SourceResult[], error?: Error) {
  let resultIndex = 0;

  return {
    calls: [] as Array<[{ to: string; data: string }, number | 'latest']>,
    async call(transaction: { to: string; data: string }, blockTag: number | 'latest') {
      this.calls.push([transaction, blockTag]);
      if (error) throw error;

      const calls = aggregateInterface.decodeFunctionData('aggregate3', transaction.data)[0];
      const pageResults = sourceResults.slice(resultIndex, resultIndex + calls.length);
      resultIndex += calls.length;

      return aggregateInterface.encodeFunctionResult('aggregate3', [
        pageResults.map(encodeSourceResult)
      ]);
    }
  };
}

function encodeSourceResult(sourceResult: SourceResult): [boolean, string] {
  if (sourceResult === 'failed') return [false, '0x'];
  if (sourceResult === 'malformed') return [true, '0x1234'];

  return [true, factoryInterface.encodeFunctionResult('source', [sourceResult])];
}

function factorySourceCalldata(proxyAddress: string): string {
  return factoryInterface.encodeFunctionData('source', [proxyAddress.toLowerCase()]);
}

function decodeAggregateCalls(provider: ReturnType<typeof createProvider>): Array<[string, boolean, string]> {
  const calls = aggregateInterface.decodeFunctionData('aggregate3', provider.calls[0][0].data)[0];

  return Array.from(calls as unknown as Array<[string, boolean, string]>).map(([target, allowFailure, data]) => [
    target,
    allowFailure,
    data
  ]);
}

async function scoreWithProvider(
  sourceResponses: unknown[],
  addresses = [proxy],
  multicallError?: Error,
  provider: any = {}
) {
  const fixture = createFixedScoreFixture({ sourceResponses, multicallError });
  const result = await fixture.strategy(
    'space',
    '1',
    provider,
    addresses,
    { factory, strategies: [{ name: 'fixed-score', params: { scores: { [source]: 12 } } }] },
    123
  );

  return { result, calls: fixture.calls, multicallCalls: fixture.multicallCalls };
}

function createFixedScoreFixture({
  sourceResponses = [],
  multicallError
}: {
  sourceResponses?: unknown[];
  multicallError?: Error;
} = {}) {
  const calls: Array<{
    addresses: string[];
    network: string;
    snapshot: number | string;
    strategies: Array<{ name: string; params?: { scores?: Record<string, number> } }>;
  }> = [];
  const multicallCalls: Array<{
    factory: string;
    provider: any;
    addresses: string[];
    calls: string[];
    blockTag: number | 'latest';
  }> = [];

  return {
    calls,
    multicallCalls,
    strategy: _createVotingProxyStrategy({
      getScoresDirect: async (_space, strategies, network, _provider, addresses, snapshot) => {
        calls.push({ addresses, network, snapshot, strategies });

        return strategies.map(({ params = {} }) =>
          Object.fromEntries(
            addresses.map((address) => [
              address,
              Number(params.scores?.[address.toLowerCase()] ?? 0)
            ])
          )
        );
      },
      callSourceMulticall: async (provider, sourceFactory, sourceAddresses, blockTag) => {
        multicallCalls.push({
          factory: sourceFactory,
          provider,
          addresses: sourceAddresses,
          calls: sourceAddresses,
          blockTag
        });
        if (multicallError) throw multicallError;

        return sourceResponses.slice(0, sourceAddresses.length);
      }
    })
  };
}
