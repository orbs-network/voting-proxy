import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { scoreWithVotingProxy } from '../snapshot-strategies/voting-proxy/proxyScoring.ts';

const direct = address('10');
const source = address('20');
const proxyHigh = address('30');
const proxyLow = address('11');

function address(byte: string): string {
  return `0x${byte.repeat(20)}`;
}

describe('voting-proxy score remapping', () => {
  it('keeps normal voter scores unchanged', async () => {
    const { result } = await scoreFixture({
      addresses: [direct],
      directScores: { [direct]: 7 }
    });

    assert.deepEqual(result, { [direct]: 7 });
  });

  it('returns the source score under a zero-vp proxy voter', async () => {
    const { result } = await scoreFixture({
      addresses: [proxyHigh],
      directScores: { [proxyHigh]: 0 },
      sourceByProxy: { [proxyHigh]: source },
      sourceScores: { [source]: 12 }
    });

    assert.deepEqual(result, { [proxyHigh]: 12 });
  });

  it('treats missing direct scores as zero-vp proxy candidates', async () => {
    const { result } = await scoreFixture({
      addresses: [proxyHigh],
      sourceByProxy: { [proxyHigh]: source },
      sourceScores: { [source]: 12 }
    });

    assert.deepEqual(result, { [proxyHigh]: 12 });
  });

  it('lets a direct source voter win over its proxy', async () => {
    const { result } = await scoreFixture({
      addresses: [source, proxyHigh],
      directScores: { [source]: 12, [proxyHigh]: 0 },
      sourceByProxy: { [proxyHigh]: source },
      sourceScores: { [source]: 12 }
    });

    assert.deepEqual(result, { [source]: 12, [proxyHigh]: 0 });
  });

  it('uses the lowest proxy address when multiple proxies resolve to the same source', async () => {
    const { result } = await scoreFixture({
      addresses: [proxyHigh, proxyLow],
      directScores: { [proxyHigh]: 0, [proxyLow]: 0 },
      sourceByProxy: { [proxyHigh]: source, [proxyLow]: source },
      sourceScores: { [source]: 12 }
    });

    assert.deepEqual(result, { [proxyHigh]: 0, [proxyLow]: 12 });
  });

  it('dedups source addresses before rescoring', async () => {
    const { scoredAddressSets } = await scoreFixture({
      addresses: [proxyHigh, proxyLow],
      directScores: { [proxyHigh]: 0, [proxyLow]: 0 },
      sourceByProxy: { [proxyHigh]: source, [proxyLow]: source },
      sourceScores: { [source]: 12 }
    });

    assert.deepEqual(scoredAddressSets, [[proxyHigh, proxyLow], [source]]);
  });

  it('returns zero for unresolved voters and sources without scores', async () => {
    assert.deepEqual((await scoreFixture({ addresses: [proxyHigh], directScores: { [proxyHigh]: 0 } })).result, {
      [proxyHigh]: 0
    });

    assert.deepEqual(
      (
        await scoreFixture({
          addresses: [proxyHigh],
          directScores: { [proxyHigh]: 0 },
          sourceByProxy: { [proxyHigh]: source }
        })
      ).result,
      { [proxyHigh]: 0 }
    );
  });

  it('matches scores and sources case-insensitively while preserving input casing', async () => {
    const upperProxy = proxyHigh.toUpperCase();
    const { result, scoredAddressSets } = await scoreFixture({
      addresses: [upperProxy],
      directScores: { [upperProxy]: 0 },
      sourceByProxy: { [proxyHigh]: source.toUpperCase() },
      sourceScores: { [source]: 12 }
    });

    assert.deepEqual(result, { [upperProxy]: 12 });
    assert.deepEqual(scoredAddressSets, [[upperProxy], [source]]);
  });

  it('scores original voters first and only resolves zero-vp source candidates', async () => {
    const { result, scoredAddressSets, resolvedAddressSets } = await scoreFixture({
      addresses: [direct, proxyHigh],
      directScores: { [direct]: 7, [proxyHigh]: 0 },
      sourceByProxy: { [proxyHigh]: source },
      sourceScores: { [source]: 12 }
    });

    assert.deepEqual(scoredAddressSets, [[direct, proxyHigh], [source]]);
    assert.deepEqual(resolvedAddressSets, [[proxyHigh]]);
    assert.deepEqual(result, { [direct]: 7, [proxyHigh]: 12 });
  });

  it('skips source resolution when all voters have direct voting power', async () => {
    const { result, scoredAddressSets, resolvedAddressSets } = await scoreFixture({
      addresses: [direct],
      directScores: { [direct]: 7 }
    });

    assert.deepEqual(scoredAddressSets, [[direct]]);
    assert.deepEqual(resolvedAddressSets, []);
    assert.deepEqual(result, { [direct]: 7 });
  });

  it('skips source scoring when no zero-vp voters resolve to sources', async () => {
    const { result, scoredAddressSets, resolvedAddressSets } = await scoreFixture({
      addresses: [proxyHigh],
      directScores: { [proxyHigh]: 0 }
    });

    assert.deepEqual(scoredAddressSets, [[proxyHigh]]);
    assert.deepEqual(resolvedAddressSets, [[proxyHigh]]);
    assert.deepEqual(result, { [proxyHigh]: 0 });
  });
});

async function scoreFixture({
  addresses,
  directScores = {},
  sourceByProxy = {},
  sourceScores = {}
}: {
  addresses: string[];
  directScores?: Record<string, number>;
  sourceByProxy?: Record<string, string>;
  sourceScores?: Record<string, number>;
}) {
  const scoredAddressSets: string[][] = [];
  const resolvedAddressSets: string[][] = [];
  let scoreCalls = 0;

  const result = await scoreWithVotingProxy({
    addresses,
    scoreInner: async (scoringAddresses: string[]) => {
      scoredAddressSets.push(scoringAddresses);
      scoreCalls += 1;

      return scoreCalls === 1 ? directScores : sourceScores;
    },
    resolveSources: async (sourceCandidates: string[]) => {
      resolvedAddressSets.push(sourceCandidates);

      return sourceByProxy;
    }
  });

  return { result, scoredAddressSets, resolvedAddressSets };
}
