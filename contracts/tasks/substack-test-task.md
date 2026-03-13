# Task Contract: Substack Test

## 任务目标
验证 Substack 模块是否满足 RSS 抓取稳定性、数据有效性与格式一致性要求。

## 输入（固定）
1. 测试源：
   - `https://www.systematiclongshort.com/`
   - `https://www.astralcodexten.com/`
2. 时间窗口：最近 24h。
3. 目标输出字段：
   - `source_type/source_name/title/content/url/published_at/fetched_at`

## 测试用例（必须全部执行）
1. feed 构造：源 URL 能正确映射到 `/feed`。
2. RSS 可读：成功解析标题、链接、发布时间、内容。
3. 窗口过滤：仅返回窗口内数据。
4. 去重策略：guid/link 规则正确生效。
5. 正文有效性：`content` 非空且非异常页文案。
6. 链接有效性：`url` 为原文链接，不是 feed 链接。
7. 字段完整性：输出字段完整且类型正确。
8. 模板兼容性：结果可正确写入“信息集会”的 Substack 分节。

## 失败处理
1. 任何 P0/P1 失败直接打回开发修复。
2. 若源无更新，必须附窗口证据，不得标注为通过或失败。

## 交付物
1. 测试报告（测试时间、窗口、样例链接、结果）。
2. 缺陷列表（分级+复现步骤）。
3. 回归结果（修复后重测结论）。

## 通过判定
1. 全部用例通过。
2. 无未关闭 P0/P1 缺陷。
3. 报告证据齐全且可复查。
