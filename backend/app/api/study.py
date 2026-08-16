from datetime import datetime, timedelta, date
from flask import Blueprint, request, jsonify
from .. import db
from ..auth import require_user
from ..models import Word, UserWordCard, ReviewLog, DailyPlan, UserSetting
from ..scheduler.core import StudyScheduler

bp = Blueprint('study', __name__)
scheduler = StudyScheduler()


def day_window(day):
    return datetime.combine(day, datetime.min.time()), datetime.combine(day + timedelta(days=1), datetime.min.time())


def yesterday_window():
    return day_window(date.today() - timedelta(days=1))


def ensure_plan(user_id):
    setting = UserSetting.query.get(user_id)
    quota = setting.daily_new_quota if setting else 100
    plan = DailyPlan.query.filter_by(user_id=user_id, plan_date=date.today()).first()
    if not plan:
        plan = DailyPlan(user_id=user_id, plan_date=date.today(), new_quota=quota)
        db.session.add(plan); db.session.flush()
    elif plan.new_quota != quota:
        plan.new_quota = quota
    return plan


def serialize(w, card=None):
    return {'word': {'id': w.id, 'word': w.word, 'meaning': w.meaning, 'example': w.example, 'translation': w.translation},
            'card': None if not card else {'id': card.id, 'state': card.state, 'stability': card.stability, 'difficulty': card.difficulty, 'due_at': card.due_at.isoformat()}}


@bp.get('/dashboard')
@require_user
def dashboard(user):
    plan = ensure_plan(user.id)
    ys, ye = yesterday_window(); ts, te = day_window(date.today())
    yesterday_ids = {x[0] for x in db.session.query(ReviewLog.word_id).filter(ReviewLog.user_id == user.id, ReviewLog.review_type == 'new', ReviewLog.reviewed_at >= ys, ReviewLog.reviewed_at < ye).distinct().all()}
    done_ids = {x[0] for x in db.session.query(ReviewLog.word_id).filter(ReviewLog.user_id == user.id, ReviewLog.review_type == 'mandatory', ReviewLog.reviewed_at >= ts, ReviewLog.reviewed_at < te).distinct().all()}
    plan.mandatory_total = len(yesterday_ids); plan.mandatory_completed = len(yesterday_ids & done_ids)
    plan.self_total = UserWordCard.query.filter(UserWordCard.user_id == user.id, UserWordCard.state != 'new', UserWordCard.due_at <= datetime.utcnow()).count()
    db.session.commit()
    return jsonify({'dailyQuota': plan.new_quota, 'newCompleted': plan.new_completed, 'newRemaining': max(0, plan.new_quota - plan.new_completed), 'mandatoryDue': max(0, plan.mandatory_total - plan.mandatory_completed), 'mandatoryTotal': plan.mandatory_total, 'selfDue': plan.self_total, 'wordCount': Word.query.count()})


@bp.get('/queue/<mode>')
@require_user
def queue(user, mode):
    if mode not in {'new', 'mandatory', 'self'}:
        return jsonify({'error': 'invalid mode'}), 400
    plan = ensure_plan(user.id)
    if mode == 'new':
        remaining = max(0, plan.new_quota - plan.new_completed)
        limit = min(max(int(request.args.get('limit', remaining or 1)), 1), remaining)
        if remaining <= 0:
            return jsonify({'items': []})
        card_ids = db.session.query(UserWordCard.word_id).filter_by(user_id=user.id)
        words = Word.query.filter(~Word.id.in_(card_ids)).order_by(Word.id.asc()).limit(limit).all()
        return jsonify({'items': [serialize(w) for w in words]})
    if mode == 'self':
        limit = min(max(int(request.args.get('limit', 100)), 1), 200)
        cards = UserWordCard.query.filter(UserWordCard.user_id == user.id, UserWordCard.state != 'new', UserWordCard.due_at <= datetime.utcnow()).order_by(UserWordCard.due_at.asc()).limit(limit).all()
        words = {w.id: w for w in Word.query.filter(Word.id.in_([c.word_id for c in cards])).all()}
        return jsonify({'items': [serialize(words[c.word_id], c) for c in cards if c.word_id in words]})
    start, end = yesterday_window()
    today_start, today_end = day_window(date.today())
    new_ids = {x[0] for x in db.session.query(ReviewLog.word_id).filter(ReviewLog.user_id == user.id, ReviewLog.review_type == 'new', ReviewLog.reviewed_at >= start, ReviewLog.reviewed_at < end).distinct().all()}
    done_ids = {x[0] for x in db.session.query(ReviewLog.word_id).filter(ReviewLog.user_id == user.id, ReviewLog.review_type == 'mandatory', ReviewLog.reviewed_at >= today_start, ReviewLog.reviewed_at < today_end).distinct().all()}
    ids = list(new_ids - done_ids)[:200]
    cards = UserWordCard.query.filter(UserWordCard.user_id == user.id, UserWordCard.word_id.in_(ids)).all() if ids else []
    words = {w.id: w for w in Word.query.filter(Word.id.in_(ids)).all()} if ids else {}
    return jsonify({'items': [serialize(words[c.word_id], c) for c in cards if c.word_id in words]})


@bp.post('/review')
@require_user
def submit_review(user):
    data = request.get_json(silent=True) or {}
    word_id = data.get('wordId'); rating = int(data.get('rating', 0)); review_type = str(data.get('reviewType', 'self'))
    if rating not in (1, 2, 3, 4) or review_type not in ('new', 'mandatory', 'self'):
        return jsonify({'error': 'invalid review'}), 400
    word = Word.query.get(word_id)
    if not word: return jsonify({'error': 'word not found'}), 404
    plan = ensure_plan(user.id)
    if review_type == 'new' and plan.new_completed >= plan.new_quota:
        return jsonify({'error': 'daily new quota reached'}), 409
    card = UserWordCard.query.filter_by(user_id=user.id, word_id=word_id).first(); now = datetime.utcnow()
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
    if review_type == 'new': plan.new_completed += 1
    elif review_type == 'mandatory': plan.mandatory_completed += 1
    else: plan.self_completed += 1
    db.session.commit()
    return jsonify(serialize(word, card))
