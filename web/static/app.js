/* AI 八卦特刊 · 前端（只读展示，hash 路由：#/ 瓜田、#/item/{idx} 单瓜） */

const app = document.getElementById("app");
let issue = null;   // 最新刊缓存
let status = null;  // 流水线状态缓存

const MELON = { 1: "🍉", 2: "🍉🍉", 3: "🍉🍉🍉" };
const MELON_LABEL = { 1: "小瓜", 2: "中瓜", 3: "大瓜" };

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------------- 公共件 ---------------- */

function masthead() {
  const hooks = (issue?.items || []).map((it) => it.hook).filter(Boolean);
  const ticker = hooks.length
    ? `<div class="ticker"><div class="ticker-inner">${
        [...hooks, ...hooks].map((h) => `<span>🍉 ${esc(h)}</span>`).join("")
      }</div></div>`
    : "";
  return `
  <header class="masthead">
    <div class="mast-top" onclick="location.hash='#/'">
      <span class="mast-badge">周四见？不，半天见</span>
      <h1>AI 八卦特刊</h1>
      <div class="tagline">严肃新闻看麻了？来这儿吃口瓜 🍉</div>
    </div>
    ${ticker}
  </header>`;
}

function infoBar() {
  if (!issue) return "";
  const gen = (issue.generated_at || "").replace("T", " ").slice(0, 16);
  const nxt = (status?.next_update || "").replace("T", " ").slice(0, 16);
  return `<div class="info-bar">
    <span>📅 第 ${esc(issue.date)} 期</span>
    ${gen ? `<span>🖨️ 更新于 ${esc(gen)}</span>` : ""}
    ${nxt ? `<span>⏰ 下期 ${esc(nxt)}</span>` : ""}
  </div>`;
}

function loadingView(main, sub) {
  app.innerHTML = `${masthead()}
    <div class="loading">
      <div class="melon-spin">🍉</div>
      <div>${esc(main)}</div>
      <div class="sub">${esc(sub || "")}</div>
    </div>`;
}

function emptyView() {
  const nxt = (status?.next_update || "").replace("T", " ").slice(0, 16);
  app.innerHTML = `${masthead()}
    <div class="pixel-box empty-box">
      <div class="melon-spin">🍉</div>
      <p>第一期还在印刷机里翻滚……</p>
      <p class="sub">${status?.generating ? "编辑部正在连夜赶稿，稍后刷新即可" : nxt ? `下期出刊：${esc(nxt)}` : "请稍后刷新"}</p>
    </div>`;
}

async function api(path) {
  const resp = await fetch(path);
  if (!resp.ok) {
    let detail = `HTTP ${resp.status}`;
    try { detail = (await resp.json()).detail || detail; } catch {}
    const err = new Error(detail);
    err.status = resp.status;
    throw err;
  }
  return resp.json();
}

async function ensureIssue() {
  if (issue) return true;
  loadingView("翻刊中……");
  try {
    [issue, status] = await Promise.all([
      api("/api/issues/latest"),
      api("/api/status").catch(() => null),
    ]);
    return true;
  } catch (e) {
    if (e.status === 404) {
      status = await api("/api/status").catch(() => null);
      emptyView();
    } else {
      app.innerHTML = `${masthead()}
        <div class="pixel-box error-box"><p>出错了：${esc(e.message)}</p></div>`;
    }
    return false;
  }
}

/* ---------------- 瓜田（主页） ---------------- */

async function homeView() {
  if (!(await ensureIssue())) return;
  const cards = issue.items
    .map((it, i) => {
      const thumb = it.image
        ? `<div class="card-thumb"><img src="/images/${esc(it.image)}" alt="" loading="lazy"></div>`
        : `<div class="card-thumb no-img"><span>🖼️ 画手赶稿中</span></div>`;
      return `
      <article class="pixel-box card" onclick="location.hash='#/item/${i}'">
        ${thumb}
        <div class="card-body">
          <div class="level-badge lv${it.melon_level || 1}">${MELON[it.melon_level] || "🍉"} ${MELON_LABEL[it.melon_level] || "小瓜"}</div>
          <h3>${esc(it.title)}</h3>
          <div class="hook">${esc(it.hook)}</div>
          <div class="chars">出场：${esc((it.characters || []).join(" · "))}</div>
        </div>
      </article>`;
    })
    .join("");
  app.innerHTML = `${masthead()}${infoBar()}<main class="cards">${cards}</main>
    <footer class="foot">内容由 AI 编辑部自动采写，吃瓜需谨慎，转发前看来源 🍉</footer>`;
}

/* ---------------- 单瓜详情 ---------------- */

async function itemView(idx) {
  if (!(await ensureIssue())) return;
  const it = issue.items[idx];
  if (!it) { location.hash = "#/"; return render(); }

  const comic = it.image
    ? `<div class="comic-zone"><img src="/images/${esc(it.image)}" alt="八卦漫画"></div>`
    : `<div class="comic-zone no-img"><span>🖼️ 本条漫画还在画手桌上，下期补上</span></div>`;

  app.innerHTML = `${masthead()}
    <a class="back pixel-btn small" href="#/">← 回瓜田</a>
    <div class="pixel-box detail">
      <div class="level-badge lv${it.melon_level || 1}">${MELON[it.melon_level] || "🍉"} ${MELON_LABEL[it.melon_level] || "小瓜"}</div>
      <h2>${esc(it.title)}</h2>
      ${comic}
      <div class="body">${esc(it.body)}</div>
      <div class="hook-box">${esc(it.hook)}</div>
      <div class="source">来源：<a href="${esc(it.source_url)}" target="_blank" rel="noopener">${esc(it.source_title || it.source_url)}</a></div>
    </div>`;
}

/* ---------------- 路由 ---------------- */

function render() {
  const hash = location.hash || "#/";
  const m = hash.match(/^#\/item\/(\d+)$/);
  if (m) return itemView(Number(m[1]));
  return homeView();
}

window.addEventListener("hashchange", render);
render();
