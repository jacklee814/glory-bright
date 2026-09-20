import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imageName } from '../src/images.ts';

test('圖片檔名為 ASCII 且依型號與序號', () => {
  assert.equal(imageName('GB-DMR-2060-1', 0), 'gb-dmr-2060-1-1.webp');
  assert.equal(imageName('GB-DMR-2060-1', 2), 'gb-dmr-2060-1-3.webp');
});

test('含中文或空白的型號被轉為 ASCII', () => {
  assert.match(imageName('010102', 0), /^[a-z0-9-]+\.webp$/);
  assert.match(imageName('GB TR 3012', 0), /^[a-z0-9-]+\.webp$/);
});

test('完全非 ASCII 的型號仍產生可用檔名', () => {
  assert.match(imageName('崁燈', 0), /^[a-z0-9-]+\.webp$/);
});

test('toWebp 轉出 WebP 且不放大原始尺寸', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const sharp = (await import('sharp')).default;
  const { toWebp } = await import('../src/images.ts');

  const dir = await mkdtemp(join(tmpdir(), 'gb-img-'));
  try {
    const source = join(dir, 'source.png');
    const destination = join(dir, 'out.webp');
    // 模擬舊站的 200×200 小圖
    await sharp({ create: { width: 200, height: 200, channels: 3, background: '#cccccc' } }).png().toFile(source);
    await toWebp(source, destination);
    const meta = await sharp(destination).metadata();
    assert.equal(meta.format, 'webp');
    assert.equal(meta.width, 200, '不應放大');
    assert.equal(meta.height, 200, '不應放大');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
