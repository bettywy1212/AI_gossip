"""AI 八卦特刊 · 全自动后端

对访客只读：整条流水线（联网抓新闻 → 八卦化改写 → 每条生成轻漫画）
全部在后台定时跑完，出刊 JSON 一次性落盘，前端永远只看到成品。

  GET  /api/issues                往期列表（日期 / 条数等元信息）
  GET  /api/issues/latest         最新一期成刊
  GET  /api/issues/{date}         某日刊（today 可作别名）
  GET  /api/status                流水线状态（是否在印刷中 / 下期时间）
  POST /api/admin/rebuild?token=  隐藏的强制重跑入口（后台执行，立即返回）

定时：UPDATE_TIMES（默认 08:05,20:05 服务器本地时间）各跑一次；
启动时若最新一期已超过 12 小时（或从未出刊）则立即补跑一次。
"""

import json
import logging
import os
import re
import threading
import time
from datetime import date as _date
from datetime import datetime, timedelta
from pathlib import Path

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")

API_KEY = os.getenv("DASHSCOPE_API_KEY", "")
BASE_URL = os.getenv("DASHSCOPE_BASE_URL", "https://dashscope.aliyuncs.com")
TEXT_MODEL = os.getenv("TEXT_MODEL", "qwen-plus")
IMAGE_MODEL = os.getenv("IMAGE_MODEL", "wan2.2-t2i-flash")
IMAGE_SIZE = os.getenv("IMAGE_SIZE", "1280*720")
NEWS_COUNT = int(os.getenv("NEWS_COUNT", "8"))
UPDATE_TIMES = os.getenv("UPDATE_TIMES", "08:05,20:05")
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "melon-admin")
# Google Analytics 4 Measurement ID（形如 G-XXXXXXXX）。空则不加载统计脚本。
GA_MEASUREMENT_ID = os.getenv("GA_MEASUREMENT_ID", "").strip()

DATA_DIR = ROOT / "data"
ISSUE_DIR = DATA_DIR / "issues"
IMAGE_DIR = DATA_DIR / "images"
ISSUE_DIR.mkdir(parents=True, exist_ok=True)
IMAGE_DIR.mkdir(parents=True, exist_ok=True)

log = logging.getLogger("ai-gossip")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

app = FastAPI(title="ai-gossip")
_ask_rate_lock = threading.Lock()
_ask_rate: dict[str, list[float]] = {}

# ---------------------------------------------------------------- 写作规则
# 浓缩自 SKILL.md / references/writing-patterns.md，并按「更劲爆」目标加辣
GOSSIP_SYSTEM_PROMPT = """你是「AI 八卦特刊」的主编，人设是娱乐周刊出身、转行盯 AI 圈的老八卦记者。把 AI 行业新闻改写成让人拍大腿转发的八卦短篇（轻八卦模式·独立成篇）。

【劲爆的来源】有趣必须来自事实本身的戏剧性——权力、利益、时机、反差、恩怨。你的武器是选角度和讲法，不是编造。同一条新闻，「XX发布了新模型」是通稿，「XX憋了半年的大招，偏偏挑在死对头发布会前一天放出来」才是瓜。

【正文结构（150-280字）】
1. 场景钩子开场：把读者直接扔进最戏剧性的瞬间。禁止「XX公司今日宣布」通稿腔，禁止无主语「她/他」开场，第一句必须点名主角。
   × 「OpenAI 发布了新模型。」
   ✓ 「OpenAI 半夜十二点突然掀桌发新模型，隔壁 Google 的发布会请柬还没发完。」
2. 时间线捋瓜：用「三天前 / 昨晚 / 今早」这类时间锚点把事件串成连续剧，突出「巧合」和「针对」。
3. 算盘拆解：点破谁得利、谁难受、谁被迫跟进。适当用「翻译成人话：」降低门槛。
4. 结尾毒舌一句：主编短评式收尾，可以阴阳公关话术、可以立 flag 式预言（「这瓜后头肯定还有续集」），但必须基于事实。

【语气】像跟闺蜜/兄弟聊连续剧：口语化、敢毒舌、敢拆穿场面话。多用具体数字和细节撑戏剧性（融资额、时间差、股价、员工数），数字越具体瓜越可信越劲爆。

【一句话吃瓜 hook】是转发钩子不是摘要：单独发到群里必须能让人追问「怎么回事？？」。允许悬念、允许阴阳，禁止无主语。
   × 「某公司发布新模型引发关注。」
   ✓ 「Meta 那个九位数挖来的大神，入职不到俩月已经在更新领英了。」

【瓜度 melon_level】1=普通动态（短平快，不硬凹戏）；2=有反差有算盘（重点写算盘拆解）；3=有恩怨有连续剧（放开写，前情提要+本集高潮+下集预告）。瓜度决定用力程度，别把 1 度瓜硬写成 3 度。

【红线（违反即废稿）】
- 事实、时间线、数字必须准确，来源必须真实存在；可以夸张修辞，不可以虚构事实。
- 禁止婚嫁隐喻、性别等级、性暗示（妾室/嫁/娶/小三/正室/入赘/小娇妻等词全禁）。
- 只调侃商业决策、公关话术和大佬的骚操作；不调侃受害者、弱势群体、灾难，不讽刺性别或外貌。
- 禁止伪造网友评论或当事人语录；引用必须真实。

【输出】只输出一个 JSON 数组，不要任何其他文字、不要 markdown 代码块。每个元素：
{
  "slug": "英文短横线标识如 gpt-launch",
  "melon_level": 1|2|3,
  "title": "标题：具体主体+具体动作+悬念或反差，18-24字，要有「点进来」的冲动",
  "body": "八卦正文，150-280字，按上面四段结构",
  "hook": "一句话吃瓜（转发钩子）",
  "characters": ["出场公司/人物"],
  "source_title": "来源标题",
  "source_url": "来源链接",
  "scene": "本条最有戏的一个画面瞬间：谁+在做什么+什么表情，中文，30字内（供漫画导演用）",
  "poll": {"question": "预测型投票题：让读者猜这瓜接下来的走向，16字内，有悬念（如「XX 会认怂道歉吗？」）", "options": ["立场A，7字内", "立场B，7字内"]},
  "marks": {"conflict": "正文里最戏剧的一句冲突点，直接摘自 body，12-22字，供前端高亮"}
}"""

NEWS_USER_PROMPT = """联网搜索今天（{today}）以及最近 48 小时内 AI 行业热度最高、最有戏剧性的 {count} 条新闻。优先选：巨头互撕、突然袭击式发布、天价挖人/融资、高管变动、翻车与打脸、监管开刀。逐条按规则改写成八卦特刊。确保 {count} 条互不重复、来自不同事件，来源链接真实可访问。"""

# ---------------------------------------------------------------- 生图规则
# 两步走：先让 LLM 当「漫画导演」把瓜设计成一个夸张搞笑的画面梗，再套风格锚点
GAG_DESIGN_PROMPT = """You are a comic director for a tech-gossip tabloid. Based on the gossip below, design ONE exaggerated, funny, soap-opera-dramatic comic scene.

Rules:
- Replace all real companies/people with anonymous cartoon human archetypes (e.g. "a smug hoodie-wearing tech CEO", "a panicking suit-wearing executive", "a tiny startup founder clutching a giant check"). No real names, no logos.
- The scene must contain: 1-2 main characters with EXAGGERATED dramatic emotions (jaw-drop shock, smug grin, cold sweat panic, villainous scheming), ONE clear visual gag prop that metaphorizes the news, and a strong sense of drama (someone bursting through a door, dramatic pointing, eavesdropping behind a wall).
- The gag prop must be purely physical and wordless: giant money bags, a snatched trophy, a crumbling sandcastle, an overflowing treasure chest, a giant watermelon, a red carpet, a throne, tangled cables. STRICTLY FORBIDDEN props: phones, screens, monitors, blackboards, whiteboards, documents, newspapers, signs, banners, charts — anything that would show writing.
- ZERO written words in the scene: never describe any object as "labeled", "reading", "that says" or carrying any word (no "a balloon labeled SALARY", no "a folder marked SECRET"). All meaning must come from pantomime, props and facial expressions alone, like a silent comedy film.
- Output ONE English sentence (max 60 words) describing the scene. Output the sentence only, nothing else.

Gossip title: {title}
Gossip summary: {body}
Suggested moment: {scene}"""

STYLE_ANCHOR = (
    "light manga gossip tabloid comic style, single panel, cute human cartoon characters "
    "with wildly exaggerated soap-opera expressions (jaw-drop shock lines, sparkle scheming eyes, "
    "flying comic sweat drops, dramatic gasp open mouths), theatrical spotlight on the main "
    "characters, a small crowd of tiny background characters gasping and whispering behind hands, "
    "dynamic exaggerated body language, bold clean ink outlines, flat cel shading, full color, "
    "vivid limited warm palette of cream white background with coral red, teal and warm yellow accents, "
    "playful paparazzi tabloid drama energy, wordless pantomime comic, 16:9 landscape. "
    "No real celebrity faces. Keep the top 25% as clean low-detail area."
)

# 万相对正向 prompt 里的「No text」经常无视，负向 prompt 拦截更有效
IMAGE_NEGATIVE_PROMPT = (
    "text, letters, words, numbers, logos, brand marks, watermarks, signage, signs, "
    "banners, posters, subtitles, captions, speech bubbles with text, Chinese characters, "
    "English words, typography, writing, screens with text, whiteboards, blackboards, "
    "documents, newspapers, realistic human photo faces, monochrome, grayscale, black and white"
)

IMAGE_PROMPT_TEMPLATE = "A dramatic gossip comic scene: {gag_en}. " + STYLE_ANCHOR


# ---------------------------------------------------------------- DashScope
class UpstreamError(RuntimeError):
    pass


def _headers(async_task: bool = False) -> dict:
    if not API_KEY:
        raise UpstreamError("DASHSCOPE_API_KEY 未配置，请在 web/.env 中填写")
    h = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}
    if async_task:
        h["X-DashScope-Async"] = "enable"
    return h


def chat(messages: list, enable_search: bool = False) -> str:
    body = {
        "model": TEXT_MODEL,
        "input": {"messages": messages},
        "parameters": {"result_format": "message"},
    }
    if enable_search:
        body["parameters"]["enable_search"] = True
    resp = requests.post(
        f"{BASE_URL}/api/v1/services/aigc/text-generation/generation",
        headers=_headers(), json=body, timeout=180,
    )
    if resp.status_code != 200:
        raise UpstreamError(f"百炼文本接口错误 {resp.status_code}: {resp.text[:300]}")
    return resp.json()["output"]["choices"][0]["message"]["content"]


def text_to_image(prompt: str) -> bytes:
    """创建万相异步任务，轮询到成功后下载图片字节（URL 仅 24h 有效，必须立刻落盘）。"""
    resp = requests.post(
        f"{BASE_URL}/api/v1/services/aigc/text2image/image-synthesis",
        headers=_headers(async_task=True),
        json={
            "model": IMAGE_MODEL,
            "input": {"prompt": prompt, "negative_prompt": IMAGE_NEGATIVE_PROMPT},
            "parameters": {"size": IMAGE_SIZE, "n": 1, "prompt_extend": False, "watermark": False},
        },
        timeout=60,
    )
    if resp.status_code != 200:
        raise UpstreamError(f"百炼生图创建任务失败 {resp.status_code}: {resp.text[:300]}")
    task_id = resp.json()["output"]["task_id"]

    deadline = time.time() + 300
    while time.time() < deadline:
        time.sleep(5)
        poll = requests.get(f"{BASE_URL}/api/v1/tasks/{task_id}", headers=_headers(), timeout=30)
        out = poll.json().get("output", {})
        status = out.get("task_status")
        if status == "SUCCEEDED":
            url = out["results"][0]["url"]
            img = requests.get(url, timeout=120)
            img.raise_for_status()
            return img.content
        if status in ("FAILED", "CANCELED", "UNKNOWN"):
            raise UpstreamError(f"生图任务失败: {json.dumps(out, ensure_ascii=False)[:300]}")
    raise UpstreamError("生图任务超时（5分钟）")


def parse_json_array(raw: str) -> list:
    """模型偶尔会包 markdown 代码块或夹带说明文字，宽松解析。"""
    raw = raw.strip()
    m = re.search(r"```(?:json)?\s*(\[.*?])\s*```", raw, re.S)
    if m:
        raw = m.group(1)
    else:
        start, end = raw.find("["), raw.rfind("]")
        if start != -1 and end > start:
            raw = raw[start : end + 1]
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise UpstreamError(f"模型输出不是合法 JSON: {e}") from e
    if not isinstance(data, list) or not data:
        raise UpstreamError("模型输出为空或不是数组")
    return data


# ---------------------------------------------------------------- 数据存取
def issue_path(day: str) -> Path:
    return ISSUE_DIR / f"{day}.json"


# 老刊没有 poll 字段时的兜底预测题（按瓜度给不同悬念）
FALLBACK_POLLS = {
    1: {"question": "这条会发酵成大瓜吗？", "options": ["会，蹲后续", "就这样了"]},
    2: {"question": "你猜当事方接下来？", "options": ["嘴硬到底", "悄悄改口"]},
    3: {"question": "这瓜还有续集吗？", "options": ["肯定有续集", "到此为止"]},
}


def ensure_polls(issue: dict) -> dict:
    for it in issue.get("items") or []:
        poll = it.get("poll")
        ok = (
            isinstance(poll, dict)
            and poll.get("question")
            and isinstance(poll.get("options"), list)
            and len(poll["options"]) >= 2
        )
        if not ok:
            it["poll"] = dict(FALLBACK_POLLS.get(it.get("melon_level", 1), FALLBACK_POLLS[1]))
        else:
            it["poll"]["options"] = poll["options"][:2]
    return issue


def _fallback_conflict(body: str) -> str:
    """老刊缺 marks.conflict 时，从正文摘一句带戏剧感的短句。"""
    body = (body or "").strip()
    if not body:
        return ""
    for needle in ("翻译成人话：", "翻译成人话:", "这瓜后头肯定还有续集"):
        i = body.find(needle)
        if i != -1:
            chunk = body[i : i + 40]
            stop = re.search(r"[。！？]", chunk)
            return chunk[: stop.end()] if stop else chunk
    parts = re.split(r"[。！？]", body)
    for p in parts:
        p = p.strip()
        if 10 <= len(p) <= 28:
            return p
    return (parts[0] if parts else body)[:22]


def ensure_marks(issue: dict) -> dict:
    for it in issue.get("items") or []:
        marks = it.get("marks") if isinstance(it.get("marks"), dict) else {}
        conflict = (marks.get("conflict") or "").strip()
        if not conflict:
            conflict = _fallback_conflict(it.get("body", ""))
        it["marks"] = {"conflict": conflict}
    return issue


def load_issue(day: str) -> dict:
    p = issue_path(day)
    if not p.exists():
        raise HTTPException(404, f"{day} 还没有出刊")
    return ensure_marks(ensure_polls(json.loads(p.read_text(encoding="utf-8-sig"))))


def save_issue(day: str, issue: dict) -> None:
    """先写临时文件再改名，访客任何时刻读到的都是完整刊。"""
    tmp = issue_path(day).with_suffix(".json.tmp")
    tmp.write_text(json.dumps(issue, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(issue_path(day))


def latest_issue_day() -> str | None:
    days = sorted(p.stem for p in ISSUE_DIR.glob("*.json"))
    return days[-1] if days else None


def resolve_day(day: str) -> str:
    return _date.today().isoformat() if day == "today" else day


# ---------------------------------------------------------------- 投票（现场互动）
# votes.json 结构：{ "<date>": { "<idx>": {"a": 12, "b": 5} } }
VOTES_PATH = DATA_DIR / "votes.json"
_votes_lock = threading.Lock()


def _load_votes() -> dict:
    if not VOTES_PATH.exists():
        return {}
    try:
        return json.loads(VOTES_PATH.read_text(encoding="utf-8"))
    except (ValueError, json.JSONDecodeError):
        return {}


def _save_votes(votes: dict) -> None:
    tmp = VOTES_PATH.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(votes, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(VOTES_PATH)


def _seed_counts(day: str, idx: int, melon_level: int) -> dict:
    """预埋票数：避免 demo 冷启动空榜。按日期+序号做确定性伪随机，瓜度越高基数越大。"""
    h = sum(day.encode()) * 31 + idx * 7
    base = 6 + melon_level * 8            # lv1≈14 / lv2≈22 / lv3≈30
    a = base + (h % 11)
    b = base + ((h // 11) % 9)
    return {"a": a, "b": b}


def _ensure_item_votes(votes: dict, day: str, idx: int, melon_level: int = 1) -> dict:
    day_votes = votes.setdefault(day, {})
    key = str(idx)
    if key not in day_votes:
        day_votes[key] = _seed_counts(day, idx, melon_level)
    return day_votes[key]


def get_issue_votes(day: str) -> dict:
    """某期全部条目的票数（不存在则按该期条目预埋并落盘）。"""
    try:
        issue = load_issue(day)
    except HTTPException:
        return {}
    with _votes_lock:
        votes = _load_votes()
        before = json.dumps(votes.get(day))
        for i, it in enumerate(issue.get("items") or []):
            _ensure_item_votes(votes, day, i, it.get("melon_level", 1))
        if json.dumps(votes.get(day)) != before:
            _save_votes(votes)
        return votes[day]


# ---------------------------------------------------------------- 定时流水线
_pipeline_lock = threading.Lock()
_pipeline_state = {"running": False, "last_error": None, "last_run": None}


def parse_update_times() -> list[tuple[int, int]]:
    times = []
    for part in UPDATE_TIMES.split(","):
        h, m = part.strip().split(":")
        times.append((int(h), int(m)))
    return sorted(times) or [(8, 5), (20, 5)]


def next_update_at(now: datetime | None = None) -> datetime:
    now = now or datetime.now()
    for h, m in parse_update_times():
        cand = now.replace(hour=h, minute=m, second=0, microsecond=0)
        if cand > now:
            return cand
    h, m = parse_update_times()[0]
    return (now + timedelta(days=1)).replace(hour=h, minute=m, second=0, microsecond=0)


def run_pipeline(reason: str) -> None:
    """完整流水线：抓新闻 → 八卦化 → 逐条设计画面梗并生图 → 一次性落盘成刊。"""
    if not _pipeline_lock.acquire(blocking=False):
        log.info("流水线已在运行，跳过本次触发（%s）", reason)
        return
    _pipeline_state["running"] = True
    _pipeline_state["last_error"] = None
    day = _date.today().isoformat()
    try:
        log.info("流水线启动（%s）：搜瓜写瓜……", reason)
        raw = chat(
            [
                {"role": "system", "content": GOSSIP_SYSTEM_PROMPT},
                {"role": "user", "content": NEWS_USER_PROMPT.format(today=day, count=NEWS_COUNT)},
            ],
            enable_search=True,
        )
        items = parse_json_array(raw)[:NEWS_COUNT]
        for i, item in enumerate(items):
            item.setdefault("slug", f"item-{i + 1}")
            item.setdefault("melon_level", 1)
            item["image"] = None

        for i, item in enumerate(items):
            log.info("生图 %d/%d：%s", i + 1, len(items), item.get("title", "")[:30])
            for attempt in (1, 2):
                try:
                    gag_en = chat(
                        [{"role": "user", "content": GAG_DESIGN_PROMPT.format(
                            title=item.get("title", ""),
                            body=item.get("body", ""),
                            scene=item.get("scene", ""),
                        )}]
                    ).strip().strip('"')
                    png = text_to_image(IMAGE_PROMPT_TEMPLATE.format(gag_en=gag_en))
                    filename = f"{day}-{i + 1:02d}-{item['slug']}-single-manga.png"
                    (IMAGE_DIR / filename).write_bytes(png)
                    item["image"] = filename
                    break
                except Exception as e:  # noqa: BLE001 — 单图失败不拖垮整刊
                    log.warning("第 %d 条生图第 %d 次失败：%s", i + 1, attempt, e)

        issue = ensure_marks(ensure_polls({
            "date": day,
            "mode": "轻八卦模式·独立成篇",
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "items": items,
        }))
        save_issue(day, issue)
        _pipeline_state["last_run"] = issue["generated_at"]
        log.info("出刊完成：%s（%d 条，%d 张图）",
                 day, len(items), sum(1 for x in items if x["image"]))
    except Exception as e:  # noqa: BLE001 — 记录错误，等下个周期或重试
        _pipeline_state["last_error"] = str(e)
        log.error("流水线失败：%s", e)
        raise
    finally:
        _pipeline_state["running"] = False
        _pipeline_lock.release()


def run_pipeline_with_retry(reason: str, retries: int = 3, wait: int = 600) -> None:
    for attempt in range(1, retries + 1):
        try:
            run_pipeline(f"{reason}#{attempt}")
            return
        except Exception:  # noqa: BLE001
            if attempt < retries:
                log.info("%d 秒后重试（%d/%d）", wait, attempt, retries)
                time.sleep(wait)


def issue_is_stale() -> bool:
    day = latest_issue_day()
    if day is None:
        return True
    try:
        issue = json.loads(issue_path(day).read_text(encoding="utf-8"))
        generated = datetime.fromisoformat(issue.get("generated_at", f"{day}T00:00:00"))
    except (ValueError, json.JSONDecodeError):
        return True
    return datetime.now() - generated > timedelta(hours=12)


def scheduler_loop() -> None:
    if issue_is_stale():
        log.info("最新一期缺失或已超过 12 小时，启动补跑")
        run_pipeline_with_retry("startup")
    while True:
        nxt = next_update_at()
        log.info("下次定时出刊：%s", nxt)
        while datetime.now() < nxt:
            time.sleep(20)
        run_pipeline_with_retry("scheduled")


@app.on_event("startup")
def start_scheduler():
    threading.Thread(target=scheduler_loop, daemon=True, name="gossip-scheduler").start()


# ---------------------------------------------------------------- API（对访客只读）
@app.get("/api/issues")
def list_issues():
    """往期归档：按日期倒序列出已出刊期次（不含正文，只返回元信息）。"""
    days = sorted((p.stem for p in ISSUE_DIR.glob("*.json")), reverse=True)
    out = []
    for day in days:
        try:
            issue = load_issue(day)
        except HTTPException:
            continue
        out.append({
            "date": day,
            "generated_at": issue.get("generated_at"),
            "item_count": len(issue.get("items") or []),
            "mode": issue.get("mode"),
        })
    return {"issues": out}


@app.get("/api/issues/latest")
def get_latest_issue():
    day = latest_issue_day()
    if day is None:
        raise HTTPException(404, "第一期还在印刷中")
    return load_issue(day)


@app.get("/api/issues/{day}")
def get_issue(day: str):
    return load_issue(resolve_day(day))


@app.get("/api/public-config")
def public_config():
    """前端可读的公开配置（不含密钥）。用于注入 GA 等统计。"""
    return {"gaMeasurementId": GA_MEASUREMENT_ID}


@app.get("/api/status")
def get_status():
    return {
        "latest": latest_issue_day(),
        "generating": _pipeline_state["running"],
        "last_run": _pipeline_state["last_run"],
        "last_error": _pipeline_state["last_error"],
        "next_update": next_update_at().isoformat(timespec="minutes"),
        "update_times": UPDATE_TIMES,
    }


@app.get("/api/votes/top")
def get_top_votes(days: int = 7, limit: int = 3):
    """「本周最熟的瓜」：近 N 天按总票数排序的条目榜单。"""
    votes = _load_votes()
    cutoff = (_date.today() - timedelta(days=days)).isoformat()
    ranked = []
    for day in sorted(votes, reverse=True):
        if day < cutoff:
            continue
        try:
            issue = load_issue(day)
        except HTTPException:
            continue
        items = issue.get("items") or []
        for key, cnt in votes[day].items():
            idx = int(key)
            if idx >= len(items):
                continue
            total = cnt.get("a", 0) + cnt.get("b", 0)
            it = items[idx]
            ranked.append({
                "date": day,
                "idx": idx,
                "title": it.get("title"),
                "hook": it.get("hook"),
                "melon_level": it.get("melon_level", 1),
                "total": total,
                "a": cnt.get("a", 0),
                "b": cnt.get("b", 0),
                "poll": it.get("poll"),
            })
    ranked.sort(key=lambda x: x["total"], reverse=True)
    return {"days": days, "top": ranked[:limit]}


@app.get("/api/votes/{day}")
def get_votes(day: str):
    """某期全部条目票数（供卡片钩子和详情页初始分布）。"""
    day = resolve_day(day)
    return {"date": day, "votes": get_issue_votes(day)}


@app.post("/api/vote")
def cast_vote(payload: dict):
    """投一票：{date, idx, choice: 'a'|'b'}。防重复交给前端 localStorage，demo 阶段够用。"""
    day = str(payload.get("date", ""))
    idx = payload.get("idx")
    choice = payload.get("choice")
    if choice not in ("a", "b") or not isinstance(idx, int) or idx < 0:
        raise HTTPException(400, "参数不对：需要 date / idx(int) / choice('a'|'b')")
    issue = load_issue(day)  # 不存在的期次直接 404
    items = issue.get("items") or []
    if idx >= len(items):
        raise HTTPException(404, f"{day} 第 {idx} 条不存在")
    with _votes_lock:
        votes = _load_votes()
        cnt = _ensure_item_votes(votes, day, idx, items[idx].get("melon_level", 1))
        cnt[choice] += 1
        _save_votes(votes)
    total = cnt["a"] + cnt["b"]
    return {"date": day, "idx": idx, "a": cnt["a"], "b": cnt["b"], "total": total}


@app.post("/api/ask")
def ask_about_news(payload: dict, request: Request):
    """基于当前新闻回答术语和背景问题，百炼密钥始终只在服务端使用。"""
    client = request.client.host if request.client else "unknown"
    now = time.time()
    with _ask_rate_lock:
        recent = [t for t in _ask_rate.get(client, []) if now - t < 60]
        if len(recent) >= 20:
            raise HTTPException(429, "问得太快了，休息一分钟再继续")
        recent.append(now)
        _ask_rate[client] = recent

    question = str(payload.get("question", "")).strip()
    article = payload.get("article") or {}
    history = payload.get("history") or []
    if not question:
        raise HTTPException(400, "先写下你想问的问题")
    if len(question) > 500:
        raise HTTPException(400, "问题太长了，请控制在 500 字以内")
    if not isinstance(article, dict) or not article.get("title"):
        raise HTTPException(400, "缺少当前新闻上下文")

    safe_history = []
    if isinstance(history, list):
        for msg in history[-6:]:
            if not isinstance(msg, dict) or msg.get("role") not in ("user", "assistant"):
                continue
            content = str(msg.get("content", "")).strip()[:1500]
            if content:
                safe_history.append({"role": msg["role"], "content": content})

    context = {
        "title": str(article.get("title", ""))[:300],
        "body": str(article.get("body", ""))[:5000],
        "hook": str(article.get("hook", ""))[:500],
        "characters": article.get("characters", [])[:12] if isinstance(article.get("characters"), list) else [],
        "source_title": str(article.get("source_title", ""))[:300],
        "source_url": str(article.get("source_url", ""))[:1000],
    }
    system = """你是 AI 八卦特刊的随读问答助手。读者正在看一条 AI 新闻，可能不懂术语、公司、产品或行业背景。
回答规则：
1. 先用一句最直白的话回答，再补充必要背景。
2. 默认控制在 180 个汉字以内；复杂问题可分 2-4 个短点。
3. 优先依据提供的新闻上下文。上下文没有明确写的内容，要说“这条新闻没有说明”，不要编造数字、引语或动机。
4. 解释术语时必须说明“它与这条新闻有什么关系”。
5. 口吻友好、清楚，可以轻松，但不要硬凹梗，不用婚恋或性别隐喻。
6. 不使用 markdown 表格，不以“作为 AI”开头。"""
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": "当前新闻上下文：\n" + json.dumps(context, ensure_ascii=False)},
        {"role": "assistant", "content": "收到，我会只围绕这条新闻和必要的通用背景解释。"},
        *safe_history,
        {"role": "user", "content": question},
    ]
    try:
        answer = chat(messages, enable_search=False).strip()
    except UpstreamError as exc:
        log.warning("随读问答失败: %s", exc)
        raise HTTPException(502, "问答助手暂时没接上百炼，请稍后再试") from exc
    return {"answer": answer, "model": TEXT_MODEL}


@app.post("/api/admin/rebuild")
def admin_rebuild(token: str = ""):
    """隐藏入口：强制重跑整条流水线（后台执行，立即返回）。"""
    if token != ADMIN_TOKEN:
        raise HTTPException(403, "token 不对")
    if _pipeline_state["running"]:
        return {"ok": False, "msg": "流水线正在运行中"}
    threading.Thread(target=run_pipeline, args=("admin",), daemon=True).start()
    return {"ok": True, "msg": "已在后台开跑，完成后 /api/issues/latest 自动更新"}


# ---------------------------------------------------------------- 静态资源
@app.middleware("http")
async def cache_policy(request: Request, call_next):
    """避免把短暂的 404（例如尚未同步的漫画）缓存进 CDN，导致修好后仍看不到图。"""
    response = await call_next(request)
    if response.status_code >= 400:
        response.headers["Cache-Control"] = "no-store"
    elif request.url.path.startswith("/images/"):
        # 漫画文件名含日期/slug，可较长缓存；前端仍带 ?v=date 便于主动刷新
        response.headers.setdefault("Cache-Control", "public, max-age=86400")
    return response


app.mount("/images", StaticFiles(directory=IMAGE_DIR), name="images")

# 编辑部传播入口（repo/entry）→ /entry/ ，与特刊同源，便于内网穿透只开一条隧道
ENTRY_DIR = ROOT.parent / "entry"
if ENTRY_DIR.is_dir():
    app.mount("/entry", StaticFiles(directory=ENTRY_DIR, html=True), name="entry")


@app.get("/")
def index():
    return FileResponse(ROOT / "static" / "index.html")


app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")
