# YouTube V2 Cursor Contract

## 1. 目标
为 `YouTube V2` 增加最小安全的增量扫描机制，减少重复处理同一批已成功抓取的视频。

## 2. 适用范围
1. 仅作用于 `YouTube V2`
2. 仅作用于同一 `(source, feed_kind)` job
3. 当前阶段只跳过“已成功处理过”的旧视频，不跳过失败项

## 3. Cursor Key
Cursor 的唯一键固定为：

`<feed_kind>:<normalized_source_url>`

示例：
1. `videos:https://www.youtube.com/@PeterYangYT`
2. `streams:https://www.youtube.com/@PeterYangYT`

## 4. Cursor State
每个 key 对应的 state 结构固定为：
1. `latestSuccessfulPublishedAt`
2. `latestRunAt`

说明：
1. `latestSuccessfulPublishedAt` 只在该 job 产生成功记录时推进
2. `latestRunAt` 用于留痕最近一次运行时间

## 5. 跳过规则
1. 先做 Discovery
2. 再做 Details
3. 仅在候选视频已经通过窗口筛选后，才应用 cursor 跳过
4. 若 `published_at <= latestSuccessfulPublishedAt`，则判定为“非新增”，本轮跳过

## 6. 安全边界
1. `transcript_missing` 不推进 cursor
2. `video_unavailable` 不推进 cursor
3. `invalid_content` 不推进 cursor
4. `network` 不推进 cursor

原因：失败项必须保留后续重试机会，不能被 cursor 吞掉。

## 7. 输出要求
`YouTube V2` 返回结果中允许包含 `cursor_state` 作为 sidecar 元数据，但不得影响：
1. 成功记录统一字段契约
2. 失败记录统一字段契约

## 8. 当前开发阶段验收
1. 有可执行单元测试覆盖 cursor 跳过逻辑
2. 成功记录能推动 `latestSuccessfulPublishedAt`
3. 失败记录不会推动 cursor
