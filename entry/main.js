/* AI 八卦特刊 · 独立传播页（七幕滚动叙事版）
 * 结构：冷开场 → 共情 → 承诺 → 对暗号 → 工牌揭晓 → 真实证据 → 传播闭环
 */

const CAST = {
  overload: {
    name: "电量见底记者",
    theme: "mag",
    image: "assets/ai-gossip-share-badge-low-battery-reporter.png",
    tagline: "今天想知道，但脑子已经下班。",
    blurb: "你不是不关心 AI。你只是没多余电量，把一条新闻从头扛到尾。",
    assignment: "今晚只吃一条。先看漫画和一句话吃瓜，正文想展开再展开。",
    share: "白天已经把脑子用完了，今晚请用一张漫画把 AI 新闻讲完。",
  },
  format: {
    name: "通稿逃犯",
    theme: "tabloid",
    image: "assets/ai-gossip-share-badge-press-release-escapee.png",
    tagline: "没有人、没有冲突、没有人话，我不进场。",
    blurb: "一看到“近日正式发布”，你就想翻窗离开。你要的不是更多信息，是先知道：这事到底谁急了？",
    assignment: "先看本周最熟的瓜，先站队，再补剧情。",
    share: "我不是不关心 AI，我只是不想看 AI 公关稿。",
  },
  learn: {
    name: "课代表失联",
    theme: "candy",
    image: "assets/ai-gossip-share-badge-class-monitor-missing.png",
    tagline: "我想懂，但别把我带回课堂。",
    blurb: "你愿意知道 AI 圈发生了什么。但一旦消息开始像补课材料，你的注意力就先下课了。",
    assignment: "先看这件事跟谁有关、会影响什么；术语不懂就问，别打开十个搜索页。",
    share: "我愿意吃瓜了解 AI，但请不要把我带回课堂。",
  },
  exec: {
    name: "已读未回选手",
    theme: "pixel",
    image: "assets/ai-gossip-share-badge-seen-unreplied-runner.png",
    tagline: "打开很多，真正进场总差最后一步。",
    blurb: "你的收藏夹里不缺新闻。缺的是那一下——有人把第一条线索递到你手里，让你愿意开始。",
    assignment: "从本周最熟的瓜开始。先投一票，给自己一个进场理由。",
    share: "我打开过很多 AI 新闻，真正读完的通常有标题党嫌疑。",
  },
};

const THEME_IDS = ["pixel", "tabloid", "candy", "mag"];
const NAME_TO_TYPE = Object.fromEntries(
  Object.entries(CAST).map(([id, info]) => [info.name, id])
);

/** 特刊基址：/entry 同源时跳站点根；本地 8010 开发时跳 8000 */
function magazineBase() {
  if (location.pathname.startsWith("/entry")) return `${location.origin}/`;
  if (location.port === "8010" || location.port === "8011") return "http://127.0.0.1:8000/";
  return `${location.origin}/`;
}

const QUESTIONS = [
  {
    q: "点开一篇《某大模型发布技术报告》，你的第一反应是？",
    opts: [
      { type: "overload", label: "先划到底：它到底值不值得我耗电？" },
      { type: "format", label: "先找：谁和谁又在较劲？" },
      { type: "learn", label: "先别讲原理，告诉我这事跟谁有关" },
      { type: "exec", label: "收藏一下，等会儿看（这个等会儿很玄）" },
    ],
  },
  {
    q: "下班后，一条 3000 字 AI 深度报道向你走来：",
    opts: [
      { type: "overload", label: "我支持它存在，但别出现在我今晚的手机里" },
      { type: "format", label: "写成“某大厂半夜掀桌”我就能看完" },
      { type: "learn", label: "它要是像补课材料，我的注意力先下课" },
      { type: "exec", label: "我打开了，读了两段，然后不记得第一段讲谁" },
    ],
  },
  {
    q: "“Token 配额、推理成本、MoE 路由”同时出现时：",
    opts: [
      { type: "overload", label: "我的电量条突然只剩一格" },
      { type: "format", label: "先说重点：这事到底谁急了？" },
      { type: "learn", label: "我想懂，但我不想像在上课" },
      { type: "exec", label: "我打开搜索框，然后被另一件事带走" },
    ],
  },
  {
    q: "什么情况最可能让你真的把一条 AI 新闻看完？",
    opts: [
      { type: "overload", label: "有图、有一句话，不需要马上读正文" },
      { type: "format", label: "人物、算盘、反转，像一集连续剧" },
      { type: "learn", label: "像朋友讲八卦，不像老师划重点" },
      { type: "exec", label: "有人先递给我第一条，而且不长" },
    ],
  },
];

const $ = (id) => document.getElementById(id);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ── 报头日期 ── */
$("masthead-date").textContent = new Date().toLocaleDateString("zh-CN", {
  year: "numeric", month: "long", day: "numeric",
});

/* ── 翻报入场（IntersectionObserver） ── */
const io = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add("on");
    io.unobserve(entry.target);
  });
}, { threshold: 0.15 });
$$(".rv, .stamp").forEach((el) => io.observe(el));

/* ── 铅字进度线 + 幕导航 ── */
const bar = $("bar");
const scenes = $$(".scene");
const dots = $$("#dots a");
let ticking = false;
function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.width = `${(scrollY / max) * 100}%`;
    let cur = 0;
    scenes.forEach((s, i) => { if (scrollY >= s.offsetTop - innerHeight * 0.5) cur = i; });
    dots.forEach((d, i) => d.classList.toggle("on", i === cur));
    ticking = false;
  });
}
addEventListener("scroll", onScroll, { passive: true });
onScroll();

/* ── 封面鼠标视差（最大 ~10px，lerp 平滑） ── */
const pars = $$(".par");
if (!reduced && matchMedia("(min-width: 900px)").matches && pars.length) {
  let mx = 0, my = 0, cx = 0, cy = 0, running = false;
  const lerp = (a, b, t) => a + (b - a) * t;
  addEventListener("mousemove", (e) => {
    mx = (e.clientX / innerWidth - 0.5) * 2;
    my = (e.clientY / innerHeight - 0.5) * 2;
    if (!running) { running = true; tick(); }
  }, { passive: true });
  function tick() {
    cx = lerp(cx, mx, 0.06);
    cy = lerp(cy, my, 0.06);
    pars.forEach((p) => {
      const d = +p.dataset.dep * 500;
      p.style.translate = `${-cx * d}px ${-cy * d}px`;
    });
    if (Math.abs(cx - mx) > 0.001 || Math.abs(cy - my) > 0.001) requestAnimationFrame(tick);
    else running = false;
  }
}

/* ── 对暗号：抽档案式切换 ── */
let answers = [];
const quizBody = $("quiz-body");

function setStep() {
  const step = Math.min(answers.length + 1, QUESTIONS.length);
  $("quiz-step").textContent = `暗号 ${step} / ${QUESTIONS.length}`;
  $("quiz-bar").style.width = `${(answers.length / QUESTIONS.length) * 100}%`;
}

function swapQuizBody(render) {
  if (reduced) { render(); return; }
  quizBody.classList.add("archiving");
  quizBody.addEventListener("animationend", () => {
    quizBody.classList.remove("archiving");
    render();
    quizBody.classList.add("pulling");
    quizBody.addEventListener("animationend", () => quizBody.classList.remove("pulling"), { once: true });
  }, { once: true });
}

function renderQuestion() {
  const step = answers.length;
  if (step >= QUESTIONS.length) return finishQuiz();
  const cur = QUESTIONS[step];
  setStep();
  quizBody.innerHTML = `
    <p class="sheet-q">${cur.q}</p>
    <div class="sheet-opts">${cur.opts.map((o, i) =>
      `<button type="button" class="sheet-opt" data-type="${o.type}">
         <span class="opt-index">${"甲乙丙丁"[i]}</span>${o.label}
       </button>`).join("")}</div>`;
  quizBody.querySelectorAll(".sheet-opt").forEach((btn) => {
    btn.addEventListener("click", () => {
      answers.push(btn.dataset.type);
      if (answers.length >= QUESTIONS.length) finishQuiz();
      else swapQuizBody(renderQuestion);
    });
  });
  $("btn-back").hidden = step === 0;
}

function finishQuiz() {
  $("quiz-bar").style.width = "100%";
  $("quiz-step").textContent = "暗号已对完";
  quizBody.innerHTML = `<p class="sheet-intro">问询完毕。编辑部正在翻档案……工牌在下一幕揭晓 ↓</p>`;
  $("btn-back").hidden = true;
  revealResult();
}

/* ── 工牌揭晓（本页高潮：抽档案 → 人物入场 → 盖章 → 递线索） ── */
function revealResult() {
  const scores = { overload: 0, format: 0, learn: 0, exec: 0 };
  answers.forEach((t) => { scores[t] += 1; });
  const winner = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
  const info = CAST[winner];

  $("result-img").src = info.image;
  $("result-img").alt = `${info.name}工牌`;
  $("result-name").textContent = info.name;
  $("result-tagline").textContent = info.tagline;
  $("result-blurb").textContent = info.blurb;
  $("result-assignment").textContent = info.assignment;
  $("btn-share").dataset.type = winner;
  $("result-share-note").hidden = true;
  try {
    localStorage.setItem("aig-identity", info.name);
    localStorage.setItem("aig-type", winner);
  } catch { /* 隐私模式忽略 */ }
  personalizeIntern(info.name);
  syncEnterLink();

  $("result-locked").hidden = true;
  const open = $("result-open");
  open.hidden = false;

  // 分层入场：工牌 → 文案 → 红章压下
  const badge = open.querySelector(".result-badge");
  const copy = open.querySelector(".result-copy");
  const stamp = $("result-stamp");
  [badge, copy].forEach((el, i) => {
    el.classList.add("rv");
    el.style.setProperty("--d", `${0.15 + i * 0.25}s`);
  });
  stamp.classList.remove("on");
  stamp.style.setProperty("--d", "0s");

  setTimeout(() => {
    $("s4").scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
    requestAnimationFrame(() => {
      badge.classList.add("on");
      copy.classList.add("on");
      setTimeout(() => stamp.classList.add("on"), reduced ? 0 : 850);
    });
  }, reduced ? 0 : 600);
}

/* ── 分享：下载工牌 + 复制暗号 ── */
function downloadBadge(info) {
  const a = document.createElement("a");
  a.href = info.image;
  a.download = `ai-gossip-${info.name}-badge.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function shareBadge(typeId) {
  const info = CAST[typeId];
  const text = `我被 AI 八卦特刊编辑部抓到了：\n【${info.name}】\n\n${info.share}\n\n你是哪位编辑部临时工？\n${location.href.split("#")[0]}`;
  downloadBadge(info);
  const note = $("result-share-note");
  try {
    await navigator.clipboard.writeText(text);
    note.textContent = "工牌图已下载，暗号已复制，去抓下一个同伙。";
  } catch {
    note.textContent = "工牌图已下载，暗号复制失败，请手动复制页面地址。";
  }
  note.hidden = false;
}

/* ── 事件 ── */
$("btn-start").addEventListener("click", () => {
  answers = [];
  swapQuizBody(renderQuestion);
});
$("btn-back").addEventListener("click", () => {
  answers.pop();
  swapQuizBody(renderQuestion);
});
$("btn-retake").addEventListener("click", () => {
  answers = [];
  $("result-open").hidden = true;
  $("result-locked").hidden = false;
  $("quiz-bar").style.width = "0";
  quizBody.innerHTML = `
    <p class="sheet-intro">编辑部想先确认一件事——</p>
    <button type="button" class="ink-btn primary" id="btn-start-again">重新对暗号 →</button>`;
  $("btn-start-again").addEventListener("click", () => swapQuizBody(renderQuestion));
  setStep();
  $("s3").scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
});
$("btn-share").addEventListener("click", (e) => shareBadge(e.currentTarget.dataset.type));
$("btn-cta-quiz").addEventListener("click", () => {
  $("s3").scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
});

/* ── 进入本期特刊：按工牌角色跳对应主题；未领工牌则随机 ── */
function currentTypeId() {
  try {
    const type = localStorage.getItem("aig-type");
    if (type && CAST[type]) return type;
    const name = localStorage.getItem("aig-identity");
    return NAME_TO_TYPE[name] || null;
  } catch {
    return null;
  }
}

function pickThemeForEnter() {
  const type = currentTypeId();
  if (type) return CAST[type].theme;
  return THEME_IDS[Math.floor(Math.random() * THEME_IDS.length)];
}

function magazineUrl(theme) {
  const u = new URL(magazineBase());
  u.searchParams.set("theme", theme || pickThemeForEnter());
  const type = currentTypeId();
  if (type) u.searchParams.set("reader", type);
  u.hash = "#/";
  return u.toString();
}

function syncEnterLink() {
  const link = $("btn-enter");
  if (!link) return;
  const type = currentTypeId();
  if (type) {
    link.href = magazineUrl(CAST[type].theme);
    link.dataset.mode = "role";
  } else {
    // 未领工牌：每次点击再随机，避免写死第一次抽到的主题
    link.href = magazineBase();
    link.dataset.mode = "random";
  }
}

$("btn-enter")?.addEventListener("click", (e) => {
  if ($("btn-enter").dataset.mode !== "random") return;
  e.preventDefault();
  const url = magazineUrl();
  if ($("btn-enter").target === "_blank") window.open(url, "_blank", "noopener");
  else location.href = url;
});
syncEnterLink();

/* ==================== 05 瓜田实习 ==================== */

const JARGON = {
  "万亿参数": "参数量是模型脑内“神经连接”的数量。人话：脑容量特别大——但大不等于聪明，还得看怎么训练的。",
  "开源": "把菜谱直接公开，任何人都能拿回家自己炒，还能改配方。对家就惨了：他们还指着卖菜赚钱。",
  "基准测试": "模型界的统一模拟考。分数高说明应试能力强，但考得好不代表干活好，跟人类考试一个道理。",
  "闭源": "只卖做好的菜，绝不给菜谱。好处是能收钱收得安稳，坏处是隔壁免费发菜谱的时候会很尴尬。",
  "护城河": "别人短时间抄不走的优势。这里指闭源公司靠“只有我有”赚钱——菜谱一公开，河就被填平了。",
};

const identity = () => {
  try { return localStorage.getItem("aig-identity") || "吃瓜群众"; } catch { return "吃瓜群众"; }
};

const INTERN_LEAD = {
  "电量见底记者": "工牌不是纪念品。今晚只派一单：划一个黑话、站一次队、丢一张战书——够了。",
  "通稿逃犯": "工牌不是纪念品。上岗第一单：把黑话翻成人话，先站队再挑衅——别读通稿。",
  "课代表失联": "工牌不是纪念品。上岗第一单：点开黑话听人话，投一票，再把战书扔进群。",
  "已读未回选手": "工牌不是纪念品。上岗第一单：先投一票就算进场，再点一个黑话、复制战书。",
};

function personalizeIntern(name) {
  const lead = $("intern-lead");
  if (lead) lead.textContent = INTERN_LEAD[name] || "工牌不是纪念品。上岗第一单：在下面这条真实的瓜上，完成三件小事。";
}
personalizeIntern(identity());

const tasksDone = { explain: false, vote: false, taunt: false };
let voteSide = null;

function completeTask(key, li) {
  if (tasksDone[key]) return;
  tasksDone[key] = true;
  $(li).classList.add("done");
  const n = Object.values(tasksDone).filter(Boolean).length;
  $("task-count").textContent = `已完成 ${n} / 3`;
  if (n === 3) {
    const wrap = $("promote-wrap");
    wrap.hidden = false;
    const stamp = $("promote-stamp");
    stamp.classList.remove("on");
    requestAnimationFrame(() =>
      setTimeout(() => stamp.classList.add("on"), reduced ? 0 : 350)
    );
  }
}

/* ── 任务一：说人话（点黑话词 / 划词） ── */
function addNote(term, text) {
  $("notes").hidden = false;
  const item = document.createElement("p");
  item.className = "note-item";
  const label = document.createElement("b");
  label.textContent = `${term}：`;
  const body = document.createElement("span");
  item.append(label, body);
  $("notes-list").appendChild(item);

  if (reduced) {
    body.textContent = text;
  } else {
    let i = 0;
    (function type() {
      body.textContent = text.slice(0, ++i);
      if (i < text.length) setTimeout(type, 22);
    })();
  }
  completeTask("explain", "task-explain");
}

const explained = new Set();
$$(".jargon").forEach((btn) => {
  btn.addEventListener("click", () => {
    const term = btn.dataset.term;
    btn.classList.add("asked");
    if (explained.has(term)) return;
    explained.add(term);
    addNote(term, JARGON[term]);
  });
});

/* 划词：正文里选中任意文本，浮出【说人话】 */
const lensBtn = document.createElement("button");
lensBtn.id = "lens-btn";
lensBtn.type = "button";
lensBtn.textContent = "说人话";
lensBtn.hidden = true;
document.body.appendChild(lensBtn);

let selectedText = "";
document.addEventListener("mouseup", (e) => {
  if (e.target === lensBtn) return;
  setTimeout(() => {
    const sel = getSelection();
    const text = sel ? sel.toString().trim() : "";
    const newsBody = $("news-body");
    if (!text || text.length < 2 || !sel.anchorNode || !newsBody.contains(sel.anchorNode)) {
      lensBtn.hidden = true;
      return;
    }
    selectedText = text;
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    lensBtn.style.left = `${rect.left + scrollX}px`;
    lensBtn.style.top = `${rect.top + scrollY - 44}px`;
    lensBtn.hidden = false;
  }, 0);
});

lensBtn.addEventListener("pointerdown", (e) => e.preventDefault());
lensBtn.addEventListener("click", () => {
  lensBtn.hidden = true;
  const hit = Object.keys(JARGON).find((k) => selectedText.includes(k));
  if (hit) {
    if (!explained.has(hit)) { explained.add(hit); addNote(hit, JARGON[hit]); }
    else completeTask("explain", "task-explain");
  } else {
    const short = selectedText.length > 14 ? selectedText.slice(0, 14) + "…" : selectedText;
    addNote(`「${short}」`, "这句编辑部还没来得及写人话版。正刊里选中任何一句都能直接问 AI，当场讲给你听。");
  }
  getSelection()?.removeAllRanges();
});

/* ── 任务二：吃瓜站队 + 小票 ── */
const SEED = { "阿里云": 128, "华为云": 97 };
$$(".poll-opt").forEach((btn) => {
  btn.addEventListener("click", () => {
    voteSide = btn.dataset.side;
    SEED[voteSide] += 1;
    const total = SEED["阿里云"] + SEED["华为云"];
    const pa = Math.round((SEED["阿里云"] / total) * 100);
    const pb = 100 - pa;

    $("poll-opts").hidden = true;
    $("poll-result").hidden = false;
    $("pct-a").textContent = `${pa}%`;
    $("pct-b").textContent = `${pb}%`;
    document.querySelectorAll(".poll-bar")[pa >= pb ? 0 : 1].classList.add("win");
    requestAnimationFrame(() => {
      $("bar-a").style.width = `${pa}%`;
      $("bar-b").style.width = `${pb}%`;
    });

    $("receipt-body").textContent = `${identity()} 已入场站队：赌【${voteSide}】第一个全面接入 Kimi K3。本立场已存档，翻案请携新瓜。`;
    $("receipt-foot").textContent = `NO.${String(total).padStart(4, "0")} · ${new Date().toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} · 编辑部盖讫`;
    $("receipt").hidden = false;
    completeTask("vote", "task-vote");
  });
});

/* ── 任务三：复制去群里挑衅 ── */
function fallbackCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.cssText = "position:fixed;left:-9999px;top:0";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch { /* ignore */ }
  ta.remove();
  return ok;
}

$("btn-taunt").addEventListener("click", async () => {
  const stance = voteSide
    ? `我赌【${voteSide}】第一个全面接入 Kimi K3，立场已在编辑部存档。`
    : "本周的瓜我已经吃完了，你还没进场。";
  const text = `【战书】我，${identity()}，已在 AI 八卦特刊上岗吃瓜：\n${stance}\n不服的来对暗号领工牌：\n${location.href.split("#")[0]}`;
  const note = $("taunt-note");
  let ok = false;
  try {
    await navigator.clipboard.writeText(text);
    ok = true;
  } catch {
    ok = fallbackCopy(text);
  }
  if (ok) {
    $("btn-taunt").textContent = "已装弹，去群里发射 →";
    note.textContent = "战书已复制。粘贴到群里，等对方点进来。";
  } else {
    note.textContent = "自动复制失败。请长按选中下方战书，手动复制：";
    let pre = document.getElementById("taunt-fallback");
    if (!pre) {
      pre = document.createElement("pre");
      pre.id = "taunt-fallback";
      pre.className = "taunt-fallback";
      note.after(pre);
    }
    pre.textContent = text;
  }
  note.hidden = false;
  completeTask("taunt", "task-taunt");
});
