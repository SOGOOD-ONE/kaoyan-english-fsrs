import os
from flask import Flask
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy


db = SQLAlchemy()


def create_app():
    app = Flask(__name__)
    app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///dev.db')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'change-me-in-production')
    db.init_app(app)
    CORS(app, supports_credentials=True, origins=os.getenv('CORS_ORIGINS', '*').split(','))

    from .api.auth import bp as auth_bp
    from .api.study import bp as study_bp
    from .api.vocabulary import bp as vocabulary_bp
    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(study_bp, url_prefix='/api/study')
    app.register_blueprint(vocabulary_bp, url_prefix='/api/vocabulary')

    with app.app_context():
        from . import models  # noqa: F401
        db.create_all()
    return app
