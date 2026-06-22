import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import * as votingProxyModule from '../snapshot-strategies/voting-proxy/index.js';
import { _createVotingProxyStrategy, strategy } from '../snapshot-strategies/voting-proxy/index.js';

const proxy = address('11');
const direct = address('10');
const source = address('22');
const zeroSource = address('00');

function address(byte) {
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
      { strategies: [{ name: 'fixed-score', params: { scores: { [source]: 12 } } }] },
      123
    );

    assert.deepEqual(result, { [proxy]: 12 });
    assert.deepEqual(fixture.multicallCalls, [
      {
        network: '1',
        provider,
        addresses: [proxy],
        calls: [proxy],
        blockTag: 123
      }
    ]);
  });

  it('rejects malformed source() return data', async () => {
    const { result } = await scoreWithProvider([address('123')]);

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
        { strategies: [{ name: 'fixed-score', params: { scores: { [source]: 12 } } }] },
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
    await assert.rejects(
      () => strategy('space', '1', {}, [proxy], { strategies: [] }, 123),
      /requires at least one inner strategy/
    );
    await assert.rejects(
      () => strategy('space', '1', {}, [proxy], {}, 123),
      /requires at least one inner strategy/
    );
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
        { strategies: [{ name: 'fixed-score' }] },
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

async function scoreWithProvider(
  sourceResponses,
  addresses = [proxy],
  multicallError,
  provider = {}
) {
  const fixture = createFixedScoreFixture({ sourceResponses, multicallError });
  const result = await fixture.strategy(
    'space',
    '1',
    provider,
    addresses,
    { strategies: [{ name: 'fixed-score', params: { scores: { [source]: 12 } } }] },
    123
  );

  return { result, calls: fixture.calls, multicallCalls: fixture.multicallCalls };
}

function createFixedScoreFixture({ sourceResponses = [], multicallError } = {}) {
  const calls = [];
  const multicallCalls = [];

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
      callSourceMulticall: async (network, provider, sourceAddresses, blockTag) => {
        multicallCalls.push({
          network,
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
