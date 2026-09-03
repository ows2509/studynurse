
const APP_VERSION = '0.5.6';

const PROD_CFG = window.STUDYNURSE_CONFIG || {};
const DEV_CFG = window.STUDYNURSE_DEV_CONFIG || {};
const DEV_MODE = new URLSearchParams(location.search).get('dev') === '1';
const CFG = DEV_MODE ? DEV_CFG : PROD_CFG;

let state = null;
let selectedCategory = null;
let editing = false;
let dirty = false;
let editSnapshot = null;
let sb = null;
let htmlTargetCardId = null;
let categoryEditId = null;
let imageTargetCardId = null;
let pendingImageFile = null;
let pendingImageBlob = null;
let pendingImageMeta = null;
let autoParsedCards = [];
let qboxOpenState = new Set();
let activeDataSource='LOADING';
let initialLoadError=null;
let saveInFlight=false;
let criticalActionsBound=false;
let lastSaveError=null;let quizQuestions=[],quizIndex=0,quizScore=0,quizChoice=null;


const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[m]));

const deepClone = obj => structuredClone ? structuredClone(obj) : JSON.parse(JSON.stringify(obj));
const cloudEnabled = () => !!(CFG.supabaseUrl && CFG.supabaseAnonKey && window.supabase);

function sanitizeRich(raw){
  const t = document.createElement('template');
  t.innerHTML = raw || '';

  t.content.querySelectorAll(
    'script,iframe,object,embed,form,input,button,textarea,select,link,meta,base'
  ).forEach(x => x.remove());

  t.content.querySelectorAll('*').forEach(el => {
    [...el.attributes].forEach(a => {
      const n = a.name.toLowerCase();
      const v = a.value || '';

      if (n.startsWith('on')) {
        el.removeAttribute(a.name);
        return;
      }
      if (['href','src','xlink:href'].includes(n) &&
          /^\s*(javascript|data:text\/html|vbscript):/i.test(v)) {
        el.removeAttribute(a.name);
        return;
      }
      if (n === 'style') {
        const safe = v.split(';').filter(p =>
          /^\s*(color|font-weight|font-style|text-decoration|font-size|background-color|text-align|margin|padding|border|width|max-width)\s*:/i.test(p)
        ).join(';');
        if (safe) el.setAttribute('style', safe);
        else el.removeAttribute('style');
      }
    });
  });
  return t.innerHTML;
}

function plainTextFromHtml(raw){
  const d = document.createElement('div');
  d.innerHTML = sanitizeRich(raw);
  return d.textContent || '';
}

function makeId(prefix='id'){
  if (crypto && crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
}

function slugify(s){
  const base = String(s||'').trim().toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g,'-')
    .replace(/^-+|-+$/g,'');
  return base || `category-${Date.now()}`;
}

function normalizeImageBlock(src, order=0){
  if (typeof src === 'string') {
    return {
      id: makeId('img'),
      type: 'image',
      url: src,
      displayWidth: 75,
      align: 'center',
      order
    };
  }
  return {
    id: src.id || makeId('img'),
    type: 'image',
    url: src.url || src.src || '',
    displayWidth: Number(src.displayWidth || src.widthPercent || 75),
    align: src.align || 'center',
    originalWidth: src.originalWidth || null,
    originalHeight: src.originalHeight || null,
    fileSize: src.fileSize || null,
    order: src.order ?? order
  };
}

function migrateState(input){
  // NON-DESTRUCTIVE:
  // Existing fields are retained; new block fields are added only when missing.
  const data = input && typeof input === 'object' ? input : {};
  if (!Array.isArray(data.categories)) data.categories = [];

  data.categories.forEach((cat, ci) => {
    // Legacy compatibility: v0.2.x/v0.3.x used main/sub.
    if (!cat.subLabel && cat.sub) cat.subLabel = cat.sub;
    if (!cat.title && cat.sub) cat.title = cat.sub;
    if (!cat.mainLabel && cat.main) cat.mainLabel = cat.main;
    if (!cat.id) cat.id = `category-${ci+1}-${slugify(cat.subLabel || cat.title || '')}`;
    if (!Array.isArray(cat.cards)) cat.cards = [];
    if (cat.order == null) cat.order = ci;

    cat.cards.forEach((card, i) => {
      if (!card.id) card.id = `${cat.id}-${i+1}`;
      if (!Array.isArray(card.keywords)) card.keywords = [];
      if (!Array.isArray(card.bullets)) card.bullets = [];
      if (!Array.isArray(card.vocab)) card.vocab = [];
      if (!Array.isArray(card.translations)) card.translations = [];
      if (!Array.isArray(card.images)) card.images = [];
      if (!Array.isArray(card.qbank)) card.qbank = [];
      if (typeof card.customHtml !== 'string') card.customHtml = '';
      if (card.order == null) card.order = i;

      if (!Array.isArray(card.blocks)) {
        const blocks = [];
        card.bullets.forEach((txt, bi) => blocks.push({
          id: makeId('txt'),
          type: 'text',
          content: txt,
          order: blocks.length
        }));

        if (card.customHtml) {
          blocks.push({
            id: makeId('html'),
            type: 'html',
            content: card.customHtml,
            order: blocks.length
          });
        }

        card.images.forEach((img) => {
          blocks.push(normalizeImageBlock(img, blocks.length));
        });

        card.blocks = blocks;
      } else {
        card.blocks = card.blocks.map((b, bi) => {
          if (b.type === 'image') return normalizeImageBlock(b, bi);
          return {
            ...b,
            id: b.id || makeId(b.type === 'html' ? 'html' : 'txt'),
            type: b.type || 'text',
            order: bi
          };
        });
      }

      syncLegacyFields(card);
    });
  });

  data.version = APP_VERSION;
  return data;
}

function syncLegacyFields(card){
  card.bullets = (card.blocks||[])
    .filter(b => b.type === 'text')
    .map(b => b.content || '');

  card.customHtml = (card.blocks||[])
    .filter(b => b.type === 'html')
    .map(b => b.content || '')
    .join('<br>');

  card.images = (card.blocks||[])
    .filter(b => b.type === 'image')
    .map(b => ({
      id: b.id,
      url: b.url,
      displayWidth: b.displayWidth || 75,
      align: b.align || 'center',
      originalWidth: b.originalWidth || null,
      originalHeight: b.originalHeight || null,
      fileSize: b.fileSize || null
    }));
}


function setDataSourceBadge(source, detail=''){
  activeDataSource=source;
  const el=$('#dataSourceBadge');
  if(!el)return;
  el.className='data-source-badge';
  if(source==='CLOUD')el.classList.add('cloud');
  else if(source==='LOCAL')el.classList.add('local');
  else if(source==='ERROR')el.classList.add('error');
  el.textContent=detail?`${source} · ${detail}`:source;
}

function validStudyState(x){
  return !!(x && Array.isArray(x.categories) && x.categories.length);
}

function setSaveState(mode, label){
  let el = $('#saveState');
  if (!el) {
    el = document.createElement('span');
    el.id = 'saveState';
    el.className = 'save-state';
    const spacer = document.querySelector('.brandrow .spacer');
    if (spacer) spacer.insertAdjacentElement('afterend', el);
  }
  el.className = 'save-state' + (mode ? ' ' + mode : '');
  el.textContent = label;
}

function openDb(){
  return new Promise((ok,no) => {
    const r = indexedDB.open('StudyNurseWeb', 4);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains('kv')) r.result.createObjectStore('kv');
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  });
}

async function idbGet(k){
  const db = await openDb();
  return new Promise((ok,no) => {
    const tx = db.transaction('kv','readonly');
    const r = tx.objectStore('kv').get(k);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
    tx.oncomplete = () => db.close();
  });
}

async function idbPut(k,v){
  const db = await openDb();
  return new Promise((ok,no) => {
    const tx = db.transaction('kv','readwrite');
    tx.objectStore('kv').put(v,k);
    tx.oncomplete = () => { db.close(); ok(); };
    tx.onerror = () => no(tx.error);
  });
}

function localDatasetKey(){
  return DEV_MODE ? 'dataset-dev' : 'dataset-prod';
}

async function loadData(){
  initialLoadError=null;

  if(cloudEnabled()){
    try{
      if(!window.supabase?.createClient) throw new Error('Supabase library not loaded');

      sb = sb || window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);

      const {data,error}=await sb.from('study_documents')
        .select('payload')
        .eq('doc_key',CFG.datasetKey || (DEV_MODE?'main-dev':'main'))
        .maybeSingle();

      if(error) throw error;

      if(data?.payload && validStudyState(data.payload)){
        const migrated=migrateState(structuredClone(data.payload));

        // Cloud is authoritative. Local cache is updated only AFTER successful cloud read.
        await idbPut(localDatasetKey(), migrated);
        setDataSourceBadge('CLOUD', `${migrated.categories.length} categories`);
        return migrated;
      }

      throw new Error('Cloud document is empty or invalid');
    }catch(e){
      initialLoadError=e;
      console.error('StudyNurse CLOUD LOAD FAILED:',e);
      setDataSourceBadge('ERROR','cloud load failed');
    }
  }

  const local=await idbGet(localDatasetKey());
  if(local && validStudyState(local)){
    const migrated=migrateState(structuredClone(local));
    setDataSourceBadge('LOCAL',`${migrated.categories.length} categories`);
    return migrated;
  }

  const seed=await fetch('./data/seed.json',{cache:'no-store'}).then(r=>{
    if(!r.ok)throw new Error(`seed HTTP ${r.status}`);
    return r.json();
  });

  const migrated=migrateState(seed);
  await idbPut(localDatasetKey(),migrated);
  setDataSourceBadge('LOCAL','seed');
  return migrated;
}

async function createRevisionSnapshot(reason){
  if (!cloudEnabled()) return;
  try {
    const {data,error} = await sb.from('study_documents')
      .select('payload')
      .eq('doc_key', CFG.datasetKey)
      .maybeSingle();

    if (error || !data?.payload) return;

    await sb.from('study_revision_log').insert({
      doc_key: CFG.datasetKey,
      payload: data.payload,
      source_version: data.payload.version || 'legacy',
      reason
    });
  } catch(e) {
    console.warn('Revision snapshot failed', e);
  }
}


function withTimeout(promise,ms,label){
  let timer;
  const timeout=new Promise((_,reject)=>{
    timer=setTimeout(()=>reject(new Error(`${label} timeout (${Math.round(ms/1000)}s)`)),ms);
  });
  return Promise.race([promise,timeout]).finally(()=>clearTimeout(timer));
}

async function ensureCloudClient(){
  if(!cloudEnabled())return null;
  if(sb)return sb;
  if(!window.supabase?.createClient)throw new Error('Supabase library not loaded');
  sb=window.supabase.createClient(CFG.supabaseUrl,CFG.supabaseAnonKey);
  return sb;
}
async function persistData(showAlert=true){
  if(saveInFlight)return false;

  saveInFlight=true;
  lastSaveError=null;

  const btn=$('#saveBtn');
  if(btn){btn.disabled=true;btn.textContent='저장 중...';}
  setSaveState('saving','1/3 편집 내용 수집 중...');

  try{
    collectEditable();

    for(const cat of(state.categories||[])){
      for(const card of(cat.cards||[])){
        if(!Array.isArray(card.vocab))card.vocab=[];
        try{collectVocabularyFromBlocks(card);}
        catch(e){console.warn('Vocabulary collection skipped',card?.title,e);}
      }
    }

    state=migrateState(state);
    state.version=APP_VERSION;

    setSaveState('saving','2/3 이 기기에 백업 중...');
    await withTimeout(idbPut(localDatasetKey(),deepClone(state)),5000,'IndexedDB save');

    if(cloudEnabled()){
      setSaveState('saving','3/3 Supabase 저장 중...');
      await ensureCloudClient();

      try{
        await withTimeout(
          createRevisionSnapshot(`manual-save-${APP_VERSION}`),
          5000,
          'revision snapshot'
        );
      }catch(e){
        console.warn('Revision snapshot skipped',e);
      }

      const cloudSave=(async()=>{
        const {data,error}=await sb.from('study_documents').upsert({
          doc_key:CFG.datasetKey||(DEV_MODE?'main-dev':'main'),
          payload:state,
          updated_at:new Date().toISOString()
        },{onConflict:'doc_key'}).select('doc_key,updated_at');

        if(error)throw error;
        return data;
      })();

      await withTimeout(cloudSave,12000,'Supabase save');
      setDataSourceBadge('CLOUD',`${state.categories.length} categories`);
    }else{
      setDataSourceBadge('LOCAL',`${state.categories.length} categories`);
    }

    dirty=false;
    editSnapshot=deepClone(state);

    if(btn){btn.disabled=false;btn.textContent='저장';}

    const msg=cloudEnabled()?'✓ 클라우드 저장 완료':'✓ 이 기기에 저장 완료';
    setSaveState('',msg);
    if(showAlert)alert(msg);
    return true;

  }catch(e){
    lastSaveError=e;
    console.error('StudyNurse SAVE FAILED',e,e?.stack);

    if(btn){btn.disabled=false;btn.textContent='저장 *';}

    setSaveState('error',`저장 실패: ${e?.message||e}`);
    if(showAlert)alert(`저장 실패\n${e?.message||e}`);
    return false;

  }finally{
    saveInFlight=false;
  }
}

function markDirty(){
  dirty = true;
  $('#saveBtn').textContent = '저장 *';
  setSaveState('saving','저장되지 않은 변경');
}

function findCard(id){
  for (const c of state.categories) {
    const x = c.cards.find(v => v.id === id);
    if (x) return x;
  }
  return null;
}

function catById(id){
  return state.categories.find(c => c.id === id);
}

function findBlock(card, blockId){
  return (card.blocks||[]).find(b => b.id === blockId);
}

function collectEditable(){
  document.querySelectorAll('[data-card][data-field]').forEach(el => {
    const card = findCard(el.dataset.card);
    if (!card) return;

    const field = el.dataset.field;
    if (field === 'title') card.title = sanitizeRich(el.innerHTML);

    if (field === 'block') {
      const block = findBlock(card, el.dataset.block);
      if (block) block.content = sanitizeRich(autoBoldAbbreviations(el.innerHTML));
    }

    if (field.startsWith('vocab:')) {
      card.vocab[+field.split(':')[1]] = sanitizeRich(el.innerHTML);
    }
    if (field.startsWith('trans:')) {
      card.translations[+field.split(':')[1]] = sanitizeRich(el.innerHTML);
    }
    syncLegacyFields(card);
  });
}

function searchCard(c,q){
  const blockText = (c.blocks||[]).map(b => b.type === 'image' ? '' : (b.content||''));
  const s = [
    c.title,
    ...(c.keywords||[]),
    ...blockText,
    ...(c.vocab||[]),
    ...(c.translations||[]),
    ...((c.qbank||[]).flatMap(x => [
      x.date, x.title, ...((x.items||[]).map(i=>i.content))
    ]))
  ].join(' ');

  return plainTextFromHtml(s).toLowerCase().includes(q);
}

function renderBlock(card, block){
  const drag = editing
    ? `<button class="drag-handle" type="button" data-drag-card="${card.id}" data-drag-block="${block.id}" aria-label="블록 이동">⋮⋮</button>`
    : '';

  if (block.type === 'image') {
    const width = Math.max(25, Math.min(100, Number(block.displayWidth || 75)));
    const align = ['left','center','right'].includes(block.align) ? block.align : 'center';
    const margin = align === 'left' ? '0 auto 0 0' : align === 'right' ? '0 0 0 auto' : '0 auto';

    return `
      <div class="content-block image-block" data-card-id="${card.id}" data-block-id="${block.id}">
        ${drag}
        <div class="image-stage" style="width:${width}%;margin:${margin}">
          <img src="${esc(block.url)}" loading="lazy" draggable="false" alt="학습 이미지">
        </div>
        <div class="image-caption-tools">
          <label>크기
            <select data-image-width="${card.id}" data-block="${block.id}">
              ${[25,50,75,100].map(v=>`<option value="${v}" ${v===width?'selected':''}>${v}%</option>`).join('')}
            </select>
          </label>
          <label>정렬
            <select data-image-align="${card.id}" data-block="${block.id}">
              <option value="left" ${align==='left'?'selected':''}>왼쪽</option>
              <option value="center" ${align==='center'?'selected':''}>가운데</option>
              <option value="right" ${align==='right'?'selected':''}>오른쪽</option>
            </select>
          </label>
          <button class="block-delete" type="button" data-delete-block="${card.id}" data-block="${block.id}">이미지 삭제</button>
        </div>
      </div>`;
  }

  if (block.type === 'html') {
    return `
      <div class="content-block" data-card-id="${card.id}" data-block-id="${block.id}">
        ${drag}
        <div class="html-block">${sanitizeRich(autoBoldAbbreviations(block.content||''))}</div>
        <div class="image-caption-tools">
          <button class="btn btn-soft" type="button" data-edit-html="${card.id}" data-block="${block.id}">&lt;/&gt; HTML 편집</button>
          <button class="block-delete" type="button" data-delete-block="${card.id}" data-block="${block.id}">HTML 삭제</button>
        </div>
      </div>`;
  }

  return `
    <div class="content-block" data-card-id="${card.id}" data-block-id="${block.id}">
      ${drag}
      <div class="text-block">
        <span class="dot">•</span>
        <div ${editing ? `class="editable" contenteditable="true" data-card="${card.id}" data-field="block" data-block="${block.id}"` : ''}>${sanitizeRich(autoBoldAbbreviations(block.content||''))}</div>
        ${editing ? `<button class="block-delete" type="button" data-delete-block="${card.id}" data-block="${block.id}">삭제</button>` : ''}
      </div>
    </div>`;
}

function renderCard(c){
  const titleAttrs = editing
    ? `class="card-title editable" contenteditable="true" data-card="${c.id}" data-field="title"`
    : `class="card-title"`;

  const vocab = (c.vocab||[]).length ? `
    <div class="panel">
      <h4>🔤 VOCAB</h4>
      <div>${c.vocab.map((x,i)=>`<div class="vocab-row"><div ${editing?`class="editable" contenteditable="true" data-card="${c.id}" data-field="vocab:${i}"`:''}>${sanitizeRich(x)}</div>${editing?`<button class="mini-del" data-del-vocab="${c.id}" data-index="${i}">✕</button>`:''}</div>`).join('')}</div>
    </div>` : '';

  const trans = (c.translations||[]).length ? `
    <div class="panel trans">
      <h4>📝 TRANSLATION</h4>
      <ul>${c.translations.map((x,i)=>`
        <li ${editing ? `class="editable" contenteditable="true" data-card="${c.id}" data-field="trans:${i}"` : ''}>${sanitizeRich(x)}</li>`).join('')}
      </ul>
    </div>` : '';

  const qb=`${(c.qbank||[]).length?`<button class="qtoggle">▼ 관련 문제 / 기출 (${c.qbank.length})</button><div class="qbox">${c.qbank.map((q,qi)=>`<div class="qsection"><div class="qhead"><span class="date">${esc(q.date||'')}</span>${editing?`<button class="qsection-drag-handle" data-qsection-drag="${c.id}" data-q-index="${qi}">⋮⋮</button>`:''}<span class="qtitle">${sanitizeRich(q.title||'')}</span>${editing?`<button class="mini-del" data-del-qsection="${c.id}" data-q-index="${qi}">기출삭제</button>`:''}</div>${(q.items||[]).map((it,ii)=>`<div class="qrow"><button class="ox-edit ${it.status==='X'?'x':''}" data-toggle-ox="${c.id}" data-q-index="${qi}" data-item-index="${ii}">${it.status==='X'?'X':'O'}</button><div ${editing?`class="editable" contenteditable="true" data-q-item="${c.id}" data-q-index="${qi}" data-item-index="${ii}"`:''}>${sanitizeRich(it.content||'')}</div>${editing?`<button class="mini-del" data-del-qitem="${c.id}" data-q-index="${qi}" data-item-index="${ii}">✕</button>`:''}</div>`).join('')}${editing?`<div class="qtools"><button class="btn btn-soft" data-add-qitem="${c.id}" data-q-index="${qi}">+ 항목</button></div>`:''}</div>`).join('')}</div>`:''}${editing?`<div class="qtools"><button class="btn btn-soft" data-add-qsection="${c.id}" data-q-type="ox">+ O/X 기출</button><button class="btn btn-soft" type="button" data-add-qa="${c.id}">+ Q&A 기출</button></div>`:''}`;

  return `
    <article class="card" aria-editing="${editing}" data-card-shell="${c.id}">
      ${editing ? `<button type="button" class="card-drag-handle" data-card-drag="${c.id}">⋮⋮</button>` : ''}
      <div class="card-head">
        <div ${titleAttrs}>${sanitizeRich(c.title)}</div>
        ${(c.keywords||[]).map(k=>`<span class="badge">${esc(k)}</span>`).join('')}
      </div>

      <div class="card-grid">
        <div>
          <div class="content-flow" data-flow-card="${c.id}">
            ${(c.blocks||[]).map(b=>renderBlock(c,b)).join('')}
          </div>
        </div>
        <aside class="side">${vocab}${trans}</aside>
      </div>

      ${qb}

      <div class="editbar">
        <button class="btn btn-soft" data-add-text="${c.id}">+ 개념</button>
        <button class="btn btn-soft" data-add-vocab="${c.id}">+ 단어</button>
        <button class="btn btn-soft" data-add-trans="${c.id}">+ 번역</button>
        <button class="btn btn-soft" data-add-image="${c.id}">+ 이미지</button>
        <button class="btn btn-soft" data-add-html="${c.id}">&lt;/&gt; HTML</button>
        <button class="btn btn-danger" data-del-card="${c.id}">카드 삭제</button>
      </div>
    </article>`;
}


function captureViewState(){
  const stateObj={
    scrollY:window.scrollY,
    openQboxes:new Set(qboxOpenState)
  };

  document.querySelectorAll('.qbox.open').forEach(box=>{
    const section=box.closest('.card');
    const cardId=section?.querySelector('[data-card]')?.dataset?.card ||
      section?.querySelector('[data-add-text]')?.dataset?.addText ||
      section?.querySelector('[data-add-qsection]')?.dataset?.addQsection;
    if(cardId) stateObj.openQboxes.add(cardId);
  });

  return stateObj;
}

function restoreViewState(v){
  if(!v) return;

  qboxOpenState=new Set(v.openQboxes||[]);

  document.querySelectorAll('.card').forEach(cardEl=>{
    const cardId=
      cardEl.querySelector('[data-add-text]')?.dataset?.addText ||
      cardEl.querySelector('[data-add-qsection]')?.dataset?.addQsection ||
      cardEl.querySelector('[data-del-card]')?.dataset?.delCard;

    const qbox=cardEl.querySelector('.qbox');
    if(qbox && cardId && qboxOpenState.has(cardId)){
      qbox.classList.add('open');
    }
  });

  requestAnimationFrame(()=>{
    window.scrollTo({top:v.scrollY,left:0,behavior:'auto'});
  });
}

function rerenderPreserveView(){
  const v=captureViewState();
  render();
  restoreViewState(v);
}

function currentCardIdFromToggle(btn){
  const card=btn.closest('.card');
  return card?.querySelector('[data-add-text]')?.dataset?.addText ||
    card?.querySelector('[data-add-qsection]')?.dataset?.addQsection ||
    card?.querySelector('[data-del-card]')?.dataset?.delCard || null;
}

function render(){
  const q = $('#searchInput').value.trim().toLowerCase();

  $('#tabs').innerHTML =
    state.categories.map(c=>`
      <button class="tab ${c.id===selectedCategory?'active':''}" data-cat="${esc(c.id)}" data-category-id="${esc(c.id)}">${editing?`<span class="category-drag-handle" data-cat-drag="${esc(c.id)}">⋮⋮</span>`:''}<span ${editing?`contenteditable="true" data-cat-name="${esc(c.id)}"`:''}>${esc(c.subLabel||c.title)}</span></button>`).join('') +
    (editing ? `<button class="tab tab-add" id="addCategoryBtn" title="카테고리 추가">＋</button>` : '');

  $('#tabs').querySelectorAll('.tab[data-cat]').forEach(b=>{
    b.onclick = () => {
      collectEditable();
      selectedCategory = b.dataset.cat;
      render();
    };
  });

  if ($('#addCategoryBtn')) $('#addCategoryBtn').onclick = () => openCategoryModal();

  const cat = catById(selectedCategory) || state.categories[0];
  if (!cat) {
    $('#content').innerHTML = '<div class="empty">데이터가 없습니다.</div>';
    return;
  }

  let cards = cat.cards || [];
  if (q) cards = cards.filter(c => searchCard(c,q));

  $('#content').innerHTML = `
    <div class="section-head">
      <h2 class="section-title">${esc(cat.title || cat.subLabel || '')}</h2>
      <div class="section-subtitle">${esc(cat.subtitle || '')}</div>
      ${editing && dirty ? `<div class="unsaved-warning">저장되지 않은 변경사항이 있습니다.</div>` : ''}
      <div class="category-tools">
        <button class="btn btn-soft" id="renameCategoryBtn">카테고리 수정</button>
        <button class="btn btn-danger" id="deleteCategoryBtn">카테고리 삭제</button>
      </div>
    </div>
    <div class="cards">${cards.length ? cards.map(renderCard).join('') : '<div class="empty">검색 결과가 없습니다.</div>'}</div>`;

  bindDynamic();
}

function bindDynamic(){
  if (editing) {
    document.querySelectorAll('.editable').forEach(el=>{
      el.addEventListener('input', markDirty);
      el.addEventListener('blur', () => {
        collectEditable();
        markDirty();
      });
    });

    document.querySelectorAll('[data-add-text]').forEach(b => b.onclick = () => addText(b.dataset.addText));
    document.querySelectorAll('[data-add-vocab]').forEach(b => b.onclick = () => addVocab(b.dataset.addVocab));
    document.querySelectorAll('[data-add-trans]').forEach(b => b.onclick = () => addTrans(b.dataset.addTrans));
    document.querySelectorAll('[data-add-image]').forEach(b => b.onclick = () => chooseImage(b.dataset.addImage));
    document.querySelectorAll('[data-add-html]').forEach(b => b.onclick = () => openHtmlEditor(b.dataset.addHtml));
    document.querySelectorAll('[data-edit-html]').forEach(b => b.onclick = () => openHtmlEditor(b.dataset.editHtml, b.dataset.block));
    document.querySelectorAll('[data-delete-block]').forEach(b => b.onclick = () => deleteBlock(b.dataset.deleteBlock, b.dataset.block));
    document.querySelectorAll('[data-del-card]').forEach(b => b.onclick = () => deleteCard(b.dataset.delCard));

    document.querySelectorAll('[data-image-width]').forEach(sel => {
      sel.onchange = () => {
        const card = findCard(sel.dataset.imageWidth);
        const block = findBlock(card, sel.dataset.block);
        if (block) {
          block.displayWidth = Number(sel.value);
          markDirty();
          render();
        }
      };
    });

    document.querySelectorAll('[data-image-align]').forEach(sel => {
      sel.onchange = () => {
        const card = findCard(sel.dataset.imageAlign);
        const block = findBlock(card, sel.dataset.block);
        if (block) {
          block.align = sel.value;
          markDirty();
          render();
        }
      };
    });

    const cat = catById(selectedCategory);
    if ($('#renameCategoryBtn')) $('#renameCategoryBtn').onclick = () => openCategoryModal(cat.id);
    if ($('#deleteCategoryBtn')) $('#deleteCategoryBtn').onclick = () => deleteCategory(cat.id);

    document.querySelectorAll('[data-del-vocab]').forEach(b=>b.onclick=e=>{e.stopPropagation();findCard(b.dataset.delVocab).vocab.splice(+b.dataset.index,1);markDirty();render();});
    document.querySelectorAll('[data-cat-name]').forEach(el=>{el.onclick=e=>e.stopPropagation();el.oninput=()=>{const c=catById(el.dataset.catName);c.subLabel=el.textContent.trim();c.title=c.subLabel;markDirty();};});
    document.querySelectorAll('[data-add-qsection]').forEach(b=>b.onclick=()=>{findCard(b.dataset.addQsection).qbank.push({date:'기출',title:'새 기출 주제',items:[{status:'O',content:'새 기출 항목'}]});markDirty();rerenderPreserveView();});
    document.querySelectorAll('[data-del-qsection]').forEach(b=>b.onclick=()=>{findCard(b.dataset.delQsection).qbank.splice(+b.dataset.qIndex,1);markDirty();rerenderPreserveView();});
    document.querySelectorAll('[data-add-qitem]').forEach(b=>b.onclick=()=>{findCard(b.dataset.addQitem).qbank[+b.dataset.qIndex].items.push({status:'O',content:'새 기출 항목'});markDirty();rerenderPreserveView();});
    document.querySelectorAll('[data-del-qitem]').forEach(b=>b.onclick=()=>{findCard(b.dataset.delQitem).qbank[+b.dataset.qIndex].items.splice(+b.dataset.itemIndex,1);markDirty();rerenderPreserveView();});
    document.querySelectorAll('[data-toggle-ox]').forEach(b=>b.onclick=()=>{const x=findCard(b.dataset.toggleOx).qbank[+b.dataset.qIndex].items[+b.dataset.itemIndex];x.status=x.status==='X'?'O':'X';markDirty();rerenderPreserveView();});
    document.querySelectorAll('[data-q-item]').forEach(el=>el.oninput=()=>{findCard(el.dataset.qItem).qbank[+el.dataset.qIndex].items[+el.dataset.itemIndex].content=sanitizeRich(el.innerHTML);markDirty();});
    initCategoryDrag();
    document.querySelectorAll('[data-add-qa]').forEach(b=>b.onclick=()=>{findCard(b.dataset.addQa).qbank.push({type:'qa',date:'기출',title:'Q&A',question:'질문 입력',answer:'정답 입력',items:[]});markDirty();rerenderPreserveView();});
    document.querySelectorAll('[data-qa-q]').forEach(x=>x.oninput=()=>{findCard(x.dataset.qaQ).qbank[+x.dataset.qIndex].question=sanitizeRich(x.innerHTML);markDirty();});
    document.querySelectorAll('[data-qa-a]').forEach(x=>x.oninput=()=>{findCard(x.dataset.qaA).qbank[+x.dataset.qIndex].answer=sanitizeRich(x.innerHTML);markDirty();});
    document.querySelectorAll('[data-qa-show]').forEach(b=>b.onclick=()=>{const q=findCard(b.dataset.qaShow).qbank[+b.dataset.qIndex],m=document.querySelector(`[data-qa-mask="${b.dataset.qaShow}-${b.dataset.qIndex}"]`);if(b.dataset.open==='1'){m.className='qa-mask';m.textContent='정답';b.textContent='정답 확인';b.dataset.open='0';}else{m.className='';m.innerHTML=sanitizeRich(q.answer);b.textContent='정답 숨기기';b.dataset.open='1';}});
        initQSectionDrag();
    initCardDrag();
    initDragHandles();
  }

  document.querySelectorAll('.qtoggle').forEach(b=>{
    const cardId=currentCardIdFromToggle(b);
    const qbox=b.nextElementSibling;
    if(cardId && qboxOpenState.has(cardId)) qbox.classList.add('open');

    b.onclick=()=>{
      qbox.classList.toggle('open');
      if(cardId){
        if(qbox.classList.contains('open')) qboxOpenState.add(cardId);
        else qboxOpenState.delete(cardId);
      }
    };
  });

  document.querySelectorAll('img').forEach(img=>{
    img.addEventListener('dragstart', e => e.preventDefault());
  });
}


function mountEditDock(){
  const dock=$('#editDock');
  const dockActions=$('#editDockActions');
  const topActions=$('#topActions');
  if(!dock||!dockActions||!topActions)return;

  ['editBtn','autoCardBtn','saveBtn'].forEach(id=>{
    const el=$('#'+id);
    if(el) dockActions.appendChild(el);
  });

  dock.hidden=false;
  hideRichToolbar();
}

function unmountEditDock(){
  const dock=$('#editDock');
  const dockActions=$('#editDockActions');
  const topActions=$('#topActions');
  if(!dock||!dockActions||!topActions)return;

  ['editBtn','autoCardBtn','saveBtn'].forEach(id=>{
    const el=$('#'+id);
    if(el) topActions.appendChild(el);
  });

  dock.hidden=true;
  hideRichToolbar();
}

function startEdit(){
  editSnapshot = deepClone(state);
  mountEditDock();
  editing = true;
  dirty = false;
  document.body.classList.add('editing');
  $('#saveBtn').hidden = false;
  $('#autoCardBtn').hidden = false;
  hideRichToolbar();
  $('#editBtn').textContent = '편집 종료';
  $('#modeBadge').textContent = 'EDIT';
  setSaveState('', cloudEnabled() ? '클라우드 연결' : '이 기기에 저장');
  render();
}

function tryExitEdit(){
  collectEditable();

  if (dirty) {
    const ok = confirm(
      '저장되지 않은 변경사항이 있습니다.\n\n편집을 종료하면 작업한 내용이 저장되지 않습니다.\n저장하지 않고 편집을 종료하시겠습니까?'
    );
    if (!ok) return;

    state = deepClone(editSnapshot);
    dirty = false;
  }

  editing = false;
  editSnapshot = null;
  unmountEditDock();
  document.body.classList.remove('editing');
  $('#saveBtn').hidden = true;
  $('#autoCardBtn').hidden = true;
  hideRichToolbar();
  $('#editBtn').textContent = '편집';
  $('#modeBadge').textContent = 'VIEW';
  $('#saveBtn').textContent = '저장';
  setSaveState('', cloudEnabled() ? '클라우드 연결' : '이 기기에 저장');
  render();
}

function toggleEdit(){
  if (editing) tryExitEdit();
  else startEdit();
}

function addText(id){
  collectEditable();
  const card = findCard(id);
  card.blocks.push({id:makeId('txt'),type:'text',content:'새 개념 입력',order:card.blocks.length});
  syncLegacyFields(card);
  markDirty();
  render();
}

function addVocab(id){
  collectEditable();
  findCard(id).vocab.push('새 단어 - 뜻');
  markDirty();
  render();
}

function addTrans(id){
  collectEditable();
  findCard(id).translations.push('새 문장 / 번역');
  markDirty();
  render();
}

function deleteBlock(cardId, blockId){
  const card = findCard(cardId);
  if (!card) return;
  const block = findBlock(card, blockId);
  const label = block?.type === 'image' ? '이미지' : block?.type === 'html' ? 'HTML 블록' : '개념 문단';
  if (!confirm(`${label}을 삭제하시겠습니까?`)) return;

  card.blocks = card.blocks.filter(b => b.id !== blockId);
  card.blocks.forEach((b,i)=>b.order=i);
  syncLegacyFields(card);
  markDirty();
  render();
}

function deleteCard(id){
  if (!confirm('이 카드를 삭제하시겠습니까?')) return;
  collectEditable();
  const c = catById(selectedCategory);
  c.cards = c.cards.filter(x => x.id !== id);
  markDirty();
  render();
}

function createCard(){
  const cat = catById(selectedCategory);
  if (!cat) return;

  const title = $('#newTitle').value.trim();
  if (!title) {
    alert('제목을 입력하세요.');
    return;
  }

  const blocks = $('#newBullets').value.split('\n')
    .map(s=>s.trim()).filter(Boolean)
    .map((s,i)=>({id:makeId('txt'),type:'text',content:esc(s),order:i}));

  const card = {
    id: makeId(cat.id || 'card'),
    title: esc(title),
    keywords: $('#newKeywords').value.split(',').map(s=>s.trim()).filter(Boolean),
    blocks,
    bullets: [],
    vocab: [],
    translations: [],
    images: [],
    qbank: [],
    customHtml: '',
    order: cat.cards.length,
    updatedAt: new Date().toISOString()
  };
  syncLegacyFields(card);
  cat.cards.push(card);

  $('#newTitle').value = '';
  $('#newKeywords').value = '';
  $('#newBullets').value = '';
  $('#cardModal').classList.remove('open');
  markDirty();
  render();
}

function openCategoryModal(id=null){
  categoryEditId = id;
  const cat = id ? catById(id) : null;
  $('#categoryModalTitle').textContent = cat ? '카테고리 수정' : '새 카테고리';
  $('#categoryName').value = cat ? (cat.subLabel || cat.title || '') : '';
  $('#categorySubtitle').value = cat ? (cat.subtitle || '') : '';
  $('#saveCategoryBtn').textContent = cat ? '수정' : '추가';
  $('#categoryModal').classList.add('open');
}

function saveCategory(){
  const name = $('#categoryName').value.trim();
  const subtitle = $('#categorySubtitle').value.trim();
  if (!name) {
    alert('카테고리 이름을 입력하세요.');
    return;
  }

  if (categoryEditId) {
    const cat = catById(categoryEditId);
    cat.subLabel = name;
    cat.title = name;
    cat.subtitle = subtitle;
  } else {
    let idBase = slugify(name);
    let id = `custom-${idBase}`;
    while (catById(id)) id = `custom-${idBase}-${Date.now()}`;

    state.categories.push({
      id,
      main:'Custom',
      mainLabel:'Custom',
      sub:id,
      subLabel:name,
      title:name,
      subtitle,
      order:state.categories.length,
      cards:[]
    });
    selectedCategory = id;
  }

  $('#categoryModal').classList.remove('open');
  categoryEditId = null;
  markDirty();
  render();
}

function deleteCategory(id){
  const cat = catById(id);
  if (!cat) return;
  if (!confirm(`"${cat.subLabel || cat.title}" 카테고리와 내부 카드 ${cat.cards.length}개를 삭제하시겠습니까?`)) return;

  const idx = state.categories.findIndex(c=>c.id===id);
  state.categories = state.categories.filter(c=>c.id!==id);
  selectedCategory = state.categories[Math.max(0,idx-1)]?.id || state.categories[0]?.id || null;
  markDirty();
  render();
}

function openHtmlEditor(cardId, blockId=null){
  const card = findCard(cardId);
  if (!card) return;

  let block = blockId ? findBlock(card, blockId) : null;
  if (!block) {
    block = {id:makeId('html'),type:'html',content:'',order:card.blocks.length,_new:true};
  }

  htmlTargetCardId = cardId;
  $('#htmlEditor').dataset.blockId = block.id;
  $('#htmlEditor').dataset.isNew = block._new ? '1' : '0';
  $('#htmlEditor').value = block.content || '';
  $('#htmlPreview').innerHTML = sanitizeRich(block.content || '');
  $('#htmlModal').classList.add('open');
}

function previewHtml(){
  $('#htmlPreview').innerHTML = sanitizeRich($('#htmlEditor').value);
}

function applyHtml(){
  const card = findCard(htmlTargetCardId);
  if (!card) return;

  const blockId = $('#htmlEditor').dataset.blockId;
  let block = findBlock(card, blockId);
  if (!block) {
    block = {id:blockId,type:'html',content:'',order:card.blocks.length};
    card.blocks.push(block);
  }
  block.content = sanitizeRich($('#htmlEditor').value);
  syncLegacyFields(card);

  $('#htmlModal').classList.remove('open');
  htmlTargetCardId = null;
  markDirty();
  render();
}

function chooseImage(cardId){
  if (!cloudEnabled()) {
    alert(DEV_MODE
      ? 'DEV DB가 연결되지 않았습니다. config.dev.js에 테스트 Supabase 정보를 입력하세요.'
      : '이미지 공유 저장은 Supabase 연결이 필요합니다.');
    return;
  }

  imageTargetCardId = cardId;
  $('#imageInput').value = '';
  $('#imageInput').click();
}

async function fileToImage(file){
  return new Promise((resolve,reject)=>{
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('이미지를 읽을 수 없습니다.'));
    };
    img.src = url;
  });
}

function formatBytes(n){
  if (!Number.isFinite(n)) return '-';
  if (n < 1024) return `${n} B`;
  if (n < 1024*1024) return `${(n/1024).toFixed(1)} KB`;
  return `${(n/1024/1024).toFixed(2)} MB`;
}

function clampCropValues(){
  const L = $('#cropLeft'), R = $('#cropRight'), T = $('#cropTop'), B = $('#cropBottom');
  if (+L.value + +R.value > 80) R.value = Math.max(0, 80 - +L.value);
  if (+T.value + +B.value > 80) B.value = Math.max(0, 80 - +T.value);

  $('#cropLeftValue').textContent = `${L.value}%`;
  $('#cropRightValue').textContent = `${R.value}%`;
  $('#cropTopValue').textContent = `${T.value}%`;
  $('#cropBottomValue').textContent = `${B.value}%`;
}

function profileSettings(){
  const p = $('#imageProfile').value;
  if (p === 'original') return {max:null, quality:1, original:true};
  if (p === 'high') return {max:2560, quality:.90};
  if (p === 'compact') return {max:1024, quality:.74};
  return {max:1600, quality:.84};
}

async function processPendingImage(){
  if (!pendingImageFile) return;

  clampCropValues();
  const img = await fileToImage(pendingImageFile);
  const L = +$('#cropLeft').value / 100;
  const R = +$('#cropRight').value / 100;
  const T = +$('#cropTop').value / 100;
  const B = +$('#cropBottom').value / 100;
  const rotate = +$('#imageRotate').value;
  const prof = profileSettings();

  const sx = Math.round(img.naturalWidth * L);
  const sy = Math.round(img.naturalHeight * T);
  const sw = Math.max(1, Math.round(img.naturalWidth * (1-L-R)));
  const sh = Math.max(1, Math.round(img.naturalHeight * (1-T-B)));

  let targetW = sw, targetH = sh;
  if (prof.max && Math.max(sw,sh) > prof.max) {
    const scale = prof.max / Math.max(sw,sh);
    targetW = Math.max(1, Math.round(sw * scale));
    targetH = Math.max(1, Math.round(sh * scale));
  }

  const rotated = rotate === 90 || rotate === 270;
  const canvas = document.createElement('canvas');
  canvas.width = rotated ? targetH : targetW;
  canvas.height = rotated ? targetW : targetH;

  const ctx = canvas.getContext('2d');
  ctx.save();
  if (rotate === 90) {
    ctx.translate(canvas.width,0);
    ctx.rotate(Math.PI/2);
  } else if (rotate === 180) {
    ctx.translate(canvas.width,canvas.height);
    ctx.rotate(Math.PI);
  } else if (rotate === 270) {
    ctx.translate(0,canvas.height);
    ctx.rotate(-Math.PI/2);
  }

  ctx.drawImage(img, sx,sy,sw,sh, 0,0,targetW,targetH);
  ctx.restore();

  const mime = prof.original && L===0 && R===0 && T===0 && B===0 && rotate===0
    ? pendingImageFile.type
    : 'image/webp';

  if (prof.original && L===0 && R===0 && T===0 && B===0 && rotate===0) {
    pendingImageBlob = pendingImageFile;
  } else {
    pendingImageBlob = await new Promise(resolve => canvas.toBlob(resolve, mime, prof.quality));
    if (!pendingImageBlob) {
      pendingImageBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', prof.quality));
    }
  }

  const previewUrl = URL.createObjectURL(pendingImageBlob);
  const oldUrl = $('#imagePreview').dataset.objectUrl;
  if (oldUrl) URL.revokeObjectURL(oldUrl);
  $('#imagePreview').dataset.objectUrl = previewUrl;
  $('#imagePreview').src = previewUrl;

  pendingImageMeta = {
    originalWidth: img.naturalWidth,
    originalHeight: img.naturalHeight,
    processedWidth: canvas.width,
    processedHeight: canvas.height,
    originalSize: pendingImageFile.size,
    processedSize: pendingImageBlob.size
  };

  $('#imageInfo').textContent =
    `원본 ${img.naturalWidth}×${img.naturalHeight} / ${formatBytes(pendingImageFile.size)} → ` +
    `업로드 ${canvas.width}×${canvas.height} / 약 ${formatBytes(pendingImageBlob.size)}`;
}

async function openImageSettings(file){
  pendingImageFile = file;
  pendingImageBlob = null;
  pendingImageMeta = null;

  ['cropLeft','cropRight','cropTop','cropBottom'].forEach(id => $( '#' + id ).value = 0);
  $('#imageProfile').value = 'standard';
  $('#imageRotate').value = '0';
  $('#imageDisplayWidth').value = '75';
  clampCropValues();

  $('#imageModal').classList.add('open');
  await processPendingImage();
}

async function uploadPreparedImage(){
  if (!pendingImageBlob || !imageTargetCardId) return;

  const card = findCard(imageTargetCardId);
  if (!card) return;

  $('#uploadImageBtn').disabled = true;
  setSaveState('saving','이미지 업로드 중...');

  try {
    const ext = pendingImageBlob.type === 'image/png' ? 'png'
      : pendingImageBlob.type === 'image/jpeg' ? 'jpg' : 'webp';
    const path = `uploads/${Date.now()}_${makeId('img')}.${ext}`;

    const {error} = await sb.storage
      .from('studynurse-images')
      .upload(path, pendingImageBlob, {
        cacheControl:'3600',
        upsert:false,
        contentType:pendingImageBlob.type
      });

    if (error) throw error;

    const {data} = sb.storage.from('studynurse-images').getPublicUrl(path);
    if (!data?.publicUrl) throw new Error('Public URL 생성 실패');

    card.blocks.push({
      id:makeId('img'),
      type:'image',
      url:data.publicUrl,
      displayWidth:Number($('#imageDisplayWidth').value),
      align:'center',
      originalWidth:pendingImageMeta?.originalWidth || null,
      originalHeight:pendingImageMeta?.originalHeight || null,
      fileSize:pendingImageBlob.size,
      order:card.blocks.length
    });
    syncLegacyFields(card);

    $('#imageModal').classList.remove('open');
    pendingImageFile = pendingImageBlob = pendingImageMeta = null;
    imageTargetCardId = null;

    // IMPORTANT: image file itself is uploaded immediately, but card/DB references are NOT saved
    // until the user presses Save. An unused uploaded file may remain if editing is discarded.
    markDirty();
    setSaveState('saving','저장되지 않은 변경');
    render();
  } catch(e) {
    setSaveState('error','이미지 업로드 실패');
    alert('이미지 업로드 실패: ' + (e.message || e));
  } finally {
    $('#uploadImageBtn').disabled = false;
  }
}

function cancelImageModal(){
  const oldUrl = $('#imagePreview').dataset.objectUrl;
  if (oldUrl) URL.revokeObjectURL(oldUrl);
  $('#imagePreview').dataset.objectUrl = '';
  $('#imageModal').classList.remove('open');
  pendingImageFile = pendingImageBlob = pendingImageMeta = null;
  imageTargetCardId = null;
}

function initCategoryDrag(){
 document.querySelectorAll('[data-cat-drag]').forEach(h=>h.onpointerdown=e=>{e.preventDefault();e.stopPropagation();const tab=h.closest('.tab');tab.classList.add('cat-dragging');const mv=ev=>{const hit=document.elementFromPoint(ev.clientX,ev.clientY)?.closest('.tab[data-category-id]');if(hit&&hit!==tab){document.querySelectorAll('.tab').forEach(x=>x.classList.remove('cat-drag-over'));hit.classList.add('cat-drag-over');const r=hit.getBoundingClientRect();hit.parentElement.insertBefore(tab,ev.clientX<r.left+r.width/2?hit:hit.nextSibling);}};const up=()=>{document.removeEventListener('pointermove',mv);const ids=[...$('#tabs').querySelectorAll('[data-category-id]')].map(x=>x.dataset.categoryId),map=new Map(state.categories.map(x=>[x.id,x]));state.categories=ids.map((id,i)=>{const x=map.get(id);return x?{...x,order:i}:null}).filter(Boolean);markDirty();render();};document.addEventListener('pointermove',mv);document.addEventListener('pointerup',up,{once:true});});
}
function initQSectionDrag(){
 document.querySelectorAll('[data-qsection-drag]').forEach(h=>h.onpointerdown=e=>{
  if(!editing)return;e.preventDefault();e.stopPropagation();
  const sec=h.closest('.qsection'),box=sec.parentElement,card=findCard(h.dataset.qsectionDrag),pid=e.pointerId,sy=e.clientY;let started=false;
  const mv=ev=>{if(ev.pointerId!==pid)return;ev.preventDefault();if(!started){if(Math.abs(ev.clientY-sy)<6)return;started=true;sec.classList.add('qsection-dragging');}const hit=document.elementFromPoint(ev.clientX,ev.clientY)?.closest('.qsection');box.querySelectorAll('.qsection').forEach(x=>x.classList.remove('qsection-drop-target'));if(hit&&hit!==sec&&hit.parentElement===box){const r=hit.getBoundingClientRect();hit.classList.add('qsection-drop-target');box.insertBefore(sec,ev.clientY<r.top+r.height/2?hit:hit.nextSibling);}};
  const up=ev=>{if(ev.pointerId!==pid)return;document.removeEventListener('pointermove',mv);document.removeEventListener('pointerup',up);if(started){const idx=[...box.querySelectorAll('.qsection')].map(x=>+x.dataset.qIndex),old=[...card.qbank];card.qbank=idx.map(i=>old[i]);markDirty();rerenderPreserveView();}};
  document.addEventListener('pointermove',mv,{passive:false});document.addEventListener('pointerup',up,{passive:false});
 });
}
function initCardDrag(){
 document.querySelectorAll('[data-card-drag]').forEach(h=>h.onpointerdown=e=>{
  if(!editing)return;e.preventDefault();e.stopPropagation();
  const el=h.closest('.card'),box=el.parentElement,cat=catById(selectedCategory),pid=e.pointerId,sy=e.clientY;let started=false;
  const mv=ev=>{if(ev.pointerId!==pid)return;ev.preventDefault();if(!started){if(Math.abs(ev.clientY-sy)<6)return;started=true;el.classList.add('card-dragging');}
   const hit=document.elementFromPoint(ev.clientX,ev.clientY)?.closest('.card');box.querySelectorAll('.card').forEach(x=>x.classList.remove('card-drop-target'));
   if(hit&&hit!==el&&hit.parentElement===box){const r=hit.getBoundingClientRect();hit.classList.add('card-drop-target');box.insertBefore(el,ev.clientY<r.top+r.height/2?hit:hit.nextSibling);}
  };
  const up=ev=>{if(ev.pointerId!==pid)return;document.removeEventListener('pointermove',mv);document.removeEventListener('pointerup',up);el.classList.remove('card-dragging');box.querySelectorAll('.card').forEach(x=>x.classList.remove('card-drop-target'));if(started){const ids=[...box.querySelectorAll('.card')].map(x=>x.dataset.cardShell),map=new Map(cat.cards.map(x=>[x.id,x]));cat.cards=ids.map((id,i)=>{const x=map.get(id);return x?{...x,order:i}:null}).filter(Boolean);markDirty();rerenderPreserveView();}};
  document.addEventListener('pointermove',mv,{passive:false});document.addEventListener('pointerup',up,{passive:false});
 });
}
function initDragHandles(){
  document.querySelectorAll('.drag-handle').forEach(handle=>{
    handle.addEventListener('pointerdown', onDragStart, {passive:false});
  });
}

let dragState = null;

function onDragStart(e){
  if (!editing || e.button === 2) return;

  const handle = e.currentTarget;
  const blockEl = handle.closest('.content-block');
  const flow = blockEl?.closest('.content-flow');
  if (!blockEl || !flow) return;

  e.preventDefault();
  e.stopPropagation();

  dragState = {
    pointerId: e.pointerId,
    handle,
    blockEl,
    flow,
    cardId: handle.dataset.dragCard,
    startX: e.clientX,
    startY: e.clientY,
    started: false,
    originalOrder: [...flow.querySelectorAll('.content-block')].map(el=>el.dataset.blockId)
  };

  document.body.classList.add('block-drag-active');

  try {
    handle.setPointerCapture(e.pointerId);
  } catch (_) {}

  // Document-level tracking is more reliable than listening on the tiny handle itself.
  document.addEventListener('pointermove', onDragMove, {passive:false});
  document.addEventListener('pointerup', onDragEnd, {passive:false});
  document.addEventListener('pointercancel', onDragCancel, {passive:false});
}

function onDragMove(e){
  if (!dragState || e.pointerId !== dragState.pointerId) return;
  e.preventDefault();

  const dx = e.clientX - dragState.startX;
  const dy = e.clientY - dragState.startY;

  // Small threshold prevents a simple tap from becoming a drag.
  if (!dragState.started) {
    if (Math.hypot(dx, dy) < 6) return;
    dragState.started = true;
    dragState.blockEl.classList.add('dragging');
  }

  // elementFromPoint identifies the block currently under the finger/mouse,
  // even while the pointer is captured by the drag handle.
  const hit = document.elementFromPoint(e.clientX, e.clientY);
  const target = hit?.closest('.content-block');

  dragState.flow.querySelectorAll('.content-block').forEach(el=>{
    el.classList.remove('drag-over');
  });

  if (!target || target === dragState.blockEl || target.parentElement !== dragState.flow) {
    // Allow moving to very top/bottom when pointer is outside a specific block.
    const rect = dragState.flow.getBoundingClientRect();
    const blocks = [...dragState.flow.querySelectorAll('.content-block')]
      .filter(el => el !== dragState.blockEl);

    if (e.clientY < rect.top + 20 && blocks.length) {
      dragState.flow.insertBefore(dragState.blockEl, blocks[0]);
    } else if (e.clientY > rect.bottom - 20) {
      dragState.flow.appendChild(dragState.blockEl);
    }
    return;
  }

  const r = target.getBoundingClientRect();
  const before = e.clientY < r.top + r.height / 2;

  target.classList.add('drag-over');
  dragState.flow.insertBefore(
    dragState.blockEl,
    before ? target : target.nextSibling
  );
}

function finishDrag(commit){
  if (!dragState) return;

  const {handle, blockEl, flow, cardId, pointerId, originalOrder, started} = dragState;

  document.removeEventListener('pointermove', onDragMove);
  document.removeEventListener('pointerup', onDragEnd);
  document.removeEventListener('pointercancel', onDragCancel);

  try {
    if (handle.hasPointerCapture?.(pointerId)) handle.releasePointerCapture(pointerId);
  } catch (_) {}

  blockEl.classList.remove('dragging');
  flow.querySelectorAll('.content-block').forEach(el=>el.classList.remove('drag-over'));
  document.body.classList.remove('block-drag-active');

  const card = findCard(cardId);

  if (card && started) {
    if (commit) {
      const ids = [...flow.querySelectorAll('.content-block')].map(el=>el.dataset.blockId);
      const map = new Map(card.blocks.map(b=>[b.id,b]));
      card.blocks = ids.map((id,i)=>{
        const b = map.get(id);
        return b ? {...b, order:i} : null;
      }).filter(Boolean);
      syncLegacyFields(card);
      markDirty();
    } else {
      const map = new Map(card.blocks.map(b=>[b.id,b]));
      card.blocks = originalOrder.map((id,i)=>{
        const b = map.get(id);
        return b ? {...b, order:i} : null;
      }).filter(Boolean);
      syncLegacyFields(card);
    }
  }

  dragState = null;
  render();
}

function onDragEnd(e){
  if (!dragState || e.pointerId !== dragState.pointerId) return;
  e.preventDefault();
  finishDrag(true);
}

function onDragCancel(e){
  if (!dragState || e.pointerId !== dragState.pointerId) return;
  e.preventDefault();
  finishDrag(false);
}


function autoBoldAbbreviations(raw){
 return String(raw??'').replace(/(^|[\s>])(Sx|Tx|Cz|Cx):(?=\s|&nbsp;|<|$)/gi,(m,p,x)=>`${p}<b>${x}:</b>`);
}
let lastRichRange=null;
function isRichEditable(el){return !!el?.closest?.('.editable[contenteditable="true"],[data-q-item][contenteditable="true"],[data-q-title][contenteditable="true"]');}
function rememberRichSelection(){if(!editing)return;const s=window.getSelection();if(!s||!s.rangeCount)return;const n=s.anchorNode,e=n?.nodeType===1?n:n?.parentElement;if(isRichEditable(e))lastRichRange=s.getRangeAt(0).cloneRange();}
function showRichToolbar(){if(editing)$('#richToolbar').hidden=false;}
function hideRichToolbar(){$('#richToolbar').hidden=true;}
function updateRichToolbarContext(){if(!editing){hideRichToolbar();return;}const s=window.getSelection(),n=s?.rangeCount?s.anchorNode:null,e=n?.nodeType===1?n:n?.parentElement;if(isRichEditable(document.activeElement)||isRichEditable(e)){rememberRichSelection();showRichToolbar();}else hideRichToolbar();}
function restoreRichSelection(){if(!lastRichRange)return;const s=window.getSelection();s.removeAllRanges();s.addRange(lastRichRange);}
function applyRichCommand(cmd,value=null){if(!editing||!lastRichRange)return;restoreRichSelection();document.execCommand(cmd,false,value);rememberRichSelection();markDirty();showRichToolbar();}

function normalizeAutoLine(line){
  return String(line || '').replace(/\uFE0F/g, '').trim();
}

function detectAutoTitle(line){
  const s = normalizeAutoLine(line);
  let m = s.match(/^<([^>]+)>\s*$/);
  if (m) return m[1].trim();

  m = s.match(/^#{1,2}\s+(.+)$/);
  if (m) return m[1].trim();

  return null;
}

function parseOXPrefix(line){
  let s = normalizeAutoLine(line).replace(/^[-*•]\s*/, '');
  let status = null;

  if (/^(❎|❌|\[X\])\s*/i.test(s)) {
    status = 'X';
    s = s.replace(/^(❎|❌|\[X\])\s*/i, '');
  } else if (/^(🅾|⭕|\[O\])\s*/i.test(s)) {
    status = 'O';
    s = s.replace(/^(🅾|⭕|\[O\])\s*/i, '');
  }

  return {status, text:s.trim()};
}

function parseAutoCards(rawText){
  const lines = String(rawText || '').replace(/\r\n?/g, '\n').split('\n');
  const cards = [];
  let current = null;

  function pushCurrent(){
    if (!current) return;
    current.title = current.title?.trim() || '새로운 주제';
    cards.push(current);
    current = null;
  }

  for (const raw of lines) {
    const line = normalizeAutoLine(raw);
    if (!line) continue;

    const title = detectAutoTitle(line);
    if (title) {
      pushCurrent();
      current = {title, notes:[], vocab:[], translations:[]};
      continue;
    }

    if (!current) {
      current = {title:line, notes:[], vocab:[], translations:[]};
      continue;
    }

    let m = line.match(/^(vocab|단어)\s*[:：]\s*(.*)$/i);
    if (m) {
      if (m[2].trim()) current.vocab.push(m[2].trim());
      continue;
    }

    m = line.match(/^(trans|translation|해석|번역)\s*[:：]\s*(.*)$/i);
    if (m) {
      if (m[2].trim()) current.translations.push(m[2].trim());
      continue;
    }

    const ox = parseOXPrefix(line);
    const prefix = ox.status === 'X' ? '❎ ' : ox.status === 'O' ? '🅾️ ' : '';
    current.notes.push({text:prefix + ox.text, status:ox.status});
  }

  pushCurrent();

  return cards.filter(c =>
    c.title || c.notes.length || c.vocab.length || c.translations.length
  );
}

function renderAutoPreview(){
  const raw = $('#autoCardInput').value.trim();
  autoParsedCards = parseAutoCards(raw);

  const summary = $('#autoPreviewSummary');
  const list = $('#autoPreviewList');
  const createBtn = $('#createAutoCardsBtn');

  if (!raw || autoParsedCards.length === 0) {
    summary.classList.remove('show');
    summary.textContent = '';
    list.innerHTML = '<div class="auto-preview-empty">정리할 수 있는 카드가 없습니다.</div>';
    createBtn.disabled = true;
    return;
  }

  const totals = autoParsedCards.reduce((a,c)=>{
    a.notes += c.notes.length;
    a.vocab += c.vocab.length;
    a.trans += c.translations.length;
    return a;
  }, {notes:0,vocab:0,trans:0});

  summary.textContent =
    `생성 예정 ${autoParsedCards.length}개 카드 · 개념 ${totals.notes}개 · VOCAB ${totals.vocab}개 · 번역 ${totals.trans}개`;
  summary.classList.add('show');

  list.innerHTML = autoParsedCards.map((c,i)=>`
    <div class="auto-preview-card">
      <div class="auto-preview-title">${i+1}. ${esc(c.title)}</div>
      <div class="auto-preview-meta">
        <span class="auto-preview-chip">개념 ${c.notes.length}</span>
        <span class="auto-preview-chip">VOCAB ${c.vocab.length}</span>
        <span class="auto-preview-chip">번역 ${c.translations.length}</span>
      </div>
      ${c.notes.length ? `
        <ul class="auto-preview-lines">
          ${c.notes.slice(0,8).map(n=>`
            <li>${n.status==='X' ? '<span class="auto-ox-x">❎</span> ' :
                  n.status==='O' ? '<span class="auto-ox-o">🅾️</span> ' : ''}
              ${esc(n.text.replace(/^(❎|🅾️)\s*/,''))}
            </li>`).join('')}
          ${c.notes.length>8 ? `<li>… 외 ${c.notes.length-8}개</li>` : ''}
        </ul>` : ''}
    </div>`).join('');

  createBtn.disabled = false;
}

function createCardsFromAutoText(){
  const cat=catById(selectedCategory);
  if(!cat){alert('카테고리를 선택하세요.');return;}

  const raw=$('#autoCardInput').value.trim();
  if(!raw){alert('자동정리할 내용을 입력하세요.');return;}

  // Preview is optional. Always parse the current input when creating cards.
  autoParsedCards=parseAutoCards(raw);

  if(!autoParsedCards.length){
    alert('카드로 정리할 수 있는 내용을 찾지 못했습니다.');
    return;
  }

  for(const parsed of autoParsedCards){
    const blocks=parsed.notes.map((n,i)=>({
      id:makeId('txt'),
      type:'text',
      content:sanitizeRich(autoBoldAbbreviations(n.text)),
      order:i
    }));

    const card={
      id:makeId(cat.id||'card'),
      title:esc(parsed.title),
      keywords:[],
      blocks,
      bullets:[],
      vocab:parsed.vocab.map(v=>sanitizeRich(v)),
      translations:parsed.translations.map(v=>sanitizeRich(v)),
      images:[],
      qbank:[],
      customHtml:'',
      order:cat.cards.length,
      updatedAt:new Date().toISOString()
    };

    syncLegacyFields(card);
    cat.cards.push(card);
  }

  const count=autoParsedCards.length;

  $('#autoCardModal').classList.remove('open');
  $('#autoCardInput').value='';
  $('#autoPreviewSummary').classList.remove('show');
  $('#autoPreviewSummary').textContent='';
  $('#autoPreviewList').innerHTML='';
  autoParsedCards=[];

  markDirty();
  rerenderPreserveView();

  alert(`${count}개 카드를 생성했습니다.\n아직 DB에는 저장되지 않았습니다.\n확인 후 [저장]을 눌러주세요.`);
}

function openAutoCardModal(){
  if (!editing) startEdit();

  autoParsedCards = [];
  $('#autoCardInput').value = '';
  $('#autoPreviewSummary').classList.remove('show');
  $('#autoPreviewSummary').textContent = '';
  $('#autoPreviewList').innerHTML = '';
  $('#createAutoCardsBtn').disabled = true;
  $('#autoCardModal').classList.add('open');

  setTimeout(()=>$('#autoCardInput').focus(), 50);
}

function closeAutoCardModal(){
  $('#autoCardModal').classList.remove('open');
  autoParsedCards = [];
}


function qPlain(x){return plainTextFromHtml(x||'').trim();}

function quizCategoryName(cat){
  return String(cat?.subLabel || cat?.title || cat?.sub || '').trim();
}
function isQuizExcludedCategory(cat){
  return quizCategoryName(cat).startsWith('#');
}
function quizActiveCategory(){
  return catById(selectedCategory);
}
function quizAllowedCategories(){
  const active=quizActiveCategory();
  if(active && isQuizExcludedCategory(active)) return [active];
  return (state.categories||[]).filter(cat=>!isQuizExcludedCategory(cat));
}
function splitStudyStatements(raw){
  const text=qPlain(raw);
  if(!text)return[];
  const normalized=text.replace(/([⭕⛔❎❌✅])/g,'\n$1 ').replace(/\n{2,}/g,'\n').trim();
  return normalized.split(/\n+/).map(s=>s.trim()).filter(s=>s.length>2);
}
function normalizeQuizStatement(s){
  return String(s||'').replace(/^[⭕✅]\s*/,'').replace(/^[⛔❎❌]\s*/,'').trim();
}

function qFacts(){
  const scope=$('#quizScope').value;
  const active=quizActiveCategory();
  let cats=[];

  if(active && isQuizExcludedCategory(active)){
    cats=[active];
  }else if(scope==='all'){
    cats=quizAllowedCategories();
  }else{
    cats=active && !isQuizExcludedCategory(active) ? [active] : quizAllowedCategories();
  }

  const out=[];
  cats.forEach(c=>{
    (c.cards||[]).forEach(card=>{
      const base={card:qPlain(card.title),cat:quizCategoryName(c),categoryId:c.id,cardId:card.id};

      (card.blocks||[]).filter(b=>b.type==='text').forEach(b=>{
        splitStudyStatements(b.content).forEach(t=>{
          if(t.length>3)out.push({...base,t});
        });
      });

      (card.vocab||[]).forEach(v=>{
        const t=qPlain(v);
        if(t.length>3)out.push({...base,t});
      });

      (card.qbank||[]).forEach(q=>{
        if(q.type==='qa'&&q.question&&q.answer){
          out.push({...base,t:qPlain(q.answer),q:qPlain(q.question)});
        }
      });
    });
  });
  return out;
}
function qShuffle(x){return [...x].sort(()=>Math.random()-.5)}
function makeQuiz(){
  const facts=qFacts();
  const allowedCats=quizAllowedCategories();
  const all=allowedCats.flatMap(c=>
    (c.cards||[]).flatMap(card=>
      (card.blocks||[]).filter(b=>b.type==='text').flatMap(b=>
        splitStudyStatements(b.content).map(t=>({
          t,card:qPlain(card.title),cat:quizCategoryName(c),categoryId:c.id,cardId:card.id
        }))
      )
    )
  ).filter(x=>x.t.length>3);

  const n=Math.min(+$ ('#quizCount').value,facts.length*2||0);
  const typ=$('#quizType').value;
  const res=[];

  for(let i=0;i<n;i++){
    const x=facts[Math.floor(Math.random()*facts.length)];
    if(!x)break;
    const kind=typ==='mixed'?(Math.random()<.5?'ox':'mcq'):typ;

    if(x.q){
      const correct=normalizeQuizStatement(x.t);
      const wrong=qShuffle(all.filter(y=>normalizeQuizStatement(y.t)!==correct))
        .slice(0,3).map(y=>normalizeQuizStatement(y.t));
      if(wrong.length===3){
        res.push({kind:'mcq',instruction:'다음 문제의 정답을 선택하세요.',statement:x.q,a:correct,opts:qShuffle([correct,...wrong]),src:`${x.cat} > ${x.card}`,categoryId:x.categoryId,cardId:x.cardId});
      }
      continue;
    }

    if(kind==='ox'){
      const raw=String(x.t||'').trim();

      if(/^[⛔❎❌]/.test(raw)){
        res.push({kind:'ox',instruction:'다음 학습 내용이 맞으면 O, 틀리면 X를 선택하세요.',statement:normalizeQuizStatement(raw),a:'X',opts:['O','X'],src:`${x.cat} > ${x.card}`,categoryId:x.categoryId,cardId:x.cardId});
        continue;
      }
      if(/^[⭕✅]/.test(raw)){
        res.push({kind:'ox',instruction:'다음 학습 내용이 맞으면 O, 틀리면 X를 선택하세요.',statement:normalizeQuizStatement(raw),a:'O',opts:['O','X'],src:`${x.cat} > ${x.card}`,categoryId:x.categoryId,cardId:x.cardId});
        continue;
      }

      const normalized=normalizeQuizStatement(raw);
      const match=normalized.match(/^(Sx|Tx|Cz|Cx):\s*(.+)$/i);
      let statement=normalized,answer='O';

      if(match && Math.random()<.45){
        const sameLabel=all.filter(y=>{
          const yy=normalizeQuizStatement(y.t);
          const mm=yy.match(/^(Sx|Tx|Cz|Cx):\s*(.+)$/i);
          return mm&&mm[1].toLowerCase()===match[1].toLowerCase()&&yy!==normalized;
        });
        const other=qShuffle(sameLabel)[0];
        if(other){
          statement=`${match[1]}: ${normalizeQuizStatement(other.t).replace(/^(Sx|Tx|Cz|Cx):\s*/i,'')}`;
          answer='X';
        }
      }

      res.push({kind:'ox',instruction:'다음 학습 내용이 맞으면 O, 틀리면 X를 선택하세요.',statement,a:answer,opts:['O','X'],src:`${x.cat} > ${x.card}`,categoryId:x.categoryId,cardId:x.cardId});
    }else{
      const correct=normalizeQuizStatement(x.t);
      const wrong=qShuffle(all.filter(y=>normalizeQuizStatement(y.t)!==correct))
        .slice(0,3).map(y=>normalizeQuizStatement(y.t));
      if(wrong.length===3){
        res.push({kind:'mcq',instruction:'다음 중 맞는 내용을 선택하세요.',statement:`"${x.card}"의 학습 내용으로 맞는 것은?`,a:correct,opts:qShuffle([correct,...wrong]),src:`${x.cat} > ${x.card}`,categoryId:x.categoryId,cardId:x.cardId});
      }
    }
  }
  return res;
}
function jumpToQuizSource(q){
 $('#quizModal').classList.remove('open');
 if(!q.categoryId||!q.cardId)return;
 selectedCategory=q.categoryId;
 render();
 requestAnimationFrame(()=>requestAnimationFrame(()=>{
  const el=document.querySelector(`[data-card-shell="${CSS.escape(q.cardId)}"]`);
  if(el){el.scrollIntoView({behavior:'smooth',block:'center'});el.classList.add('source-highlight');setTimeout(()=>el.classList.remove('source-highlight'),1900);}
 }));
}
function showQuiz(){
  const x=quizQuestions[quizIndex];
  if(!x)return;

  quizChoice=null;
  $('#quizProgress').textContent=`문제 ${quizIndex+1} / ${quizQuestions.length}`;
  $('#quizSource').innerHTML=`출처: <button class="quiz-source-link" data-quiz-source="1">${esc(x.src)}</button>`;
  $('#quizSource').querySelector('[data-quiz-source]').onclick=()=>jumpToQuizSource(x);

  $('#quizQuestion').innerHTML=
    `<div class="quiz-instruction">${esc(x.instruction||'문제를 확인하세요.')}</div>`+
    `<div class="quiz-statement">${esc(x.statement||x.q||'')}</div>`;

  $('#quizOptions').innerHTML=x.opts.map((o,i)=>`<button class="quiz-option" data-qchoice="${i}">${i+1}. ${esc(o)}</button>`).join('');
  $('#quizAnswer').hidden=true;
  $('#quizAnswer').innerHTML='';
  $('#revealQuizBtn').hidden=false;
  $('#nextQuizBtn').hidden=true;

  document.querySelectorAll('[data-qchoice]').forEach(b=>b.onclick=()=>{
    document.querySelectorAll('.quiz-option').forEach(x=>x.classList.remove('selected'));
    b.classList.add('selected');
    quizChoice=x.opts[+b.dataset.qchoice];
  });
}
function startQuiz(){quizQuestions=makeQuiz();if(!quizQuestions.length)return alert('문제를 만들 수 있는 카드 내용이 부족합니다.');quizIndex=quizScore=0;$('#quizSetup').hidden=true;$('#quizPlay').hidden=false;$('#quizResult').hidden=true;showQuiz();}
function nextQuiz(){
  quizIndex++;

  if(quizIndex>=quizQuestions.length){
    $('#quizPlay').hidden=true;
    $('#quizResult').hidden=false;
    const total=quizQuestions.length;
    const rate=total?Math.round(quizScore/total*100):0;
    $('#quizResult').innerHTML=`<div class="quiz-result"><b>${total}문제 중 ${quizScore}문제 정답</b><br>정답률 ${rate}%<br><br><button class="btn btn-soft" id="restartQuizBtn">다시 풀기</button></div>`;
    $('#restartQuizBtn').onclick=()=>{
      $('#quizResult').hidden=true;
      $('#quizSetup').hidden=false;
    };
    return;
  }

  showQuiz();
}

function revealQuiz(){
  const x=quizQuestions[quizIndex];
  const correct=quizChoice===x.a;
  if(correct)quizScore++;

  $('#quizAnswer').hidden=false;
  $('#quizAnswer').innerHTML=
    `<div class="quiz-feedback ${correct?'correct':'wrong'}">`+
    `${correct?'✓ 정답':'✕ 오답'}<br>`+
    `내 선택: ${esc(quizChoice??'선택 안 함')}<br>`+
    `정답: ${esc(x.a)}</div>`;

  document.querySelectorAll('.quiz-option').forEach(b=>{
    const value=x.opts[+b.dataset.qchoice];
    if(value===x.a)b.classList.add('correct');
    else if(value===quizChoice)b.classList.add('wrong');
    b.disabled=true;
  });

  $('#revealQuizBtn').hidden=true;
  $('#nextQuizBtn').hidden=false;
}


function countStateCards(){
  return (state?.categories||[]).reduce((n,c)=>n+(c.cards?.length||0),0);
}
function diagClass(ok,warn=false){return ok?'diag-ok':warn?'diag-warn':'diag-err';}
function renderDiagnostics(){
  const editBtn=$('#editBtn'),quizBtn=$('#quizBtn');
  const data=[
    ['Version',CFG.version||'?',true],
    ['Environment',DEV_MODE?'DEV':'PROD',true],
    ['Data Source',activeDataSource||'?',activeDataSource==='CLOUD',activeDataSource==='LOCAL'],
    ['Categories',String(state?.categories?.length||0),(state?.categories?.length||0)>0],
    ['Cards',String(countStateCards()),countStateCards()>0],
    ['Selected Category',selectedCategory||'(none)',!!selectedCategory],
    ['Edit handler',String(typeof editBtn?.onclick),typeof editBtn?.onclick==='function'],
    ['Quiz handler',String(typeof quizBtn?.onclick),typeof quizBtn?.onclick==='function'],
    ['Card DND handles',String(document.querySelectorAll('[data-card-drag]').length),true],
    ['QBank DND handles',String(document.querySelectorAll('[data-qsection-drag]').length),true],
    ['Service Worker',navigator.serviceWorker?.controller?'controlled':'not controlled',true],
    ['Cloud enabled',String(cloudEnabled()),cloudEnabled()],
    ['Critical delegation',String(criticalActionsBound),criticalActionsBound],
    ['Save in flight',String(saveInFlight),!saveInFlight],
    ['Last save error',lastSaveError?(lastSaveError.message||String(lastSaveError)):'none',!lastSaveError]
  ];
  $('#diagGrid').innerHTML=data.map(([k,v,ok,warn])=>
    `<div class="diag-item"><b>${esc(k)}</b><span class="${diagClass(ok,warn)}">${esc(v)}</span></div>`
  ).join('');
  $('#diagLog').textContent=
    `bind defined: ${typeof bind}\n`+
    `render defined: ${typeof render}\n`+
    `editBtn exists: ${!!editBtn}\n`+
    `quizBtn exists: ${!!quizBtn}\n`+
    `initialLoadError: ${initialLoadError ? (initialLoadError.message||initialLoadError) : 'none'}`;
}
async function testDiagnosticCloud(){
  const log=$('#diagLog');
  try{
    log.textContent='Supabase 읽기 테스트 중...';
    const cfg=window.STUDYNURSE_CONFIG;
    const r=await fetch(`${cfg.supabaseUrl}/rest/v1/study_documents?doc_key=eq.${encodeURIComponent(cfg.datasetKey)}&select=doc_key,payload,updated_at`,{
      headers:{apikey:cfg.supabaseAnonKey,Authorization:`Bearer ${cfg.supabaseAnonKey}`}
    });
    const rows=await r.json();
    const payload=rows?.[0]?.payload;
    const cards=(payload?.categories||[]).reduce((n,c)=>n+(c.cards?.length||0),0);
    log.textContent=
      `HTTP: ${r.status}\n`+
      `rows: ${rows.length}\n`+
      `version: ${payload?.version}\n`+
      `categories: ${payload?.categories?.length}\n`+
      `cards: ${cards}\n`+
      `updated_at: ${rows?.[0]?.updated_at||''}`;
  }catch(e){
    log.textContent='ERROR: '+(e?.stack||e);
  }
}


function bindCriticalActions(){
  if(criticalActionsBound)return;
  criticalActionsBound=true;

  document.addEventListener('click',async e=>{
    const btn=e.target.closest('button');
    if(!btn)return;

    if(btn.id==='editBtn'){
      e.preventDefault();e.stopImmediatePropagation();
      toggleEdit();
      return;
    }

    if(btn.id==='saveBtn'){
      e.preventDefault();e.stopImmediatePropagation();
      await persistData(true);
      return;
    }

    if(btn.id==='autoCardBtn'){
      e.preventDefault();e.stopImmediatePropagation();
      openAutoCardModal();
      return;
    }

    if(btn.id==='quizBtn'){
      e.preventDefault();e.stopImmediatePropagation();
      const active=quizActiveCategory();
      const scope=$('#quizScope');
      if(active && isQuizExcludedCategory(active)){
        scope.value='category';
        scope.disabled=true;
        scope.title='# 카테고리는 현재 카테고리 시험 전용입니다.';
      }else{
        scope.disabled=false;
        scope.title='';
      }
      $('#quizModal').classList.add('open');
      $('#quizSetup').hidden=false;
      $('#quizPlay').hidden=true;
      $('#quizResult').hidden=true;
      return;
    }

    if(btn.id==='diagBtn'){
      e.preventDefault();e.stopImmediatePropagation();
      $('#diagModal').classList.add('open');
      renderDiagnostics();
      return;
    }
  },true);
}

function bind(){
  bindCriticalActions();
  $('#searchInput').addEventListener('input', render);
  $('#rtBold').onclick=()=>applyRichCommand('bold'); $('#rtUnderline').onclick=()=>applyRichCommand('underline'); $('#rtHighlight').onclick=()=>applyRichCommand('hiliteColor','#fff59d'); $('#rtBlack').onclick=()=>applyRichCommand('foreColor','#111111'); $('#rtPink').onclick=()=>applyRichCommand('foreColor','#c2185b'); $('#rtClear').onclick=()=>applyRichCommand('removeFormat');
  $('#richToolbar').addEventListener('pointerdown',e=>{if(e.target.closest('button'))e.preventDefault();});
  document.addEventListener('selectionchange',()=>{if(!editing)return;const s=window.getSelection(),n=s?.rangeCount?s.anchorNode:null,e=n?.nodeType===1?n:n?.parentElement;if(isRichEditable(e)){rememberRichSelection();showRichToolbar();}});
  document.addEventListener('focusin',e=>{if(editing&&isRichEditable(e.target))setTimeout(updateRichToolbarContext,0);});
  document.addEventListener('pointerdown',e=>{if(!editing||e.target.closest('#richToolbar')||isRichEditable(e.target))return;setTimeout(updateRichToolbarContext,0);});


  $('#addCardBtn').onclick = () => {
    if (!editing) startEdit();
    $('#cardModal').classList.add('open');
  };
  $('#closeCardBtn').onclick = () => $('#cardModal').classList.remove('open');
  $('#createCardBtn').onclick = createCard;

  $('#closeCategoryBtn').onclick = () => {
    $('#categoryModal').classList.remove('open');
    categoryEditId = null;
  };
  $('#saveCategoryBtn').onclick = saveCategory;

  $('#previewHtmlBtn').onclick = previewHtml;
  $('#applyHtmlBtn').onclick = applyHtml;
  $('#closeHtmlBtn').onclick = () => {
    $('#htmlModal').classList.remove('open');
    htmlTargetCardId = null;
  };
  $('#htmlEditor').addEventListener('input', previewHtml);

  $('#imageInput').addEventListener('change', e => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) return alert('이미지 파일만 사용할 수 있습니다.');
    if (f.size > 30 * 1024 * 1024) return alert('원본 이미지는 30MB 이하로 사용하세요.');
    openImageSettings(f).catch(err => alert(err.message || err));
  });

  ['imageProfile','imageRotate','cropLeft','cropRight','cropTop','cropBottom'].forEach(id=>{
    $('#' + id).addEventListener('input', () => {
      processPendingImage().catch(console.error);
    });
  });

  $('#uploadImageBtn').onclick = uploadPreparedImage;
  $('#cancelImageBtn').onclick = cancelImageModal;

  $('#previewAutoCardsBtn').onclick = renderAutoPreview;
  $('#createAutoCardsBtn').onclick = createCardsFromAutoText;
  $('#closeAutoCardsBtn').onclick = closeAutoCardModal;
  $('#autoCardInput').addEventListener('input', () => {
    autoParsedCards = [];
    $('#createAutoCardsBtn').disabled = !$('#autoCardInput').value.trim();
  });
  $('#closeQuizBtn').onclick=()=>$('#quizModal').classList.remove('open');
  $('#exitQuizBtn').onclick=()=>$('#quizModal').classList.remove('open');
  $('#startQuizBtn').onclick=startQuiz;
  $('#revealQuizBtn').onclick=revealQuiz;
  $('#nextQuizBtn').onclick=nextQuiz;

  $('#diagRefreshBtn').onclick=renderDiagnostics;
  $('#diagCloudBtn').onclick=testDiagnosticCloud;
  $('#diagCloseBtn').onclick=()=>$('#diagModal').classList.remove('open');

}

async function init(){
  try{
    $('#envBadge').textContent=DEV_MODE?'DEV':'PROD';
    $('#envBadge').classList.toggle('dev',DEV_MODE);
    setDataSourceBadge('LOADING');

    if(cloudEnabled() && window.supabase?.createClient){
      sb=window.supabase.createClient(CFG.supabaseUrl,CFG.supabaseAnonKey);
    }

    const loaded=await loadData();
    state=migrateState(structuredClone(loaded));

    if(!validStudyState(state)){
      throw new Error('Loaded state has no categories');
    }

    // Always select a valid category before the very first render.
    if(!selectedCategory || !state.categories.some(c=>c.id===selectedCategory)){
      selectedCategory=state.categories[0].id;
    }

    // Render the data once, then bind static UI controls.
    // Do not render again here: a second render recreates the button DOM
    // and removes the click handlers attached by bind().
    render();

    try{
      bind();
    }catch(bindError){
      console.error('StudyNurse UI BIND ERROR:',bindError);
      setSaveState('error','일부 UI 연결 오류 · 데이터는 정상 로드됨');
    }
    const requiredIds=['editBtn','saveBtn','quizBtn','autoCardBtn','diagBtn'];
    const missing=requiredIds.filter(id=>!$('#'+id));
    if(missing.length)throw new Error('Required UI missing: '+missing.join(', '));
    if(!criticalActionsBound)throw new Error('Critical action delegation is not active');


    if(activeDataSource==='CLOUD'){
      setSaveState('',`${DEV_MODE?'DEV':'PROD'} · CLOUD`);
    }else if(activeDataSource==='LOCAL'){
      setSaveState('saving',`${DEV_MODE?'DEV':'PROD'} · LOCAL`);
    }else{
      setSaveState('error','데이터 로드 오류');
    }

    if(initialLoadError){
      console.warn('Cloud fallback reason:',initialLoadError);
    }

    if('serviceWorker' in navigator && location.protocol.startsWith('http')){
      navigator.serviceWorker.register('./service-worker.js').catch(e=>console.warn('SW register failed',e));
    }
  }catch(e){
    console.error('=== STUDYNURSE INIT FATAL ===',e,e?.stack);
    setDataSourceBadge('ERROR','init failed');
    setSaveState('error','초기화 실패 · Console 확인');
  }
}

window.addEventListener('beforeunload' , e => {
  if (!dirty) return;
  e.preventDefault();
  e.returnValue = '';
});

document.addEventListener('visibilitychange', () => {
  // v0.5.6 intentionally does NOT auto-save on background/visibility changes.
});

init();
