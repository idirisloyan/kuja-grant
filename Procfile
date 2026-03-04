web: flask db upgrade && gunicorn --bind 0.0.0.0:${PORT:-5000} --workers 4 --threads 4 --timeout 180 --worker-class gthread --max-requests 1000 --max-requests-jitter 50 --preload server:app
