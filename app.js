
const APP_VERSION = '0.3.0';
const CFG = window.STUDYNURSE_CONFIG || {};

let state = null;
let selectedCategory = null;
let editing = false;
let dirty = false;
let autosaveTimer = null;
let sb = null;
let imageTargetCardId = null;
let htmlTargetCardId = null;
let categoryEditId = null;
let forceRevisionOnNextSave = false;

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[m]));

const cloudEnabled = () =>
  !!(CFG.supabaseUrl && CFG.supabaseAnonKey && window.supabase);

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
  if (crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
}

function slugify(s){
  const base = String(s||'').trim().toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g,'-')
    .replace(/^-+|-+$/g,'');
  return base || `category-${Date.now()}`;
}

function migrateState(input){
  // IMPORTANT: destructive reset is prohibited.
  // Unknown legacy fields are intentionally retained.
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
    });
  });

  data.version = APP_VERSION;
  return data;
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
    const r = indexedDB.open('StudyNurseWeb', 3);
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

async function loadData(){
  if (cloudEnabled()) {
    try {
      sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);

      const {data,error} = await sb.from('study_documents')
        .select('payload')
        .eq('doc_key', CFG.datasetKey || 'main')
        .maybeSingle();

      if (error) throw error;

      if (data?.payload) {
        const migrated = migrateState(data.payload);
        await idbPut('dataset', migrated);
        return migrated;
      }
    } catch(e) {
      console.warn('Cloud load failed; local fallback used.', e);
    }
  }

  const local = await idbGet('dataset');
  if (local) return migrateState(local);

  const seed = await fetch('./data/seed.json', {cache:'no-store'}).then(r=>r.json());
  const migrated = migrateState(seed);
  await idbPut('dataset', migrated);
  return migrated;
}

async function maybeCreateRevision(reason='autosave', force=false){
  if (!cloudEnabled()) return;

  const last = Number(await idbGet('lastRevisionAt') || 0);
  const now = Date.now();

  // Prevent a full JSON snapshot on every keystroke.
  if (!force && now - last < 10 * 60 * 1000) return;

  try {
    const {data,error} = await sb.from('study_documents')
      .select('payload')
      .eq('doc_key', CFG.datasetKey || 'main')
      .maybeSingle();

    if (error || !data?.payload) return;

    const {error:logError} = await sb.from('study_revision_log').insert({
      doc_key: CFG.datasetKey || 'main',
      payload: data.payload,
      source_version: data.payload.version || 'legacy',
      reason
    });

    if (!logError) await idbPut('lastRevisionAt', now);
    else console.warn('Revision log insert failed', logError);
  } catch(e) {
    console.warn('Revision checkpoint failed', e);
  }
}

async function persistData(showAlert=false, reason='autosave'){
  collectEditable();
  state = migrateState(state);
  setSaveState('saving','저장 중...');

  try {
    await idbPut('dataset', state);

    if (cloudEnabled()) {
      await maybeCreateRevision(
        showAlert ? 'manual-save' : reason,
        showAlert || forceRevisionOnNextSave
      );
      forceRevisionOnNextSave = false;

      const {error} = await sb.from('study_documents').upsert({
        doc_key: CFG.datasetKey || 'main',
        payload: state,
        updated_at: new Date().toISOString()
      }, {onConflict:'doc_key'});

      if (error) throw error;
    }

    dirty = false;
    $('#saveBtn').textContent = '저장';
    setSaveState('', cloudEnabled() ? '✓ 클라우드 저장됨' : '✓ 이 기기에 저장됨');
    if (showAlert) alert(cloudEnabled() ? '클라우드 저장 완료' : '이 기기에 저장 완료');
    return true;
  } catch(e) {
    setSaveState('error','저장 실패');
    if (showAlert) alert('저장 실패: ' + (e.message || e));
    else console.error(e);
    return false;
  }
}

function markDirty(reason='autosave', forceRevision=false){
  dirty = true;
  if (forceRevision) forceRevisionOnNextSave = true;
  $('#saveBtn').textContent = '저장 *';
  setSaveState('saving','변경됨');
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => persistData(false, reason), 1200);
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

function collectEditable(){
  document.querySelectorAll('[data-card][data-field]').forEach(el => {
    const card = findCard(el.dataset.card);
    if (!card) return;

    const f = el.dataset.field;
    if (f === 'title') card.title = sanitizeRich(el.innerHTML);
    else if (f.startsWith('bullet:')) card.bullets[+f.split(':')[1]] = sanitizeRich(el.innerHTML);
    else if (f.startsWith('vocab:')) card.vocab[+f.split(':')[1]] = sanitizeRich(el.innerHTML);
    else if (f.startsWith('trans:')) card.translations[+f.split(':')[1]] = sanitizeRich(el.innerHTML);
  });
}

function searchCard(c,q){
  const s = [
    c.title,
    ...(c.keywords||[]),
    ...(c.bullets||[]),
    ...(c.vocab||[]),
    ...(c.translations||[]),
    c.customHtml || '',
    ...((c.qbank||[]).flatMap(x => [
      x.date, x.title, ...((x.items||[]).map(i=>i.content))
    ]))
  ].join(' ');

  return plainTextFromHtml(s).toLowerCase().includes(q);
}

function renderImages(c){
  if (!(c.images||[]).length) return '';
  return `<div class="images">${
    c.images.map((src,i)=>`
      <span class="card-image-wrap">
        <img src="${esc(src)}" loading="lazy">
        ${editing ? `<button class="img-delete" data-del-image="${c.id}" data-image-index="${i}" title="이미지 삭제">✕</button>` : ''}
      </span>`).join('')
  }</div>`;
}

function renderCard(c){
  const titleAttrs = editing
    ? `class="card-title editable" contenteditable="true" data-card="${c.id}" data-field="title"`
    : `class="card-title"`;

  const bullets = (c.bullets||[]).map((x,i)=>`
    <div class="bullet">
      <span class="dot">•</span>
      <div ${editing ? `class="editable" contenteditable="true" data-card="${c.id}" data-field="bullet:${i}"` : ''}>${sanitizeRich(x)}</div>
    </div>`).join('');

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

  const custom = c.customHtml
    ? `<div class="custom-html">${sanitizeRich(c.customHtml)}</div>` : '';

  return `
    <article class="card" aria-editing="${editing}">
      <div class="card-head">
        <div ${titleAttrs}>${sanitizeRich(c.title)}</div>
        ${(c.keywords||[]).map(k=>`<span class="badge">${esc(k)}</span>`).join('')}
      </div>

      <div class="card-grid">
        <div>
          <div class="bullets">${bullets}</div>
          ${custom}
          ${renderImages(c)}
        </div>
        <aside class="side">${vocab}${trans}</aside>
      </div>

      ${qb}

      <div class="editbar">
        <button class="btn btn-soft" data-add-bullet="${c.id}">+ 개념</button>
        <button class="btn btn-soft" data-add-vocab="${c.id}">+ 단어</button>
        <button class="btn btn-soft" data-add-trans="${c.id}">+ 번역</button>
        <button class="btn btn-soft" data-add-image="${c.id}">+ 이미지</button>
        <button class="btn btn-soft" data-edit-html="${c.id}">&lt;/&gt; HTML</button>
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

  if ($('#addCategoryBtn')) {
    $('#addCategoryBtn').onclick = () => openCategoryModal();
  }

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
      <div class="category-tools">
        <button class="btn btn-soft" id="renameCategoryBtn">카테고리 수정</button>
        <button class="btn btn-danger" id="deleteCategoryBtn">카테고리 삭제</button>
      </div>
    </div>

    <div class="cards">
      ${cards.length ? cards.map(renderCard).join('') : '<div class="empty">검색 결과가 없습니다.</div>'}
    </div>`;

  if (editing) {
    document.querySelectorAll('.editable').forEach(el=>{
      el.addEventListener('input', () => markDirty('text-edit'));
      el.addEventListener('blur', () => {
        collectEditable();
        markDirty('text-edit');
      });
    });

    document.querySelectorAll('[data-del-card]').forEach(b =>
      b.onclick = () => deleteCard(b.dataset.delCard));
    document.querySelectorAll('[data-add-bullet]').forEach(b =>
      b.onclick = () => addBullet(b.dataset.addBullet));
    document.querySelectorAll('[data-add-vocab]').forEach(b =>
      b.onclick = () => addVocab(b.dataset.addVocab));
    document.querySelectorAll('[data-add-trans]').forEach(b =>
      b.onclick = () => addTrans(b.dataset.addTrans));
    document.querySelectorAll('[data-add-image]').forEach(b =>
      b.onclick = () => chooseImage(b.dataset.addImage));
    document.querySelectorAll('[data-edit-html]').forEach(b =>
      b.onclick = () => openHtmlEditor(b.dataset.editHtml));
    document.querySelectorAll('[data-del-image]').forEach(b =>
      b.onclick = () => deleteImage(b.dataset.delImage, Number(b.dataset.imageIndex)));

    $('#renameCategoryBtn').onclick = () => openCategoryModal(cat.id);
    $('#deleteCategoryBtn').onclick = () => deleteCategory(cat.id);
  }

  document.querySelectorAll('.qtoggle').forEach(b=>{
    b.onclick = () => b.nextElementSibling.classList.toggle('open');
  });
}

function toggleEdit(){
  collectEditable();
  editing = !editing;
  document.body.classList.toggle('editing', editing);
  $('#saveBtn').hidden = !editing;
  $('#editBtn').textContent = editing ? '편집 종료' : '편집';
  $('#modeBadge').textContent = editing ? 'EDIT' : 'VIEW';
  if (!editing && dirty) persistData(false,'edit-exit');
  render();
}

function addBullet(id){
  collectEditable();
  findCard(id).bullets.push('새 개념 입력');
  markDirty('add-bullet');
  render();
}
function addVocab(id){
  collectEditable();
  findCard(id).vocab.push('새 단어 - 뜻');
  markDirty('add-vocab');
  render();
}
function addTrans(id){
  collectEditable();
  findCard(id).translations.push('새 문장 / 번역');
  markDirty('add-translation');
  render();
}

function deleteCard(id){
  if (!confirm('이 카드를 삭제하시겠습니까? 삭제 전 상태는 revision log에 보존됩니다.')) return;
  collectEditable();
  const c = catById(selectedCategory);
  c.cards = c.cards.filter(x => x.id !== id);
  markDirty('delete-card', true);
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

  cat.cards.push({
    id: makeId(cat.id || 'card'),
    title: esc(title),
    keywords: $('#newKeywords').value.split(',').map(s=>s.trim()).filter(Boolean),
    bullets: $('#newBullets').value.split('\n').map(s=>esc(s.trim())).filter(Boolean),
    vocab: [],
    translations: [],
    images: [],
    qbank: [],
    customHtml: '',
    order: cat.cards.length,
    updatedAt: new Date().toISOString()
  });

  $('#newTitle').value = '';
  $('#newKeywords').value = '';
  $('#newBullets').value = '';
  $('#cardModal').classList.remove('open');
  markDirty('create-card');
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
    markDirty('rename-category');
  } else {
    let idBase = slugify(name);
    let id = `custom-${idBase}`;
    while (catById(id)) id = `custom-${idBase}-${Date.now()}`;

    const cat = {
      id,
      main: 'Custom',
      mainLabel: 'Custom',
      sub: id,
      subLabel: name,
      title: name,
      subtitle,
      order: state.categories.length,
      cards: []
    };
    state.categories.push(cat);
    selectedCategory = id;
    markDirty('create-category');
  }

  $('#categoryModal').classList.remove('open');
  categoryEditId = null;
  render();
}

function deleteCategory(id){
  const cat = catById(id);
  if (!cat) return;

  if (!confirm(`"${cat.subLabel || cat.title}" 카테고리와 내부 카드 ${cat.cards.length}개를 삭제하시겠습니까?\n삭제 전 상태는 revision log에 보존됩니다.`)) return;

  const idx = state.categories.findIndex(c => c.id === id);
  state.categories = state.categories.filter(c => c.id !== id);
  selectedCategory = state.categories[Math.max(0, idx-1)]?.id || state.categories[0]?.id || null;
  markDirty('delete-category', true);
  render();
}

function openHtmlEditor(cardId){
  const card = findCard(cardId);
  if (!card) return;

  htmlTargetCardId = cardId;
  $('#htmlEditor').value = card.customHtml || '';
  $('#htmlPreview').innerHTML = sanitizeRich(card.customHtml || '');
  $('#htmlModal').classList.add('open');
}

function previewHtml(){
  $('#htmlPreview').innerHTML = sanitizeRich($('#htmlEditor').value);
}

function applyHtml(){
  const card = findCard(htmlTargetCardId);
  if (!card) return;

  card.customHtml = sanitizeRich($('#htmlEditor').value);
  $('#htmlModal').classList.remove('open');
  htmlTargetCardId = null;
  markDirty('html-edit');
  render();
}

function chooseImage(cardId){
  if (!cloudEnabled()) {
    alert('이미지 공유 저장은 Supabase 연결이 필요합니다.');
    return;
  }
  imageTargetCardId = cardId;
  $('#imageInput').value = '';
  $('#imageInput').click();
}

async function uploadSelectedImage(file){
  if (!file || !imageTargetCardId) return;
  if (!file.type.startsWith('image/')) {
    alert('이미지 파일만 업로드할 수 있습니다.');
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    alert('이미지는 10MB 이하로 사용하세요.');
    return;
  }

  const card = findCard(imageTargetCardId);
  if (!card) return;

  setSaveState('saving','이미지 업로드 중...');
  document.body.classList.add('uploading');

  try {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
    const path = `uploads/${Date.now()}_${makeId('img')}_${safeName}`;

    const {error} = await sb.storage
      .from('studynurse-images')
      .upload(path, file, {cacheControl:'3600', upsert:false, contentType:file.type});

    if (error) throw error;

    const {data} = sb.storage.from('studynurse-images').getPublicUrl(path);
    if (!data?.publicUrl) throw new Error('Public URL 생성 실패');

    card.images.push(data.publicUrl);
    markDirty('add-image');
    await persistData(false,'add-image');
    render();
  } catch(e) {
    setSaveState('error','이미지 업로드 실패');
    alert('이미지 업로드 실패: ' + (e.message || e));
  } finally {
    document.body.classList.remove('uploading');
    imageTargetCardId = null;
  }
}

function storagePathFromPublicUrl(url){
  const marker = '/storage/v1/object/public/studynurse-images/';
  const idx = String(url||'').indexOf(marker);
  return idx >= 0 ? decodeURIComponent(String(url).slice(idx + marker.length)) : null;
}

async function deleteImage(cardId,index){
  const card = findCard(cardId);
  if (!card || !card.images[index]) return;
  if (!confirm('이 이미지를 카드에서 삭제하시겠습니까?')) return;

  const url = card.images[index];
  const path = storagePathFromPublicUrl(url);

  // Existing packaged images have no storage path; only remove reference.
  if (cloudEnabled() && path) {
    try {
      const {error} = await sb.storage.from('studynurse-images').remove([path]);
      if (error) console.warn('Storage file delete failed; reference will still be removed.', error);
    } catch(e) {
      console.warn(e);
    }
  }

  card.images.splice(index,1);
  markDirty('delete-image', true);
  render();
}

function bind(){
  $('#searchInput').addEventListener('input', render);
  $('#editBtn').onclick = toggleEdit;
  $('#saveBtn').onclick = () => persistData(true,'manual-save');

  $('#addCardBtn').onclick = () => {
    if (!editing) toggleEdit();
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
    if (f) uploadSelectedImage(f);
  });
}

async function init(){
  if (cloudEnabled()) {
    sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
  }

  state = await loadData();
  state = migrateState(state);
  selectedCategory = state.categories[0]?.id || null;

  bind();
  render();

  setSaveState('', cloudEnabled() ? '클라우드 연결' : '이 기기에 저장');

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
  }
}

window.addEventListener('beforeunload', e => {
  if (dirty) {
    collectEditable();
    idbPut('dataset', migrateState(state)).catch(()=>{});
    e.preventDefault();
    e.returnValue = '';
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && dirty) persistData(false,'visibility-hidden');
});

init();
