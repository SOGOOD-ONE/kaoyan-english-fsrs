from flask import Blueprint, request, jsonify, make_response
from werkzeug.security import generate_password_hash, check_password_hash
from .. import db
from ..models import User, UserSetting
from ..auth import issue_token, require_user

bp = Blueprint('auth', __name__)

@bp.get('/me')
@require_user
def me(user):
    return jsonify({'user': {'id': user.id, 'email': user.email, 'nickname': user.nickname}})

@bp.post('/register')
def register():
    data = request.get_json(silent=True) or {}
    email = str(data.get('email', '')).strip().casefold(); password = str(data.get('password', ''))
    nickname = str(data.get('nickname', '考研用户')).strip()[:80]
    if len(email) < 5 or len(password) < 8: return jsonify({'error': '邮箱或密码不符合要求'}), 400
    if User.query.filter_by(email=email).first(): return jsonify({'error': '该邮箱已注册'}), 409
    user = User(email=email, password_hash=generate_password_hash(password), nickname=nickname or '考研用户')
    db.session.add(user); db.session.flush(); db.session.add(UserSetting(user_id=user.id)); db.session.commit()
    response = make_response(jsonify({'user': {'id': user.id, 'email': user.email, 'nickname': user.nickname}}), 201)
    response.set_cookie('access_token', issue_token(user.id), httponly=True, samesite='Lax', secure=False, max_age=604800)
    return response

@bp.post('/login')
def login():
    data = request.get_json(silent=True) or {}; email = str(data.get('email', '')).strip().casefold()
    user = User.query.filter_by(email=email).first()
    if not user or not check_password_hash(user.password_hash, str(data.get('password', ''))): return jsonify({'error': '邮箱或密码错误'}), 401
    from datetime import datetime
    user.last_login_at = datetime.utcnow(); db.session.commit()
    response = make_response(jsonify({'user': {'id': user.id, 'email': user.email, 'nickname': user.nickname}}))
    response.set_cookie('access_token', issue_token(user.id), httponly=True, samesite='Lax', secure=False, max_age=604800)
    return response

@bp.post('/logout')
def logout():
    response = make_response(jsonify({'ok': True})); response.delete_cookie('access_token'); return response
