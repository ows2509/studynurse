
const APP_VERSION = '0.4.0';

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
  if (cloudEnabled()) {
    try {
      sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
      const {data,error} = await sb.from('study_documents')
        .select('payload')
        .eq('doc_key', CFG.datasetKey || (DEV_MODE ? 'main-dev' : 'main'))
        .maybeSingle();

      if (error) throw error;

      if (data?.payload) {
        const migrated = migrateState(data.payload);
        await idbPut(localDatasetKey(), migrated);
        return migrated;
      }
    } catch(e) {
      console.warn('Cloud load failed; local fallback used.', e);
    }
  }

  const local = await idbGet(localDatasetKey());
  if (local) return migrateState(local);

  const seed = await fetch('./data/seed.json', {cache:'no-store'}).then(r=>r.json());
  const migrated = migrateState(seed);
  await idbPut(localDatasetKey(), migrated);
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

async function persistData(showAlert=true){
  collectEditable();
  state = migrateState(state);
  setSaveState('saving','저장 중...');

  try {
    // Save local copy only when the user explicitly presses Save.
    await idbPut(localDatasetKey(), state);

    if (cloudEnabled()) {
      await createRevisionSnapshot(`manual-save-${APP_VERSION}`);

      const {error} = await sb.from('study_documents').upsert({
        doc_key: CFG.datasetKey,
        payload: state,
        updated_at: new Date().toISOString()
      }, {onConflict:'doc_key'});

      if (error) throw error;
    }

    dirty = false;
    editSnapshot = deepClone(state);
    $('#saveBtn').textContent = '저장';
    setSaveState('', cloudEnabled() ? '✓ 클라우드 저장됨' : '✓ 이 기기에 저장됨');

    if (showAlert) alert(cloudEnabled() ? '클라우드 저장 완료' : '이 기기에 저장 완료');
    return true;
  } catch(e) {
    setSaveState('error','저장 실패');
    alert('저장 실패: ' + (e.message || e));
    return false;
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
      if (block) block.content = sanitizeRich(el.innerHTML);
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
        <div class="html-block">${sanitizeRich(block.content||'')}</div>
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
        <div ${editing ? `class="editable" contenteditable="true" data-card="${card.id}" data-field="block" data-block="${block.id}"` : ''}>${sanitizeRich(block.content||'')}</div>
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
      <ul>${c.vocab.map((x,i)=>`
        <li ${editing ? `class="editable" contenteditable="true" data-card="${c.id}" data-field="vocab:${i}"` : ''}>${sanitizeRich(x)}</li>`).join('')}
      </ul>
    </div>` : '';

  const trans = (c.translations||[]).length ? `
    <div class="panel trans">
      <h4>📝 TRANSLATION</h4>
      <ul>${c.translations.map((x,i)=>`
        <li ${editing ? `class="editable" contenteditable="true" data-card="${c.id}" data-field="trans:${i}"` : ''}>${sanitizeRich(x)}</li>`).join('')}
      </ul>
    </div>` : '';

  const qb = (c.qbank||[]).length ? `
    <button class="qtoggle">▼ 관련 문제 / 기출 (${c.qbank.length})</button>
    <div class="qbox">${c.qbank.map(q=>`
      <div class="qsection">
        <div class="qhead">
          <span class="date">${esc(q.date||'')}</span>
          <span class="qtitle">${sanitizeRich(q.title||'')}</span>
        </div>
        ${(q.items||[]).map(i=>`
          <div class="qitem">
            <span class="status ${i.status==='X'?'X':'O'}">${esc(i.status||'O')}</span>
            <div>${sanitizeRich(i.content)}</div>
          </div>`).join('')}
      </div>`).join('')}
    </div>` : '';

  return `
    <article class="card" aria-editing="${editing}">
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
        <button class="btn btn-soft" data-auto-card="${c.id}">⚡ 텍스트 자동정리</button>
        <button class="btn btn-danger" data-del-card="${c.id}">카드 삭제</button>
      </div>
    </article>`;
}

function render(){
  const q = $('#searchInput').value.trim().toLowerCase();

  $('#tabs').innerHTML =
    state.categories.map(c=>`
      <button class="tab ${c.id===selectedCategory?'active':''}" data-cat="${esc(c.id)}">
        ${esc(c.subLabel || c.title)}
      </button>`).join('') +
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
    document.querySelectorAll('[data-auto-card]').forEach(b => b.onclick = openAutoCardModal);
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

    initDragHandles();
  }

  document.querySelectorAll('.qtoggle').forEach(b=>{
    b.onclick = () => b.nextElementSibling.classList.toggle('open');
  });

  document.querySelectorAll('img').forEach(img=>{
    img.addEventListener('dragstart', e => e.preventDefault());
  });
}

function startEdit(){
  editSnapshot = deepClone(state);
  editing = true;
  dirty = false;
  document.body.classList.add('editing');
  $('#saveBtn').hidden = false;
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
  document.body.classList.remove('editing');
  $('#saveBtn').hidden = true;
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

\nfunction normalizeAutoLine(line){\n  return String(line||'').replace(/\\uFE0F/g,'').trim();\n}\nfunction detectAutoTitle(line){\n  const s=normalizeAutoLine(line);\n  let m=s.match(/^<([^>]+)>\\s*$/); if(m) return m[1].trim();\n  m=s.match(/^#{1,2}\\s+(.+)$/); if(m) return m[1].trim();\n  return null;\n}\nfunction parseOXPrefix(line){\n  let s=normalizeAutoLine(line).replace(/^[-*•]\\s*/,'');\n  let status=null;\n  if(/^(❎|❌|\\[X\\])\\s*/i.test(s)){status='X';s=s.replace(/^(❎|❌|\\[X\\])\\s*/i,'');}\n  else if(/^(🅾|⭕|\\[O\\])\\s*/i.test(s)){status='O';s=s.replace(/^(🅾|⭕|\\[O\\])\\s*/i,'');}\n  return {status,text:s.trim()};\n}\nfunction parseAutoCards(rawText){\n  const lines=String(rawText||'').replace(/\\r\\n?/g,'\\n').split('\\n');\n  const blocks=[]; let current=null;\n  const push=()=>{if(current){current.title=current.title?.trim()||'새로운 주제';blocks.push(current);current=null;}};\n  for(const raw of lines){\n    const line=normalizeAutoLine(raw); if(!line) continue;\n    const title=detectAutoTitle(line);\n    if(title){push();current={title,notes:[],vocab:[],translations:[],sourceLines:[]};continue;}\n    if(!current){current={title:line,notes:[],vocab:[],translations:[],sourceLines:[]};continue;}\n    current.sourceLines.push(line);\n    let m=line.match(/^(vocab|단어)\\s*[:：]\\s*(.*)$/i);\n    if(m){if(m[2].trim())current.vocab.push(m[2].trim());continue;}\n    m=line.match(/^(trans|translation|해석|번역)\\s*[:：]\\s*(.*)$/i);\n    if(m){if(m[2].trim())current.translations.push(m[2].trim());continue;}\n    const ox=parseOXPrefix(line);\n    if(ox.status) current.notes.push({text:`${ox.status==='X'?'❎':'🅾️'} ${ox.text}`,status:ox.status});\n    else current.notes.push({text:line.replace(/^[-*•]\\s*/,'').trim(),status:null});\n  }\n  push();\n  return blocks.filter(b=>b.title||b.notes.length||b.vocab.length||b.translations.length);\n}\nfunction renderAutoPreview(){\n  const raw=$('#autoCardInput').value.trim();\n  autoParsedCards=parseAutoCards(raw);\n  const summary=$('#autoPreviewSummary'),list=$('#autoPreviewList'),createBtn=$('#createAutoCardsBtn');\n  if(!raw||autoParsedCards.length===0){summary.classList.remove('show');summary.textContent='';list.innerHTML='<div class="auto-preview-empty">정리할 수 있는 카드가 없습니다.</div>';createBtn.disabled=true;return;}\n  const totals=autoParsedCards.reduce((a,c)=>{a.notes+=c.notes.length;a.vocab+=c.vocab.length;a.trans+=c.translations.length;return a;},{notes:0,vocab:0,trans:0});\n  summary.textContent=`생성 예정 ${autoParsedCards.length}개 카드 · 개념 ${totals.notes}개 · VOCAB ${totals.vocab}개 · 번역 ${totals.trans}개`;summary.classList.add('show');\n  list.innerHTML=autoParsedCards.map((c,i)=>`<div class="auto-preview-card"><div class="auto-preview-title">${i+1}. ${esc(c.title)}</div><div class="auto-preview-meta"><span class="auto-preview-chip">개념 ${c.notes.length}</span><span class="auto-preview-chip">VOCAB ${c.vocab.length}</span><span class="auto-preview-chip">번역 ${c.translations.length}</span></div>${c.notes.length?`<ul class="auto-preview-lines">${c.notes.slice(0,8).map(n=>`<li>${n.status==='X'?'<span class="auto-ox-x">❎</span> ':n.status==='O'?'<span class="auto-ox-o">🅾️</span> ':''}${esc(n.text.replace(/^(❎|🅾️)\\s*/,''))}</li>`).join('')}${c.notes.length>8?`<li>… 외 ${c.notes.length-8}개</li>`:''}</ul>`:''}</div>`).join('');\n  createBtn.disabled=false;\n}\nfunction createCardsFromAutoText(){\n  const cat=catById(selectedCategory); if(!cat){alert('카테고리를 선택하세요.');return;}\n  if(!autoParsedCards.length){renderAutoPreview();if(!autoParsedCards.length)return;}\n  for(const parsed of autoParsedCards){\n    const blocks=parsed.notes.map((n,i)=>({id:makeId('txt'),type:'text',content:sanitizeRich(n.text),order:i}));\n    const card={id:makeId(cat.id||'card'),title:esc(parsed.title),keywords:[],blocks,bullets:[],vocab:parsed.vocab.map(v=>sanitizeRich(v)),translations:parsed.translations.map(v=>sanitizeRich(v)),images:[],qbank:[],customHtml:'',order:cat.cards.length,updatedAt:new Date().toISOString()};\n    syncLegacyFields(card);cat.cards.push(card);\n  }\n  const count=autoParsedCards.length;\n  $('#autoCardModal').classList.remove('open');$('#autoCardInput').value='';$('#autoPreviewSummary').classList.remove('show');$('#autoPreviewSummary').textContent='';$('#autoPreviewList').innerHTML='';autoParsedCards=[];\n  markDirty();render();\n  alert(`${count}개 카드를 편집 화면에 생성했습니다.\\n아직 DB에는 저장되지 않았습니다.\\n내용을 확인한 뒤 [저장] 버튼을 눌러주세요.`);\n}\nfunction openAutoCardModal(){\n  if(!editing) startEdit();autoParsedCards=[];$('#autoCardInput').value='';$('#autoPreviewSummary').classList.remove('show');$('#autoPreviewSummary').textContent='';$('#autoPreviewList').innerHTML='';$('#createAutoCardsBtn').disabled=true;$('#autoCardModal').classList.add('open');setTimeout(()=>$('#autoCardInput').focus(),50);\n}\nfunction closeAutoCardModal(){$('#autoCardModal').classList.remove('open');autoParsedCards=[];}\n
function bind(){
  $('#searchInput').addEventListener('input', render);
  $('#editBtn').onclick = toggleEdit;
  $('#saveBtn').onclick = () => persistData(true);

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
  $('#autoCardInput').addEventListener('input', () => { autoParsedCards = []; $('#createAutoCardsBtn').disabled = true; });
}

async function init(){
  if (cloudEnabled()) {
    sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
  }

  state = migrateState(await loadData());
  selectedCategory = state.categories[0]?.id || null;

  $('#envBadge').textContent = DEV_MODE ? 'DEV' : 'PROD';
  $('#envBadge').classList.toggle('dev', DEV_MODE);

  bind();
  render();

  if (DEV_MODE && !cloudEnabled()) {
    setSaveState('', 'DEV · 로컬 저장');
  } else {
    setSaveState('', cloudEnabled() ? `${DEV_MODE?'DEV':'PROD'} · 클라우드 연결` : '이 기기에 저장');
  }

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
  }
}

window.addEventListener('beforeunload', e => {
  if (!dirty) return;
  e.preventDefault();
  e.returnValue = '';
});

document.addEventListener('visibilitychange', () => {
  // v0.4.0 intentionally does NOT auto-save on background/visibility changes.
});

init();
