// DOM helpers, storage, small UI primitives.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}
export const icon = name => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('class', 'ic');
  s.innerHTML = `<use href="#i-${name}"/>`;
  return s;
};
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ---- events
const bus = new EventTarget();
export const on = (name, fn) => bus.addEventListener(name, e => fn(e.detail));
export const emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));

// ---- key/value settings (localStorage)
const P = 'kdrone.';
export const kv = {
  get(k, d) { try { const v = localStorage.getItem(P + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { kv.setQuiet(k, v); kv.changed?.(k); },
  // Save without telling sync (used for sync's own bookkeeping and for values that arrive from another device).
  setQuiet(k, v) { try { localStorage.setItem(P + k, JSON.stringify(v)); } catch { toast('Storage is full. Delete some saved items.'); } },
};

// ---- blobs (IndexedDB)
let dbp;
const open = () => dbp ||= new Promise((res, rej) => {
  const r = indexedDB.open('kestrel-drone', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('files');
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const tx = async (mode, fn) => {
  const db = await open();
  return new Promise((res, rej) => { const q = fn(db.transaction('files', mode).objectStore('files')); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
};
export const files = {
  put: (k, v) => tx('readwrite', s => s.put(v, k)),
  get: k => tx('readonly', s => s.get(k)),
  del: k => tx('readwrite', s => s.delete(k)),
};

// ---- toast + modal
let tt;
export function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(tt); tt = setTimeout(() => t.classList.add('hidden'), 3200);
}
export function modal(title, body, actions = []) {
  const m = $('#modal');
  const close = () => { m.classList.add('hidden'); m.replaceChildren(); };
  m.replaceChildren(h('div', { class: 'dialog' },
    h('h2', {}, title),
    h('div', { class: 'body' }, body),
    h('div', { class: 'foot' },
      h('button', { class: 'btn', onclick: close }, actions.length ? 'Cancel' : 'Close'),
      actions.map(a => h('button', { class: 'btn ' + (a.danger ? 'danger' : 'primary'), onclick: async () => { if (await a.run() !== false) close(); } }, a.label)))));
  m.classList.remove('hidden');
  m.onclick = e => { if (e.target === m) close(); };
  return close;
}
export const confirmDel = (what, run) => modal('Delete ' + what + '?', h('div', {}, 'You cannot undo this.'), [{ label: 'Delete', danger: true, run }]);

// A list/detail layout that collapses to one pane on phones.
export function split(view, listEl, detailEl) {
  const root = h('div', { class: 'split' }, listEl, detailEl);
  view.replaceChildren(root);
  return { showDetail: () => root.classList.add('detail'), showList: () => root.classList.remove('detail') };
}
export const backBtn = fn => h('button', { class: 'btn sq back', onclick: fn, title: 'Back to list' }, icon('back'));
export function download(name, text, type = 'text/plain') {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.append(a); a.click(); a.remove();
}
