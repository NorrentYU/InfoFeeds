# Task Contract: Telegram Dev

## 任务目标
实现 Telegram 渠道数据抓取与标准化输出，供下游摘要层直接消费。

## 输入（固定）
1. 测试源：
   - `https://t.me/cookiesreads`
   - `https://t.me/web3list`
2. 时间窗口：最近 24h（可参数化，默认 24h）。
3. 输出字段：
   - `source_type/source_name/title/content/url/published_at/fetched_at`

## 必做实现
1. 抓取频道消息列表（窗口内）。
2. 解析消息中的外链并标准化 URL。
3. 抓取外链正文并做清洗。
4. 外链正文不可用时，支持 Substack RSS 与 X 外链兜底提取。
5. 无外链消息若正文有效，可降级入库（`url` 置空）并记录 `no_external_link`。
6. 识别并过滤 CAPTCHA/防火墙/空正文。
7. 按统一字段输出记录。
8. 对失败项输出失败记录（脱敏）。

## 禁止决策
1. 不允许改字段名。
2. 不允许把 Telegram 消息链接写入最终 `url`（降级路径必须 `url` 置空）。
3. 不允许把拦截页文本当正文。
4. 不允许扩展到非 Telegram 渠道。

## 交付物
1. 代码实现（仅 Telegram 模块相关）。
2. 标准化输出样例（两个源都覆盖）。
3. 自测记录（至少 1 次失败重试样例）。

## 完成判定
1. 两个测试源均有可用输出或有明确“无更新”证据。
2. 输出可直接进入摘要层，无需额外清洗。
