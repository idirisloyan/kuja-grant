# Gunicorn configuration for Kuja Grant Management System
# Enforce 16MB max request body at the server level (prevents 503 from proxy)
limit_request_body = 16 * 1024 * 1024  # 16 MB
