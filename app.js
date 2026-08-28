
const CFG = window.STUDYNURSE_CONFIG || {};
let state = null;
let selectedCategory = null;
let editing = false;
let dirty = false;
let autosaveTimer = null;
let sb = null;

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[m]));

const cloudEnabled = () => !!(CFG.supabaseUrl && CFG.supabaseAnonKey && window.supabase);

function sanitizeRich(html){
  const t = document.createElement('template');
  t.innerHTML = html || '';
  t.content.querySelectorAll('script,iframe,object,embed,form,input,button,textarea,select').forEach(x=>x.remove());
  t.content.querySelectorAll('*').forEach(el=>{
    [...el.attributes].forEach(a=>{
      const n = a.name.toLowerCase(), v = a.value || '';
      if (n.startsWith('on') || (['href','src'].includes(n) && /^\s*javascript:/i.test(v))) {
        el.removeAttribute(a.name);
      }
      if (n === 'style') {
        const safe = v.split(';').filter(p =>
          /^\s*(color|font-weight|font-style|text-decoration|font-size|background-color)\s*:/i.test(p)
        ).join(';');
        if (safe) el.setAttribute('style', safe);
        else el.removeAttribute('style');
      }
    });
  });
  return t.innerHTML;
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
  return new Promise((ok,no)=>{
    const r = indexedDB.open('StudyNurseWeb', 2);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains('kv')) r.result.createObjectStore('kv');
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  });
}

async function idbGet(k){
  const db = await openDb();
  return new Promise((ok,no)=>{
    const tx = db.transaction('kv','readonly');
    const r = tx.objectStore('kv').get(k);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
    tx.oncomplete = () => db.close();
  });
}

async function idbPut(k,v){
  const db = await openDb();
  return new Promise((ok,no)=>{
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
        .select('payload').eq('doc_key', CFG.datasetKey || 'main').maybeSingle();
      if (!error && data?.payload) {
        await idbPut('dataset', data.payload);
        return data.payload;
      }
    } catch(e) {
      console.warn('cloud load failed', e);
    }
  }

  const local = await idbGet('dataset');
  if (local) return local;

  const seed = await fetch('./data/seed.json', {cache:'no-store'}).then(r=>r.json());
  await idbPut('dataset', seed);
  return seed;
}

async function persistData(showAlert=false){
  collectEditable();
  state.version = '0.2.3';
  setSaveState('saving','저장 중...');
  try {
    await idbPut('dataset', state);

    if (cloudEnabled()) {
      const {error} = await sb.from('study_documents')
        .upsert({
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
    return false;
  }
}

function markDirty(){
  dirty = true;
  $('#saveBtn').textContent = '저장 *';
  setSaveState('saving','변경됨');
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(()=>persistData(false), 1200);
}

function findCard(id){
  for (const c of state.categories) {
    const x = c.cards.find(v=>v.id===id);
    if (x) return x;
  }
  return null;
}
function catById(id){ return state.categories.find(c=>c.id===id); }

function collectEditable(){
  document.querySelectorAll('[data-card][data-field]').forEach(el=>{
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
    c.title, ...(c.keywords||[]), ...(c.bullets||[]), ...(c.vocab||[]), ...(c.translations||[]),
    ...((c.qbank||[]).flatMap(x=>[x.date,x.title,...((x.items||[]).map(i=>i.content))]))
  ].join(' ');
  const div = document.createElement('div');
  div.innerHTML = s;
  return div.textContent.toLowerCase().includes(q);
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

  const imgs = (c.images||[]).length ? `
    <div class="images">${c.images.map(x=>`<img src="${esc(x)}" loading="lazy">`).join('')}</div>` : '';

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
          <div class="bullets">${bullets}</div>
          ${imgs}
        </div>
        <aside class="side">${vocab}${trans}</aside>
      </div>
      ${qb}
      <div class="editbar">
        <button class="btn btn-soft" data-add-bullet="${c.id}">+ 개념</button>
        <button class="btn btn-soft" data-add-vocab="${c.id}">+ 단어</button>
        <button class="btn btn-soft" data-add-trans="${c.id}">+ 번역</button>
        <button class="btn btn-danger" data-del-card="${c.id}">카드 삭제</button>
      </div>
    </article>`;
}

function render(){
  const q = $('#searchInput').value.trim().toLowerCase();

  $('#tabs').innerHTML = state.categories.map(c=>`
    <button class="tab ${c.id===selectedCategory?'active':''}" data-cat="${esc(c.id)}">
      ${esc(c.subLabel||c.title)}
    </button>`).join('');

  $('#tabs').querySelectorAll('.tab').forEach(b=>{
    b.onclick = ()=>{
      collectEditable();
      selectedCategory = b.dataset.cat;
      render();
    };
  });

  const cat = catById(selectedCategory) || state.categories[0];
  if (!cat) {
    $('#content').innerHTML = '<div class="empty">데이터가 없습니다.</div>';
    return;
  }

  let cards = cat.cards || [];
  if (q) cards = cards.filter(c=>searchCard(c,q));

  $('#content').innerHTML = `
    <div class="section-head">
      <h2 class="section-title">${esc(cat.title)}</h2>
      <div class="section-subtitle">${esc(cat.subtitle||'')}</div>
    </div>
    <div class="cards">
      ${cards.length ? cards.map(renderCard).join('') : '<div class="empty">검색 결과가 없습니다.</div>'}
    </div>`;

  if (editing) {
    document.querySelectorAll('.editable').forEach(el=>{
      el.addEventListener('input', markDirty);
      el.addEventListener('blur', ()=>{ collectEditable(); markDirty(); });
    });
    document.querySelectorAll('[data-del-card]').forEach(b=>b.onclick=()=>deleteCard(b.dataset.delCard));
    document.querySelectorAll('[data-add-bullet]').forEach(b=>b.onclick=()=>addBullet(b.dataset.addBullet));
    document.querySelectorAll('[data-add-vocab]').forEach(b=>b.onclick=()=>addVocab(b.dataset.addVocab));
    document.querySelectorAll('[data-add-trans]').forEach(b=>b.onclick=()=>addTrans(b.dataset.addTrans));
  }

  document.querySelectorAll('.qtoggle').forEach(b=>{
    b.onclick = ()=>b.nextElementSibling.classList.toggle('open');
  });
}

function toggleEdit(){
  collectEditable();
  editing = !editing;
  document.body.classList.toggle('editing', editing);
  $('#saveBtn').hidden = !editing;
  $('#editBtn').textContent = editing ? '편집 종료' : '편집';
  $('#modeBadge').textContent = editing ? 'EDIT' : 'VIEW';
  if (!editing && dirty) persistData(false);
  render();
}

function addBullet(id){
  collectEditable();
  findCard(id).bullets.push('새 개념 입력');
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
function deleteCard(id){
  if (!confirm('이 카드를 삭제하시겠습니까?')) return;
  collectEditable();
  const c = catById(selectedCategory);
  c.cards = c.cards.filter(x=>x.id!==id);
  markDirty();
  render();
}

function createCard(){
  const cat = catById(selectedCategory);
  if (!cat) return;

  const title = $('#newTitle').value.trim();
  if (!title) { alert('제목을 입력하세요.'); return; }

  const id = cat.id + '-' + Date.now();
  cat.cards.push({
    id,
    title: esc(title),
    keywords: $('#newKeywords').value.split(',').map(s=>s.trim()).filter(Boolean),
    bullets: $('#newBullets').value.split('\n').map(s=>esc(s.trim())).filter(Boolean),
    vocab: [],
    translations: [],
    images: [],
    qbank: [],
    order: cat.cards.length,
    updatedAt: new Date().toISOString()
  });

  $('#newTitle').value = '';
  $('#newKeywords').value = '';
  $('#newBullets').value = '';
  $('#cardModal').classList.remove('open');
  markDirty();
  render();
}

function bind(){
  $('#searchInput').addEventListener('input', render);
  $('#editBtn').onclick = toggleEdit;
  $('#saveBtn').onclick = ()=>persistData(true);
  $('#addCardBtn').onclick = ()=>{
    if (!editing) toggleEdit();
    $('#cardModal').classList.add('open');
  };
  $('#closeCardBtn').onclick = ()=>$('#cardModal').classList.remove('open');
  $('#createCardBtn').onclick = createCard;
}

async function init(){
  if (cloudEnabled()) {
    sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
  }

  state = await loadData();
  selectedCategory = state.categories[0]?.id || null;
  bind();
  render();
  setSaveState('', cloudEnabled() ? '클라우드 연결' : '이 기기에 저장');

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
  }
}

window.addEventListener('beforeunload', e=>{
  if (dirty) {
    collectEditable();
    idbPut('dataset', state).catch(()=>{});
    e.preventDefault();
    e.returnValue = '';
  }
});

document.addEventListener('visibilitychange', ()=>{
  if (document.visibilityState === 'hidden' && dirty) {
    persistData(false);
  }
});

init();
