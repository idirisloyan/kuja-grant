"""
Kuja Grant Management System — Entry Point for Gunicorn / Railway
=================================================================
This is the thin entry point consumed by Gunicorn (see Procfile).
All application logic lives under the ``app/`` package.
"""
from app import create_app

app = create_app()

if __name__ == '__main__':
    app.run()
