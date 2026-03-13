# Task Contract: X Dev

## 任务目标
实现 X 渠道非官方 `For You` 抓取，采用“CDP 直连专用已登录 Chrome 主路径 + 会话/密码/人工接管兜底”并输出统一结构供摘要层使用。

## 输入（固定）
1. `.env` 账号凭证（只读；仅兜底登录路径使用）。
2. CDP 连接端点（默认 `http://127.0.0.1:9222`，可由 `X_CDP_ENDPOINT` 覆盖）。
3. 专用浏览器 profile（与用户日常浏览器隔离）。
4. 会话状态存储（例如 storageState/userDataDir，本地持久化）。
5. 抓取模式：
   - 测试：`For You` 前 5 条
   - 生产：`For You` 前 20 条
6. 输出字段：
   - `source_type/source_name/title/content/url/published_at/fetched_at`

## 必做实现
1. 在主流程中优先执行 CDP 附着（`connectOverCDP`）并确认 `For You` 标签。
2. 若 CDP 失败，提供明确错误分类：
   - `cdp_unavailable`（如 `ECONNREFUSED`）
   - `cdp_context_missing`
   - `cdp_not_logged_in`（无法确认 `For You`）
3. CDP 不可用时，降级到本地会话复用；仍失败再进入密码登录 + 人工接管流程。
4. 人工接管完成后必须持久化会话状态，供后续定时任务复用。
5. 抓取前 N 条推文卡片并去重。
6. 从卡片外链/引用外链中尝试提取可读原文；失败时回退推文文本。
7. `url` 优先使用提取到的外链原文链接；未命中时回退推文状态链接。
8. 校验并输出统一字段（`source_type=x`，`source_name=for_you`）。
9. 对异常项输出失败记录（脱敏）。
10. 若结果整体超过 24h，执行自动刷新重试（最多 3 次）并记录 `stale_feed` 处理结果。
11. 保持 `npm run x:cdp-smoke` 可独立运行并产出 `reports/x-cdp-smoke.json`。

## 禁止决策
1. 不允许改统一字段名。
2. 不允许输出明文账号密码或会话敏感信息。
3. 不允许把 `Following` 流结果当作 `For You` 结果。
4. 不允许把跳转壳链接或明显无效链接写入最终 `url`。
5. 不允许在定时任务中每次都走账号密码直登。
6. 不允许复用用户日常 Chrome profile（多账号/多标签环境）。
7. 不允许在 CDP 主路径可用时强制降级到密码登录。

## 交付物
1. 代码实现（仅 X 模块相关）。
2. 标准化输出样例（测试 5 条 + 生产 20 条）。
3. 自测记录（CDP 成功 + 降级路径成功 + 阻塞路径各至少 1 条）。
4. `reports/x-cdp-smoke.json`（最近一次可复查产物）。

## 完成判定
1. 测试模式能稳定返回前 5 条 `For You` 记录（或有明确阻塞证据）。
2. 生产模式可返回前 20 条 `For You` 记录（或有明确阻塞证据）。
3. CDP 主路径在可用环境下可稳定通过 `x:cdp-smoke`。
