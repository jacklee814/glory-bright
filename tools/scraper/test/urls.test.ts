import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapshotName, lightListUrl, switchListUrl, lightDetailUrl, lightSubCategoryUrl } from '../src/urls.ts';

test('列表頁 URL 帶分頁參數', () => {
  assert.equal(lightListUrl(42, 1), 'http://www.glory-bright.com.tw/goods_light.php?id=42&act=goods&page=1');
  assert.equal(switchListUrl(578, 2), 'http://www.glory-bright.com.tw/goods.php?id=578&act=goods&page=2');
});

test('明細頁 URL', () => {
  assert.equal(lightDetailUrl(120), 'http://www.glory-bright.com.tw/goods_light_list.php?id=120');
});

test('snapshotName 產生安全的 ASCII 檔名', () => {
  assert.equal(snapshotName('http://www.glory-bright.com.tw/goods_light.php?id=42&act=goods&page=1'), 'goods_light-id42-actgoods-page1');
  assert.equal(snapshotName('http://www.glory-bright.com.tw/index.php'), 'index');
});

test('snapshotName 對不同 URL 不碰撞', () => {
  const a = snapshotName(lightListUrl(42, 1));
  const b = snapshotName(lightListUrl(42, 2));
  const c = snapshotName(switchListUrl(42, 1));
  assert.equal(new Set([a, b, c]).size, 3);
});

test('中文查詢參數的頁面不會互相覆蓋', () => {
  const names = ['崁燈', '軌道燈', '吸頂/懸吊燈', '線型燈', '辦公/工程照明']
    .map(name => snapshotName(lightSubCategoryUrl(name)));
  assert.equal(new Set(names).size, names.length, `檔名須唯一，實際為 ${names.join(', ')}`);
  for (const name of names) assert.match(name, /^[A-Za-z0-9._-]+$/, `檔名須為 ASCII：${name}`);
});

test('純 ASCII 的 URL 檔名維持可讀且不加雜湊', () => {
  assert.equal(snapshotName(lightListUrl(42, 1)), 'goods_light-id42-actgoods-page1');
  assert.equal(snapshotName(lightDetailUrl(120)), 'goods_light_list-id120');
});
