from datetime import datetime, timedelta, date
from flask import Blueprint, request, jsonify
from sqlalchemy import and_, not_, or_
from .. import db
from ..auth import require_user
from ..models import Word, UserWordCard, ReviewLog, DailyPlan
from ..scheduler.core import StudyScheduler

bp = Blueprint('study', __name__)
scheduler = StudyScheduler()


def yesterday_window():
    today = date.today()
    start = datetime.combine(today - timedelta(days=1), datetime.min.time())
    end = datetime.combine(today, datetime.min.time())
    return start, end


def serialize(w, card=None):
    return {'word': {'id': w.id, 'word': w.word, 'meaning': w.meaning, 'example': w.example, 'translation': w.translation},
            'card': None if not card else {'id': card.id, 'state': card.state, 'stability': card.stability, 'difficulty': card.difficulty, 'due_at': card.due_at.isoformat()}}


@bp.get('/dashboard')
@require_user
def dashboard(user):
    plan = DailyPlan.query.filter_by(user_id=user.id, plan_date=date.today()).first()
    if not plan:
        from ..models import UserSetting
        setting = UserSetting.query.get(user.id)
        plan = DailyPlan(user_id=user.id, plan_date=date.today(), new_quota=setting.daily_new_quota if setting else 100)
        db.session.add(plan); db.session.commit()
    new_count = Word.query.filter(~Word.id.in_(db.session.query(UserWordCard.word_id).filter_by(user_id=user.id))).count()
    mandatory_total = ReviewLog.query.filter(ReviewLog.user_id == user.id, ReviewLog.review_type == 'new', ReviewLog.reviewed_at >= yesterday_window()[0], ReviewLog.reviewed_at < yesterday_window()[1]).with_entities(ReviewLog.word_id).distinct().count()
    self_count = UserWordCard.query.filter(UserWordCard.user_id == user.id, UserWordCard.state != 'new', UserWordCard.due_at <= datetime.utcnow()).count()
    return jsonify({'dailyQuota': plan.new_quota, 'newAvailable': new_count, 'mandatoryDue': mandatory_total, 'selfDue': self_count})


@bp.get('/queue/<mode>')
@require_user
def queue(user, mode):
    if mode not in {'new', 'mandatory', 'self'}:
        return jsonify({'error': 'invalid mode'}), 400
    limit = int(request.args.get('limit', 100)) if mode == 'new' else 10000
    if mode == 'new':
        card_ids = db.session.query(UserWordCard.word_id).filter_by(user_id=user.id)
        words = Word.query.filter(~Word.id.in_(card_ids)).order_by(Word.id.asc()).limit(max(0, min(limit, 200))).all()
        return jsonify({'items': [serialize(w) for w in words]})
    if mode == 'self':
        cards = UserWordCard.query.filter(UserWordCard.user_id == user.id, UserWordCard.state != 'new', UserWordCard.due_at <= datetime.utcnow()).order_by(UserWordCard.due_at.asc()).limit(10000).all()
        words = {w.id: w for w in Word.query.filter(Word.id.in_([c.word_id for c in cards])).all()}
        return jsonify({'items': [serialize(words[c.word_id], c) for c in cards if c.word_id in words]})
    start, end = yesterday_window()
    word_ids = [x[0] for x in db.session.query(ReviewLog.word_id).filter(ReviewLog.user_id == user.id, ReviewLog.review_type == 'new', ReviewLog.reviewed_at >= start, ReviewLog.reviewed_at < end).distinct().all()]
    cards = UserWordCard.query.filter(UserWordCard.user_id == user.id, UserWordCard.word_id.in_(word_ids)).all()
    words = {w.id: w for w in Word.query.filter(Word.id.in_(word_ids)).all()}
    return jsonify({'items': [serialize(words[c.word_id], c) for c in cards if c.word_id in words]})


@bp.post('/review')
@require_user
def submit_review(user):
    data = request.get_json(silent=True) or {}
    word_id = data.get('wordId'); rating = int(data.get('rating', 0)); review_type = str(data.get('reviewType', 'self'))
    if rating not in (1,2,3,4) or review_type not in ('new','mandatory','self'):
        return jsonify({'error': 'invalid review'}), 400
    word = Word.query.get(word_id)
    if not word:
        return jsonify({'error': 'word not found'}), 404
    card = UserWordCard.query.filter_by(user_id=user.id, word_id=word_id).first()
    now = datetime.utcnow()
    if not card:
        card = UserWordCard(user_id=user.id, word_id=word_id, state='learning', stability=0.5, difficulty=5.0, first_learned_at=now)
        db.session.add(card); db.session.flush()
        elapsed = 0
    else:
        elapsed = max(0, (now - (card.last_review_at or now)).total_seconds() / 86400)
    result = scheduler.review(stability=card.stability, difficulty=card.difficulty, rating=rating, elapsed_days=elapsed, now=now, review_count=card.review_count)
    card.state = result.state; card.stability = result.stability; card.difficulty = result.difficulty; card.due_at = result.due_at; card.last_review_at = now; card.review_count += 1
    if rating >= 3: card.correct_count += 1
    else: card.wrong_count += 1
    db.session.add(ReviewLog(user_id=user.id, word_id=word_id, card_id=card.id, rating=rating, review_type=review_type, reviewed_at=now))
    db.session.commit()
    return jsonify(serialize(word, card))
