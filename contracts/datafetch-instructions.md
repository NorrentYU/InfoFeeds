# datafetch-instructions

## 0. 角色与边界
- 架构师 agent：制定方案、冻结接口、验收关卡、处理阻塞。
- 开发 agent：只做实现，不改需求、不改合同。
- 测试 agent：只做验证，不补需求、不替代开发修设计。

## 1. 总体架构方案（先设计后开发）

### 1.1 分层设计（由上到下）
1. Source Adapter Layer（渠道适配层）
   - Telegram 适配器
   - Substack 适配器
   - YouTube 适配器
   - X For You 适配器（登录个人账号后抓取个性化推送）
   - Others 适配器
2. Normalize Layer（统一清洗层）
   - 统一字段：`source_type/source_name/title/content/url/published_at/fetched_at`
3. Summarize Layer（总结层）
   - 使用用户自定义 prompt 进行摘要生成
4. Digest Compose Layer（编排层）
   - 按固定 markdown 模板聚合
5. Delivery Layer（导出层）
   - PDF 生成
   - 本地落盘
6. Scheduler + Settings Layer（配置与调度层）
   - 信息源管理
   - 推送时间/频次管理
   - 时间窗口管理（默认 24h）

### 1.2 固定接口契约
- 渠道适配器输出必须是统一中间结构（Normalize Layer 输入）。
- Summarize Layer 只接收正文文本，不接收“拦截页/验证码页”。
- Compose Layer 只消费“已验证有效摘要”的数据。
- X 渠道固定来源为“登录后 For You 流”，不读取 `sourceList.md` 的 X 列表。
- X 渠道认证固定为“CDP 直连专用已登录 Chrome 优先 -> 本地会话复用 -> 密码/人工接管兜底”，定时任务不反复密码登录。
- X 渠道运行在独立专用浏览器 profile 中，避免与用户日常浏览器环境相互污染。
- Others 渠道抓取主路径固定为 RSS `/feed`，实现与 Substack 方案同构。

## 2. 开发执行顺序（不可跳步）

### Phase A：架构冻结
1. 冻结统一字段与 markdown 输出模板。
2. 冻结错误码与失败处理策略（抓取失败、正文为空、反爬拦截）。
3. 冻结测试口径（Telegram/Substack/YouTube/Others 为 2 源；X 为 For You 前 5 条；非 X 默认 24h 窗口；格式校验；有效性校验）。

### Phase B：按渠道横向开发 + 测试（一个渠道完成后再下一个）
1. Telegram：开发 -> 测试 -> 修复 -> 回归 -> 验收
2. Substack：开发 -> 测试 -> 修复 -> 回归 -> 验收
3. YouTube：开发 -> 测试 -> 修复 -> 回归 -> 验收
4. X：开发 -> 测试 -> 修复 -> 回归 -> 验收
5. Others：开发 -> 测试 -> 修复 -> 回归 -> 验收

### Phase C：跨层耦合集成
1. 进入聚合层开发与测试（执行 `contracts/aggregation-execution.md`）。
2. 将 Phase B 产物接入 Normalize/Summarize/Compose。
3. 执行端到端链路测试：抓取 -> 摘要 -> markdown -> PDF -> 投递。
4. 对调度与前端设置页面做联调回归。

## 3. 渠道模块 Task Contract（开发 agent）

### 3.1 输入
- Telegram/Substack/YouTube/Others：`sourceList.md` 中该渠道的信息源列表。
- X：`.env` 中的登录凭证（只读使用，不输出，作为兜底路径）。
- X：CDP 连接端点（默认 `http://127.0.0.1:9222`）与专用浏览器 profile。
- X：本地会话状态存储（持久化复用）。
- 默认时间窗口：最近 24h。
- YouTube 专项时间窗口：默认 `T-48h ~ T-24h`。
- X 专项抓取数量：测试 5 条，生产 20 条（不按时间窗口筛选）。
- 用户 prompt（可配置）。

### 3.2 输出
- 标准化内容列表（每条包含正文、来源、原链接、时间）。
- 失败记录（若有）包含失败原因和原始证据。

### 3.3 完成标准
1. 渠道抓取成功率达到可用（2 个测试源都能稳定产出或有明确“无更新”证据）。
2. Telegram 外链消息优先抓外链正文；无外链但消息正文有效时可降级入库（`url` 置空并留痕），禁止把 tg 消息壳链接当原文链接。
3. 对反爬/验证码页面有识别逻辑并中止摘要。
4. X 渠道能读取 For You 流，测试阶段成功抓取前 5 条；生产阶段可抓取前 20 条并进入摘要链路。
5. X 渠道 `x:cdp-smoke` 验证通过（可直连专用已登录 Chrome 并拿到前 5 条）。
6. X 渠道支持挑战场景的人机接管，并能在接管后复用会话完成后续抓取。
7. X 渠道支持 stale feed 自动刷新重试（最多 3 次）并输出明确结论。

### 3.4 禁止事项
- 不得擅自变更字段结构。
- 不得绕过有效性校验直接输出摘要。
- 不得以拦截页文本充当正文。
- 不得打印、回传、持久化明文账号密码。

## 4. 渠道模块 Task Contract（测试 agent）

### 4.1 固定测试源（减少决策）
- Telegram：`https://t.me/cookiesreads`、`https://t.me/web3list`
- Substack：`https://www.systematiclongshort.com/`、`https://www.astralcodexten.com/`
- YouTube：`https://www.youtube.com/@PeterYangYT`、`https://www.youtube.com/@Messari`
- Others：`https://every.to/chain-of-thought/`、`https://every.to/napkin-math/`
- X：优先使用 CDP 直连专用已登录 Chrome 抓取 For You 前 5 条（测试口径）；会话/凭证路径仅作兜底

### 4.2 测试用例（每渠道一致）
1. 抓取有效更新（非 X 默认 24h；X 按 For You 前 N 条）。
2. 校验原链接是否为原文链接而非中转链接。
3. 校验摘要是否表达正文核心，不含拦截页话术。
4. 校验 markdown 区块格式是否符合模板。
5. 校验 PDF 渲染后内容完整、段落顺序正确。
6. X 专项：确认抓取的是 For You 个性化流，不是 Following 流或搜索结果页。
7. X 专项：测试时仅验证前 5 条；若遇 2FA/CAPTCHA/风控挑战，必须标记阻塞并附证据，不得跳过。
8. YouTube 专项：测试时不校验时间窗口，每个测试源仅验证其最新视频的 transcript；仅执行字幕提取路径，无字幕则标记 `transcript_missing`。
9. X 专项：先执行 CDP 烟雾测试（`x:cdp-smoke`），再验证会话复用与人工接管流程可用。
10. Others 专项：按 `<source>/feed` 读取 RSS；仅当 `/feed` 不可用且有阻塞证据时才允许升级备选策略。

### 4.3 通过标准
- Telegram/Substack/YouTube/Others：2 个测试源全部通过“通用用例 + 对应渠道专项用例”。
- X：For You 前 5 条全部通过通用用例 + X 专项用例，且生产口径前 20 条可执行。
- 渠道报告中包含：源或抓取范围、时间窗口或抓取条数、样例链接、摘要结果、失败重试记录。

## 5. 聚合层 Task Contract（开发 + 测试）
1. 开发执行：`contracts/tasks/aggregation-dev-task.md`。
2. 测试执行：`contracts/tasks/aggregation-test-task.md`。
3. 默认摘要 prompt：`contracts/prompts/default-summary-prompt.md`。
4. 聚合层必须输出三件套：`digest-*.md`、`digest-*.pdf`、`digest-*.manifest.json`。
5. 聚合层必须执行二次正文有效性校验与跨渠道 URL 去重。
6. 摘要失败条目必须留痕到 manifest，不得伪造成功摘要。
7. 聚合层默认 LLM provider 为 OpenAI 兼容接口（读取 `LLM_API_KEY` + `LLM_API_URL` + `LLM_MODEL`）；Anthropic 为兜底（读取 `ANTHROPIC_API_KEY` + `ANTHROPIC_MODEL`）。兼容保留 `OPENAI_*` / `BAILIAN_*` 旧变量。

## 6. 输出格式模板（必须严格一致）
```markdown
信息集会

xxxx年x月x日星期x，xx:xx

Telegram

[Telegram频道1]
xxxxxxxx（内容总结）
原链接：xxxxx（原文链接；若无外链降级则填 `N/A`）

[Telegram频道2]
xxxxxxxx（内容总结）
原链接：xxxxx（原文链接；若无外链降级则填 `N/A`）

X
xxxxxxx（内容总结）
原链接：xxxxx（优先外链原文；无外链时为原推文链接）

Substack

[订阅账号1]
xxxxxxx（内容总结）
原链接：xxxxx（原substack链接）

Youtube
[订阅频道1]
xxxxxxx（视频内容总结）
原链接：xxxxx（原视频链接）

其他
[newsletter1]
xxxxxxx（内容总结）
原链接：xxxxx（原文链接）
```

## 7. 前端管理页最小可用范围（MVP）
1. 信息源管理：新增/删除/启停。
2. 调度设置：时间、频次、时区（默认 UTC+8 08:30）。
3. 时间窗口设置：默认 24h。
4. Prompt 设置：可编辑并保存。

## 8. 会话终止规则
- 终止前必须对照 `contracts/datafetch-contracts.md` 全量打勾。
- 任一渠道或聚合层未完成，均不得终止会话。
