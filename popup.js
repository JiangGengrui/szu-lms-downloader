// ============================================================
// 畅课课件下载助手 · 扩展弹窗逻辑
// ============================================================
'use strict';

const STORAGE_KEY = 'courseware_items';
let items = [];

const listEl = document.getElementById('list');
const emptyEl = document.getElementById('empty');
const countEl = document.getElementById('count');
const btnClear = document.getElementById('btnClear');
const btnAll = document.getElementById('btnAll');

function fmtTime(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function typeLabel(t) {
  return { pdf: 'PDF', office: 'Office', video: '视频', file: '文件' }[t] || '文件';
}

function render() {
  countEl.textContent = String(items.length);
  emptyEl.style.display = items.length ? 'none' : 'block';
  listEl.innerHTML = '';

  items.forEach((it, idx) => {
    const li = document.createElement('li');
    li.className = 'item';
    li.style.setProperty('--i', idx);

    const index = document.createElement('span');
    index.className = 'idx';
    index.textContent = String(idx + 1).padStart(2, '0');

    const icon = document.createElement('span');
    icon.className = 'type type-' + it.type;
    icon.textContent = typeLabel(it.type);

    const info = document.createElement('div');
    info.className = 'info';
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = it.filename || '未命名课件';
    name.title = it.filename || '';
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = fmtTime(it.capturedAt);
    if (it.courseId) {
      const course = document.createElement('span');
      course.className = 'meta-course';
      course.textContent = '课程 ' + it.courseId;
      meta.appendChild(course);
    }
    info.appendChild(name);
    info.appendChild(meta);

    const btn = document.createElement('button');
    btn.className = 'btn-dl';
    btn.textContent = '下载';
    btn.addEventListener('click', () => doDownload(btn, it));

    li.appendChild(index);
    li.appendChild(icon);
    li.appendChild(info);
    li.appendChild(btn);
    listEl.appendChild(li);
  });
}

function doDownload(btn, item) {
  btn.textContent = '下载中…';
  btn.disabled = true;
  chrome.runtime.sendMessage(
    { type: 'DOWNLOAD', fileUrl: item.fileUrl, filename: item.filename },
    (res) => {
      btn.disabled = false;
      if (res && res.ok) {
        btn.textContent = '已开始 ✓';
      } else {
        btn.textContent = '失败';
        alert('下载失败：' + ((res && res.error) || '未知错误'));
      }
      setTimeout(() => { btn.textContent = '下载'; }, 1600);
    }
  );
}

btnAll.addEventListener('click', () => {
  console.log('[畅课下载] 点击全部下载，当前', items.length, '条');
  if (!items.length) return;
  btnAll.disabled = true;
  btnAll.textContent = '下载中…';
  chrome.runtime.sendMessage({ type: 'DOWNLOAD_ALL' }, (res) => {
    btnAll.disabled = false;
    if (chrome.runtime.lastError) {
      btnAll.textContent = '失败';
      alert('通信失败：' + chrome.runtime.lastError.message);
      setTimeout(() => { btnAll.textContent = '全部下载'; }, 1800);
      return;
    }
    if (res && res.ok) {
      btnAll.textContent = `已开始 ${res.total} 个`;
    } else {
      btnAll.textContent = '失败';
      alert('全部下载失败');
    }
    setTimeout(() => { btnAll.textContent = '全部下载'; }, 1800);
  });
});

btnClear.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'CLEAR' }, () => {
    items = [];
    render();
  });
});

function load() {
  chrome.runtime.sendMessage({ type: 'GET_LIST' }, (res) => {
    items = (res && res.items) || [];
    render();
  });
}

// 监听存储变化，实时更新（在弹窗打开期间）
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STORAGE_KEY]) {
    items = changes[STORAGE_KEY].newValue || [];
    render();
  }
});

load();
