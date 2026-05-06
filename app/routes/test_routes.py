"""
Test-only routes — Phase 13.19.

Env-gated test endpoints used by Playwright + the e2e suite. The blueprint
registers, but every handler 404s when AI_MOCK_MODE != '1' (chosen over
403 to avoid leaking the route's existence in production).

Currently exposes:
  POST /api/test/ai-mock     — push a scripted scenario to the mock queue
  POST /api/test/ai-mock/reset — clear all scenarios
"""

from flask import Blueprint, jsonify, request, abort

from app.services import ai_mock

test_bp = Blueprint('test', __name__, url_prefix='/api/test')


def _gate():
    if not ai_mock.gate():
        abort(404)  # leak nothing


@test_bp.route('/ai-mock', methods=['POST'])
def push_mock():
    _gate()
    data = request.get_json(silent=True) or {}
    scenario = data.get('scenario', 'success')
    endpoint = data.get('endpoint')
    payload = data.get('payload')
    ok = ai_mock.push(scenario, endpoint=endpoint, payload=payload)
    return jsonify({'success': ok, 'scenario': scenario, 'endpoint': endpoint})


@test_bp.route('/ai-mock/reset', methods=['POST'])
def reset_mock():
    _gate()
    ai_mock.reset()
    return jsonify({'success': True})
