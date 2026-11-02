// ============================================================
// 畅课课件下载助手 · 后台 Service Worker
// 作用：监听课件预览请求 → 解析真实下载地址 → 存储 → 执行下载
// ============================================================
'use strict';

const STORAGE_KEY = 'courseware_items';
const MAX_ITEMS = 100;

// ------------------------------------------------------------
// 监听网络请求
// 畅课平台的课件预览（pdf-viewer 等）都是通过 note-bene 预览器加载，
// 真实下载地址被编码在「file」查询参数里。预览器以 iframe 方式加载，
// 属于 sub_frame 类型的导航请求。
// ------------------------------------------------------------
chrome.webRequest.onBeforeRequest.addListener(
  handlePreviewRequest,
  { urls: ['*://lms.szu.edu.cn/*'], types: ['main_frame', 'sub_frame'] }
);

function handlePreviewRequest(details) {
  const url = details.url || '';
  // 只处理 note-bene 预览器 / viewer 类请求，避免误捕获其他资源
  if (!url.includes('note-bene') && !url.includes('viewer')) return;

  let u;
  try {
    u = new URL(url);
  } catch (e) {
    return;
  }

  // file 参数即真实下载 URL（URLSearchParams.get 已自动做一层解码）
  const fileUrl = u.searchParams.get('file');
  if (!fileUrl) return;

  const item = {
    key: extractKey(fileUrl),
    fileUrl: fileUrl,
    filename: extractFilename(fileUrl),
    type: detectType(url, fileUrl),
    courseId: u.searchParams.get('course_id') || '',
    uploadId: u.searchParams.get('upload_id') || '',
    capturedAt: Date.now(),
  };

  saveItem(item);
}

// 从下载地址的路径中取文件唯一标识（文件 hash）用于去重
function extractKey(fileUrl) {
  try {
    const parts = new URL(fileUrl).pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || fileUrl;
  } catch (e) {
    return fileUrl;
  }
}

// 提取文件名：优先取 name 参数（URLSearchParams 会自动解码中文）
function extractFilename(fileUrl) {
  try {
    const name = new URL(fileUrl).searchParams.get('name');
    if (name && name.trim()) return name;
  } catch (e) {}
  try {
    const parts = new URL(fileUrl).pathname.split('/').filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return decodeURIComponent(last);
  } catch (e) {}
  return 'courseware';
}

// 判断文件类型（用于列表里显示标签）
function detectType(viewerUrl, fileUrl) {
  if (viewerUrl.includes('pdf-viewer')) return 'pdf';
  if (viewerUrl.includes('office') || viewerUrl.includes('ppt') || viewerUrl.includes('word')) return 'office';
  if (viewerUrl.includes('video')) return 'video';
  const name = extractFilename(fileUrl).toLowerCase();
  if (name.endsWith('.pdf')) return 'pdf';
  if (/\.(docx?|pptx?|xlsx?|wps|et|dps)$/.test(name)) return 'office';
  if (/\.(mp4|mov|avi|mkv|flv|wmv)$/.test(name)) return 'video';
  return 'file';
}

// 保存（去重 + 最新的排最前 + 限制条数）
function saveItem(item) {
  chrome.storage.local.get(STORAGE_KEY, (data) => {
    let items = data[STORAGE_KEY] || [];
    items = items.filter((it) => it.key !== item.key);
    items.unshift(item);
    if (items.length > MAX_ITEMS) items = items.slice(0, MAX_ITEMS);
    chrome.storage.local.set({ [STORAGE_KEY]: items });
  });
}

// 下载：浏览器会自动带上登录 cookie，鉴权 token 已包含在 URL 里
function downloadFile(fileUrl, filename) {
  return new Promise((resolve, reject) => {
    const options = { url: fileUrl, saveAs: false };
    if (filename) options.filename = sanitizeFilename(filename);
    chrome.downloads.download(options, (id) => {
      const err = chrome.runtime.lastError;
      if (err) reject(err.message);
      else resolve(id);
    });
  });
}

// 清理文件名中的非法字符
function sanitizeFilename(name) {
  return String(name)
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim() || 'courseware';
}

// ------------------------------------------------------------
// 消息处理：content script / popup 发来的指令
// ------------------------------------------------------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;

  if (msg.type === 'GET_LIST') {
    chrome.storage.local.get(STORAGE_KEY, (data) => {
      sendResponse({ items: data[STORAGE_KEY] || [] });
    });
    return true; // 异步响应
  }

  if (msg.type === 'DOWNLOAD') {
    downloadFile(msg.fileUrl, msg.filename)
      .then((id) => sendResponse({ ok: true, id }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  if (msg.type === 'DOWNLOAD_ALL') {
    console.log('[畅课下载] 收到 DOWNLOAD_ALL 消息');
    chrome.storage.local.get(STORAGE_KEY, (data) => {
      const list = data[STORAGE_KEY] || [];
      console.log('[畅课下载] 待下载条数:', list.length);
      // 关键：立即响应，绝不依赖下载回调，避免消息通道超时关闭
      sendResponse({ ok: true, total: list.length });
      // 之后异步逐条发起下载（结果不影响上面的响应）
      list.forEach((it) => {
        try {
          chrome.downloads.download(
            { url: it.fileUrl, filename: sanitizeFilename(it.filename), saveAs: false },
            (id) => {
              const err = chrome.runtime.lastError;
              if (err) {
                console.log('[畅课下载] 单条失败:', err.message, '→', it.filename);
              } else {
                console.log('[畅课下载] 已发起 id=' + id + ':', it.filename);
              }
            }
          );
        } catch (e) {
          console.log('[畅课下载] 同步异常:', String(e), '→', it.filename);
        }
      });
    });
    return true;
  }

  if (msg.type === 'CLEAR') {
    chrome.storage.local.remove(STORAGE_KEY, () => sendResponse({ ok: true }));
    return true;
  }
});
