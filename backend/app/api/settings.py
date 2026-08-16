from flask import Blueprint, request, jsonify
from .. import db
from ..auth import require_user
from ..models import UserSetting

bp = Blueprint('settings', __name__)

@bp.patch('/')
@require_user
def update(user):
    data = request.get_json(silent=True) or {}
    setting = UserSetting.query.get(user.id)
    if not setting:
        setting = UserSetting(user_id=user.id); db.session.add(setting)
    if 'dailyNewQuota' in data:
        quota = int(data['dailyNewQuota'])
        if quota not in (80, 100, 150, 200): return jsonify({'error':'每日新词只能选择 80/100/150/200'}),400
        setting.daily_new_quota = quota
    if 'soundEnabled' in data: setting.sound_enabled = bool(data['soundEnabled'])
    if 'autoPlayExample' in data: setting.auto_play_example = bool(data['autoPlayExample'])
    db.session.commit()
    return jsonify({'dailyNewQuota':setting.daily_new_quota,'soundEnabled':setting.sound_enabled,'autoPlayExample':setting.auto_play_example})
