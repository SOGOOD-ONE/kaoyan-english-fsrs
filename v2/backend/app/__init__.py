from flask import Flask
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from flask_sqlalchemy import SQLAlchemy


db = SQLAlchemy()
jwt = JWTManager()


def create_app(config=None):
    app = Flask(__name__)
    app.config.update(
        SQLALCHEMY_DATABASE_URI="sqlite:///kaoyan_v2.db",
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        JWT_SECRET_KEY="change-me-in-production",
        JWT_ACCESS_TOKEN_EXPIRES=3600,
        JWT_REFRESH_TOKEN_EXPIRES=2592000,
    )
    if config:
        app.config.update(config)

    db.init_app(app)
    jwt.init_app(app)
    CORS(app, supports_credentials=True, origins=app.config.get("CORS_ORIGINS", "*"))

    from .models import User  # noqa: F401
    from .routes.auth import bp as auth_bp
    from .routes.vocab import bp as vocab_bp
    from .routes.study import bp as study_bp

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(vocab_bp, url_prefix="/api/vocab")
    app.register_blueprint(study_bp, url_prefix="/api/study")

    @app.get("/api/health")
    def health():
        return {"ok": True, "service": "kaoyan-english-v2"}

    return app
