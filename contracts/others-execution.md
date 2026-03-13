# Others Module Execution Pack

## 1. 模块目标
在最近 24h 时间窗口内，基于 newsletter RSS（`/feed`）抓取更新，提取可读正文并输出统一中间结构；通过测试后进入全链路耦合集成。

## 2. 模块范围
1. 本轮只做 Others（newsletter）渠道，作为 datafetch 渠道层最后一个模块。
2. 固定测试源（来自 `sourceList.md` Others）：
   - `https://every.to/chain-of-thought/`
   - `https://every.to/napkin-math/`
3. 抓取策略固定为 RSS 优先：先读 `<source>/feed`。
4. 仅当 `/feed` 不可用且已记录阻塞证据时，允许升级架构师确认是否启用备用抓取路径。

## 3. 开发单（给开发 agent）
开发 agent 执行文件：`contracts/tasks/others-dev-task.md`

### 3.1 输入
1. `sourceList.md` 的 Others 分组。
2. 调度参数（默认 24h，UTC+8 08:30）。
3. 用户摘要 prompt（由设置层注入）。

### 3.2 实现任务
1. 将 newsletter 源标准化为 feed URL（`/feed`）。
2. 拉取并解析 RSS，提取条目字段（标题、链接、发布时间、内容）。
3. 内容字段优先级：`content:encoded` > `description`。
4. 链接清洗：保留原文主链接，移除常见追踪参数。
5. 时间过滤：只保留窗口内更新。
6. 去重：`guid` 优先；缺失时使用 `link + published_at`。
7. 输出统一中间结构：
   - `source_type=others`
   - `source_name`
   - `title`
   - `content`
   - `url`
   - `published_at`
   - `fetched_at`
8. 失败留痕：记录 feed 不可达、解析失败、内容无效等错误类型（脱敏）。

### 3.3 禁止事项
1. 不得跳过 `/feed` 直接抓 HTML 作为主路径（除非明确升级批准）。
2. 不得把 feed 链接写入最终 `url`。
3. 不得把订阅引导页/异常页文本当正文。
4. 不得绕过统一字段契约。

### 3.4 交付物
1. Others 渠道标准化数据样例（至少覆盖两个测试源）。
2. 开发自测记录（含至少 1 次失败重试）。
3. 已知限制列表（若有）。

## 4. 测试单（给测试 agent）
测试 agent 执行文件：`contracts/tasks/others-test-task.md`

### 4.1 通用用例
1. feed URL 构造正确（`/feed`）。
2. RSS 解析稳定，可提取标题/链接/时间/内容。
3. 时间窗口过滤正确（默认最近 24h）。
4. 去重正确（guid/link 规则生效）。
5. 输出字段完整且符合统一结构。

### 4.2 Others 专项用例
1. 两个测试源均至少输出 1 条有效记录（或有明确无更新证据）。
2. `url` 必须是原文链接，不是 feed 链接。
3. `content` 不能为空且非订阅墙/拦截页文案。
4. 结果能按目标模板落入 `其他` 分节。

### 4.3 通过标准
1. 所有用例通过。
2. 无 P0/P1 未关闭缺陷。
3. 有完整测试证据可追溯。

## 5. 验收闸门（架构师）
1. 开发交付物齐全且符合契约。
2. 测试报告通过且证据完整。
3. Others 结果可被下游摘要与聚合层直接消费。
4. 仅在上述 1-3 全部满足时，允许进入全链路联调验收（抓取 -> 清洗 -> 总结 -> 聚合 -> PDF -> 投递）。

## 6. 阻塞升级
1. 连续 2 次 feed 拉取失败：升级架构师。
2. 大面积源无有效 feed：升级架构师确认源地址或备选策略。
3. 契约字段不一致：先冻结新契约，再继续开发。
