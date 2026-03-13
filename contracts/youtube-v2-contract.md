# YouTube V2 Contract

## 1. 目标
在不继续叠补丁到 `src/youtube/` 的前提下，重构 YouTube 抓取模块为独立的 `YouTube V2`，解决以下问题：
1. `videos` 与 `streams` 无法使用独立时间窗口。
2. 单频道顺序串行导致全量运行耗时线性放大。
3. 频道扫描、视频详情、字幕提取耦合在一个控制流里，难以定位瓶颈。

## 2. 范围
1. V2 仅覆盖 YouTube 渠道。
2. V2 本轮开发目录固定为 `src/youtube-v2/`。
3. V2 当前阶段作为独立模块开发，不直接替换现有 `src/youtube/` 生产入口。
4. V2 继续遵守统一字段契约：
   - `source_type/source_name/title/content/url/published_at/fetched_at`
5. V2 继续遵守字幕-only策略：
   - 仅使用人工字幕/自动字幕
   - 无字幕标记 `transcript_missing`

## 3. 固定架构
V2 必须按下列阶段实现，不允许再次回到单函数串行大循环：

### 3.1 Discovery
按 `(source, feed_kind)` 建立独立 job，仅负责发现候选视频 URL。

固定 `feed_kind`：
1. `videos`
2. `streams`

### 3.2 Details
仅对候选视频 URL 拉取视频详情，用于补齐：
1. `published_at`
2. `captionTracks`
3. `wasLive`

### 3.3 Selection
按 job 自己的时间窗口筛选可处理视频，不允许 `videos` 和 `streams` 共用一套窗口参数。

### 3.4 Transcript Extraction
仅对 Selection 通过的视频执行字幕提取、文本校验、标准化输出。

## 4. 默认窗口策略
1. `videos`: `T-24h ~ T`
2. `streams`: `T-96h ~ T-72h`

窗口必须按 job 独立配置，禁止通过一个全局窗口加条件偏移来模拟双窗口。

## 5. 并发策略
1. Job 级并发：允许多个 `(source, feed_kind)` 并发执行。
2. Details 级并发：允许同一 job 下多个候选视频并发拉详情。
3. Transcript 级并发：允许同一 job 下多个已选视频并发拉字幕。
4. 并发度必须可配置，禁止硬编码在业务逻辑里。

## 6. 失败模型
V2 继续输出统一失败记录，允许的 `failure_type` 固定为：
1. `parse`
2. `network`
3. `video_unavailable`
4. `transcript_missing`
5. `invalid_content`
6. `no_updates`
7. `unexpected`

要求：
1. 单 job 失败不得阻塞整批。
2. Discovery 无候选或频道无对应 tab 时，输出 `no_updates`。
3. 字幕缺失必须输出 `transcript_missing`。
4. 错误详情必须脱敏，不得输出凭证。

## 7. 去重规则
1. 最终成功记录按 `url` 去重。
2. 若同一视频同时出现在 `videos` 与 `streams` job，优先保留 `streams` job 的结果。

## 8. 非目标
本轮 V2 不做：
1. NotebookLM 集成
2. 聚合层接线切换
3. HTML 页面抓取替代字幕
4. 本地转写/ASR

## 9. 当前开发里程碑
本轮必须交付：
1. `YouTube V2` contract 文件
2. `src/youtube-v2/` 独立模块骨架
3. Discovery/Selection/Transcript 的首版可执行实现
4. 对应单元测试

## 10. 验收口径
1. 新模块不修改旧 `src/youtube/` 主流程。
2. 单元测试覆盖：
   - 双窗口 job 规划
   - `videos` 与 `streams` 独立筛选
   - 无字幕失败留痕
   - 无更新留痕
   - 无效 source 解析失败
3. V2 输出可被现有摘要层直接消费。
