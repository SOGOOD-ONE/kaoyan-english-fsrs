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
        SESSION_COOKIE_SAMESITE="Lax",
    )

    db.init_app(app)
    CORS(
        app,
        resources={r"/api/*": {"origins": os.getenv("FRONTEND_ORIGIN", "*")}},
        supports_credentials=True,
    )

    from .api import api
    app.register_blueprint(api, url_prefix="/api")

    with app.app_context():
        from . import models  # noqa: F401
        db.create_all()

    return app
