# Task Contract: Aggregation Dev

## 任务目标
实现聚合层：清洗、去重、摘要、组装 markdown、导出 PDF，并输出可追溯 manifest。

## 输入（固定）
1. 五个渠道的 `records/failures`。
2. 统一字段：`source_type/source_name/title/content/url/published_at/fetched_at`。
3. 默认 prompt：`contracts/prompts/default-summary-prompt.md`。
4. 用户 prompt：可选；存在时追加到默认 prompt 末尾。
5. 时间参数：默认时区 UTC+8，默认窗口 24h，默认推送 08:30。
6. LLM 配置：默认使用 OpenAI 兼容接口，读取 `LLM_API_KEY`（必填）、`LLM_API_URL`（可选，默认 `https://api.openai.com/v1`，支持 `.../v1`、完整 `.../chat/completions` 或完整 `.../responses`）、`LLM_MODEL`（可选）；Anthropic 为可选兜底，读取 `ANTHROPIC_API_KEY`、`ANTHROPIC_MODEL`、`ANTHROPIC_BASE_URL`（可选）与 `ANTHROPIC_VERSION`（可选）。兼容保留 `OPENAI_*` / `BAILIAN_*` 旧变量。

## 必做实现
1. 聚合入口按渠道顺序装载：Telegram -> X -> Substack -> Youtube -> 其他。
2. 固定执行顺序：先完成全量装载与去重，再进入并发摘要；禁止边抓取边摘要。
3. 执行二次有效性校验：
   - 文本为空、长度不足、命中拦截关键词的条目直接剔除并记失败。
4. 执行 URL 规范化与跨渠道去重：
   - 去重键：canonical URL
   - 冲突保留策略：优先保留 `content` 更完整（长度更长）的记录。
5. 摘要编排（OpenAI 兼容接口）：
   - 摘要输入：标题、正文、来源、发布时间、原链接
   - 若 `url` 为空（Telegram 无外链降级），渲染时用 `N/A（无外链）`
   - 并发上限：4
   - 单条超时：45 秒
   - 失败重试：最多 2 次
6. 摘要输出解析：必须符合“`**标题** + 1-3段正文`”；不合规判失败。
7. Markdown 组装必须严格匹配目标模板分节顺序：Telegram -> X -> Substack -> Youtube -> 其他。
8. 生成 PDF 并确保与 markdown 同步版本。
9. 生成 manifest，最少包含：
   - `input_count`
   - `filtered_count`
   - `deduped_count`
   - `summary_success_count`
   - `summary_failure_count`
   - `output_markdown`
   - `output_pdf`
   - `failed_items[]`

## 禁止决策
1. 不允许更改统一中间字段名。
2. 不允许把摘要失败条目伪装成成功。
3. 不允许跳过默认 prompt 直接仅用用户 prompt。
4. 不允许调整渠道分节顺序。

## 交付物
1. `src/aggregate/` 代码实现。
2. `tests/aggregate/` 覆盖聚合核心逻辑。
3. `REPORT_OUTPUT_DIR/digest-<timestamp>.md/.pdf/.manifest.json` 样例产物。

## 完成判定
1. 能稳定产出 markdown + PDF + manifest 三件套。
2. 摘要成功率 >= 90%（在输入为有效正文的前提下）。
3. 输出格式满足“信息集会”模板，不含结构性错误。
