web: python seed.py && gunicorn --bind 0.0.0.0:${PORT:-5000} --workers 2 --timeout 120 server:app
