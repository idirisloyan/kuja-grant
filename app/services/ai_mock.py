"""
AI mock harness — Phase 13.19.

PMO's pattern: AI_MOCK_MODE=1 swaps the Anthropic client for a stub
that drains a queue of scripted responses. A test endpoint at
/api/test/ai-mock (env-gated) lets Playwright/test runners push
scenarios at runtime: success, timeout, rate_limited, malformed,
aborted.

Three security gates on the test endpoint:
  1. AI_MOCK_MODE === '1' on the subsystem
  2. The endpoint 404s when off (chosen over 403 to not leak the
     route's existence)
  3. Every handler invokes the gate() helper before any work

Usage in tests:

    requests.post('/api/test/ai-mock', json={
        'scenario': 'rate_limited',
        'endpoint': 'draft_application',
    })
    # Next call to AIService.draft_application(...) returns the
    # scripted error path without hitting Anthropic.

Failure-path tests against the real API are slow + expensive + flaky.
With the mock, "what does the user see when Anthropic 429s?" is a
deterministic 200ms test.
"""

import os
import logging

logger = logging.getLogger('kuja')

# Module-level queue: { endpoint or '*': [scenario, ...] }
# Each scenario is consumed FIFO; once empty, behavior falls through
# to the real AI client (so a partially-mocked test doesn't hang).
_QUEUE: dict[str, list[dict]] = {}


def is_mock_mode() -> bool:
    """Strict env-gate. Production must never see this enabled."""
    return os.environ.get('AI_MOCK_MODE') == '1'


def gate() -> bool:
    """Helper for the test endpoint. Returns False if mock mode is off,
    True if it's safe to proceed. Callers should 404 on False."""
    return is_mock_mode()


def push(scenario: str, *, endpoint: str | None = None, payload: dict | None = None):
    """Enqueue a scenario for the next call to `endpoint` (or any call
    if endpoint is None).

    Scenarios:
      success      — return payload (or a default success dict)
      timeout      — raise a Timeout exception
      rate_limited — raise a 429-shaped exception
      malformed    — return a string that won't parse as JSON
      aborted      — raise an AbortError
    """
    if not is_mock_mode():
        return False
    key = endpoint or '*'
    _QUEUE.setdefault(key, []).append({
        'scenario': scenario,
        'payload': payload or {},
    })
    return True


def consume(endpoint: str) -> dict | None:
    """Pop the next scripted scenario for this endpoint (or any).
    Returns None if no scenario queued — caller falls through to real AI."""
    if not is_mock_mode():
        return None
    # Endpoint-specific queue first, then wildcard.
    for key in (endpoint, '*'):
        q = _QUEUE.get(key)
        if q:
            return q.pop(0)
    return None


def reset():
    """Clear all queued scenarios. For test setup/teardown."""
    if not is_mock_mode():
        return
    _QUEUE.clear()


def render_scenario(scenario_dict: dict) -> dict | str:
    """Convert a scenario dict into the value/exception _call_claude
    or _call_claude_tool would return.

    For 'success' returns the payload (caller wraps in their schema shape).
    For error scenarios raises the appropriate exception so the caller's
    try/except triggers as it would in production.
    """
    s = scenario_dict.get('scenario', 'success')
    if s == 'timeout':
        # Match anthropic SDK's timeout error shape — string match in caller.
        raise TimeoutError("mock: request timed out")
    if s == 'rate_limited':
        raise RuntimeError("mock: 429 rate limit exceeded")
    if s == 'aborted':
        raise InterruptedError("mock: aborted by client")
    if s == 'malformed':
        return "this is not valid JSON {[]}"
    # Default: success
    return scenario_dict.get('payload', {'success': True, 'mock': True})
