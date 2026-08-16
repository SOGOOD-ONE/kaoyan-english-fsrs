from datetime import datetime, date
from uuid import uuid4

from . import db


def uid():
    return str(uuid4())


class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.String(36), primary_key=True, default=uid)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    username = db.Column(db.String(64), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    nickname = db.Column(db.String(64), nullable=False)
    avatar_url = db.Column(db.String(500))
    status = db.Column(db.String(20), nullable=False, default="active")
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_login_at = db.Column(db.DateTime)

    settings = db.relationship("UserSettings", back_populates="user", uselist=False, cascade="all, delete-orphan")


class UserSettings(db.Model):
    __tablename__ = "user_settings"
    user_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    daily_new_quota = db.Column(db.Integer, nullable=False, default=100)
    timezone = db.Column(db.String(64), nullable=False, default="Asia/Shanghai")
    theme = db.Column(db.String(20), nullable=False, default="system")
    sound_enabled = db.Column(db.Boolean, nullable=False, default=True)
    example_auto_play = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    user = db.relationship("User", back_populates="settings")


class Word(db.Model):
    __tablename__ = "words"
    id = db.Column(db.String(36), primary_key=True, default=uid)
    normalized = db.Column(db.String(255), unique=True, nullable=False, index=True)
    word = db.Column(db.String(255), nullable=False)
    part_of_speech = db.Column(db.String(100))
    meaning = db.Column(db.Text)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)


class WordSource(db.Model):
    __tablename__ = "word_sources"
    id = db.Column(db.String(36), primary_key=True, default=uid)
    word_id = db.Column(db.String(36), db.ForeignKey("words.id", ondelete="CASCADE"), nullable=False, index=True)
    year = db.Column(db.Integer)
    paper = db.Column(db.String(100))
    article = db.Column(db.String(100))
    paragraph = db.Column(db.Integer)
    sentence = db.Column(db.Text)
    translation = db.Column(db.Text)


class Vocabulary(db.Model):
    __tablename__ = "vocabularies"
    id = db.Column(db.String(36), primary_key=True, default=uid)
    owner_user_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"))
    name = db.Column(db.String(200), nullable=False)
    kind = db.Column(db.String(20), nullable=False, default="user")
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)


class VocabularyWord(db.Model):
    __tablename__ = "vocabulary_words"
    id = db.Column(db.String(36), primary_key=True, default=uid)
    vocabulary_id = db.Column(db.String(36), db.ForeignKey("vocabularies.id", ondelete="CASCADE"), nullable=False)
    word_id = db.Column(db.String(36), db.ForeignKey("words.id", ondelete="CASCADE"), nullable=False)
    note = db.Column(db.Text)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    __table_args__ = (db.UniqueConstraint("vocabulary_id", "word_id", name="uq_vocab_word"),)


class UserCard(db.Model):
    __tablename__ = "user_cards"
    id = db.Column(db.String(36), primary_key=True, default=uid)
    user_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    word_id = db.Column(db.String(36), db.ForeignKey("words.id", ondelete="CASCADE"), nullable=False, index=True)
    state = db.Column(db.String(20), nullable=False, default="new")
    stability = db.Column(db.Float, nullable=False, default=1.0)
    difficulty = db.Column(db.Float, nullable=False, default=5.5)
    due_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    first_learned_at = db.Column(db.DateTime)
    last_review_at = db.Column(db.DateTime)
    correct_count = db.Column(db.Integer, nullable=False, default=0)
    wrong_count = db.Column(db.Integer, nullable=False, default=0)
    review_count = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    __table_args__ = (db.UniqueConstraint("user_id", "word_id", name="uq_user_word_card"),)


class ReviewLog(db.Model):
    __tablename__ = "review_logs"
    id = db.Column(db.String(36), primary_key=True, default=uid)
    user_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    word_id = db.Column(db.String(36), db.ForeignKey("words.id", ondelete="CASCADE"), nullable=False, index=True)
    card_id = db.Column(db.String(36), db.ForeignKey("user_cards.id", ondelete="CASCADE"), nullable=False)
    rating = db.Column(db.Integer, nullable=False)
    review_type = db.Column(db.String(20), nullable=False)
    reviewed_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, index=True)
    state_before = db.Column(db.String(20))
    state_after = db.Column(db.String(20))
    stability_before = db.Column(db.Float)
    stability_after = db.Column(db.Float)
    difficulty_before = db.Column(db.Float)
    difficulty_after = db.Column(db.Float)
    elapsed_seconds = db.Column(db.Integer)


class DailyPlan(db.Model):
    __tablename__ = "daily_plans"
    id = db.Column(db.String(36), primary_key=True, default=uid)
    user_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    plan_date = db.Column(db.Date, nullable=False, default=date.today)
    new_quota = db.Column(db.Integer, nullable=False, default=100)
    new_completed = db.Column(db.Integer, nullable=False, default=0)
    mandatory_total = db.Column(db.Integer, nullable=False, default=0)
    mandatory_completed = db.Column(db.Integer, nullable=False, default=0)
    self_total = db.Column(db.Integer, nullable=False, default=0)
    self_completed = db.Column(db.Integer, nullable=False, default=0)
    __table_args__ = (db.UniqueConstraint("user_id", "plan_date", name="uq_daily_plan"),)


class StudySession(db.Model):
    __tablename__ = "study_sessions"
    id = db.Column(db.String(36), primary_key=True, default=uid)
    user_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    session_type = db.Column(db.String(20), nullable=False)
    started_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    finished_at = db.Column(db.DateTime)
    planned_count = db.Column(db.Integer, nullable=False, default=0)
    completed_count = db.Column(db.Integer, nullable=False, default=0)


class ImportBatch(db.Model):
    __tablename__ = "import_batches"
    id = db.Column(db.String(36), primary_key=True, default=uid)
    user_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    filename = db.Column(db.String(255), nullable=False)
    total_rows = db.Column(db.Integer, nullable=False, default=0)
    valid_rows = db.Column(db.Integer, nullable=False, default=0)
    inserted_words = db.Column(db.Integer, nullable=False, default=0)
    linked_existing = db.Column(db.Integer, nullable=False, default=0)
    duplicates_in_file = db.Column(db.Integer, nullable=False, default=0)
    invalid_rows = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
