/* Local project files and six independent, editable design snapshots. */
window.BoxProjects={install(api){
 'use strict';
 const $=id=>document.getElementById(id),data=BoxProjectData,dialog=$('project-dialog');
 let designs=[],busy=false,dirty=false;const excluded=new WeakSet();
 const notice=(text,error=false)=>{$('project-status').textContent=text;$('project-status').classList.toggle('error',error);};
 function render(){
  $('compare-live').disabled=busy||!designs.some(d=>!excluded.has(d));
  $('compare-count').textContent=designs.length+' / 6';$('compare-add').disabled=busy||designs.length>=6;$('compare-align').disabled=busy||!designs.length;
  $('comparison-grid').replaceChildren();
  for(let i=0;i<6;i++){
   const card=document.createElement('article');card.className='comparison-card';const d=designs[i];
   if(!d){const add=document.createElement('button');add.className='comparison-empty';add.textContent='＋ 現在のデザインを追加';add.disabled=busy||designs.length>=6;add.addEventListener('click',addDesign);card.append(add);}
   else{
    const img=document.createElement('img');img.src=d.thumbnail;img.alt=d.name+'の箱プレビュー';
    const name=document.createElement('input');name.type='text';name.maxLength=50;name.value=d.name;name.setAttribute('aria-label','比較案'+(i+1)+'の名前');name.disabled=busy;name.addEventListener('input',()=>{d.name=name.value.trim()||'デザイン '+(i+1);dirty=true;});name.addEventListener('change',()=>{d.name=name.value.trim()||'デザイン '+(i+1);name.value=d.name;img.alt=d.name+'の箱プレビュー';dirty=true;});
    const actions=document.createElement('div');actions.className='comparison-actions';
    const button=(label,fn)=>{const b=document.createElement('button');b.textContent=label;b.disabled=busy;b.addEventListener('click',fn);actions.append(b);};
    button('編集する',()=>run(async()=>{api.apply(d.snapshot);dialog.close();api.message(d.name+'を開きました。編集後は「現在の状態で更新」で比較案に反映できます。');}));
    button('現在の状態で更新',()=>run(async()=>{if(!confirm('「'+d.name+'」を現在のデザイン・設定で更新しますか？'))return;const snapshot=api.snapshot(),thumbnail=await api.thumbnail(snapshot);designs[i]={...d,snapshot,thumbnail};dirty=true;notice('比較案を更新しました。');}));
    button('削除',()=>{if(confirm('「'+d.name+'」を比較から外しますか？')){designs.splice(i,1);dirty=true;render();}});
    const select=document.createElement('label');select.className='comparison-select';const check=document.createElement('input');check.type='checkbox';check.checked=!excluded.has(d);check.disabled=busy;check.setAttribute('aria-label',d.name+'を比較に表示');check.addEventListener('change',()=>{if(check.checked)excluded.delete(d);else excluded.add(d);$('compare-live').disabled=!designs.some(item=>!excluded.has(item));});select.append(check,document.createTextNode('比較に表示'));card.append(img,name,select,actions);
   }$('comparison-grid').append(card);
  }
 }
 async function run(fn){
  if(busy||api.busy())return;busy=true;render();
  try{await api.run(fn);}catch(e){console.error(e);notice(e.message||'処理できませんでした。もう一度お試しください。',true);}
  finally{busy=false;render();}
 }
 async function addDesign(){return run(async()=>{
  if(designs.length>=6)return;notice('比較用の画像を作成しています…');
  const snapshot=api.snapshot(),thumbnail=await api.thumbnail(snapshot);designs.push({name:'デザイン '+(designs.length+1),snapshot,thumbnail});dirty=true;
  notice('比較に追加しました。画像や設定を変えて、次の案を追加できます。');
 });}
 function download(doc,suffix){
  const blob=new Blob([JSON.stringify(doc)],{type:'application/octet-stream'});if(blob.size>data.MAX_BYTES)throw new Error('保存ファイルが250 MBを超えています。比較案や画像サイズを減らしてください。');
  const link=document.createElement('a'),url=URL.createObjectURL(blob);link.href=url;link.download=($('project-name').value.trim()||'箱プロジェクト').replace(/[\\/:*?"<>|]/g,'_')+suffix;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
 }
 $('compare-add').addEventListener('click',addDesign);
 $('compare-live').addEventListener('click',()=>run(async()=>{const selected=designs.filter(d=>!excluded.has(d));if(!selected.length)return;notice('比較用の箱を準備しています…');const context=api.comparison(selected);BoxComparison.open(context);notice('ライブ比較を閉じると、各案を編集できます。');}));
 $('compare-align').addEventListener('click',()=>run(async()=>{
  notice('現在の構図・照明で比較をそろえています…');const configuration=api.snapshot().config,newDesigns=[];
  for(const d of designs){const snapshot=api.withComposition(d.snapshot,configuration);newDesigns.push({...d,snapshot,thumbnail:await api.thumbnail(snapshot)});}
  designs=newDesigns;dirty=true;notice('全案の構図・照明・背景をそろえました。箱のサイズとデザインは各案のままです。');
 }));
 $('project-save').addEventListener('click',()=>run(async()=>{notice('画像と比較案をまとめています…');download(await data.encode(api.snapshot(),designs,$('project-name').value),'.boxproject');dirty=false;notice('作業ファイルを書き出しました。「保存した作業を開く」で、あとから続きを編集できます。');}));
 $('composition-save').addEventListener('click',()=>run(async()=>{download({format:data.FORMAT,version:data.VERSION,kind:'composition',name:$('project-name').value,config:api.snapshot().config},'.boxview');notice('構図を保存しました。別の画像にも使えます。');}));
 $('project-load-button').addEventListener('click',()=>$('project-load').click());
 $('project-load').addEventListener('change',e=>{const file=e.target.files[0];e.target.value='';if(!file)return;run(async()=>{
  if(file.size>data.MAX_BYTES)throw new Error('250 MB以下のプロジェクトファイルを選んでください。');
  notice('保存ファイルを確認しています…');let parsed;try{parsed=JSON.parse(await file.text());}catch{throw new Error('保存ファイルを読み取れませんでした。このツールで保存した作業ファイル（.boxproject）または構図ファイル（.boxview）を選んでください。');}
  const doc=data.validate(parsed,api.schema),composition=doc.kind==='composition'||$('project-load-mode').value==='composition';
  if(composition){const config=doc.kind==='composition'?doc.config:doc.current.config;api.apply(api.withComposition(api.snapshot(),config));notice('構図・照明・背景を適用しました。画像・配置と箱のサイズはそのままです。');dirty=true;return;}
  const loaded=await data.decode(doc);
  if(!confirm('保存したプロジェクトを開き、現在の作業と比較案を置き換えますか？\n必要な作業は先に「作業を保存」で残してください。')){notice('読み込みを取り消しました。');return;}
  api.apply(loaded.current);designs=loaded.designs;$('project-name').value=doc.name||'箱プロジェクト';dirty=false;notice('プロジェクトを読み込みました。PDFは保存したページの画像として復元しています。');
 });});
 function open(){if(api.busy())return;api.closePanels();render();dialog.showModal();}
 $('open-project').addEventListener('click',open);$('open-compare').addEventListener('click',open);
 $('close-project').addEventListener('click',()=>{if(!busy)dialog.close();});dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 window.addEventListener('beforeunload',e=>{if(dirty&&designs.length){e.preventDefault();e.returnValue='';}});
 render();
}};
