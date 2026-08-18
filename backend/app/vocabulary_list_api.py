from flask import Blueprint, jsonify

from .api import login_required
from .models import Vocabulary
from .api import visible_vocabulary_filter

vocabulary_list_api = Blueprint("vocabulary_list_api", __name__)


@vocabulary_list_api.get("/vocabularies")
@login_required
def list_vocabularies(user):
    vocabularies = Vocabulary.query.filter(visible_vocabulary_filter(user)).order_by(
        Vocabulary.priority.desc(), Vocabulary.created_at.asc()
    ).all()
    return jsonify([
        {
            "id": vocabulary.id,
            "name": vocabulary.name,
            "kind": vocabulary.kind,
            "priority": vocabulary.priority,
            "description": vocabulary.description,
        }
        for vocabulary in vocabularies
    ])
