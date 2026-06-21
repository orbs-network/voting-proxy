import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  normalizedScoreMap,
  remapProxyScores,
  scoreWithVotingProxy,
  sourceAddressesToScore
} from '../snapshot-strategies/voting-proxy/proxyScoring.js';

const direct = address('10');
const source = address('20');
const proxyHigh = address('30');
const proxyLow = address('11');

function address(byte) {
  return `0x${byte.repeat(20)}`;
}

describe('voting-proxy score remapping', () => {
  it('keeps normal voter scores unchanged', () => {
    assert.deepEqual(remapProxyScores([direct], { [direct]: 7 }, {}, {}), {
      [direct]: 7
    });
  });

  it('returns the source score under a zero-vp proxy voter', () => {
    assert.deepEqual(
      remapProxyScores([proxyHigh], { [proxyHigh]: 0 }, { [proxyHigh]: source }, { [source]: 12 }),
      {
        [proxyHigh]: 12
      }
    );
  });

  it('treats missing direct scores as zero-vp proxy candidates', async () => {
    const result = await scoreWithVotingProxy({
      addresses: [proxyHigh],
      scoreInner: async (addresses) => (addresses[0] === source ? { [source]: 12 } : {}),
      resolveSources: async () => ({ [proxyHigh]: source })
    });

    assert.deepEqual(result, { [proxyHigh]: 12 });
  });

  it('lets a direct source voter win over its proxy', () => {
    assert.deepEqual(
      remapProxyScores(
        [source, proxyHigh],
        { [source]: 12, [proxyHigh]: 0 },
        { [proxyHigh]: source },
        { [source]: 12 }
      ),
      {
        [source]: 12,
        [proxyHigh]: 0
      }
    );
  });

  it('uses the lowest proxy address when multiple proxies resolve to the same source', () => {
    assert.deepEqual(
      remapProxyScores(
        [proxyHigh, proxyLow],
        { [proxyHigh]: 0, [proxyLow]: 0 },
        { [proxyHigh]: source, [proxyLow]: source },
        { [source]: 12 }
      ),
      {
        [proxyHigh]: 0,
        [proxyLow]: 12
      }
    );
  });

  it('dedups source addresses before rescoring', () => {
    assert.deepEqual(
      sourceAddressesToScore(
        [proxyHigh, proxyLow],
        { [proxyHigh]: 0, [proxyLow]: 0 },
        { [proxyHigh]: source, [proxyLow]: source }
      ),
      [source]
    );
  });

  it('returns zero when a resolved source has no source score', () => {
    assert.deepEqual(remapProxyScores([proxyHigh], { [proxyHigh]: 0 }, { [proxyHigh]: source }, {}), {
      [proxyHigh]: 0
    });
  });

  it('matches scores and sources case-insensitively while preserving input casing', () => {
    const upperProxy = proxyHigh.toUpperCase();

    assert.deepEqual(
      remapProxyScores([upperProxy], { [upperProxy]: 0 }, { [proxyHigh]: source.toUpperCase() }, { [source]: 12 }),
      {
        [upperProxy]: 12
      }
    );
  });

  it('does not rescore positive-vp voters even when they expose source()', () => {
    assert.deepEqual(sourceAddressesToScore([proxyHigh], { [proxyHigh]: 5 }, { [proxyHigh]: source }), []);
  });

  it('does not rescore unresolved zero-vp voters or sources already present as voters', () => {
    assert.deepEqual(sourceAddressesToScore([proxyHigh], { [proxyHigh]: 0 }, {}), []);
    assert.deepEqual(
      sourceAddressesToScore([source, proxyHigh], { [source]: 12, [proxyHigh]: 0 }, { [proxyHigh]: source }),
      []
    );
    assert.deepEqual(remapProxyScores([proxyHigh], { [proxyHigh]: 0 }, {}, {}), { [proxyHigh]: 0 });
    assert.deepEqual(remapProxyScores([proxyHigh], { [proxyHigh]: 5 }, { [proxyHigh]: source }, {}), {
      [proxyHigh]: 5
    });
  });

  it('normalizes score maps once for repeated lookups', () => {
    const scores = normalizedScoreMap({ [proxyHigh.toUpperCase()]: 9 });

    assert.equal(scores.get(proxyHigh), 9);
    assert.equal(scores.get(proxyHigh.toUpperCase()), 9);
  });

  it('scores original voters first and only resolves zero-vp source candidates', async () => {
    const scoredAddressSets = [];
    const resolvedAddressSets = [];

    const result = await scoreWithVotingProxy({
      addresses: [direct, proxyHigh],
      scoreInner: async (addresses) => {
        scoredAddressSets.push(addresses);
        if (addresses[0] === source) return { [source]: 12 };

        return { [direct]: 7, [proxyHigh]: 0 };
      },
      resolveSources: async (addresses) => {
        resolvedAddressSets.push(addresses);
        return { [proxyHigh]: source };
      }
    });

    assert.deepEqual(scoredAddressSets, [[direct, proxyHigh], [source]]);
    assert.deepEqual(resolvedAddressSets, [[proxyHigh]]);
    assert.deepEqual(result, { [direct]: 7, [proxyHigh]: 12 });
  });

  it('skips source resolution when all voters have direct voting power', async () => {
    let resolveCalls = 0;
    const result = await scoreWithVotingProxy({
      addresses: [direct],
      scoreInner: async () => ({ [direct]: 7 }),
      resolveSources: async () => {
        resolveCalls += 1;
        return {};
      }
    });

    assert.equal(resolveCalls, 0);
    assert.deepEqual(result, { [direct]: 7 });
  });

  it('skips source scoring when zero-vp voters resolve to no source', async () => {
    const scoredAddressSets = [];
    const result = await scoreWithVotingProxy({
      addresses: [proxyHigh],
      scoreInner: async (addresses) => {
        scoredAddressSets.push(addresses);
        return { [proxyHigh]: 0 };
      },
      resolveSources: async () => ({})
    });

    assert.deepEqual(scoredAddressSets, [[proxyHigh]]);
    assert.deepEqual(result, { [proxyHigh]: 0 });
  });
});
