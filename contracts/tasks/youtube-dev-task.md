# Task Contract: YouTube Dev

## 任务目标
实现 YouTube 渠道抓取与字幕提取（字幕-only），输出统一结构供摘要层使用。

## 输入（固定）
1. 测试源：
   - `https://www.youtube.com/@PeterYangYT`
   - `https://www.youtube.com/@Messari`
2. 时间窗口：`T-48h ~ T-24h`（YouTube 专项默认）。
3. 输出字段：
   - `source_type/source_name/title/content/url/published_at/fetched_at`

## 必做实现
1. 抓取频道视频列表并按窗口筛选。
2. 提取可用字幕（人工/自动）。
3. 无字幕视频标记 `transcript_missing` 并记录原因。
4. 记录文本来源（`caption`）。
5. 过滤无效文本（空文本、错误页文案、占位文本）。
6. 确保 `url` 为视频原链接。
7. 对失败项输出失败记录（脱敏）。

## 禁止决策
1. 不允许改统一字段名。
2. 不允许把频道页链接写入最终 `url`。
3. 不允许把无字幕项当成功 transcript。
4. 不允许扩展到非 YouTube 渠道。

## 交付物
1. 代码实现（仅 YouTube 模块相关）。
2. 标准化输出样例（两个源都覆盖）。
3. 自测记录（字幕可用样例 + 无字幕缺失样例各至少 1 条）。

## 完成判定
1. 两个测试源均有可用输出或有明确“无更新/不可达”证据。
2. 输出可直接进入摘要层，无需额外清洗。
