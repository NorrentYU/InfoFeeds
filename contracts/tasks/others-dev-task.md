# Task Contract: Others Dev

## 任务目标
实现 Others（newsletter）渠道基于 RSS（`/feed`）的抓取与标准化输出，供下游摘要层直接消费。

## 输入（固定）
1. 测试源：
   - `https://every.to/chain-of-thought/`
   - `https://every.to/napkin-math/`
2. 时间窗口：最近 24h（可参数化，默认 24h）。
3. 输出字段：
   - `source_type/source_name/title/content/url/published_at/fetched_at`

## 必做实现
1. 源地址规范化并拼接 `/feed`。
2. 拉取 RSS 并解析条目。
3. 提取内容优先级：`content:encoded` > `description`。
4. 时间过滤与去重（`guid` 优先，后备 `link + published_at`）。
5. 链接清洗并确保 `url` 为原文链接。
6. 过滤无效正文（空内容、异常页文案、订阅墙提示文案）。
7. 对失败项输出失败记录（脱敏）。

## 禁止决策
1. 不允许改统一字段名。
2. 不允许把 feed 链接写入最终 `url`。
3. 不允许直接将异常页文本当正文。
4. 不允许扩展到非 Others 渠道。

## 交付物
1. 代码实现（仅 Others 模块相关）。
2. 标准化输出样例（两个源都覆盖）。
3. 自测记录（至少 1 次失败重试样例）。

## 完成判定
1. 两个测试源均有可用输出或有明确“无更新”证据。
2. 输出可直接进入摘要层，无需额外清洗。
