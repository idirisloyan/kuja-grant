#!/usr/bin/env python3
"""Kuja Grant Management - Entry Point"""
import os
from dotenv import load_dotenv
load_dotenv()

from server import app, db

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    host = os.getenv('HOST', '0.0.0.0')
    port = int(os.getenv('PORT', 5000))
    debug = os.getenv('FLASK_DEBUG', '1') == '1'
    print(f"\n{'='*50}")
    print(f"  Kuja Grant Management System")
    print(f"  Running at http://{host}:{port}")
    print(f"  Debug mode: {debug}")
    print(f"{'='*50}\n")
    app.run(host=host, port=port, debug=debug)
