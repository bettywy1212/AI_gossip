# AI 八卦特刊 · Web

像素杂志风前端 + FastAPI 后端 + 百炼（DashScope）API 的全自动八卦刊物：

**后台每 12 小时自动跑完整条流水线（qwen 联网抓 5 条 AI 新闻 → 按 ai-gossip skill 规则八卦化 → 万相逐条生成轻漫画）→ 一次性出刊落盘 → 前端只展示成品，访客看不到任何生成过程**

## 启动

1. 填 API key：编辑 `web/.env`，把百炼 API Key 填进 `DASHSCOPE_API_KEY=`
   （其余配置已填好默认值）

2. 装依赖（本机已有可跳过）：

   ```
   pip install -r web/requirements.txt
   ```

3. 启动：

   ```
   cd web
   uvicorn server:app --port 8000
   ```

4. 打开 http://localhost:8000

## 团队共建：让异地伙伴也能看到效果

> **注意**：`http://127.0.0.1:8000` 只有你本机能打开。GitHub 仓库地址是  
> **https://github.com/bettywy1212/AI_gossip**（不是 localhost 链接）。

### 方案 A · 最快（推荐 demo）：内网穿透，2 分钟出公网链接

你本机保持 `uvicorn` 运行，另开一个终端：

```powershell
# 若未安装：winget install Cloudflare.cloudflared
cloudflared tunnel --url http://127.0.0.1:8000
```

终端会打印一行 `https://xxxx.trycloudflare.com`，**把这个链接发给队友**即可——他们浏览器打开就能看到完整效果（投票、主题、榜单都在）。

- 优点：零部署、立刻可看、数据就是你本机这期
- 缺点：你电脑要开着、关终端链接就失效（黑客松 demo 够用）

### 方案 B · 共建代码：推 GitHub，队友本地跑

1. 你先把改动 push 到 https://github.com/bettywy1212/AI_gossip  
2. 队友：

   ```bash
   git clone https://github.com/bettywy1212/AI_gossip.git
   cd AI_gossip/web
   pip install -r requirements.txt
   copy .env.example .env   # Windows；Mac/Linux 用 cp
   uvicorn server:app --port 8000
   ```

3. **重要**：`.gitignore` 忽略了 `web/data/`（刊物 JSON + 漫画图），clone 下来默认是空刊。任选其一：
   - **省事**：你 zip 整个 `web/data/` 文件夹发群，他们解压到 `web/data/`
   - **长期**：把 demo 数据也 commit 进仓库（见下方「可选：提交 demo 数据」）

### 方案 C · 长期公网（黑客松后）：部署到云

需要 7×24 在线时用 Render / Railway / 阿里云等，把 `web/` 作为 Python 服务部署；`.env` 里填 API Key，数据目录挂载持久盘。比 A/B 多一步，适合正式对外。

### 可选：提交 demo 数据进 GitHub

若希望 clone 即有内容，可在 `.gitignore` 里对 demo 期次放行，或单独建 `web/data-demo/` 并在 README 说明复制到 `web/data/`。

## v1.1（页面能力）

- **测测我**（`#/quiz`）：四题读者类型倾向测试 → 推荐主题与读法并本地记忆
- **单条竖屏分享图**：详情页「下载分享图」（漫画 + 标题 + 一句话吃瓜）
- **轻量新闻标记**：当事方下划线、数字圈示、冲突句高亮；过载型自动降噪

刻意不做：送报定制特刊、20 条纯文本加餐、整刊长图（易冲产品调性、加重选择负担）。

## 定时机制

- `UPDATE_TIMES=08:05,20:05`（`.env` 可改）：早刊收割美国公司夜里放的大招、赶早高峰；晚刊收割国内/欧洲白天的新闻、赶晚间刷手机高峰
- 服务启动时若最新一期缺失或已超过 12 小时，立即补跑一期
- 流水线失败自动重试 3 次（间隔 10 分钟）；单条生图失败不拖垮整刊（该条无图，下期补）
- 出刊 JSON 先写临时文件再原子改名，访客任何时刻读到的都是完整刊

## 结构

```
web/
├── server.py           # FastAPI + 后台定时流水线（文字+生图一步跑完）
├── .env                # 配置（填 DASHSCOPE_API_KEY）
├── requirements.txt
├── static/             # 像素杂志风前端（无构建，纯 HTML/CSS/JS）
│   ├── index.html
│   ├── style.css
│   └── app.js
└── data/               # 运行时生成
    ├── issues/{日期}.json   # 每日刊物（结构化落盘）
    └── images/              # 生成的漫画 PNG（万相 URL 只活 24h，已即时落盘）
```

## API（对访客只读）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/issues` | 往期列表（日期 / 条数 / 出刊时间） |
| GET | `/api/issues/latest` | 最新一期成刊 |
| GET | `/api/issues/{date}` | 读某日刊（`today` 可作别名） |
| GET | `/api/status` | 流水线状态 / 下期出刊时间 |
| POST | `/api/ask` | 基于当前新闻上下文调用百炼进行随读问答 |
| POST | `/api/admin/rebuild?token=<ADMIN_TOKEN>` | 隐藏入口：强制立即重跑一期（后台执行） |

## 与 skill 的关系

- 写作规则浓缩自 `SKILL.md` + `references/writing-patterns.md`（轻八卦模式·独立成篇 + 全部红线），并按「更劲爆」目标强化：场景钩子开场、时间线捋瓜、算盘拆解、主编毒舌收尾、瓜度分级控制用力程度，见 `server.py` 中 `GOSSIP_SYSTEM_PROMPT`
- 生图两步走：先让 LLM 当「漫画导演」把瓜设计成一个夸张狗血的画面梗（英文+匿名化，`GAG_DESIGN_PROMPT`），再套强化版轻漫画锚点（聚光灯、吃瓜群众、夸张肢体，`STYLE_ANCHOR`）
- 画面禁文字、顶部留净空的规则保留（后续可接 `scripts/overlay-text.ps1` 叠字）

## 已知取舍

- 每条只生 1 张图（skill 的「3 张抽卡选 1」留待下一版）
- 未叠中文标题（叠字脚本是 Windows PowerShell，可手动跑）
- 定时用后台线程而非系统级 cron：服务器进程需常驻；关机期间错过的刊次由启动补跑兜底
