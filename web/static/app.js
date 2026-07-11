/* AI 八卦特刊 · 前端（只读展示，hash 路由）
   #/            最新刊
   #/archive     往期回顾
   #/d/{date}    某一期
   #/d/{date}/{idx} 单瓜详情 */

const app = document.getElementById("app");
const issueCache = {};  // date -> issue
let latestDate = null;
let status = null;      // 流水线状态缓存

const MELON = { 1: "🍉", 2: "🍉🍉", 3: "🍉🍉🍉" };
const MELON_LABEL = { 1: "小瓜", 2: "中瓜", 3: "大瓜" };

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------------- 公共件 ---------------- */

function masthead(issue) {
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

function infoBar(issue) {
  if (!issue) return "";
  const gen = (issue.generated_at || "").replace("T", " ").slice(0, 16);
  const nxt = (status?.next_update || "").replace("T", " ").slice(0, 16);
  const isLatest = issue.date === latestDate;
  return `<div class="info-bar">
    <span>📅 第 ${esc(issue.date)} 期${isLatest ? "" : "（往期）"}</span>
    ${gen ? `<span>🖨️ 更新于 ${esc(gen)}</span>` : ""}
    ${isLatest && nxt ? `<span>⏰ 下期 ${esc(nxt)}</span>` : ""}
    <a class="archive-link" href="#/archive">📚 往期回顾</a>
  </div>`;
}

function loadingView(main, sub) {
  app.innerHTML = `${masthead(null)}
    <div class="loading">
      <div class="melon-spin">🍉</div>
      <div>${esc(main)}</div>
      <div class="sub">${esc(sub || "")}</div>
    </div>`;
}

function emptyView() {
  const nxt = (status?.next_update || "").replace("T", " ").slice(0, 16);
  app.innerHTML = `${masthead(null)}
    <div class="pixel-box empty-box">
      <div class="melon-spin">🍉</div>
      <p>第一期还在印刷机里翻滚……</p>
      <p class="sub">${status?.generating ? "编辑部正在连夜赶稿，稍后刷新即可" : nxt ? `下期出刊：${esc(nxt)}` : "请稍后刷新"}</p>
    </div>`;
}

function errorView(msg) {
  app.innerHTML = `${masthead(null)}
    <div class="pixel-box error-box"><p>出错了：${esc(msg)}</p>
    <p style="margin-top:12px"><a class="pixel-btn small" href="#/">回瓜田</a></p></div>`;
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

async function getIssue(date) {
  if (issueCache[date]) return issueCache[date];
  const issue = await api(date === "latest" ? "/api/issues/latest" : `/api/issues/${date}`);
  issueCache[issue.date] = issue;
  if (date === "latest") latestDate = issue.date;
  if (!status) status = await api("/api/status").catch(() => null);
  return issue;
}

/* ---------------- 转发 ---------------- */

async function copyShare(btn, text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  const old = btn.textContent;
  btn.textContent = "✅ 已复制，去群里丢瓜";
  btn.disabled = true;
  setTimeout(() => { btn.textContent = old; btn.disabled = false; }, 1600);
}

function shareText(it, date, idx) {
  const url = `${location.origin}/#/d/${date}/${idx}`;
  return `🍉 ${it.hook}\n\n${url}`;
}

/* ---------------- 瓜田（某一期的列表） ---------------- */

async function issueView(date) {
  let issue;
  try {
    issue = await getIssue(date);
  } catch (e) {
    if (e.status === 404 && date === "latest") {
      status = status || (await api("/api/status").catch(() => null));
      return emptyView();
    }
    return errorView(e.message);
  }
  const cards = issue.items
    .map((it, i) => {
      const thumb = it.image
        ? `<div class="card-thumb"><img src="/images/${esc(it.image)}" alt="" loading="lazy"></div>`
        : `<div class="card-thumb no-img"><span>🖼️ 画手赶稿中</span></div>`;
      return `
      <article class="pixel-box card" onclick="location.hash='#/d/${esc(issue.date)}/${i}'">
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
  app.innerHTML = `${masthead(issue)}${infoBar(issue)}<main class="cards">${cards}</main>
    <footer class="foot">内容由 AI 编辑部自动采写，吃瓜需谨慎，转发前看来源 🍉</footer>`;
}

/* ---------------- 单瓜详情 ---------------- */

async function itemView(date, idx) {
  let issue;
  try {
    issue = await getIssue(date);
  } catch (e) {
    return errorView(e.message);
  }
  const it = issue.items[idx];
  if (!it) { location.hash = "#/"; return render(); }

  const comic = it.image
    ? `<div class="comic-zone"><img src="/images/${esc(it.image)}" alt="八卦漫画"></div>`
    : `<div class="comic-zone no-img"><span>🖼️ 本条漫画还在画手桌上，下期补上</span></div>`;

  app.innerHTML = `${masthead(issue)}
    <a class="back pixel-btn small" href="#/d/${esc(issue.date)}">← 回瓜田</a>
    <div class="pixel-box detail">
      <div class="level-badge lv${it.melon_level || 1}">${MELON[it.melon_level] || "🍉"} ${MELON_LABEL[it.melon_level] || "小瓜"}</div>
      <h2>${esc(it.title)}</h2>
      ${comic}
      <div class="body">${esc(it.body)}</div>
      <div class="hook-box">${esc(it.hook)}</div>
      <div class="share-row">
        <button class="pixel-btn small share-btn" id="share">🍉 复制吃瓜文案</button>
      </div>
      <div class="source">来源：<a href="${esc(it.source_url)}" target="_blank" rel="noopener">${esc(it.source_title || it.source_url)}</a></div>
    </div>`;

  document.getElementById("share").onclick = (ev) =>
    copyShare(ev.currentTarget, shareText(it, issue.date, idx));
}

/* ---------------- 往期回顾 ---------------- */

async function archiveView() {
  let list;
  try {
    list = await api("/api/issues");
  } catch (e) {
    return errorView(e.message);
  }
  if (!latestDate) { try { await getIssue("latest"); } catch {} }
  const rows = list.length
    ? list
        .map((iss) => `
        <article class="pixel-box arch-row" onclick="location.hash='#/d/${esc(iss.date)}'">
          <div class="arch-head">
            <span class="arch-date">📅 ${esc(iss.date)}${iss.date === latestDate ? '<span class="arch-new">最新</span>' : ""}</span>
            <span class="arch-count">${iss.count} 条瓜</span>
          </div>
          <ul class="arch-titles">
            ${iss.titles.map((t) => `<li>${esc(t)}</li>`).join("")}
          </ul>
        </article>`)
        .join("")
    : `<div class="pixel-box empty-box"><p>还没有往期，瓜田刚开垦 🍉</p></div>`;
  app.innerHTML = `${masthead(null)}
    <a class="back pixel-btn small" href="#/">← 回最新刊</a>
    <h2 class="arch-title">📚 往期回顾</h2>
    ${rows}`;
}

/* ---------------- 路由 ---------------- */

function render() {
  const hash = location.hash || "#/";
  let m;
  if (hash === "#/archive") return archiveView();
  if ((m = hash.match(/^#\/d\/(\d{4}-\d{2}-\d{2})\/(\d+)$/))) return itemView(m[1], Number(m[2]));
  if ((m = hash.match(/^#\/d\/(\d{4}-\d{2}-\d{2})$/))) return issueView(m[1]);
  if ((m = hash.match(/^#\/item\/(\d+)$/))) return itemView("latest", Number(m[1])); // 旧链接兼容
  return issueView("latest");
}

window.addEventListener("hashchange", render);
render();
