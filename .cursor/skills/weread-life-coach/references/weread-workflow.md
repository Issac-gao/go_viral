# 取书（对接微信读书）

若已安装 `weread-skills` 且存在 `WEREAD_API_KEY`（`wrk-` 开头）：

1. `/store/search` 或书架 `/shelf/sync` 定位 bookId（用户说「我的书库」则先书架）
2. `/book/info` 书名作者评分简介
3. `/book/chapterinfo` 目录
4. `/book/getprogress` 进度（整数百分比；100 才是读完）
5. `/book/bestbookmarks` 热门划线（全书 + 关键章）
6. 如有：`/book/bookmarklist` + `/review/list/mine` 用户笔记
7. `/review/list` 只作读者共识补充，不替代原书结构

请求体参数与 `api_name`、`skill_version` 平铺，不要包在 `params` 里。时间戳展示为 YYYY-MM-DD；阅读时长按秒换算。

无 Key 或接口失败：不要假装读过微信读书；改用用户提供的章节/摘录，并在开头标明来源限制。
