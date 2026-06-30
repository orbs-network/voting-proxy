import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

test('propagates missing Score API utils imports', async () => {
  const root = await mkdtemp(join(process.cwd(), 'tmp-voting-proxy-missing-utils-'));

  try {
    const strategyDir = join(root, 'snapshot-strategies', 'voting-proxy');
    await mkdir(strategyDir, { recursive: true });
    await copyFile(
      new URL('../snapshot-strategies/voting-proxy/index.ts', import.meta.url),
      join(strategyDir, 'index.ts')
    );
    await copyFile(
      new URL('../snapshot-strategies/voting-proxy/proxyScoring.ts', import.meta.url),
      join(strategyDir, 'proxyScoring.ts')
    );

    const { strategy } = await import(pathToFileURL(join(strategyDir, 'index.ts')).href);

    await assert.rejects(
      () =>
        strategy(
          'space',
          '1',
          {},
          ['0x1111111111111111111111111111111111111111'],
          {
            factory: '0x2222222222222222222222222222222222222222',
            strategies: [{ name: 'fixed-score' }]
          },
          123
        ),
      (error) =>
        error instanceof Error &&
        'code' in error &&
        error.code === 'ERR_MODULE_NOT_FOUND'
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
