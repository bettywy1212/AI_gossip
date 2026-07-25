/* AI 八卦特刊 · 前端
 * hash 路由：#/ 瓜田、#/item/{idx}、#/issue/{date}/…、#/archive、#/about、#/quiz
 * v1.1：用户类型测试 · 单条竖屏分享图 · 轻量新闻标记
 */

const app = document.getElementById("app");
let issue = null;      // 当前阅读中的刊
let latestDay = null;  // 最新一期日期
let status = null;
let askArticle = null;
let askController = null;

/* ---------------- 主题 ---------------- */

const THEMES = [
  { id: "pixel",   label: "夜刊", icon: "👾" },
  { id: "tabloid", label: "小报", icon: "🗞️" },
  { id: "candy",   label: "糖果", icon: "🍭" },
  { id: "mag",     label: "杂志", icon: "📖" },
];

function currentTheme() {
  const saved = localStorage.getItem("gossip-theme");
  return THEMES.some((t) => t.id === saved) ? saved : "pixel";
}

function setTheme(id, { rerender = true } = {}) {
  if (!THEMES.some((t) => t.id === id)) return;
  localStorage.setItem("gossip-theme", id);
  document.body.dataset.theme = id;
  if (rerender) render();
}

/** 入口页跨端口跳转：?theme=tabloid&reader=format → 套用主题 / 读者类型后清掉 query */
function bootFromEntryParams() {
  const params = new URLSearchParams(location.search);
  const theme = params.get("theme");
  const reader = params.get("reader");
  let touched = false;
  if (theme && THEMES.some((t) => t.id === theme)) {
    setTheme(theme, { rerender: false });
    touched = true;
  }
  if (reader) {
    applyReader(reader);
    touched = true;
  }
  if (!touched) return;
  const url = new URL(location.href);
  url.searchParams.delete("theme");
  url.searchParams.delete("reader");
  const clean = url.pathname + (url.searchParams.toString() ? `?${url.searchParams}` : "") + url.hash;
  history.replaceState(null, "", clean);
}

/* ---------------- 随读问答 ---------------- */

function askAssistantHtml() {
  return `<button type="button" class="selection-ask" id="selection-ask" hidden>说人话</button>
    <aside class="selection-answer" id="selection-answer" hidden aria-live="polite">
      <button type="button" class="selection-close" id="selection-close" aria-label="关闭解读">×</button>
      <div class="selection-quote" id="selection-quote"></div>
      <div class="selection-result" id="selection-result"></div>
      <small>随读解读</small>
    </aside>`;
}

async function explainSelection(text, rect) {
  const trigger = document.getElementById("selection-ask");
  const panel = document.getElementById("selection-answer");
  const quote = document.getElementById("selection-quote");
  const result = document.getElementById("selection-result");
  if (!text || !askArticle || !panel || !quote || !result) return;
  trigger.hidden = true;
  quote.textContent = `“${text}”`;
  result.textContent = "正在结合这条新闻解释…";
  result.className = "selection-result loading";
  panel.hidden = false;
  placeSelectionUi(panel, rect);
  try {
    const question = `请用简单的话解读我选中的内容“${text}”，并说明它在这条新闻里是什么意思。`;
    const data = await apiPost("/api/ask", { question, article: askArticle, history: [] });
    result.textContent = data.answer;
    result.className = "selection-result";
  } catch (e) {
    result.textContent = e.message || "暂时解读不了，请稍后再试";
    result.className = "selection-result error";
  }
}

function placeSelectionUi(el, rect) {
  const margin = 12;
  const width = el.offsetWidth || 300;
  const viewportLeft = Math.min(window.innerWidth - width - margin, Math.max(margin, rect.left + rect.width / 2 - width / 2));
  const below = rect.bottom + 10;
  const viewportTop = below + (el.offsetHeight || 48) > window.innerHeight
    ? Math.max(margin, rect.top - (el.offsetHeight || 48) - 10)
    : below;
  el.style.left = `${window.scrollX + viewportLeft}px`;
  el.style.top = `${window.scrollY + viewportTop}px`;
}

function setupAskAssistant() {
  askController?.abort();
  askController = new AbortController();
  const { signal } = askController;
  const body = document.querySelector(".detail .body");
  const trigger = document.getElementById("selection-ask");
  const panel = document.getElementById("selection-answer");
  let selectedText = "";
  let selectedRect = null;
  const hide = () => { trigger.hidden = true; panel.hidden = true; };
  body?.addEventListener("pointerup", () => setTimeout(() => {
    const selection = window.getSelection();
    const text = selection?.toString().trim().replace(/\s+/g, " ").slice(0, 160);
    if (!text || !selection.rangeCount || !body.contains(selection.anchorNode)) {
      trigger.hidden = true;
      return;
    }
    selectedText = text;
    selectedRect = selection.getRangeAt(0).getBoundingClientRect();
    panel.hidden = true;
    trigger.hidden = false;
    placeSelectionUi(trigger, selectedRect);
  }, 0), { signal });
  trigger?.addEventListener("pointerdown", (e) => e.preventDefault(), { signal });
  trigger?.addEventListener("click", () => explainSelection(selectedText, selectedRect), { signal });
  document.getElementById("selection-close")?.addEventListener("click", hide, { signal });
  document.addEventListener("selectionchange", () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) trigger.hidden = true;
  }, { signal });
  document.addEventListener("pointerdown", (e) => {
    if (!trigger?.contains(e.target) && !panel?.contains(e.target) && !body?.contains(e.target)) hide();
  }, { signal });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hide();
  }, { signal });
}

function themeSwitch() {
  return `<div class="theme-switch">
    ${THEMES.map((t, idx) =>
      `<button type="button" class="theme-chip${t.id === currentTheme() ? " active" : ""}"
         onclick="setTheme('${t.id}')" title="快捷键 ${idx + 1}">
         <span class="theme-key">${idx + 1}</span><span class="theme-icon">${t.icon}</span>${t.label}
       </button>`
    ).join("")}
  </div>`;
}

window.setTheme = setTheme;

/* ---------------- 读者类型（测验结果） ---------------- */

const READER_TYPES = {
  overload: {
    id: "overload",
    name: "过载型",
    theme: "mag",
    blurb: "高强度脑力后，高密度文字耐受下降。短块、大漫画、少干扰更适合你。",
    tip: "建议：先看漫画和一句话吃瓜，正文默认折叠；标记已调成最轻。",
  },
  format: {
    id: "format",
    name: "形式排斥型",
    theme: "tabloid",
    blurb: "对通稿腔、无冲突报道天然没兴趣。你需要的是权谋、得失和戏剧性。",
    tip: "建议：用复古小报读瓜；冲突句会加高亮，帮你一眼抓到爆点。",
  },
  learn: {
    id: "learn",
    name: "学习厌恶型",
    theme: "candy",
    blurb: "不是不想知道，而是抗拒「我在上课」。吃瓜式接收才不累。",
    tip: "建议：糖果粗野主题更像刷社媒；少术语感，当事方轻轻标一下即可。",
  },
  exec: {
    id: "exec",
    name: "执行型",
    theme: "pixel",
    blurb: "启动难、易分心、读两行忘前两句。独立成篇 + 时间锚点更对路。",
    tip: "建议：像素夜刊分块清楚；人物与「三天前/昨晚」时间锚会帮你回线。",
  },
};

function currentReader() {
  const id = localStorage.getItem("gossip-reader");
  return READER_TYPES[id] || null;
}

function applyReader(typeId) {
  const t = READER_TYPES[typeId];
  if (!t) {
    delete document.body.dataset.reader;
    return;
  }
  document.body.dataset.reader = t.id;
  localStorage.setItem("gossip-reader", t.id);
}

const savedReader = currentReader();
if (savedReader) document.body.dataset.reader = savedReader.id;

bootFromEntryParams();
document.body.dataset.theme = currentTheme();

const MELON = { 1: "🍉", 2: "🍉🍉", 3: "🍉🍉🍉" };
const MELON_LABEL = { 1: "小瓜", 2: "中瓜", 3: "大瓜" };

/* ---------------- 全民预测投票 ---------------- */

let voteMap = {};   // { "<date>": { "<idx>": {a, b} } }
const myVotes = JSON.parse(localStorage.getItem("gossip-my-votes") || "{}");

const myVote = (date, idx) => myVotes[`${date}:${idx}`];

function saveMyVote(date, idx, choice) {
  myVotes[`${date}:${idx}`] = choice;
  localStorage.setItem("gossip-my-votes", JSON.stringify(myVotes));
}

async function ensureVotes(date) {
  if (voteMap[date]) return;
  const data = await api(`/api/votes/${date}`).catch(() => null);
  voteMap[date] = data?.votes || {};
}

async function apiPost(path, body) {
  const resp = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    let detail = `HTTP ${resp.status}`;
    try { detail = (await resp.json()).detail || detail; } catch {}
    throw new Error(detail);
  }
  return resp.json();
}

function pollRevealedHtml(poll, cnt, myChoice, instant, date, idx) {
  const total = Math.max((cnt.a || 0) + (cnt.b || 0), 1);
  const pa = Math.round(((cnt.a || 0) / total) * 100);
  const pb = 100 - pa;
  const row = (key, label, pct) => `
    <div class="poll-row${myChoice === key ? " mine" : ""}">
      <span class="poll-label">${esc(label)}${myChoice === key ? "（你）" : ""}</span>
      <span class="poll-bar"><i style="width:${instant ? pct : 0}%" data-w="${pct}"></i></span>
      <span class="poll-pct">${pct}%</span>
    </div>`;
  const myPct = myChoice === "a" ? pa : pb;
  const tease = myPct >= 50
    ? `${myPct}% 的吃瓜群众和你押同一边，稳`
    : `只有 ${myPct}% 的人和你押同一边，勇的`;
  return `
    <div class="poll-q">🗳️ ${esc(poll.question)}</div>
    <div class="poll-stamp">已盖章</div>
    ${row("a", poll.options[0], pa)}
    ${row("b", poll.options[1], pb)}
    <div class="poll-sub">${(cnt.a || 0) + (cnt.b || 0)} 人已站队 · ${tease}</div>
    <button type="button" class="pixel-btn small poll-share" onclick="copyVoteTaunt('${esc(date)}',${idx},'${myChoice}')">复制去群里挑衅 →</button>`;
}

function pollHtml(date, idx) {
  const it = issue?.items?.[idx];
  if (!it?.poll) return "";
  const poll = it.poll;
  const cnt = voteMap[date]?.[idx] || { a: 0, b: 0 };
  const voted = myVote(date, idx);
  if (voted) {
    return `<div class="poll-box revealed" id="poll-box">${pollRevealedHtml(poll, cnt, voted, true, date, idx)}</div>`;
  }
  return `<div class="poll-box" id="poll-box">
    <div class="poll-q">🗳️ 全民预测：${esc(poll.question)}</div>
    <div class="poll-btns">
      <button type="button" class="pixel-btn small poll-opt" onclick="castVote('${esc(date)}',${idx},'a')">${esc(poll.options[0])}</button>
      <button type="button" class="pixel-btn small poll-opt" onclick="castVote('${esc(date)}',${idx},'b')">${esc(poll.options[1])}</button>
    </div>
    <div class="poll-sub">先站队再翻牌，看大家怎么押 · ${(cnt.a || 0) + (cnt.b || 0)} 人已站队</div>
  </div>`;
}

window.castVote = async (date, idx, choice) => {
  if (myVote(date, idx)) return;
  const box = document.getElementById("poll-box");
  if (!box || box.classList.contains("cracking")) return;
  box.classList.add("cracking");
  box.insertAdjacentHTML("beforeend", `<div class="melon-crack"></div>`);
  saveMyVote(date, idx, choice);
  let cnt;
  try {
    cnt = await apiPost("/api/vote", { date, idx, choice });
  } catch {
    // 网络失败也让 demo 不掉链子：本地 +1
    const old = voteMap[date]?.[idx] || { a: 0, b: 0 };
    cnt = { ...old, [choice]: (old[choice] || 0) + 1 };
  }
  (voteMap[date] ||= {})[idx] = { a: cnt.a, b: cnt.b };
  const poll = issue?.items?.[idx]?.poll;
  setTimeout(() => {
    box.classList.remove("cracking");
    box.classList.add("revealed");
    box.innerHTML = pollRevealedHtml(poll, cnt, choice, false, date, idx);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      box.querySelectorAll(".poll-bar i").forEach((el) => { el.style.width = `${el.dataset.w}%`; });
    }));
    toast("已站队！可复制文案去群里挑衅");
  }, 800);
};

async function copyVoteTaunt(date, idx, choice) {
  const it = issue?.items?.[idx];
  if (!it?.poll) return;
  const label = it.poll.options[choice === "a" ? 0 : 1];
  const text = `我押了「${label}」：${it.hook}\n\n你呢？👇\n${shareUrl(date, idx)}`;
  try {
    await navigator.clipboard.writeText(text);
    toast("挑衅文案已复制，去群里扔炸弹吧");
  } catch {
    toast("复制失败，请手动选中文案");
  }
}
window.copyVoteTaunt = copyVoteTaunt;

function voteHintHtml(date, idx) {
  const it = issue?.items?.[idx];
  const cnt = voteMap[date]?.[idx];
  if (!it?.poll || !cnt) return "";
  const total = (cnt.a || 0) + (cnt.b || 0);
  if (!total) return "";
  const aLeads = (cnt.a || 0) >= (cnt.b || 0);
  const pct = Math.round(((aLeads ? cnt.a : cnt.b) / total) * 100);
  const opt = it.poll.options[aLeads ? 0 : 1];
  return `<div class="vote-hint">🗳️ ${total} 人站队 · ${pct}% 押「${esc(opt)}」</div>`;
}

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** 漫画 URL 带刊期版本，避开 CDN 对历史 404 的缓存 */
function mangaUrl(filename, date) {
  if (!filename) return "";
  const v = encodeURIComponent(date || latestDay || "1");
  return `/images/${encodeURIComponent(filename)}?v=${v}`;
}

/* ---------------- 轻量新闻标记 ---------------- */

const TIME_ANCHORS = ["三天前", "两天前", "昨晚", "昨夜", "今早", "今天", "凌晨", "半夜"];

function rangesOverlap(a, b) {
  return a.start < b.end && b.start < a.end;
}

function collectMarkRanges(text, item) {
  const ranges = [];
  const add = (start, end, type) => {
    if (start < 0 || end <= start || end > text.length) return;
    if (ranges.some((r) => rangesOverlap(r, { start, end }))) return;
    ranges.push({ start, end, type });
  };

  const entities = [...(item.characters || [])]
    .filter((e) => e && String(e).length >= 2)
    .sort((a, b) => String(b).length - String(a).length);
  for (const e of entities) {
    const i = text.indexOf(e);
    if (i !== -1) add(i, i + e.length, "entity");
  }

  const reader = document.body.dataset.reader;
  // 过载型：几乎不标数字，避免视觉噪声
  if (reader !== "overload") {
    const numRe = /\d+(?:\.\d+)?(?:%|亿|万|倍|手|名|人|天|个月|小时|分钟)?|[\d,]+(?:亿|万)?(?:美元|元)?|\d+万(?:Token|token)/g;
    let m;
    let n = 0;
    const maxNums = reader === "learn" ? 2 : 4;
    while ((m = numRe.exec(text)) && n < maxNums) {
      if (m[0].length >= 2) {
        add(m.index, m.index + m[0].length, "num");
        n += 1;
      }
    }
  }

  // 冲突句：形式排斥型强化，过载型跳过
  if (reader !== "overload") {
    const conflict = (item.marks?.conflict || "").trim();
    if (conflict) {
      const i = text.indexOf(conflict);
      if (i !== -1) add(i, i + conflict.length, "conflict");
    }
  }

  // 执行型：时间锚点
  if (reader === "exec") {
    for (const a of TIME_ANCHORS) {
      let from = 0;
      while (true) {
        const i = text.indexOf(a, from);
        if (i === -1) break;
        add(i, i + a.length, "time");
        from = i + a.length;
      }
    }
  }

  return ranges.sort((a, b) => a.start - b.start || b.end - a.end);
}

function markPlain(text, item) {
  const raw = String(text ?? "");
  const ranges = collectMarkRanges(raw, item);
  if (!ranges.length) return esc(raw);
  let out = "";
  let cursor = 0;
  const cls = {
    entity: "mark-entity",
    num: "mark-num",
    conflict: "mark-conflict",
    time: "mark-time",
  };
  for (const r of ranges) {
    if (r.start < cursor) continue;
    out += esc(raw.slice(cursor, r.start));
    out += `<span class="${cls[r.type]}">${esc(raw.slice(r.start, r.end))}</span>`;
    cursor = r.end;
  }
  out += esc(raw.slice(cursor));
  return out;
}

function shareUrl(date, idx) {
  const base = `${location.origin}${location.pathname}`;
  if (date && latestDay && date !== latestDay) {
    return `${base}#/issue/${date}/item/${idx}`;
  }
  return `${base}#/item/${idx}`;
}

async function copyGossip(date, idx) {
  const it = issue?.items?.[idx];
  if (!it) return;
  const text = `${it.title}\n\n🍉 ${it.hook}\n\n${shareUrl(date, idx)}`;
  try {
    await navigator.clipboard.writeText(text);
    toast("已复制吃瓜文案");
  } catch {
    toast("复制失败，请手动选中文案");
  }
}

function toast(msg) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 1800);
}

window.copyGossip = copyGossip;
window.toggleBody = (btn) => {
  const box = btn.closest(".body-fold");
  if (!box) return;
  const open = box.classList.toggle("open");
  btn.textContent = open ? "收起正文 ↑" : "展开正文 ↓";
  btn.setAttribute("aria-expanded", open ? "true" : "false");
};

/* ---------------- 单条竖屏分享图 ---------------- */

function themePalette() {
  const s = getComputedStyle(document.body);
  return {
    bg: s.getPropertyValue("--bg").trim() || "#2b2138",
    panel: s.getPropertyValue("--panel").trim() || "#3d2f52",
    ink: s.getPropertyValue("--ink").trim() || "#1a1226",
    text: s.getPropertyValue("--text").trim() || "#faf6ee",
    accent: s.getPropertyValue("--accent").trim() || "#e85a4f",
    hl: s.getPropertyValue("--hl").trim() || "#f4b942",
    hot: s.getPropertyValue("--hot").trim() || "#ff2e88",
    muted: s.getPropertyValue("--muted").trim() || "#9a8bb5",
  };
}

function wrapCanvasText(ctx, text, maxWidth) {
  const chars = String(text || "").split("");
  const lines = [];
  let line = "";
  for (const ch of chars) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = ch;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function shareCard(date, idx) {
  const it = issue?.items?.[idx];
  if (!it) return;
  toast("正在生成分享图…");
  const W = 720;
  const H = 1280;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  const c = themePalette();
  const pad = 40;

  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = c.panel;
  ctx.fillRect(24, 24, W - 48, H - 48);
  ctx.strokeStyle = c.ink;
  ctx.lineWidth = 4;
  ctx.strokeRect(24, 24, W - 48, H - 48);

  ctx.fillStyle = c.hot;
  ctx.font = "bold 22px sans-serif";
  ctx.fillText("AI 八卦特刊 🍉", pad + 8, 72);

  ctx.fillStyle = c.text;
  ctx.font = "bold 36px sans-serif";
  const titleLines = wrapCanvasText(ctx, it.title, W - pad * 2 - 16).slice(0, 3);
  let y = 120;
  for (const line of titleLines) {
    ctx.fillText(line, pad + 8, y);
    y += 48;
  }

  y += 12;
  const comicTop = y;
  const comicH = 380;
  ctx.fillStyle = c.ink;
  ctx.fillRect(pad, comicTop, W - pad * 2, comicH);
  if (it.image) {
    try {
      const img = await loadImage(mangaUrl(it.image, issue?.date));
      const ratio = Math.max((W - pad * 2) / img.width, comicH / img.height);
      const dw = img.width * ratio;
      const dh = img.height * ratio;
      const dx = pad + ((W - pad * 2) - dw) / 2;
      const dy = comicTop + (comicH - dh) / 2;
      ctx.save();
      ctx.beginPath();
      ctx.rect(pad, comicTop, W - pad * 2, comicH);
      ctx.clip();
      ctx.drawImage(img, dx, dy, dw, dh);
      ctx.restore();
    } catch {
      ctx.fillStyle = c.muted;
      ctx.font = "20px sans-serif";
      ctx.fillText("漫画赶稿中", pad + 24, comicTop + comicH / 2);
    }
  } else {
    ctx.fillStyle = c.muted;
    ctx.font = "20px sans-serif";
    ctx.fillText("漫画赶稿中", pad + 24, comicTop + comicH / 2);
  }

  y = comicTop + comicH + 48;
  ctx.fillStyle = c.accent;
  ctx.font = "bold 22px sans-serif";
  ctx.fillText("一句话吃瓜", pad + 8, y);
  y += 40;
  ctx.fillStyle = c.text;
  ctx.font = "28px sans-serif";
  const hookLines = wrapCanvasText(ctx, it.hook, W - pad * 2 - 16).slice(0, 4);
  for (const line of hookLines) {
    ctx.fillText(line, pad + 8, y);
    y += 40;
  }

  ctx.fillStyle = c.muted;
  ctx.font = "18px sans-serif";
  ctx.fillText("正经新闻读不进去？吃瓜读懂。", pad + 8, H - 100);
  ctx.fillStyle = c.hl;
  ctx.font = "16px sans-serif";
  const link = shareUrl(date, idx).replace(/^https?:\/\//, "");
  const linkLines = wrapCanvasText(ctx, link, W - pad * 2 - 16).slice(0, 2);
  let ly = H - 68;
  for (const line of linkLines) {
    ctx.fillText(line, pad + 8, ly);
    ly += 22;
  }

  try {
    const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
    if (!blob) throw new Error("blob");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-gossip-${date}-${idx + 1}.png`;
    a.click();
    URL.revokeObjectURL(url);
    toast("分享图已下载");
  } catch {
    toast("生成失败，试试复制吃瓜文案");
  }
}
window.shareCard = shareCard;

/* ---------------- 用户类型测试 ---------------- */

const QUIZ_QS = [
  {
    q: "正经 AI 长文摆在面前，你最常的状态是？",
    opts: [
      { type: "overload", label: "脑力已经用完，两行就滑走" },
      { type: "format", label: "通稿腔一上来就想关" },
      { type: "learn", label: "一有「上课感」就抗拒" },
      { type: "exec", label: "想读，但读两句就忘前文" },
    ],
  },
  {
    q: "什么样的内容反而能让你看下去？",
    opts: [
      { type: "overload", label: "短、有图、信息块很少" },
      { type: "format", label: "有人物、冲突、算盘" },
      { type: "learn", label: "像聊天吃瓜，不像补课" },
      { type: "exec", label: "开头点名、独立成篇、好跳读" },
    ],
  },
  {
    q: "你刷 AI 动态时，最怕什么？",
    opts: [
      { type: "overload", label: "信息密度太高，越看越累" },
      { type: "format", label: "没戏没恩怨，干巴巴发布" },
      { type: "learn", label: "被推着「你应该懂这些」" },
      { type: "exec", label: "启动困难，收藏了也不打开" },
    ],
  },
  {
    q: "如果只能选一种阅读帮助，你要？",
    opts: [
      { type: "overload", label: "先看摘要和漫画，正文可折叠" },
      { type: "format", label: "把新闻写成连续剧八卦" },
      { type: "learn", label: "零门槛，带点好玩的包装" },
      { type: "exec", label: "人物和时间线标清楚，方便回想" },
    ],
  },
];

let quizAnswers = [];

function quizView() {
  app.className = "";
  const step = quizAnswers.length;
  if (step >= QUIZ_QS.length) return quizResultView();

  const cur = QUIZ_QS[step];
  app.innerHTML = `${masthead()}${siteNav("quiz")}
    <div class="pixel-box quiz-box">
      <div class="quiz-progress">第 ${step + 1} / ${QUIZ_QS.length} 题</div>
      <h2 class="page-title">测测你为什么读不进严肃新闻</h2>
      <p class="page-sub">四题倾向描述，不是诊断。测完推荐最适配的主题与读法</p>
      <p class="quiz-q">${esc(cur.q)}</p>
      <div class="quiz-opts">
        ${cur.opts.map((o, i) =>
          `<button type="button" class="pixel-btn quiz-opt" onclick="answerQuiz('${o.type}')">${esc(o.label)}</button>`
        ).join("")}
      </div>
      ${step ? `<button type="button" class="body-toggle" onclick="quizBack()">← 上一题</button>` : ""}
    </div>
    ${foot()}`;
  setupTickerScroll();
}

function quizResultView() {
  const scores = { overload: 0, format: 0, learn: 0, exec: 0 };
  for (const t of quizAnswers) scores[t] = (scores[t] || 0) + 1;
  const winner = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
  const info = READER_TYPES[winner];
  const themeLabel = THEMES.find((t) => t.id === info.theme)?.label || info.theme;

  app.innerHTML = `${masthead()}${siteNav("quiz")}
    <div class="pixel-box quiz-box quiz-result">
      <div class="quiz-progress">测试完成</div>
      <h2 class="page-title">你更像：${esc(info.name)}</h2>
      <p class="quiz-blurb">${esc(info.blurb)}</p>
      <p class="quiz-tip">${esc(info.tip)}</p>
      <p class="quiz-rec">推荐主题：<strong>${esc(themeLabel)}</strong></p>
      <div class="actions">
        <button type="button" class="pixel-btn" onclick="applyQuizResult('${winner}')">套用推荐并去吃瓜</button>
        <button type="button" class="pixel-btn small" onclick="retakeQuiz()">再测一次</button>
        <a class="pixel-btn small" href="#/">先看看再说</a>
      </div>
    </div>
    ${foot()}`;
  setupTickerScroll();
}

window.answerQuiz = (type) => {
  quizAnswers.push(type);
  quizView();
};
window.quizBack = () => {
  quizAnswers.pop();
  quizView();
};
window.retakeQuiz = () => {
  quizAnswers = [];
  quizView();
};
window.applyQuizResult = (typeId) => {
  const info = READER_TYPES[typeId];
  if (!info) return;
  applyReader(typeId);
  setTheme(info.theme, { rerender: false });
  toast(`已套用：${info.name} · ${THEMES.find((t) => t.id === info.theme)?.label || ""}`);
  if ((location.hash || "#/") === "#/") render();
  else location.hash = "#/";
};

/* ---------------- 公共件 ---------------- */

function siteNav(active) {
  const items = [
    { hash: "#/", id: "home", label: "本期吃瓜" },
    { hash: "#/quiz", id: "quiz", label: "测测我" },
    { hash: "#/archive", id: "archive", label: "往期" },
    { hash: "#/about", id: "about", label: "关于" },
  ];
  return `<nav class="site-nav">${items.map((x) =>
    `<a href="${x.hash}" class="${active === x.id ? "active" : ""}">${x.label}</a>`
  ).join("")}</nav>`;
}

function quizBanner() {
  if (currentReader()) return "";
  return `<a class="quiz-banner" href="#/quiz">🧠 测测你为什么读不进严肃新闻 → 顺便推荐主题</a>`;
}

function masthead() {
  const hooks = (issue?.items || []).map((it) => it.hook).filter(Boolean);
  const ticker = hooks.length
    ? `<div class="ticker"><div class="ticker-inner">${
        [...hooks, ...hooks].map((h) => `<span>🍉 ${esc(h)}</span>`).join("")
      }</div></div>`
    : "";
  return `
  ${themeSwitch()}
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
    <span>📝 ${issue.items?.length || 0} 条瓜</span>
    ${melonThermoHtml()}
    ${gen ? `<span>🖨️ 更新于 ${esc(gen)}</span>` : ""}
    ${nxt ? `<span>⏰ 下期 ${esc(nxt)}</span>` : ""}
  </div>`;
}

function foot() {
  return `<footer class="foot">
    内容由 AI 编辑部采写改写，吃瓜需谨慎，转发前看来源 ·
    <a href="#/about">免责声明</a>
  </footer>`;
}

function loadingView(main, sub) {
  app.className = "";
  app.innerHTML = `${masthead()}${siteNav("home")}
    <div class="loading">
      <div class="melon-spin">🍉</div>
      <div>${esc(main)}</div>
      <div class="sub">${esc(sub || "")}</div>
    </div>`;
}

function emptyView() {
  app.className = "";
  const nxt = (status?.next_update || "").replace("T", " ").slice(0, 16);
  app.innerHTML = `${masthead()}${siteNav("home")}
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

async function ensureStatus() {
  if (!status) status = await api("/api/status").catch(() => null);
  if (status?.latest) latestDay = status.latest;
}

async function loadIssue(day) {
  await ensureStatus();
  if (day) {
    if (issue?.date === day) return true;
    loadingView("翻往期……");
    try {
      issue = await api(`/api/issues/${day}`);
      await ensureVotes(day);
      return true;
    } catch (e) {
      app.innerHTML = `${masthead()}${siteNav("archive")}
        <div class="pixel-box error-box"><p>出错了：${esc(e.message)}</p></div>`;
      return false;
    }
  }
  if (issue && (!latestDay || issue.date === latestDay)) return true;
  loadingView("翻刊中……");
  try {
    [issue, status] = await Promise.all([
      api("/api/issues/latest"),
      api("/api/status").catch(() => null),
    ]);
    latestDay = issue.date;
    await ensureVotes(issue.date);
    return true;
  } catch (e) {
    if (e.status === 404) {
      status = await api("/api/status").catch(() => null);
      emptyView();
    } else {
      app.innerHTML = `${masthead()}${siteNav("home")}
        <div class="pixel-box error-box"><p>出错了：${esc(e.message)}</p></div>`;
    }
    return false;
  }
}

function melonKingIdx(date) {
  const votes = voteMap[date];
  if (!votes) return -1;
  let best = -1;
  let bestTotal = 0;
  for (const [key, cnt] of Object.entries(votes)) {
    const total = (cnt.a || 0) + (cnt.b || 0);
    if (total > bestTotal) {
      bestTotal = total;
      best = Number(key);
    }
  }
  return best;
}

function melonThermoHtml() {
  const items = issue?.items || [];
  if (!items.length) return "";
  const sum = items.reduce((s, it) => s + (Number(it.melon_level) || 1), 0);
  const avg = (sum / items.length).toFixed(1);
  const n = Number(avg);
  const icons = n >= 2.5 ? "🍉🍉🍉" : n >= 1.5 ? "🍉🍉" : "🍉";
  return `<span class="melon-thermo" title="本期 ${items.length} 条瓜的平均瓜度">🌡️ 本期平均瓜度 ${avg} ${icons}</span>`;
}

function cardsHtml(date, kingIdx = -1) {
  return issue.items
    .map((it, i) => {
      const thumb = it.image
        ? `<div class="card-thumb"><img src="${mangaUrl(it.image, date)}" alt="" loading="lazy"></div>`
        : `<div class="card-thumb no-img"><span>🖼️ 画手赶稿中</span></div>`;
      const href = date && latestDay && date !== latestDay
        ? `#/issue/${date}/item/${i}`
        : `#/item/${i}`;
      const kingCls = i === kingIdx ? " melon-king" : "";
      const kingBadge = i === kingIdx ? `<span class="melon-king-badge">👑 今日瓜王</span>` : "";
      return `
      <article class="pixel-box card${kingCls}" onclick="location.hash='${href}'">
        ${kingBadge}
        ${thumb}
        <div class="card-body">
          <div class="level-badge lv${it.melon_level || 1}">${MELON[it.melon_level] || "🍉"} ${MELON_LABEL[it.melon_level] || "小瓜"}</div>
          <h3>${esc(it.title)}</h3>
          <div class="hook">${esc(it.hook)}</div>
          <div class="chars">出场：${esc((it.characters || []).join(" · "))}</div>
          ${voteHintHtml(date, i)}
          <div class="read-more">阅读全文</div>
        </div>
      </article>`;
    })
    .join("");
}

/* ---------------- 瓜田（主页 / 某期） ---------------- */

async function homeView(date) {
  if (!(await loadIssue(date || null))) return;
  const viewingDate = issue.date;
  const isArchive = latestDay && viewingDate !== latestDay;

  let topBlock = "";
  if (!isArchive) {
    const top = await api("/api/votes/top").catch(() => null);
    if (top?.top?.length) {
      const medals = ["🥇", "🥈", "🥉"];
      const hot = top.top[0];
      const ctaHref = hot.date === latestDay ? `#/item/${hot.idx}` : `#/issue/${hot.date}/item/${hot.idx}`;
      topBlock = `<aside class="home-side" aria-label="本周最熟的瓜">
        <section class="pixel-box top-melons">
          <div class="top-title">🔥 本周最熟的瓜</div>
          <div class="top-subline">按站队人数排 · 点进瓜里就能投</div>
          ${top.top.map((x, i) => {
            const href = x.date === latestDay ? `#/item/${x.idx}` : `#/issue/${x.date}/item/${x.idx}`;
            return `<a class="top-row" href="${href}">
              <span class="top-medal">${medals[i] || "🍉"}</span>
              <span class="top-body">
                <span class="top-name">${esc(x.title)}</span>
                <span class="top-count">${x.total} 人站队</span>
              </span>
            </a>`;
          }).join("")}
          <p class="top-cta-line">别光吃瓜，<strong>快去表态</strong>，看看你和多数人押同边吗 👇</p>
          <a class="pixel-btn small top-cta" href="${ctaHref}">🍉 快去表态 →</a>
        </section>
      </aside>`;
    }
  }

  const reader = currentReader();
  const readerChip = reader
    ? `<div class="reader-chip">你的读法：${esc(reader.name)} · <a href="#/quiz">重测</a></div>`
    : "";

  const kingIdx = !isArchive ? melonKingIdx(viewingDate) : -1;

  app.className = topBlock ? "home-page" : "";
  app.innerHTML = `${masthead()}${siteNav(isArchive ? "archive" : "home")}${infoBar()}
    ${isArchive ? "" : quizBanner()}
    ${readerChip}
    ${isArchive ? `<a class="back pixel-btn small" href="#/archive">← 回往期</a>` : ""}
    <div class="home-layout${topBlock ? "" : " home-layout--solo"}">
      <main class="cards">${cardsHtml(viewingDate, kingIdx)}</main>
      ${topBlock}
    </div>
    ${isArchive ? "" : `<p class="kbd-hint">Demo 彩蛋：<kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> 换主题 · <kbd>Enter</kbd> 进首瓜</p>`}
    ${foot()}`;
  setupTickerScroll();
}

/* ---------------- 单瓜详情 ---------------- */

async function itemView(idx, date) {
  app.className = "";
  if (!(await loadIssue(date || null))) return;
  const it = issue.items[idx];
  if (!it) { location.hash = date ? `#/issue/${date}` : "#/"; return render(); }

  const viewingDate = issue.date;
  askArticle = {
    title: it.title,
    body: it.body,
    hook: it.hook,
    characters: it.characters || [],
    source_title: it.source_title || "",
    source_url: it.source_url || "",
  };
  const backHref = date && latestDay && date !== latestDay ? `#/issue/${date}` : "#/";
  const comic = it.image
    ? `<div class="comic-zone"><img src="${mangaUrl(it.image, viewingDate)}" alt="八卦漫画"></div>`
    : `<div class="comic-zone no-img"><span>🖼️ 本条漫画还在画手桌上，下期补上</span></div>`;

  const markLegend = `<div class="mark-legend" aria-hidden="true">
    <span><i class="mark-entity">当事方</i></span>
    <span><i class="mark-num">数字</i></span>
    <span><i class="mark-conflict">冲突点</i></span>
  </div>`;

  app.innerHTML = `${masthead()}${siteNav(date && latestDay && date !== latestDay ? "archive" : "home")}
    <a class="back pixel-btn small" href="${backHref}">← ${date && latestDay && date !== latestDay ? "回本期" : "回瓜田"}</a>
    <div class="pixel-box detail">
      <div class="level-badge lv${it.melon_level || 1}">${MELON[it.melon_level] || "🍉"} ${MELON_LABEL[it.melon_level] || "小瓜"}</div>
      <h2>${esc(it.title)}</h2>
      ${comic}
      <div class="hook-box">${esc(it.hook)}</div>
      ${markLegend}
      <div class="body-fold">
        <button type="button" class="body-toggle" aria-expanded="false" onclick="toggleBody(this)">展开正文 ↓</button>
        <div class="body">${markPlain(it.body, it)}</div>
      </div>
      ${pollHtml(viewingDate, idx)}
      <div class="actions">
        <button type="button" class="pixel-btn small" onclick="copyGossip('${esc(viewingDate)}', ${idx})">复制吃瓜</button>
        <button type="button" class="pixel-btn small" onclick="shareCard('${esc(viewingDate)}', ${idx})">下载分享图</button>
      </div>
      <div class="source">
        <span>来源</span>
        <a href="${esc(it.source_url)}" target="_blank" rel="noopener">${esc(it.source_title || it.source_url)}</a>
      </div>
    </div>
    ${foot()}
    ${askAssistantHtml()}`;
  setupTickerScroll();
  setupAskAssistant();
}

/* ---------------- 往期归档 ---------------- */

async function archiveView() {
  app.className = "";
  await ensureStatus();
  loadingView("翻档案柜……");
  try {
    const data = await api("/api/issues");
    const list = data.issues || [];
    if (!list.length) {
      app.innerHTML = `${masthead()}${siteNav("archive")}
        <div class="pixel-box empty-box"><p>档案柜还是空的</p><p class="sub">出刊后会自动进档</p></div>`;
      return;
    }
    const rows = list.map((x) => {
      const gen = (x.generated_at || "").replace("T", " ").slice(0, 16);
      const isLatest = x.date === latestDay;
      return `<a class="pixel-box archive-row" href="#/issue/${esc(x.date)}">
        <div class="archive-date">📅 ${esc(x.date)}${isLatest ? ' <span class="pill">最新</span>' : ""}</div>
        <div class="archive-meta">${x.item_count || 0} 条瓜${gen ? ` · ${esc(gen)}` : ""}</div>
      </a>`;
    }).join("");
    app.innerHTML = `${masthead()}${siteNav("archive")}
      <h2 class="page-title">往期特刊</h2>
      <p class="page-sub">吃瓜最爽的是回头看连续剧</p>
      <div class="archive-list">${rows}</div>
      ${foot()}`;
    setupTickerScroll();
  } catch (e) {
    app.innerHTML = `${masthead()}${siteNav("archive")}
      <div class="pixel-box error-box"><p>出错了：${esc(e.message)}</p></div>`;
  }
}

/* ---------------- 关于 / 免责声明 ---------------- */

function aboutView() {
  app.className = "";
  app.innerHTML = `${masthead()}${siteNav("about")}
    <div class="pixel-box about-box">
      <h2 class="page-title">关于 AI 八卦特刊</h2>
      <p>想跟上 AI 行业动态，正经新闻却总读不进去？这里用好奇心包装事实：有漫画、有爆点、有来源，吃瓜读懂。</p>
      <h3>我们是什么</h3>
      <ul>
        <li>趣味改写的<strong>行业瓜特刊</strong>，帮怕严肃报道的人无痛跟上 AI 动态</li>
        <li>每条含：漫画配图 · 标题 · 八卦正文 · 一句话吃瓜 · 原新闻来源</li>
        <li>默认「轻八卦 · 独立成篇」：不靠性别隐喻，有趣来自权力 / 利益 / 时机 / 反差</li>
      </ul>
      <h3>我们不是什么</h3>
      <ul>
        <li><strong>不是新闻机构</strong>，不做原创调查报道</li>
        <li>不是假新闻站，也不鼓励标题党误导。事实与时间线须可核对</li>
        <li>不是深度研报或系统课，适合碎片吃瓜，不适合当决策依据</li>
      </ul>
      <h3>免责声明</h3>
      <ul>
        <li>正文为 AI 辅助改写与点评，可能有疏漏；请点击来源外链核实</li>
        <li>配图为 AI 生成的寓言式漫画，不代表真实人物肖像或官方立场</li>
        <li>转发请自重，消费决策与立场请以一手来源为准</li>
      </ul>
      <h3>v1.2 已上线（Demo 加分）</h3>
      <ul>
        <li><strong>今日瓜王</strong>：站队人数最多的卡片自动戴 👑</li>
        <li><strong>投完挑衅文案</strong>：投票后可一键复制「我押了 XX，你呢？」</li>
        <li><strong>键盘吃瓜</strong>：首页按 <kbd>1</kbd>/<kbd>2</kbd>/<kbd>3</kbd> 换主题，<kbd>Enter</kbd> 进第一条瓜</li>
        <li><strong>瓜度温度计</strong>：刊头显示本期平均瓜度</li>
        <li><strong>八卦越传越邪</strong>：往下滚时走马灯加速</li>
      </ul>
      <h3>v1.1 已上线</h3>
      <ul>
        <li><a href="#/quiz">测测我</a>：四题判断你更像哪类读者，并推荐主题与读法</li>
        <li>详情页「下载分享图」：竖屏单条卡片，方便发社媒</li>
        <li>正文轻量标记：当事方下划线、数字圈示、冲突句高亮（过载型自动降噪）</li>
      </ul>
      <p class="about-note">刻意不做：送报定制特刊、20 条纯文本加餐、整刊长图。避免变资讯 App、加重选择负担。</p>
    </div>
    ${foot()}`;
  setupTickerScroll();
}

/* ---------------- 路由 ---------------- */

let _tickerScrollHandler = null;

function setupTickerScroll() {
  if (_tickerScrollHandler) {
    window.removeEventListener("scroll", _tickerScrollHandler);
    _tickerScrollHandler = null;
  }
  requestAnimationFrame(() => {
    const inner = document.querySelector(".ticker-inner");
    if (!inner) return;
    _tickerScrollHandler = () => {
      const dur = Math.max(10, 48 - window.scrollY / 32);
      inner.style.animationDuration = `${dur}s`;
    };
    window.addEventListener("scroll", _tickerScrollHandler, { passive: true });
    _tickerScrollHandler();
  });
}

function setupKeyboardMelon() {
  document.addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea, select, button, .quiz-opt, .poll-opt")) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const hash = location.hash || "#/";
    const onHome = hash === "#/" || /^#\/issue\/\d{4}-\d{2}-\d{2}$/.test(hash);
    if (e.key === "1") { e.preventDefault(); setTheme("pixel"); toast("👾 像素夜刊"); }
    if (e.key === "2") { e.preventDefault(); setTheme("tabloid"); toast("🗞️ 复古小报"); }
    if (e.key === "3") { e.preventDefault(); setTheme("candy"); toast("🍭 糖果粗野"); }
    if (e.key === "4") { e.preventDefault(); setTheme("mag"); toast("📖 轻杂志"); }
    if (e.key === "Enter" && onHome && issue?.items?.length) {
      e.preventDefault();
      const d = issue.date;
      location.hash = latestDay && d !== latestDay ? `#/issue/${d}/item/0` : "#/item/0";
    }
  });
}
setupKeyboardMelon();

function render() {
  const hash = location.hash || "#/";
  let m;
  if ((m = hash.match(/^#\/issue\/(\d{4}-\d{2}-\d{2})\/item\/(\d+)$/))) {
    return itemView(Number(m[2]), m[1]);
  }
  if ((m = hash.match(/^#\/issue\/(\d{4}-\d{2}-\d{2})$/))) {
    return homeView(m[1]);
  }
  if ((m = hash.match(/^#\/item\/(\d+)$/))) {
    return itemView(Number(m[1]));
  }
  if (hash === "#/quiz") {
    if (!quizAnswers.length) quizAnswers = [];
    return quizView();
  }
  if (hash === "#/archive") return archiveView();
  if (hash === "#/about") return aboutView();
  return homeView();
}

window.addEventListener("hashchange", render);
render();
