import type { Product } from '@glory-bright/shared/schema';
const form = document.querySelector<HTMLFormElement>('#catalog-filters')!;
const search = form.querySelector<HTMLInputElement>('[name=q]')!;
const checks = [...form.querySelectorAll<HTMLInputElement>('input[type=checkbox]')];
const cards = [...document.querySelectorAll<HTMLElement>('[data-product]')].map(element=>({element,product:JSON.parse(element.dataset.product!) as Product & {path:string[]}}));
const keys = [...new Set(checks.map(input=>input.name))];
function restore() {
  const params = new URLSearchParams(location.search);
  search.value = params.get('q') || '';
  checks.forEach(input=>{ input.checked=params.getAll(input.name).flatMap(value=>value.split(',')).includes(input.value); });
}
function apply(save:boolean) {
  const params = new URLSearchParams();
  if(search.value.trim()) params.set('q',search.value.trim());
  checks.filter(input=>input.checked).forEach(input=>params.append(input.name,input.value));
  const matches = (key:string,values:string[])=>!params.getAll(key).length||params.getAll(key).some(value=>values.includes(value));
  let count=0;
  cards.forEach(({element,product:p})=>{
    let visible = p.model.toLowerCase().includes(search.value.trim().toLowerCase());
    const light = p.kind==='light';
    visible &&= matches('type',light?p.path:[]);
    visible &&= matches('cutout',light&&p.cutoutDia?[String(p.cutoutDia)]:[]);
    visible &&= matches('cct',light?p.cct.map(String):[]);
    visible &&= matches('beam',light?p.beamAngle.map(String):[]);
    visible &&= matches('cri',light&&p.cri?[p.cri>=90?'90':String(p.cri)]:[]);
    visible &&= matches('color',light?p.colors.map(color=>['白','黑'].includes(color)?color:'其他'):[]);
    visible &&= matches('watt',light?[p.watt<10?'under10':p.watt<20?'10to20':p.watt<30?'20to30':'30plus']:[]);
    visible &&= matches('series',!light?[p.series]:[]);
    visible &&= matches('switchType',!light?p.path:[]);
    visible &&= matches('finish',!light?p.finish:[]);
    visible &&= matches('gang',!light&&p.gang?[String(p.gang)]:[]);
    element.hidden=!visible;
    if(visible)count++;
  });
  document.querySelector('#result-count')!.textContent=`共 ${count} 項`;
  document.querySelector<HTMLElement>('#empty-results')!.hidden=count>0;
  const chips=document.querySelector('#filter-chips')!; chips.replaceChildren();
  checks.filter(input=>input.checked).forEach(input=>{
    const button=document.createElement('button'); button.type='button';button.className='filter-chip';
    button.textContent=`${input.parentElement!.textContent?.trim()} ×`;
    button.setAttribute('aria-label',`移除 ${input.parentElement!.textContent?.trim()}`);
    button.addEventListener('click',()=>{input.checked=false;apply(true);});chips.append(button);
  });
  if(save) {
    const url=new URL(location.href);
    ['q',...keys].forEach(key=>url.searchParams.delete(key));
    params.forEach((value,key)=>url.searchParams.append(key,value));
    if(url.href!==location.href)history.pushState({},'',url);
  }
}
form.addEventListener('submit',event=>event.preventDefault());
form.addEventListener('input',()=>apply(true));
form.addEventListener('reset',()=>{search.value='';checks.forEach(input=>input.checked=false);apply(true);});
window.addEventListener('popstate',()=>{restore();apply(false);});
restore();apply(false);
