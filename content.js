// ============================================================
// 畅课课件下载助手 · 页面悬浮窗
// 在畅课平台页面右下角注入一个可拖动的悬浮球，
// 自动展示捕获到的课件并提供下载按钮。
// ============================================================
(function () {
  'use strict';
  if (window.__szuLmsDownloader) return;
  window.__szuLmsDownloader = true;

  const STORAGE_KEY = 'courseware_items';
  const POS_KEY = 'fab_position';
  let items = [];
  let open = false;

  // 拖动状态
  let dragging = false;
  let moved = false;
  let startX = 0, startY = 0, origX = 0, origY = 0;

  // ---------- 构建 DOM ----------
  const root = document.createElement('div');
  root.id = 'szu-dl-root';
  root.innerHTML = `
    <div id="szu-dl-panel" class="szu-dl-hidden">
      <div class="szu-dl-head">
        <div class="szu-dl-title">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          <span>畅课课件下载</span>
        </div>
        <div class="szu-dl-head-actions">
          <span class="szu-dl-count" id="szu-dl-count">0</span>
          <button class="szu-dl-all" id="szu-dl-all" title="一键下载全部课件">全部下载</button>
          <button class="szu-dl-clear" id="szu-dl-clear" title="清空列表">清空</button>
        </div>
      </div>
      <div class="szu-dl-list" id="szu-dl-list"></div>
      <div class="szu-dl-empty" id="szu-dl-empty">
        <span class="szu-dl-empty-mark">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </span>
        <div>暂无课件</div>
        <div>点击课件预览后，下载链接会自动出现在这里</div>
      </div>
    </div>
    <div id="szu-dl-fab" title="畅课课件下载助手">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      <span class="szu-dl-badge" id="szu-dl-badge">0</span>
    </div>
  `;
  document.body.appendChild(root);

  const fab = root.querySelector('#szu-dl-fab');
  const panel = root.querySelector('#szu-dl-panel');
  const listEl = root.querySelector('#szu-dl-list');
  const emptyEl = root.querySelector('#szu-dl-empty');
  const countEl = root.querySelector('#szu-dl-count');
  const badgeEl = root.querySelector('#szu-dl-badge');
  const clearBtn = root.querySelector('#szu-dl-clear');

  // ---------- 拖动 ----------
  fab.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    moved = false;
    startX = e.clientX;
    startY = e.clientY;
    const r = root.getBoundingClientRect();
    origX = r.left;
    origY = r.top;
    root.style.transition = 'none';
    e.preventDefault();
  });

  document.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
    if (!moved) return;

    let left = origX + dx;
    let top = origY + dy;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rw = root.offsetWidth || 56;
    const rh = root.offsetHeight || 56;
    left = Math.max(0, Math.min(left, vw - rw));
    top = Math.max(0, Math.min(top, vh - rh));
    setPosition(left, top);
  });

  document.addEventListener('pointerup', () => {
    if (!dragging) return;
    dragging = false;
    root.style.transition = '';
    if (moved) {
      const r = root.getBoundingClientRect();
      chrome.storage.local.set({ [POS_KEY]: { left: r.left, top: r.top } });
    }
  });

  fab.addEventListener('click', (e) => {
    if (moved) {
      e.stopPropagation();
      return;
    }
    togglePanel();
  });

  function setPosition(left, top) {
    root.style.left = left + 'px';
    root.style.top = top + 'px';
    root.style.right = 'auto';
    root.style.bottom = 'auto';
  }

  function togglePanel() {
    open = !open;
    panel.classList.toggle('szu-dl-hidden', !open);
  }

  const allBtn = root.querySelector('#szu-dl-all');
  allBtn.addEventListener('click', () => {
    console.log('[畅课下载] 点击全部下载，当前', items.length, '条');
    if (!items.length) return;
    allBtn.disabled = true;
    allBtn.textContent = '下载中…';
    chrome.runtime.sendMessage({ type: 'DOWNLOAD_ALL' }, (res) => {
      allBtn.disabled = false;
      if (chrome.runtime.lastError) {
        allBtn.textContent = '失败';
        alert('通信失败：' + chrome.runtime.lastError.message);
        setTimeout(() => { allBtn.textContent = '全部下载'; }, 1800);
        return;
      }
      if (res && res.ok) {
        allBtn.textContent = `已开始 ${res.total} 个`;
      } else {
        allBtn.textContent = '失败';
      }
      setTimeout(() => { allBtn.textContent = '全部下载'; }, 1800);
    });
  });

  clearBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'CLEAR' }, () => {
      items = [];
      render();
    });
  });

  // ---------- 渲染 ----------
  function typeLabel(t) {
    return { pdf: 'PDF', office: 'Office', video: '视频', file: '文件' }[t] || '文件';
  }

  function fmtTime(ts) {
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function render() {
    const n = items.length;
    badgeEl.textContent = n > 99 ? '99+' : String(n);
    badgeEl.style.display = n ? 'flex' : 'none';
    countEl.textContent = String(n);
    emptyEl.style.display = n ? 'none' : 'block';
    listEl.innerHTML = '';

    items.forEach((it, idx) => {
      const item = document.createElement('div');
      item.className = 'szu-dl-item';
      item.style.setProperty('--i', idx);

      const index = document.createElement('span');
      index.className = 'szu-dl-idx';
      index.textContent = String(idx + 1).padStart(2, '0');

      const tag = document.createElement('span');
      tag.className = 'szu-dl-tag szu-dl-tag-' + it.type;
      tag.textContent = typeLabel(it.type);

      const info = document.createElement('div');
      info.className = 'szu-dl-info';
      const name = document.createElement('div');
      name.className = 'szu-dl-name';
      name.textContent = it.filename || '未命名课件';
      name.title = it.filename || '';
      const meta = document.createElement('div');
      meta.className = 'szu-dl-meta';
      meta.textContent = fmtTime(it.capturedAt);
      info.appendChild(name);
      info.appendChild(meta);

      const btn = document.createElement('button');
      btn.className = 'szu-dl-btn';
      btn.textContent = '下载';
      btn.addEventListener('click', () => download(btn, it));

      item.appendChild(index);
      item.appendChild(tag);
      item.appendChild(info);
      item.appendChild(btn);
      listEl.appendChild(item);
    });
  }

  function download(btn, it) {
    btn.textContent = '下载中…';
    btn.disabled = true;
    chrome.runtime.sendMessage(
      { type: 'DOWNLOAD', fileUrl: it.fileUrl, filename: it.filename },
      (res) => {
        btn.disabled = false;
        if (res && res.ok) {
          btn.textContent = '✓ 已开始';
        } else {
          btn.textContent = '失败';
          alert('下载失败：' + ((res && res.error) || '未知错误'));
        }
        setTimeout(() => { btn.textContent = '下载'; }, 1600);
      }
    );
  }

  // ---------- 数据同步 ----------
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[STORAGE_KEY]) {
      items = changes[STORAGE_KEY].newValue || [];
      render();
    }
  });

  chrome.runtime.sendMessage({ type: 'GET_LIST' }, (res) => {
    items = (res && res.items) || [];
    render();
  });

  // 恢复上次拖动的位置
  chrome.storage.local.get(POS_KEY, (d) => {
    const p = d[POS_KEY];
    if (p && typeof p.left === 'number') setPosition(p.left, p.top);
  });
})();
