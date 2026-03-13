# Aggregation Layer Execution Pack

## 1. 模块目标
将 Telegram/Substack/YouTube/X/Others 的标准化记录统一清洗、去重、调用 AI 摘要，并按固定模板聚合为 Markdown 与 PDF。

## 2. 模块范围
1. 本轮只做聚合层（Normalize + Summarize + Compose + PDF），不改各渠道抓取器。
2. 输入仅接收各渠道既有统一字段：`source_type/source_name/title/content/url/published_at/fetched_at`。
3. 摘要默认使用 `contracts/prompts/default-summary-prompt.md`；用户自定义 prompt 作为附加约束拼接。
4. 非 X 渠道遵循时间窗口过滤（默认 24h）；X 渠道遵循“前 N 条（测试 5 / 生产 20）”。
5. 摘要执行策略固定为：先全量提取并合并 -> 二次校验与跨渠道去重 -> 并发摘要（禁止边提取边摘要）。

## 3. 开发单（给开发 agent）
开发 agent 执行文件：`contracts/tasks/aggregation-dev-task.md`

### 3.1 输入
1. 各渠道抓取结果（records + failures）。
2. 调度参数：时区（默认 UTC+8）、推送时间（默认 08:30）、窗口（默认 24h）。
3. 用户自定义 prompt（可为空）。
4. 默认 prompt 文件：`contracts/prompts/default-summary-prompt.md`。
5. LLM 配置：默认使用 OpenAI 兼容接口，读取 `LLM_API_KEY`（必填）、`LLM_API_URL`（可选，默认 `https://api.openai.com/v1`，支持 `.../v1`、完整 `.../chat/completions` 或完整 `.../responses`）、`LLM_MODEL`（可选）；Anthropic 为可选兜底，读取 `ANTHROPIC_API_KEY`、`ANTHROPIC_MODEL`、`ANTHROPIC_BASE_URL`（可选）与 `ANTHROPIC_VERSION`（可选）。兼容保留 `OPENAI_*` / `BAILIAN_*` 旧变量。

### 3.2 实现任务
1. 汇总 5 个渠道 records，按渠道顺序处理：Telegram -> X -> Substack -> Youtube -> 其他。
2. 做二次正文有效性校验（聚合层兜底）：
   - 拦截 CAPTCHA/风控/登录页文案
   - 过滤明显无正文项
3. 统一 URL 规范化并跨渠道去重（同一 canonical URL 只保留 1 条最佳记录）。
4. 构建摘要输入（标题、正文、来源、时间、原链接），调用 LLM 生成中文摘要。
   - 默认 provider：OpenAI 兼容接口。
5. 摘要失败重试（最多 2 次）；仍失败则记录失败并跳过该条，不污染成功输出。
6. 将摘要结果写入目标 markdown 模板并生成 PDF。
   - 若某条 `url` 为空（Telegram 无外链降级），固定渲染为 `原链接：N/A（无外链）`。
7. 产出聚合执行清单（manifest）：记录输入条数、去重条数、摘要成功/失败、输出文件路径。

### 3.3 禁止事项
1. 不得修改渠道层已冻结字段名。
2. 不得把失败条目写成“成功摘要”。
3. 不得把拦截页文案送入 LLM 生成摘要。
4. 不得改变最终 markdown 顶层结构与分节顺序。

### 3.4 交付物
1. 聚合层代码（`src/aggregate/`）与测试（`tests/aggregate/`）。
2. `REPORT_OUTPUT_DIR/digest-<timestamp>.md`。
3. `REPORT_OUTPUT_DIR/digest-<timestamp>.pdf`。
4. `REPORT_OUTPUT_DIR/digest-<timestamp>.manifest.json`。

## 4. 测试单（给测试 agent）
测试 agent 执行文件：`contracts/tasks/aggregation-test-task.md`

### 4.1 通用用例
1. 能正确读取 5 个渠道输入并完成合并。
2. 能过滤无效正文并保留失败证据。
3. 能执行跨渠道去重（同 URL 不重复出现在最终报告）。
4. 摘要输出符合 prompt 格式（标题 + 段落，不含列表）。
5. markdown 模板结构、分节顺序、原链接字段完整。
6. PDF 可打开且内容与 markdown 一致。

### 4.2 聚合层专项用例
1. 用户自定义 prompt 为空时，默认 prompt 生效。
2. 用户自定义 prompt 存在时，默认 prompt + 用户 prompt 可共同生效。
3. 单条摘要失败不会阻断整体出报，但必须记录在 manifest。
4. X 渠道测试口径（前 5 条）与生产口径（前 20 条）能被正确渲染到 X 分节。

### 4.3 通过标准
1. 所有用例通过。
2. 无 P0/P1 未关闭缺陷。
3. 报告与 manifest 证据完整可追溯。

## 5. 验收闸门（架构师）
1. 聚合层交付物齐全且符合契约。
2. 聚合层测试报告通过且证据完整。
3. 端到端链路（抓取 -> 摘要 -> markdown -> PDF -> 投递）成功一次。

## 6. 阻塞升级
1. LLM 调用连续失败导致摘要成功率低于 90%：升级架构师。
2. markdown 与 PDF 内容不一致：升级架构师。
3. 去重策略导致误删关键条目：升级架构师冻结新规则后再继续。
