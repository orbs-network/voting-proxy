import assert from 'node:assert/strict';
import { rename } from 'node:fs/promises';
import { test } from 'node:test';

import { strategy } from '../snapshot-strategies/voting-proxy/index.ts';

const utilsPath = new URL('../utils.ts', import.meta.url);
const hiddenUtilsPath = new URL('../utils.ts.hidden', import.meta.url);

test('propagates missing Score API utils imports', async () => {
  await rename(utilsPath, hiddenUtilsPath);

  try {
    await assert.rejects(
      () =>
        strategy(
          'space',
          '1',
          {},
          ['0x1111111111111111111111111111111111111111'],
          { strategies: [{ name: 'fixed-score' }] },
          123
        ),
      (error) =>
        error instanceof Error &&
        'code' in error &&
        error.code === 'ERR_MODULE_NOT_FOUND'
    );
  } finally {
    await rename(hiddenUtilsPath, utilsPath);
  }
});
