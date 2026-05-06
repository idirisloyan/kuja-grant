"""
Rate limiting policies — Phase 13.11.

PMO's named-policy pattern: one source of truth for per-operation-class
limits. In-memory token bucket today; Redis swap is a one-file change.

Each policy has:
  name, max_calls, window_seconds, scope ('user' | 'ip')

Policies are looked up by name; if a name isn't registered, the call
falls through to a permissive default (ai_extraction limits — same
ceiling as today's ai_limiter).

Usage from a route:

    from app.utils.rate_policies import enforce, RateLimitedError

    @bp.route('/expensive-thing', methods=['POST'])
    @login_required
    def expensive_thing():
        try:
            enforce('ai_heavy', current_user.id)
        except RateLimitedError as e:
            return error_response('rate.limited', 429, retry_after=e.retry_after)
        ...
"""

import threading
import time
from typing import NamedTuple


class Policy(NamedTuple):
    name: str
    max_calls: int
    window_seconds: int
    scope: str  # 'user' | 'ip'


POLICIES = {
    # Auth
    'login':         Policy('login', 30, 60, 'ip'),
    'login_wide':    Policy('login_wide', 100, 600, 'ip'),
    # AI tiers
    'ai_extraction': Policy('ai_extraction', 10, 60, 'user'),
    'ai_heavy':      Policy('ai_heavy', 3, 60, 'user'),
    'ai_qa':         Policy('ai_qa', 30, 60, 'user'),
    # Mutation
    'upload':        Policy('upload', 30, 60, 'user'),
    'write':         Policy('write', 120, 60, 'user'),
    'bulk':          Policy('bulk', 10, 60, 'user'),
    # Auth misc
    'totp_enroll':   Policy('totp_enroll', 5, 600, 'user'),
    'push_subscribe': Policy('push_subscribe', 5, 60, 'user'),
}


class RateLimitedError(Exception):
    def __init__(self, policy_name: str, retry_after: int):
        super().__init__(f"rate limited: {policy_name}, retry in {retry_after}s")
        self.policy_name = policy_name
        self.retry_after = retry_after


# In-memory bucket: { (policy, scope_key): [timestamps...] } pruned on each call.
# Single-process; for multi-worker swap to Redis with the same shape.
_buckets: dict[tuple[str, str], list[float]] = {}
_lock = threading.Lock()


def enforce(policy_name: str, scope_key, *, ip: str | None = None) -> None:
    """Raise RateLimitedError if scope_key has exceeded the policy."""
    policy = POLICIES.get(policy_name)
    if not policy:
        return  # unknown policy — be permissive
    key_value = ip if policy.scope == 'ip' else str(scope_key)
    if not key_value:
        return
    bucket_key = (policy.name, key_value)
    now = time.monotonic()
    cutoff = now - policy.window_seconds

    with _lock:
        bucket = _buckets.setdefault(bucket_key, [])
        # Drop expired entries.
        bucket[:] = [t for t in bucket if t >= cutoff]
        if len(bucket) >= policy.max_calls:
            # Compute retry_after: time until oldest entry expires.
            retry_after = max(1, int(policy.window_seconds - (now - bucket[0])))
            raise RateLimitedError(policy.name, retry_after)
        bucket.append(now)


def reset(policy_name: str, scope_key) -> None:
    """Reset a specific scope's bucket. Used by admin tooling."""
    policy = POLICIES.get(policy_name)
    if not policy:
        return
    bucket_key = (policy.name, str(scope_key))
    with _lock:
        _buckets.pop(bucket_key, None)


def status(policy_name: str, scope_key, *, ip: str | None = None) -> dict:
    """Snapshot the bucket without consuming a token."""
    policy = POLICIES.get(policy_name)
    if not policy:
        return {'unknown': True}
    key_value = ip if policy.scope == 'ip' else str(scope_key)
    if not key_value:
        return {'no_scope': True}
    bucket_key = (policy.name, key_value)
    now = time.monotonic()
    cutoff = now - policy.window_seconds
    with _lock:
        bucket = _buckets.get(bucket_key, [])
        used = sum(1 for t in bucket if t >= cutoff)
    return {
        'policy': policy.name,
        'used': used,
        'max': policy.max_calls,
        'window_seconds': policy.window_seconds,
        'remaining': max(0, policy.max_calls - used),
    }
