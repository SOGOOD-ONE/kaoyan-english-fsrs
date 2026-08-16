# 考研英语 V2

## 定位
成熟背词 App 的交互 + 平台级用户系统 + 自研复习调度。

FSRS 不再作为产品规则。学习调度由 `backend/app/scheduler/` 自己定义，算法可独立迭代。

## 技术栈
- Frontend: Vue 3 + TypeScript + Vite + Pinia
- Backend: Flask + SQLAlchemy + Alembic
- Database: PostgreSQL
- Auth: HttpOnly session / token
- Public vocabulary: platform-owned
- User data: always scoped by authenticated `user_id`

## 核心数据边界
`words` 是公共词库；`user_word_cards` 是用户学习状态；`review_logs` 是不可变复习历史；`daily_plans` 是用户每日计划。

同一用户 + 同一词只能存在一张学习卡：`UNIQUE(user_id, word_id)`。

## 学习模式
1. NEW：每日新词，用户选择 80/100/150/200。
2. MANDATORY：按本地日历日，复习前一天首次学习的新词；00:00 切换日期。
3. SELF：由自研 Scheduler 返回全部当前到期卡片，不设置人为 20/50 个上限。

三种队列互相独立。

## 自研 Scheduler 原则
输入：card、rating、review time、历史表现、词条权重。
输出：state、stability、difficulty、due_at。

保留稳定性/难度/可提取性等概念，但实现不复制 FSRS 参数或公式。以后可以用历史 review_logs 离线评估算法版本。

## 导入与重复
导入不是简单覆盖 words：
- 标准化 `normalized_word`（大小写、空白、Unicode 规范化）
- 公共词库中按 `normalized_word` 判断重复
- 用户词库通过关联表保存来源
- 用户备注、收藏、学习状态永远不写入公共 words
- 导入结果返回 total / inserted / merged / invalid / duplicate

## 用户数据
所有用户数据都必须通过后端鉴权得到的 `user_id` 查询，禁止客户端传入任意 user_id 后直接查询。

包括：settings、daily_plans、cards、review_logs、study_sessions、user_vocabularies、imports、favorites、notes。
