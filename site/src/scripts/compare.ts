import type { Product } from '@glory-bright/shared/schema';

const products: Product[] = JSON.parse(document.querySelector('#compare-data')!.textContent!);
const known = new Map(products.map(product => [product.model, product]));
const key = 'glory-bright-comparison';
let selected: string[] = [];
try {
  const saved: unknown = JSON.parse(sessionStorage.getItem(key) ?? '[]');
  if (Array.isArray(saved)) selected = [...new Set(saved.filter((model): model is string => typeof model === 'string' && known.has(model)))].slice(0, 3);
} catch { /* Storage may be disabled; in-page comparison still works. */ }
const bar = document.querySelector<HTMLElement>('#compare-bar')!;
const dialog = document.querySelector<HTMLDialogElement>('#compare-dialog')!;
const summary = document.querySelector('#compare-summary')!;
const status = document.querySelector('#compare-status')!;

// A product-detail page has its model in its H1; cards provide explicit controls.
const model = document.querySelector('h1')?.textContent?.trim();
if (model && known.has(model)) {
  const label = document.createElement('label');
  const input = document.createElement('input');
  input.type = 'checkbox'; input.dataset.compare = model;
  label.append(input, ' 加入比較');
  document.querySelector('h1')!.after(label);
}
const controls = [...document.querySelectorAll<HTMLInputElement>('[data-compare]')];
function update() {
  controls.forEach(input => { input.checked = selected.includes(input.dataset.compare!); });
  bar.hidden = selected.length === 0;
  summary.textContent = `已選 ${selected.length}/3：${selected.join('、')}`;
  document.body.classList.toggle('has-comparison', selected.length > 0);
  try { sessionStorage.setItem(key, JSON.stringify(selected)); } catch { /* Keep in memory. */ }
}
controls.forEach(input => input.addEventListener('change', () => {
  const model = input.dataset.compare!;
  if (input.checked && !selected.includes(model)) {
    if (selected.length === 3) {
      input.checked = false;
      status.textContent = '最多比較 3 項產品，請先取消一項。';
      return;
    }
    selected.push(model);
  } else selected = selected.filter(value => value !== model);
  status.textContent = `已選 ${selected.length} 項產品`;
  update();
}));
document.querySelector('#compare-clear')!.addEventListener('click', () => { selected = []; update(); });
function specifications(product: Product): Record<string, string> {
  if (product.kind === 'light') return {
    '種類': '燈具', '功率': product.watt ? `${product.watt}W` : '—', '孔徑': product.cutoutDia ? `${product.cutoutDia}mm` : '—',
    '色溫': product.cct.map(value => `${value}K`).join(' / ') || '—', '演色性': product.cri ? `CRI ${product.cri}` : '—',
    '角度': product.beamAngle.map(value => `${value}°`).join(' / ') || '—', '顏色': product.colors.join('、') || '—',
    '燈座': product.socket || '—', '尺寸': product.dimensions || '—', '電壓': product.voltage || '—',
  };
  const typeName = { switch: '開關', socket: '插座', panel: '面板' }[product.type];
  return { '種類': '開關面板', '系列': product.series.toUpperCase(), '類型': typeName, '說明': product.description.join('；') || '—' };
}
document.querySelector('#compare-open')!.addEventListener('click', () => {
  const table = document.querySelector('#compare-table')!;
  table.replaceChildren();
  const specs = selected.map(model => specifications(known.get(model)!));
  const header = document.createElement('tr');
  ['規格', ...selected].forEach(value => { const cell = document.createElement('th'); cell.scope = 'col'; cell.textContent = value; header.append(cell); });
  const head = document.createElement('thead'); head.append(header); table.append(head);
  const body = document.createElement('tbody');
  [...new Set(specs.flatMap(spec => Object.keys(spec)))].forEach(name => {
    const values = specs.map(spec => spec[name] || '—');
    const row = document.createElement('tr');
    if (new Set(values).size > 1) row.className = 'different';
    const label = document.createElement('th'); label.scope = 'row'; label.textContent = name; row.append(label);
    values.forEach(value => { const cell = document.createElement('td'); cell.textContent = value; row.append(cell); });
    body.append(row);
  });
  table.append(body);
  dialog.showModal();
});
update();
