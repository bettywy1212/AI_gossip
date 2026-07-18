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
| GET | `/api/issues/latest` | 最新一期成刊 |
| GET | `/api/issues/{date}` | 读某日刊（`today` 可作别名） |
| GET | `/api/status` | 流水线状态 / 下期出刊时间 |
| POST | `/api/admin/rebuild?token=<ADMIN_TOKEN>` | 隐藏入口：强制立即重跑一期（后台执行） |

## 与 skill 的关系

- 写作规则浓缩自 `SKILL.md` + `references/writing-patterns.md`（轻八卦模式·独立成篇 + 全部红线），并按「更劲爆」目标强化：场景钩子开场、时间线捋瓜、算盘拆解、主编毒舌收尾、瓜度分级控制用力程度，见 `server.py` 中 `GOSSIP_SYSTEM_PROMPT`
- 生图两步走：先让 LLM 当「漫画导演」把瓜设计成一个夸张狗血的画面梗（英文+匿名化，`GAG_DESIGN_PROMPT`），再套强化版轻漫画锚点（聚光灯、吃瓜群众、夸张肢体，`STYLE_ANCHOR`）
- 画面禁文字、顶部留净空的规则保留（后续可接 `scripts/overlay-text.ps1` 叠字）

## 已知取舍

- 每条只生 1 张图（skill 的「3 张抽卡选 1」留待下一版）
- 未叠中文标题（叠字脚本是 Windows PowerShell，可手动跑）
- 定时用后台线程而非系统级 cron：服务器进程需常驻；关机期间错过的刊次由启动补跑兜底
