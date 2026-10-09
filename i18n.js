/* Local, reversible presentation translations. Project data and artwork are never translated. */
(()=>{
 'use strict';
 const locales=['ja','en','ko','zh-CN','zh-TW','de','fr','es','pt-BR'];
 const names=['日本語','English','한국어','简体中文','繁體中文（台灣）','Deutsch','Français','Español','Português (Brasil)'];
 const storageKey='box-studio-language';
 const dictionaries=window.BoxTranslations||{};
 function resolve(value){const tag=String(value||'').toLowerCase();if(tag.startsWith('zh'))return /hant|tw|hk|mo/.test(tag)?'zh-TW':'zh-CN';if(tag.startsWith('pt'))return 'pt-BR';return locales.find(l=>tag===l||tag.startsWith(l+'-'))||'en';}
 let language='ja';try{const saved=localStorage.getItem(storageKey);language=saved&&locales.includes(saved)?saved:resolve(navigator.language);}catch{language=resolve(navigator.language);}
 function exact(source,lang=language){return lang==='ja'?source:dictionaries[source]?.[locales.indexOf(lang)-1]??source;}
 const templates=[];
 function template(source){const pieces=source.split(/(\{\d+\})/);let args=[];let regex='^';for(const p of pieces){if(/^\{\d+\}$/.test(p)){args.push(p);regex+='(.+?)';}else regex+=p.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}templates.push({source,args,regex:new RegExp(regex+'$','s')});}
 for(const key of Object.keys(dictionaries))if(/\{\d+\}/.test(key))template(key);
 function t(source,lang=language){
  if(typeof source!=='string'||lang==='ja')return source;
  const trim=source.trim();let result=exact(trim,lang);
  if(result===trim){for(const item of templates){const match=trim.match(item.regex);if(!match)continue;result=exact(item.source,lang).replace(/\{\d+\}/g,key=>match[item.args.indexOf(key)+1]);break;}}
  return source.slice(0,source.indexOf(trim))+result+source.slice(source.indexOf(trim)+trim.length);
 }
 const state=new WeakMap(), attributes=['aria-label','aria-valuetext','title','placeholder','alt'];
 const excluded='script,style,textarea,code,pre,[data-i18n-ignore],.comparison-card input,#line-layer-list';
 function translateNode(node){
  const parent=node.parentElement;if(!parent||parent.closest(excluded))return;
  const old=state.get(node),current=node.data;
  const original=old&&current===old.output?old.source:current;
  const output=t(original);state.set(node,{source:original,output});if(current!==output)node.data=output;
 }
 const attrState=new WeakMap();
 function translateAttributes(el){
  if(el.closest(excluded))return;
  let record=attrState.get(el);if(!record){record={};attrState.set(el,record);}
  for(const name of attributes){const value=el.getAttribute(name);if(value==null)continue;const old=record[name];const source=old&&value===old.output?old.source:value,output=t(source);record[name]={source,output};if(value!==output)el.setAttribute(name,output);}
 }
 function scan(root){
  if(root.nodeType===3){translateNode(root);return;}
  if(root.nodeType!==1||root.closest(excluded))return;
  translateAttributes(root);
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);
  while(walker.nextNode()){const n=walker.currentNode;if(n.nodeType===3)translateNode(n);else translateAttributes(n);}
 }
 let observer;
 function observe(){observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:attributes});}
 function setLanguage(next){
  if(!locales.includes(next))return;language=next;
  try{localStorage.setItem(storageKey,next);}catch{}
  observer?.disconnect();document.documentElement.lang=next;
  document.querySelectorAll('.language-select').forEach(el=>el.value=next);
  document.querySelectorAll('[data-localized-help]').forEach(el=>el.hidden=next==='ja');
  document.querySelectorAll('[data-original-help]').forEach(el=>el.hidden=next!=='ja');
  if(window.BoxLocaleHelp)for(const el of document.querySelectorAll('[data-localized-help]')){el.replaceChildren();for(const [heading,body]of BoxLocaleHelp[next]||[]){const section=document.createElement('section'),h=document.createElement('h3'),p=document.createElement('p');h.textContent=heading;p.textContent=body;section.append(h,p);el.append(section);}}
  scan(document.body);
  const pageTitle=document.querySelector('title');if(pageTitle){if(!pageTitle.dataset.original)pageTitle.dataset.original=pageTitle.textContent;pageTitle.textContent=t(pageTitle.dataset.original);}
  // Keep FAQ structured data equal to the translated, visible FAQ answers.
  const faq=document.querySelector('[data-faq-schema]');if(faq){const data=JSON.parse(faq.dataset.faqSchema);for(const q of data.mainEntity){q.name=t(q.name);q.acceptedAnswer.text=t(q.acceptedAnswer.text);}faq.textContent=JSON.stringify(data);}
  observe();document.dispatchEvent(new CustomEvent('box-language-change',{detail:{language}}));
 }
 function start(){
  const host=document.querySelector('.header-actions')||document.querySelector('header');if(!host)return;
  const label=document.createElement('label');label.className='language-control';label.dataset.i18nIgnore='';
  const globe=document.createElement('span');globe.textContent='◎';globe.setAttribute('aria-hidden','true');
  const select=document.createElement('select');select.className='language-select';select.setAttribute('aria-label','Language / 言語');for(let i=0;i<locales.length;i++){const o=document.createElement('option');o.value=locales[i];o.textContent=names[i];o.lang=locales[i];select.append(o);}select.value=language;label.append(globe,select);host.prepend(label);select.addEventListener('change',()=>setLanguage(select.value));
  const help=document.querySelector('.help-body');if(help){help.dataset.originalHelp='';const translated=document.createElement('div');translated.className='help-body';translated.dataset.localizedHelp='';translated.dataset.i18nIgnore='';help.after(translated);}
  for(const script of document.querySelectorAll('script[type="application/ld+json"]')){try{if(JSON.parse(script.textContent)['@type']==='FAQPage')script.dataset.faqSchema=script.textContent;}catch{}}
  observer=new MutationObserver(records=>{
   observer.disconnect();const roots=new Set();for(const r of records){if(r.type==='characterData')translateNode(r.target);else if(r.type==='attributes')translateAttributes(r.target);else for(const n of r.addedNodes)roots.add(n);}for(const root of roots)scan(root);observe();
  });
  setLanguage(language);
 }
 window.BoxI18n={t,resolve,setLanguage,get language(){return language;},confirm:text=>window.confirm(t(text)),alert:text=>window.alert(t(text))};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
