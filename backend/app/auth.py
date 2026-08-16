from functools import wraps
from flask import request, jsonify, current_app
import jwt
from datetime import datetime, timedelta, timezone
from .models import User


def issue_token(user_id: str):
    now = datetime.now(timezone.utc)
    return jwt.encode({'sub': user_id, 'iat': now, 'exp': now + timedelta(days=7)}, current_app.config['SECRET_KEY'], algorithm='HS256')


def current_user():
    token = request.cookies.get('access_token') or request.headers.get('Authorization', '').removeprefix('Bearer ').strip()
    if not token:
        return None
    try:
        payload = jwt.decode(token, current_app.config['SECRET_KEY'], algorithms=['HS256'])
        return User.query.get(payload['sub'])
    except jwt.PyJWTError:
        return None


def require_user(fn):
    @wraps(fn)
    def wrapped(*args, **kwargs):
        user = current_user()
        if not user:
            return jsonify({'error': 'unauthorized'}), 401
        return fn(user, *args, **kwargs)
    return wrapped
