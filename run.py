#!/usr/bin/env python3
"""Kuja Grant Management — Local Development Runner

Creates the app, ensures all tables exist, and starts the Flask dev server.
"""
import os
from dotenv import load_dotenv

load_dotenv()

from app import create_app
from app.extensions import db

app = create_app()

if __name__ == '__main__':
    with app.app_context():
        db.create_all()

    host = os.getenv('HOST', '0.0.0.0')
    port = int(os.getenv('PORT', 5000))
    debug = os.getenv('FLASK_DEBUG', '1') == '1'

    print(f"\n{'='*50}")
    print(f"  Kuja Grant Management System v2.0.0")
    print(f"  Running at http://{host}:{port}")
    print(f"  Debug mode: {debug}")
    print(f"{'='*50}\n")

    app.run(host=host, port=port, debug=debug)
