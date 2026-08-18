import os
from flask import Flask
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import inspect, text


db = SQLAlchemy()


def ensure_schema_compatibility():
    inspector = inspect(db.engine)
    tables = inspector.get_table_names()
    if "user_settings" in tables:
        columns = {column["name"] for column in inspector.get_columns("user_settings")}
        if "daily_review_quota" not in columns:
            db.session.execute(text("ALTER TABLE user_settings ADD COLUMN daily_review_quota INTEGER NOT NULL DEFAULT 100"))
    if "user_word_cards" in tables:
        columns = {column["name"] for column in inspector.get_columns("user_word_cards")}
        additions = {
            "known_excluded": "ALTER TABLE user_word_cards ADD COLUMN known_excluded BOOLEAN NOT NULL DEFAULT 0",
            "new_ec_correct": "ALTER TABLE user_word_cards ADD COLUMN new_ec_correct INTEGER NOT NULL DEFAULT 0",
            "new_ce_correct": "ALTER TABLE user_word_cards ADD COLUMN new_ce_correct INTEGER NOT NULL DEFAULT 0",
            "new_attempts": "ALTER TABLE user_word_cards ADD COLUMN new_attempts INTEGER NOT NULL DEFAULT 0",
            "new_complete": "ALTER TABLE user_word_cards ADD COLUMN new_complete BOOLEAN NOT NULL DEFAULT 0",
        }
        changed = False
        for name, statement in additions.items():
            if name not in columns:
                db.session.execute(text(statement))
                changed = True
        if "new_attempts" not in columns:
            db.session.execute(text("UPDATE user_word_cards SET new_attempts = MIN(3, COALESCE(new_ec_correct, 0) + COALESCE(new_ce_correct, 0))"))
        if changed:
            db.session.commit()
    if "daily_plans" in tables:
        columns = {column["name"] for column in inspector.get_columns("daily_plans")}
        if "mandatory_source_date" not in columns:
            db.session.execute(text("ALTER TABLE daily_plans ADD COLUMN mandatory_source_date DATE"))
            db.session.commit()


def _security_headers(response):
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    return response


def create_app() -> Flask:
    app = Flask(__name__)
    secret_key = os.getenv("SECRET_KEY")
    if not secret_key:
        raise RuntimeError("SECRET_KEY must be configured before starting the application")
    if len(secret_key) < 32:
        raise RuntimeError("SECRET_KEY must be at least 32 characters long")

    cookie_secure = os.getenv("COOKIE_SECURE", "0") == "1"
    cookie_samesite_none = os.getenv("COOKIE_SAMESITE_NONE", "0") == "1"
    if cookie_samesite_none and not cookie_secure:
        raise RuntimeError("COOKIE_SAMESITE_NONE=1 requires COOKIE_SECURE=1")

    app.config.update(
        SECRET_KEY=secret_key,
        SQLALCHEMY_DATABASE_URI=os.getenv("DATABASE_URL", "sqlite:///kaoyan.db"),
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="None" if cookie_samesite_none else "Lax",
        SESSION_COOKIE_SECURE=cookie_secure,
    )

    db.init_app(app)
    origins = [item.strip() for item in os.getenv("FRONTEND_ORIGIN", "http://localhost:5173").split(",") if item.strip()]
    if not origins:
        raise RuntimeError("FRONTEND_ORIGIN must contain at least one allowed origin")
    CORS(app, resources={r"/api/*": {"origins": origins}}, supports_credentials=True)
    app.after_request(_security_headers)

    from .api import api
    from .vocabulary_api import vocabulary_api
    from .vocabulary_list_api import vocabulary_list_api
    from .history_api import history_api
    from .study_plan_api import study_plan_api
    from .review_quota_api import review_quota_api
    from .study_new_api import study_new_api
    from .review_queue_api import review_queue_api
    from .study_self_api import study_self_api
    from .study_sync_api import study_sync_api
    from .dashboard_api import dashboard_api
    from .vocabulary_stats_api import vocabulary_stats_api
    app.register_blueprint(api, url_prefix="/api")
    app.register_blueprint(vocabulary_api, url_prefix="/api")
    app.register_blueprint(vocabulary_list_api, url_prefix="/api")
    app.register_blueprint(history_api, url_prefix="/api")
    app.register_blueprint(study_plan_api, url_prefix="/api")
    app.register_blueprint(review_quota_api, url_prefix="/api")
    app.register_blueprint(study_new_api, url_prefix="/api")
    app.register_blueprint(review_queue_api, url_prefix="/api")
    app.register_blueprint(study_self_api, url_prefix="/api")
    app.register_blueprint(study_sync_api, url_prefix="/api")
    app.register_blueprint(dashboard_api, url_prefix="/api")
    app.register_blueprint(vocabulary_stats_api, url_prefix="/api")

    with app.app_context():
        from . import models  # noqa: F401
        db.create_all()
        ensure_schema_compatibility()

    return app
