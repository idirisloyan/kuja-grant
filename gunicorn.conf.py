# Gunicorn configuration for Kuja Grant Management System
#
# IMPORTANT: limit_request_body must be HIGHER than Flask's MAX_CONTENT_LENGTH (16 MB).
# If both are the same, Gunicorn kills the connection with 503 before Flask can
# return a controlled 413 JSON error. The 4 MB buffer lets Flask handle the rejection.
limit_request_body = 20 * 1024 * 1024  # 20 MB (Flask enforces 16 MB with proper 413)
