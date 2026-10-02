(()=>{
 'use strict';
 const pairs=[];
 const units={rotation:'°',tilt:'°',roll:'°',zoom:'%', 'camera-horizontal':'°','camera-height':'°','camera-distance':'%',rounding:'mm','base-peek':'mm','pair-gap':'mm','gif-speed':'×',brightness:'%','light-direction':'°','light-key':'%','light-fill':'%','light-rim':'%','light-ambient':'%','light-keyAzimuth':'°','light-keyElevation':'°','light-keyDistance':'%','light-elevation':'°','light-temperature':'K','light-spread':'%','shadow-blur':'%','focus-blur':'%',inset:'px'};
 for(const range of document.querySelectorAll('input[type="range"]')){
  const old=range.closest('label');if(!old)continue;
  // Keep the stored value in actual multiples; only the visible thumb uses a curved scale.
  const nonlinear=range.id==='gif-speed';let slider=range;
  if(nonlinear){slider=range.cloneNode();slider.id=range.id+'-slider';slider.min='0';slider.max='100';slider.step='any';slider.defaultValue=String(BoxStudio.gifSpeedPosition(range.defaultValue));range.type='hidden';}

  const field=document.createElement('div');field.className=(old.className+' numeric-field').trim();if(old.id)field.id=old.id;
  const label=document.createElement('label');label.htmlFor=slider.id;label.className='range-title';label.textContent=[...old.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim();
  const output=old.querySelector('output');const controls=document.createElement('div');controls.className='range-entry';
  const number=document.createElement('input');number.type='number';number.id=range.id+'-number';number.className='range-number';number.setAttribute('aria-label',(range.getAttribute('aria-label')||label.textContent)+'（数値）');
  const unit=document.createElement('span');unit.className='range-unit';unit.textContent=units[range.id]||'';unit.setAttribute('aria-hidden','true');
  field.append(label);if(output)field.append(output);controls.append(slider,number,unit);if(nonlinear)controls.append(range);field.append(controls);old.replaceWith(field);
  function sync(force=false){for(const attr of ['min','max','step'])number[attr]=range.getAttribute(attr)|| (attr==='step'?'1':'');number.disabled=range.disabled;if(force||document.activeElement!==number)number.value=range.value;if(nonlinear){slider.value=BoxStudio.gifSpeedPosition(range.value);slider.disabled=range.disabled;slider.setAttribute('aria-valuetext',range.value+'倍速');}}
  function commit(){
   if(number.disabled||number.value.trim()===''||!Number.isFinite(number.valueAsNumber)){sync(true);return;}
   const min=Number(range.min),max=Number(range.max),step=Number(range.step)||1;
   const clamped=Math.max(min,Math.min(max,number.valueAsNumber));
   const next=String(Math.max(min,Math.min(max,Number((min+Math.round((clamped-min)/step)*step).toFixed(8)))));
   if(next!==range.value){range.value=next;range.dispatchEvent(new Event('input',{bubbles:true}));range.dispatchEvent(new Event('change',{bubbles:true}));}
   sync(true);
  }
  if(nonlinear){
   function setSpeed(speed){range.value=String(speed);range.dispatchEvent(new Event('input',{bubbles:true}));range.dispatchEvent(new Event('change',{bubbles:true}));}
   slider.addEventListener('input',()=>setSpeed(BoxStudio.gifSpeedAtPosition(slider.value)));
   slider.addEventListener('keydown',e=>{
    const delta={ArrowRight:.05,ArrowUp:.05,ArrowLeft:-.05,ArrowDown:-.05,PageUp:1,PageDown:-1}[e.key];
    if(delta===undefined&&e.key!=='Home'&&e.key!=='End')return;e.preventDefault();
    setSpeed(e.key==='Home'?.1:e.key==='End'?15:Math.max(.1,Math.min(15,Math.round((Number(range.value)+delta)*20)/20)));
   });
  }
  number.addEventListener('change',commit);number.addEventListener('blur',commit);number.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();commit();}else if(e.key==='Escape'){e.preventDefault();sync(true);number.blur();}});
  range.addEventListener('input',()=>sync(true));range.addEventListener('change',()=>sync(true));
  new MutationObserver(()=>sync()).observe(range,{attributes:true,attributeFilter:['min','max','step','disabled']});pairs.push(sync);sync(true);
 }
 window.BoxRangeInputs={sync:()=>pairs.forEach(sync=>sync())};
})();
