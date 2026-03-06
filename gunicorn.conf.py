# Gunicorn configuration for Kuja Grant Management System
#
# limit_request_body = 0 means NO gunicorn-level body limit.
# The OversizedUploadGuard WSGI middleware (app/middleware.py) handles rejection
# at the application level with proper body draining so the 413 response
# reaches the client cleanly (no TCP connection reset).
limit_request_body = 0
