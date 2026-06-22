import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import * as votingProxyModule from '../snapshot-strategies/voting-proxy/index.js';
import { _createVotingProxyStrategy, strategy } from '../snapshot-strategies/voting-proxy/index.js';

const proxy = address('11');
const direct = address('10');
const source = address('22');
const encodedSource = `0x${'0'.repeat(24)}${source.slice(2)}`;

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

  it('resolves sources through provider.call at the snapshot block', async () => {
    const calls = [];
    const provider = {
      async call(tx, blockTag) {
        calls.push([tx, blockTag]);
        return encodedSource;
      }
    };

    const { result } = await scoreWithProvider(provider);

    assert.deepEqual(result, { [proxy]: 12 });
    assert.deepEqual(calls, [[{ to: proxy, data: '0x67e828bf' }, 123]]);
  });

  it('rejects malformed source() return data', async () => {
    const { result } = await scoreWithProvider({
      async call() {
        return '0x1234';
      }
    });

    assert.deepEqual(result, { [proxy]: 0 });
  });

  it('keeps resolved sources and drops unresolved sources in the same batch', async () => {
    const unresolvedProxy = address('33');
    const provider = {
      async call(tx) {
        return tx.to === proxy ? encodedSource : '0x1234';
      }
    };

    const { result } = await scoreWithProvider(provider, [proxy, unresolvedProxy]);

    assert.deepEqual(result, { [proxy]: 12, [unresolvedProxy]: 0 });
  });

  it('ignores non-contracts, reverting calls, zero sources, and providers without call support', async () => {
    const zeroSource = `0x${'0'.repeat(64)}`;
    const revertingProvider = {
      async call() {
        throw new Error('not a contract');
      }
    };
    const zeroProvider = {
      async call() {
        return zeroSource;
      }
    };

    assert.deepEqual((await scoreWithProvider({})).result, { [proxy]: 0 });
    assert.deepEqual((await scoreWithProvider(null)).result, { [proxy]: 0 });
    assert.deepEqual((await scoreWithProvider(revertingProvider)).result, { [proxy]: 0 });
    assert.deepEqual((await scoreWithProvider(zeroProvider)).result, { [proxy]: 0 });
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
    await assert.rejects(
      () =>
        strategy(
          'space',
          '1',
          {},
          [proxy],
          { strategies: [{ name: '../test/fixtures/fixed-score', params: {} }] },
          123
        ),
      /Invalid inner strategy name/
    );
  });

  it('runs inner strategies before and after resolving proxy sources', async () => {
    const fixture = createFixedScoreFixture();
    const provider = {
      async call() {
        return encodedSource;
      }
    };

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
      { addresses: [direct, proxy], network: '2', snapshot: 123 },
      { addresses: [source], network: '2', snapshot: 123 }
    ]);
  });

  it('sums multiple configured inner strategies', async () => {
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

  it('handles extra score keys emitted by inner strategies without returning them', async () => {
    const strategyWithExtraScores = _createVotingProxyStrategy(async () => ({
      strategy: async () => ({ [direct]: 2, [source]: 3 })
    }));

    assert.deepEqual(
      await strategyWithExtraScores('space', '1', {}, [direct], { strategies: [{ name: 'fixed-score' }] }, 123),
      { [direct]: 2 }
    );
  });

  it('defaults inner strategy network and params', async () => {
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
    assert.deepEqual(fixture.calls[0], { addresses: [direct], network: '1', snapshot: 123 });
  });
});

async function scoreWithProvider(provider, addresses = [proxy]) {
  const fixture = createFixedScoreFixture();
  const result = await fixture.strategy(
    'space',
    '1',
    provider,
    addresses,
    { strategies: [{ name: 'fixed-score', params: { scores: { [source]: 12 } } }] },
    123
  );

  return { result, calls: fixture.calls };
}

function createFixedScoreFixture() {
  const calls = [];

  return {
    calls,
    strategy: _createVotingProxyStrategy(async () => ({
      strategy: async (_space, network, _provider, addresses, params = {}, snapshot) => {
        calls.push({ addresses, network, snapshot });

        return Object.fromEntries(
          addresses.map((address) => [address, Number(params.scores?.[address.toLowerCase()] ?? 0)])
        );
      }
    }))
  };
}
