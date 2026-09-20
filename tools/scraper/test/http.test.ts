import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isInterceptPage, RateLimiter } from '../src/http.ts';

test('偵測 HiNet WFS 攔截頁', () => {
  const html = `<html><head><meta http-equiv="pragma" content="no-cache"><meta http-equiv="refresh" content="0;url='http://wfs.hinet.net?flag=W&uid=?&host=www.glory-bright.com.tw&mwn=MC006&&S012'"></head></html>`;
  assert.equal(isInterceptPage(html), true);
});

test('正常產品頁不被判為攔截頁', () => {
  const html = `<html><head><title>榮輝照明科技有限公司</title></head><body>GB-DMR-2060-1</body></html>`;
  assert.equal(isInterceptPage(html), false);
});

test('空白回應視為攔截頁', () => {
  assert.equal(isInterceptPage(''), true);
});

test('RateLimiter 兩次 wait 之間至少間隔設定值', async () => {
  const limiter = new RateLimiter(120);
  const started = Date.now();
  await limiter.wait();
  await limiter.wait();
  assert.ok(Date.now() - started >= 120, '第二次 wait 應被延遲');
});
