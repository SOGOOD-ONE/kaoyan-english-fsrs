import os
from flask import Flask
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy


db = SQLAlchemy()


def create_app() -> Flask:
    app = Flask(__name__)
    app.config.update(
        SECRET_KEY=os.getenv("SECRET_KEY", "dev-only-change-me"),
        SQLALCHEMY_DATABASE_URI=os.getenv("DATABASE_URL", "sqlite:///kaoyan.db"),
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="None" if os.getenv("COOKIE_SAMESITE_NONE", "0") == "1" else "Lax",
        SESSION_COOKIE_SECURE=os.getenv("COOKIE_SECURE", "0") == "1",
    )

    db.init_app(app)
    origins = [item.strip() for item in os.getenv("FRONTEND_ORIGIN", "http://localhost:5173").split(",") if item.strip()]
    CORS(app, resources={r"/api/*": {"origins": origins}}, supports_credentials=True)

    from .api import api
    from .vocabulary_api import vocabulary_api
    from .history_api import history_api
    from .study_plan_api import study_plan_api
    app.register_blueprint(api, url_prefix="/api")
    app.register_blueprint(vocabulary_api, url_prefix="/api")
    app.register_blueprint(history_api, url_prefix="/api")
    app.register_blueprint(study_plan_api, url_prefix="/api")

    with app.app_context():
        from . import models  # noqa: F401
        db.create_all()

    return app
