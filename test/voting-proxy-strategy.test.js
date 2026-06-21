import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createVotingProxyStrategy,
  decodeAddress,
  resolveProxySources,
  strategy
} from '../snapshot-strategies/voting-proxy/index.js';

const proxy = address('11');
const direct = address('10');
const source = address('22');
const encodedSource = `0x${'0'.repeat(24)}${source.slice(2)}`;

function address(byte) {
  return `0x${byte.repeat(20)}`;
}

describe('voting-proxy strategy source resolution', () => {
  it('decodes ABI encoded address results', () => {
    assert.equal(decodeAddress(encodedSource), source);
  });

  it('rejects malformed source() return data', () => {
    assert.equal(decodeAddress('0x1234'), undefined);
  });

  it('resolves sources through provider.call at the snapshot block', async () => {
    const calls = [];
    const provider = {
      async call(tx, blockTag) {
        calls.push([tx, blockTag]);
        return encodedSource;
      }
    };

    assert.deepEqual(await resolveProxySources(provider, [proxy], 123), { [proxy]: source });
    assert.deepEqual(calls, [[{ to: proxy, data: '0x67e828bf' }, 123]]);
  });

  it('keeps resolved sources and drops unresolved sources in the same batch', async () => {
    const unresolvedProxy = address('33');
    const provider = {
      async call(tx) {
        return tx.to === proxy ? encodedSource : '0x1234';
      }
    };

    assert.deepEqual(await resolveProxySources(provider, [proxy, unresolvedProxy], 123), { [proxy]: source });
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

    assert.deepEqual(await resolveProxySources({}, [proxy], 123), {});
    assert.deepEqual(await resolveProxySources(null, [proxy], 123), {});
    assert.deepEqual(await resolveProxySources(revertingProvider, [proxy], 123), {});
    assert.deepEqual(await resolveProxySources(zeroProvider, [proxy], 123), {});
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
          { sourceMethod: 'owner', strategies: [{ name: 'fixed-score', params: {} }] },
          123
        ),
      /sourceMethod = "source"/
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
    const strategyWithExtraScores = createVotingProxyStrategy(async () => ({
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
    assert.deepEqual(fixture.calls, [{ addresses: [direct], network: '1', snapshot: 123 }]);
  });
});

function createFixedScoreFixture() {
  const calls = [];

  return {
    calls,
    strategy: createVotingProxyStrategy(async () => ({
      strategy: async (_space, network, _provider, addresses, params = {}, snapshot) => {
        calls.push({ addresses, network, snapshot });

        return Object.fromEntries(
          addresses.map((address) => [address, Number(params.scores?.[address.toLowerCase()] ?? 0)])
        );
      }
    }))
  };
}
