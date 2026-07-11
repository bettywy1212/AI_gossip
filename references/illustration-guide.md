# AI 八卦特刊 · 配图指南

出图前走一遍本页：判定类型 → 选格式与风格 → 写 brief → 生纯画面 → 附叠字建议。

---

## 已定标准速查

| 维度 | 规则 |
|------|------|
| 风格 | 日常 → **轻漫画**；争议 → **复古海报** |
| 文字 | **纯画面 + 后期叠字**（生图 prompt 不写中文） |
| 格式 | 按新闻类型：单格 / 双格 / 三格 |
| 范围 | 按新闻类型：一图一爆点 / 概括全文 |

---

## Step 1：判定新闻类型

每条 news 先打两个标签：**风格类** + **叙事类**。

### 风格类（决定画风）

| 标签 | 判定信号 | 画风 |
|------|----------|------|
| **日常** | 发布、升级、促销、竞品卡位、功能上线 | 轻漫画 |
| **争议** | 隐私、伦理、监管摩擦、安全丑闻、用户权益受损 | 复古海报 |

拿不准时：只要涉及「用户没同意就被怎样」「监管/法律在磨刀」「安全机构皱眉」→ 争议。

### 叙事类（决定格式 + 画面范围）

| 标签 | 判定信号 | 格式 | 画面范围 |
|------|----------|------|----------|
| **单一爆点** | 一个动作、一句就能说完 | 单格 | 一图一爆点 |
| **铺垫反转** | 前后对比、竞品跟进、等了很久终于… | 双格 | 一图一爆点 |
| **多线叙事** | 多档产品、审批流程、时间线 3 步以上 | 三格 | 概括全文 |

**组合示例（7 月 9 日 batch）**：

| News | 风格 | 叙事 | 格式 | 范围 |
|------|------|------|------|------|
| GPT-5.6 全面开放 | 日常 | 铺垫反转 | 双格 | 概括全文 |
| GPT-Live 语音 | 日常 | 单一爆点 | 单格 | 一图一爆点 |
| Fable 5 促销延期 | 日常 | 铺垫反转 | 双格 | 一图一爆点 |
| Muse Image @人出图 | 争议 | 多线叙事 | 三格 | 概括全文 |
| Google 限 Meta 算力 | 日常 | 铺垫反转 | 双格 | 一图一爆点 |

---

## Step 2：提取 visual brief（三要素）

从每条 news 正文提取：

1. **主体**：公司 / 产品 / 具名人物（不出现真实 CEO 肖像）
2. **爆点**：画面要抓的唯一瞬间或叙事弧
3. **情绪**：狂喜 / 尴尬 / 打脸 / 紧张 / 吃瓜

### brief 模板

```
News: {标题}
风格: 轻漫画 | 复古海报
格式: 单格 | 双格 | 三格
范围: 一图一爆点 | 概括全文
主体: {公司/产品}
爆点: {一句话}
情绪: {一个词}

画面描述（无文字）:
- 格1: ...
- 格2: ...（如有）
- 格3: ...（如有）

叠字建议（后期叠加，不写入生图 prompt）:
- 主标题: ...
- 格1旁白: ...
- 格2旁白: ...
```

---

## Step 3：生图 prompt 规则

### 必须

- 16:9 横版
- 明确格式：single-panel / two-panel / three-panel comic strip
- 明确风格：light manga gossip style **或** retro Chinese screen-print poster style
- 画面元素、角色动作、色彩情绪
- 结尾加：**No text, no speech bubbles, no letters, no Chinese characters in the image. Leave clean areas for text overlay later.**

### 禁止

- 中文、英文标题、对话气泡文字
- 真实 CEO / 名人肖像
- 婚嫁隐喻画面（花轿、婚纱、小三撕扯等）

### 轻漫画 prompt 关键词

`light manga comic style, cheerful exaggerated expressions, clean lines, Chinese tech gossip tone, cartoon developers and robot mascots, no text`

### 复古海报 prompt 关键词

`retro screen-print poster style, high contrast black background fluorescent accent colors, bold composition with empty space for headline overlay, grain texture, no text`

---

## Step 4：自动叠字（无需用户确认）

生图完成后，写入当批 `overlay-config.json`，运行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/overlay-text.ps1 -ConfigPath "assets/issues/{日期}/overlay-config.json"
```

叠字规范：

| 位置 | 字数 | 内容 |
|------|------|------|
| 主标题 | ≤15 字 | 新闻标题精简版 |
| 格旁白 | 每格 ≤8 字 | 格1 铺垫 / 格2 转折 / 格3 收尾 |
| 副标 | 可选 | 日期、产品名 |

争议海报风：标题用荧光绿，格旁白用黄色；日常轻漫画：白字 + 黑底半透明条。

---

## Step 5：文件命名与存放

```
assets/issues/{YYYY-MM-DD}/{序号}-{slug}-{single|two|three}-{manga|poster}.png
```

例：`assets/issues/2026-07-09/01-gpt56-two-manga.png`

---

## 画面构图参考（按格式）

### 单格 · 一图一爆点

一个动作定格。例：闸机升起三模型挥手；语音波形+插嘴手势。

### 双格 · 铺垫反转

| 格 | 画什么 |
|----|--------|
| 1 | 限制/等待/对手领先 |
| 2 | 释放/反击/全面开放 |

### 三格 · 概括全文

| 格 | 画什么 |
|----|--------|
| 1 | 背景/预审/争议起因 |
| 2 | 核心动作/产品亮相 |
| 3 | 后果/用户影响/punchline 留白区 |

---

## 风格样例索引

探索样例见 [assets/style-exploration/](../assets/style-exploration/index.md)。正式出刊以本指南为准：样例中的图中文字仅作构图参考，正式流程用纯画面+叠字。
