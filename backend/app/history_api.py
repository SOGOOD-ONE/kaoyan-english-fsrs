from flask import Blueprint, jsonify, request, session

from .history import build_history

history_api = Blueprint("history_api", __name__)


@history_api.get("/history")
def history():
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"error": "unauthorized"}), 401
    try:
        days = int(request.args.get("days", 30))
    except ValueError:
        days = 30
    return jsonify(build_history(user_id, days))
