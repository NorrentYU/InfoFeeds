# Task Contract: Aggregation Test

## 任务目标
验证聚合层在格式合规、摘要质量、去重正确性与可交付性（PDF）上的稳定性。

## 输入（固定）
1. 五个渠道的标准化样例输出（含失败记录）。
2. 默认 prompt：`contracts/prompts/default-summary-prompt.md`。
3. 用户 prompt：空/非空两组场景。
4. 默认窗口与时区：24h + UTC+8。
5. LLM 配置：`LLM_API_KEY` 可用，`LLM_API_URL` 可解析并生效（支持 `.../v1`、完整 `.../chat/completions` 或完整 `.../responses`），`LLM_MODEL` 可解析并生效；Gemini 为兜底路径。兼容保留 `OPENAI_*` / `BAILIAN_*` 旧变量。

## 测试用例（必须全部执行）
1. 输入装载：可读取并识别 5 个渠道 records/failures。
2. 二次校验：拦截页/空正文条目被过滤并记录失败。
3. 去重正确性：同 canonical URL 在最终 markdown 只出现一次。
4. 摘要格式：每条摘要为 `**标题**` + 段落正文，不含列表符号或编号。
5. 摘要质量：摘要包含关键信息（数字、日期、金额、比例等）且无明显幻觉。
6. 分节顺序：Telegram -> X -> Substack -> Youtube -> 其他。
7. 链接校验：每条都包含“原链接：<url>”；若输入 `url` 为空（Telegram 降级），必须渲染为 `N/A（无外链）`。
8. 默认 prompt 场景：无用户 prompt 时产出风格符合默认规则。
9. 叠加 prompt 场景：有用户 prompt 时仍保持输出结构稳定。
10. 容错性：单条摘要失败时，整体仍可出报，并在 manifest 记录失败项。
11. PDF 一致性：PDF 能打开，内容与 markdown 一致。
12. 执行顺序校验：先去重再摘要，确保重复 URL 不会重复触发摘要调用。

## 失败处理
1. 任一 P0/P1 失败直接打回开发修复。
2. 若摘要模型不可用，必须记录调用错误并执行回退重试，不得静默成功。

## 交付物
1. 聚合层测试报告（覆盖用例、结果、失败项、回归结论）。
2. 缺陷清单（分级+复现步骤）。
3. 回归报告（修复后重测结果）。
4. 产物证据：`digest-*.md/.pdf/.manifest.json`。

## 通过判定
1. 全部用例通过。
2. 无未关闭 P0/P1 缺陷。
3. 证据完整且可复查。
