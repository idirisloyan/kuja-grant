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

import logging
import os
import threading
import time
from typing import NamedTuple

logger = logging.getLogger('kuja')


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
# Single-process. Phase 13.35 — Redis backend activates when REDIS_URL is set.
_buckets: dict[tuple[str, str], list[float]] = {}
_lock = threading.Lock()

# Phase 13.35 — Redis client cache. Initialized lazily on first call.
_redis_client = None
_redis_init_attempted = False


def _get_redis():
    """Return a Redis client if REDIS_URL is set + redis-py importable.

    Falls back to None — caller uses in-memory bucket instead.
    """
    global _redis_client, _redis_init_attempted
    if _redis_init_attempted:
        return _redis_client
    _redis_init_attempted = True
    url = os.environ.get('REDIS_URL') or os.environ.get('RATE_LIMIT_REDIS_URL')
    if not url:
        return None
    try:
        import redis as _redis
        client = _redis.from_url(url, socket_timeout=2, socket_connect_timeout=2)
        # Eager ping so we fail fast + log clearly if config is wrong.
        client.ping()
        _redis_client = client
        logger.info('rate_policies: Redis backend active')
        return _redis_client
    except Exception as e:
        logger.warning(f'rate_policies: Redis unavailable, falling back to in-memory ({e})')
        return None


def _enforce_redis(policy: Policy, key_value: str, client) -> None:
    """Atomic sliding-window rate limit via Redis sorted set.

    ZADD timestamp · ZREMRANGEBYSCORE expired · ZCARD · EXPIRE.
    Pipelined in one round-trip.
    """
    import time as _time
    now_ms = int(_time.time() * 1000)
    cutoff_ms = now_ms - (policy.window_seconds * 1000)
    redis_key = f'kuja:rl:{policy.name}:{key_value}'
    pipe = client.pipeline()
    pipe.zremrangebyscore(redis_key, 0, cutoff_ms)
    pipe.zadd(redis_key, {f'{now_ms}:{os.getpid()}': now_ms})
    pipe.zcard(redis_key)
    pipe.expire(redis_key, policy.window_seconds + 1)
    _, _, count, _ = pipe.execute()
    if count > policy.max_calls:
        # Pop the just-added entry — the call is rejected, not consumed.
        try:
            client.zremrangebyrank(redis_key, -1, -1)
        except Exception:
            pass
        # retry_after: time until the oldest entry leaves the window.
        try:
            oldest = client.zrange(redis_key, 0, 0, withscores=True)
            if oldest:
                _, oldest_ms = oldest[0]
                elapsed = (now_ms - int(oldest_ms)) / 1000
                retry_after = max(1, int(policy.window_seconds - elapsed))
            else:
                retry_after = 1
        except Exception:
            retry_after = 1
        raise RateLimitedError(policy.name, retry_after)


def enforce(policy_name: str, scope_key, *, ip: str | None = None) -> None:
    """Raise RateLimitedError if scope_key has exceeded the policy."""
    policy = POLICIES.get(policy_name)
    if not policy:
        return  # unknown policy — be permissive
    key_value = ip if policy.scope == 'ip' else str(scope_key)
    if not key_value:
        return

    # Phase 13.35 — prefer Redis when configured (multi-worker safe).
    client = _get_redis()
    if client is not None:
        try:
            _enforce_redis(policy, key_value, client)
            return
        except RateLimitedError:
            raise
        except Exception as e:
            logger.warning(f'rate_policies: Redis enforce failed ({e}); falling back to in-memory')

    # In-memory fallback — single-process semantics.
    bucket_key = (policy.name, key_value)
    now = time.monotonic()
    cutoff = now - policy.window_seconds

    with _lock:
        bucket = _buckets.setdefault(bucket_key, [])
        bucket[:] = [t for t in bucket if t >= cutoff]
        if len(bucket) >= policy.max_calls:
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
