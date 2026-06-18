import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { main, parseArgs, submitEnvelope, voteCalldata, withSignature } from '../scripts/submit-vote.mjs';

describe('submit-vote helper', () => {
  it('builds vote(bytes32) calldata for the owner account transaction', () => {
    const hash = `0x${'11'.repeat(32)}`;

    assert.equal(voteCalldata(hash), `0xa69beaba${'11'.repeat(32)}`);
  });

  it('rejects non-bytes32 vote hashes', () => {
    assert.throws(() => voteCalldata('0x1234'), /bytes32/);
  });

  it('sets the Snapshot envelope signature to 0x by default', () => {
    const envelope = {
      address: '0xVotingProxy',
      sig: '0x1234',
      data: { message: { from: '0xVotingProxy' } }
    };

    assert.deepEqual(withSignature(envelope), {
      address: '0xVotingProxy',
      sig: '0x',
      data: { message: { from: '0xVotingProxy' } }
    });
    assert.equal(withSignature(envelope, '0xbeef').sig, '0xbeef');
  });

  it('parses flags, boolean submit, and values', () => {
    assert.deepEqual(parseArgs(['--hash', `0x${'22'.repeat(32)}`, '--envelope', 'envelope.json', '--submit']), {
      hash: `0x${'22'.repeat(32)}`,
      envelope: 'envelope.json',
      submit: true
    });
    assert.deepEqual(parseArgs(['-h']), { help: true });
  });

  it('rejects unexpected positional arguments and missing values', () => {
    assert.throws(() => parseArgs(['unexpected']), /Unexpected argument/);
    assert.throws(() => parseArgs(['--hash']), /Missing value/);
    assert.throws(() => parseArgs(['--hash', '--submit']), /Missing value/);
  });

  it('submits envelopes and returns JSON responses', async () => {
    await withMockFetch(
      async (url, init) => new Response(JSON.stringify({ url, method: init?.method, ok: true }), { status: 200 }),
      async () => {
        assert.deepEqual(await submitEnvelope('https://seq.snapshot.org', { sig: '0x' }), {
          url: 'https://seq.snapshot.org',
          method: 'POST',
          ok: true
        });
      }
    );
  });

  it('includes text response bodies in submission errors', async () => {
    await withMockFetch(async () => new Response('bad request', { status: 400 }), async () => {
      await assert.rejects(() => submitEnvelope('https://seq.snapshot.org', { sig: '0x' }), /bad request/);
    });
  });

  it('prints help and hash output from main', async () => {
    assert.match(await captureStdout(() => main(['--help'])), /Usage:/);

    const hash = `0x${'33'.repeat(32)}`;
    const output = JSON.parse(await captureStdout(() => main(['--hash', hash])));

    assert.equal(output.voteHash, hash);
    assert.equal(output.voteCalldata, voteCalldata(hash));
  });

  it('loads envelopes, forces sig to 0x, and submits from main', async () => {
    const hash = `0x${'44'.repeat(32)}`;

    await withMockFetch(async () => new Response(JSON.stringify({ id: 'ok' }), { status: 200 }), async () => {
      await withEnvelopeFile({ address: '0xVotingProxy', sig: '0x1234', data: {} }, async (envelopePath) => {
        const output = JSON.parse(
          await captureStdout(() =>
            main(['--hash', hash, '--envelope', envelopePath, '--hub', 'https://hub.example', '--submit'])
          )
        );

        assert.equal(output.envelope.sig, '0x');
        assert.deepEqual(output.receipt, { id: 'ok' });
      });
    });
  });

  it('uses the default Snapshot sequencer hub when submitting from main', async () => {
    const hash = `0x${'66'.repeat(32)}`;

    await withMockFetch(async (url) => new Response(JSON.stringify({ url }), { status: 200 }), async () => {
      await withEnvelopeFile({ address: '0xVotingProxy', sig: '0x1234', data: {} }, async (envelopePath) => {
        const output = JSON.parse(
          await captureStdout(() => main(['--hash', hash, '--envelope', envelopePath, '--submit']))
        );

        assert.equal(output.receipt.url, 'https://seq.snapshot.org');
      });
    });
  });

  it('requires hash and an envelope when submitting from main', async () => {
    await assert.rejects(() => main([]), /Missing --hash/);
    await assert.rejects(() => main(['--hash', `0x${'55'.repeat(32)}`, '--submit']), /Missing --envelope/);
  });
});

async function withMockFetch(fetch, fn) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetch;

  try {
    await fn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function withEnvelopeFile(envelope, fn) {
  const dir = await mkdtemp(join(tmpdir(), 'voting-proxy-'));
  const envelopePath = join(dir, 'envelope.json');

  try {
    await writeFile(envelopePath, JSON.stringify(envelope));
    await fn(envelopePath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function captureStdout(fn) {
  const originalLog = console.log;
  const lines = [];
  console.log = (value) => lines.push(String(value));

  try {
    await fn();
    return lines.join('\n');
  } finally {
    console.log = originalLog;
  }
}
