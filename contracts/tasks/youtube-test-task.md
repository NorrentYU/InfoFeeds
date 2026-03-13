# Task Contract: YouTube Test

## 任务目标
验证 YouTube 模块是否满足“字幕-only”的稳定性、有效性与格式一致性要求。

## 输入（固定）
1. 测试源：
   - `https://www.youtube.com/@PeterYangYT`
   - `https://www.youtube.com/@Messari`
2. 测试模式：不校验时间窗口，仅取每个测试源最新视频。
3. 目标输出字段：
   - `source_type/source_name/title/content/url/published_at/fetched_at`

## 测试用例（必须全部执行）
1. 最新视频选择：每个测试源仅返回最新视频 1 条。
2. 视频链接有效性：`url` 为具体视频链接。
3. 字幕提取路径：有字幕视频应成功提取字幕文本。
4. 无字幕处理：应返回 `transcript_missing` 记录，不得伪造 transcript。
5. 文本有效性：`content` 非空且非错误文案（仅对成功 transcript 记录校验）。
6. 字段完整性：输出字段完整且类型正确。
7. 模板兼容性：结果可正确写入“信息集会”的 `Youtube` 分节。

## 失败处理
1. 任何 P0/P1 失败直接打回开发修复。
2. 若出现视频不可达或地区限制，必须附证据并标记失败类型。

## 交付物
1. 测试报告（测试时间、窗口、样例链接、结果）。
2. 缺陷列表（分级+复现步骤）。
3. 回归结果（修复后重测结论）。

## 通过判定
1. 全部用例通过。
2. 无未关闭 P0/P1 缺陷。
3. 报告证据齐全且可复查。
