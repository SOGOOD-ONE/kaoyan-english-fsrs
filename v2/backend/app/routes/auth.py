from datetime import datetime

from flask import Blueprint, request
from flask_jwt_extended import create_access_token, create_refresh_token, get_jwt_identity, jwt_required
from passlib.hash import bcrypt

from .. import db
from ..models import User, UserSettings

bp = Blueprint("auth", __name__)


@bp.post("/register")
def register():
    data = request.get_json(silent=True) or {}
    email = str(data.get("email", "")).strip().lower()
    username = str(data.get("username", "")).strip()
    password = str(data.get("password", ""))
    nickname = str(data.get("nickname") or username).strip()
    if not email or not username or len(password) < 8:
        return {"message": "email、username 必填，密码至少 8 位"}, 400
    if User.query.filter((User.email == email) | (User.username == username)).first():
        return {"message": "邮箱或用户名已存在"}, 409
    user = User(email=email, username=username, password_hash=bcrypt.hash(password), nickname=nickname)
    user.settings = UserSettings()
    db.session.add(user)
    db.session.commit()
    return _tokens(user), 201


@bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    identifier = str(data.get("identifier", "")).strip().lower()
    password = str(data.get("password", ""))
    user = User.query.filter((User.email == identifier) | (User.username == identifier)).first()
    if not user or not bcrypt.verify(password, user.password_hash) or user.status != "active":
        return {"message": "账号或密码错误"}, 401
    user.last_login_at = datetime.utcnow()
    db.session.commit()
    return _tokens(user)


@bp.get("/me")
@jwt_required()
def me():
    user = User.query.get(get_jwt_identity())
    if not user:
        return {"message": "用户不存在"}, 404
    return _user_json(user)


def _tokens(user):
    return {"access_token": create_access_token(identity=user.id), "refresh_token": create_refresh_token(identity=user.id), "user": _user_json(user)}


def _user_json(user):
    return {"id": user.id, "email": user.email, "username": user.username, "nickname": user.nickname, "avatar_url": user.avatar_url}
