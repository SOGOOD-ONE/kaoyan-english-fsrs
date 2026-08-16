# 考研英语 V2

这是同一个仓库内的全新重建版本，旧版不再作为产品基础。

## 已建立
- Vue 3 + TypeScript + Vite 前端
- Flask + SQLAlchemy 后端
- PostgreSQL / Docker Compose
- 用户注册、登录、HttpOnly Cookie
- 用户设置与每日新词量持久化
- 用户学习卡 `user_id + word_id` 唯一约束
- 复习历史 `review_logs`
- 今日新词 / 昨日强制复习 / 自主到期复习三队列
- 自研 Scheduler，独立于 FSRS
- Excel 导入、标准化、重复合并统计
- 移动端背词交互

## 本地运行

### Backend
```bash
cd backend
python -m venv .venv
# Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
python run.py
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

默认前端 API：`http://localhost:5000/api`，生产环境通过 `VITE_API_BASE` 配置。

## 下一阶段
1. 完整词库导入与真题例句模型
2. 用户自定义词库 / 收藏 / 备注
3. 统计页与学习日历
4. Scheduler 离线回放测试与参数评估
5. Alembic 正式迁移
6. 生产环境 HTTPS / secure cookie / PostgreSQL
7. 前后端正式部署
