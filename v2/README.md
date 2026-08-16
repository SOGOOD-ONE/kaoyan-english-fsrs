# 考研英语智能背词 V2

这是全新重构版，不再修补旧的 GitHub Pages 单页应用。

## 技术架构

- Frontend: Vue 3 + TypeScript + Vite + Pinia
- Backend: Flask + SQLAlchemy + Alembic
- Database: PostgreSQL（开发环境可使用 SQLite）
- Auth: HttpOnly Cookie Session / JWT-ready API
- Scheduler: 独立的 Python 学习调度引擎

## 核心原则

1. 公共词库与用户数据完全分离。
2. 所有用户数据必须通过 authenticated user identity 绑定，禁止前端传入 user_id 作为权限依据。
3. 同一用户同一词条只能存在一张学习卡：`UNIQUE(user_id, word_id)`。
4. 新词、强制复习、自主复习是三个独立队列。
5. 强制复习按用户本地日历的 00:00 分界，复习昨天第一次学习过的新词。
6. 自主复习由独立 Scheduler 决定，UI 不暴露算法内部参数。
7. 导入词库必须先规范化、去重、报告冲突，再写入数据库；导入不能覆盖用户已有学习状态。
8. 所有复习行为产生不可变 ReviewLog，学习卡只保存当前状态。

## 学习流程

`每日新词配额 → 今日新词 → 次日强制复习 → 自主算法复习`

## 数据边界

- `words`：平台公共词条。
- `word_sources`：真题来源、年份、文章、段落、例句。
- `user_vocabularies` / `user_vocabulary_words`：用户自己的词库及其归属。
- `user_cards`：用户对某个词的当前学习状态。
- `review_logs`：用户全部复习历史。
- `daily_plans`：每日目标与完成情况。
- `study_sessions`：学习会话。
- `user_settings`：每日配额、界面、声音等设置。

## 开发阶段

V2 第一阶段先完成后端领域模型、认证、词库导入/重复判断和 Scheduler API，再接 Vue 页面。生产部署放在核心功能稳定之后。
