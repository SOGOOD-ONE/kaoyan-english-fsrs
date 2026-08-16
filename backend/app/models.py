from datetime import datetime
import uuid
from . import db


def uid():
    return str(uuid.uuid4())


class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.String(36), primary_key=True, default=uid)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    nickname = db.Column(db.String(80), nullable=False, default='考研用户')
    status = db.Column(db.String(20), nullable=False, default='active')
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_login_at = db.Column(db.DateTime)


class UserSetting(db.Model):
    __tablename__ = 'user_settings'
    user_id = db.Column(db.String(36), db.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    daily_new_quota = db.Column(db.Integer, nullable=False, default=100)
    timezone = db.Column(db.String(64), nullable=False, default='Asia/Shanghai')
    sound_enabled = db.Column(db.Boolean, nullable=False, default=True)
    auto_play_example = db.Column(db.Boolean, nullable=False, default=False)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class Word(db.Model):
    __tablename__ = 'words'
    id = db.Column(db.String(36), primary_key=True, default=uid)
    word = db.Column(db.String(255), nullable=False)
    normalized_word = db.Column(db.String(255), nullable=False, unique=True, index=True)
    meaning = db.Column(db.Text, nullable=False, default='')
    example = db.Column(db.Text)
    translation = db.Column(db.Text)
    source = db.Column(db.String(100), default='system')
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)


class UserWordCard(db.Model):
    __tablename__ = 'user_word_cards'
    id = db.Column(db.String(36), primary_key=True, default=uid)
    user_id = db.Column(db.String(36), db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    word_id = db.Column(db.String(36), db.ForeignKey('words.id', ondelete='CASCADE'), nullable=False, index=True)
    state = db.Column(db.String(20), nullable=False, default='new')
    stability = db.Column(db.Float, nullable=False, default=0.0)
    difficulty = db.Column(db.Float, nullable=False, default=5.0)
    due_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    first_learned_at = db.Column(db.DateTime)
    last_review_at = db.Column(db.DateTime)
    correct_count = db.Column(db.Integer, nullable=False, default=0)
    wrong_count = db.Column(db.Integer, nullable=False, default=0)
    review_count = db.Column(db.Integer, nullable=False, default=0)
    __table_args__ = (db.UniqueConstraint('user_id', 'word_id', name='uq_user_word_card'),)


class ReviewLog(db.Model):
    __tablename__ = 'review_logs'
    id = db.Column(db.String(36), primary_key=True, default=uid)
    user_id = db.Column(db.String(36), db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    word_id = db.Column(db.String(36), db.ForeignKey('words.id', ondelete='CASCADE'), nullable=False)
    card_id = db.Column(db.String(36), db.ForeignKey('user_word_cards.id', ondelete='CASCADE'), nullable=False)
    rating = db.Column(db.Integer, nullable=False)
    review_type = db.Column(db.String(20), nullable=False)
    reviewed_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    elapsed_seconds = db.Column(db.Integer)


class DailyPlan(db.Model):
    __tablename__ = 'daily_plans'
    id = db.Column(db.String(36), primary_key=True, default=uid)
    user_id = db.Column(db.String(36), db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    plan_date = db.Column(db.Date, nullable=False)
    new_quota = db.Column(db.Integer, nullable=False, default=100)
    new_completed = db.Column(db.Integer, nullable=False, default=0)
    mandatory_total = db.Column(db.Integer, nullable=False, default=0)
    mandatory_completed = db.Column(db.Integer, nullable=False, default=0)
    self_total = db.Column(db.Integer, nullable=False, default=0)
    self_completed = db.Column(db.Integer, nullable=False, default=0)
    __table_args__ = (db.UniqueConstraint('user_id', 'plan_date', name='uq_user_plan_date'),)
