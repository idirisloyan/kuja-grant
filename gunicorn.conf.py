# Gunicorn configuration for Kuja Grant Management System
#
# limit_request_body = 0 means NO gunicorn-level body limit.
# The OversizedUploadGuard WSGI middleware (app/middleware.py) handles rejection
# at the application level with proper body draining so the 413 response
# reaches the client cleanly (no TCP connection reset).
limit_request_body = 0

# Phase 149 — Notes on the gunicorn flags chosen in Procfile:
#
# --preload  Loads the WSGI app ONCE in the master process before
#            forking workers. Two wins for our deployment:
#              1. Memory: shared code pages via copy-on-write. Worker
#                 RAM grows only as Python writes to them, so the
#                 4-worker fleet's resident set is dramatically less
#                 than 4x the cold-start footprint.
#              2. Boot time: workers don't re-import. After the master
#                 imports the app, each fork is sub-second.
#            Side effect: the bootstrap ALTER pattern in
#            `app/__init__.py` runs in the master ONCE before fork,
#            which is exactly what we want -- workers don't race to
#            ALTER the same column.
#            Caveats:
#              * Don't open per-worker resources at import time. The
#                Anthropic SDK + SQLAlchemy engine are lazy, so they're
#                fine. Random-state init (e.g. uuid4 seeds) would not
#                be -- we use os.urandom which doesn't depend on init.
#              * Background threads / schedulers must be started in
#                a post_fork hook, not at import. We follow this rule
#                in app/__init__.py (rescreening_scheduler is opt-in
#                via env var and lives in a separate process).
#
# --workers 4 --threads 8  Hybrid sync workers with thread pool inside
#                          each, sized for Railway's default vCPU
#                          allocation. I/O-bound workload (Claude API
#                          + DB) benefits more from threads than
#                          process forks past 4.
#
# --max-requests 1000 --max-requests-jitter 50  Auto-recycle workers
#            after ~1000-1050 requests to bound resident memory growth
#            from slow leaks. Cheap insurance.
#
# --timeout 180  Long enough to cover slow AI calls; the timeout for
#                interactive surfaces is enforced at the application
#                layer via the per-endpoint resolver.
