/* Illustrated controls share the existing inputs and their change handlers. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const svg=(body,cls='choice-art')=>`<svg class="${cls}" viewBox="0 0 80 56" aria-hidden="true" focusable="false">${body}</svg>`;
 const lightColors={studio:['#FFE597','#F5E6BC','#B7A988'],neutral:['#F2DFAC','#E7D29C','#DAC795'],soft:['#F7E5B6','#EAD5A6','#C4B58F'],contrast:['#FFE7A6','#D2B876','#685D46'],warm:['#FFE2A0','#EDBA74','#B28148']};
 function lightArt(name){const c=lightColors[name];return svg(`<rect x="1" y="1" width="78" height="54" rx="10" fill="${name==='warm'?'#FFF2D8':'#F8F8F6'}" stroke="none"/><ellipse cx="43" cy="46" rx="23" ry="4" fill="${c[2]}" opacity=".18" stroke="none"/><path d="m23 19 20-8 19 9-21 9z" fill="${c[0]}" stroke="none"/><path d="m23 19 18 10v19l-18-10z" fill="${c[2]}" stroke="none"/><path d="m41 29 21-9v19l-21 9z" fill="${c[1]}" stroke="none"/>`);}
 const groups=[];
 function choices(id,title,options,art){
  const select=$(id),old=select.parentElement,group=document.createElement('fieldset');group.className='picture-field '+id+'-choices';
  const legend=document.createElement('legend');legend.textContent=title;group.append(legend);old.replaceWith(group);select.hidden=true;group.append(select);
  const row=document.createElement('div');row.className='picture-choices';row.setAttribute('role','group');row.setAttribute('aria-label',title);group.append(row);
  for(const [value,label,description]of options){const button=document.createElement('button');button.type='button';button.dataset.choice=value;button.innerHTML=art(value)+'<span class="choice-name"></span><small></small><span class="choice-check" aria-hidden="true">✓</span>';button.querySelector('.choice-name').textContent=label;button.querySelector('small').textContent=description;button.setAttribute('aria-label',label+'：'+description);button.addEventListener('click',()=>{if(select.disabled)return;select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));sync();});row.append(button);}
  groups.push({select,row});new MutationObserver(sync).observe(select,{attributes:true,attributeFilter:['disabled']});
 }
 choices('box-type','箱の種類',[['lid','化粧箱','ふたと身が分かれる'],['tuck','キャラメル箱','上下を差し込む']],()=> '');
 choices('lighting-preset','照明',[['studio','スタジオ','自然な立体感'],['neutral','色を確認','陰影ひかえめ'],['soft','やわらか','ふんわりした光'],['contrast','くっきり','陰影をはっきり'],['warm','暖かい光','ぬくもりのある色']],lightArt);
 document.querySelectorAll('.view-bar [data-view]').forEach(button=>{const name=button.textContent;button.innerHTML='<span>'+name+'</span><b class="view-check" aria-hidden="true">✓</b>';button.setAttribute('aria-label',name);});
 let activeStep=null;
 function setActiveStep(step){
  activeStep=String(step);
  for(const b of nav.children){if(b.dataset.step===activeStep)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');}
  for(const [selector,n] of [['#shape-panel','1'],['#design-panel','2'],['.composition-controls','3'],['.save-controls','4']])document.querySelector(selector).classList.toggle('step-active',activeStep===n);
 }
 const guide=document.querySelector('.header-guide'),nav=document.createElement('nav');nav.className='step-guide';nav.setAttribute('aria-label','使い方の4ステップ');
 for(const [i,label]of ['箱を選ぶ','画像を配置','構図を決める','保存'].entries()){const b=document.createElement('button');b.type='button';b.innerHTML=`<b>${i+1}</b><span>${label}</span>`;b.dataset.step=i+1;b.addEventListener('click',()=>{if(i<2){$(i?'tab-design':'tab-shape').click();document.querySelector('.editor').scrollIntoView({block:'start',behavior:'auto'});$(i?'design-panel':'shape-panel').scrollTop=0;$(i?'tab-design':'tab-shape').focus();}else{const target=document.querySelector(i===2?'.composition-controls':'.save-controls');target.querySelector('.control-title').scrollIntoView({block:'nearest',behavior:'auto'});target.focus({preventScroll:true});}setActiveStep(i+1);});nav.append(b);}
 guide.replaceWith(nav);
 for(const [selector,title,num]of [['.composition-controls','箱の向き','3'],['.save-controls','保存','4']]){const p=document.querySelector(selector);p.tabIndex=-1;const heading=document.createElement('h2');heading.className='control-title';heading.innerHTML=`<b>${num}</b>${title}`;p.prepend(heading);}
 const labels={ 'export-three':['3カットを保存','斜め・表・裏をZIPで'],'export-layers':['箱と影を別々に保存','透過PNG 2枚をZIPで'],'export-pair':['同じ角度で表と裏','2枚のPNGをZIPで'],'export-gif':['回転GIF','動きをつけて保存']};
 for(const[id,[title,description]]of Object.entries(labels)){$(id).innerHTML=`<span class="save-label">${title}<small>${description}</small></span>`;}
 const toast=document.createElement('div');toast.id='action-toast';toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');toast.hidden=true;$('review-dialog').append(toast);let timer;
 $('download').addEventListener('click',()=>{clearTimeout(timer);toast.textContent='✓ ダウンロードを開始しました';toast.hidden=false;timer=setTimeout(()=>toast.hidden=true,3200);});
 function sync(){for(const {select,row}of groups)for(const b of row.children){b.setAttribute('aria-pressed',String(b.dataset.choice===select.value));b.disabled=select.disabled;}if(!activeStep)setActiveStep($('tab-design').getAttribute('aria-selected')==='true'?'2':'1');}
 new MutationObserver(()=>{for(const b of nav.children)b.disabled=$('export-gif').disabled;}).observe($('export-gif'),{attributes:true,attributeFilter:['disabled']});
 for(const id of ['tab-shape','tab-design'])$(id).addEventListener('click',()=>{setActiveStep(id==='tab-design'?'2':'1');});
 // Follow intentional interaction, not hover or scrolling past a section.
 function followInteraction(event){
  const target=event.target;if(!(target instanceof Element))return;
  if(target.closest('.step-guide'))return;
  const areas=[['#shape-panel,#tab-shape','1'],['#design-panel,#tab-design,#image-editor,#finish-editor','2'],['.composition-controls,#preview-dock,#shooting-settings,#comparison-live','3'],['.save-controls,#review-dialog','4']];
  for(const [selector,step] of areas)if(target.closest(selector)){setActiveStep(step);break;}
 }
 for(const type of ['pointerdown','focusin','input','change'])document.addEventListener(type,followInteraction,true);
 window.BoxFriendly={sync};sync();
})();
