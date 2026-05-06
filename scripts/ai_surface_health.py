"""
CLI wrapper for the flagship AI surface health runner — Phase 13.39.

Usage:
  py -3 scripts/ai_surface_health.py             # exercises AI when key is set
  py -3 scripts/ai_surface_health.py --dry-run   # never calls Anthropic

Designed for cron — exits 0 on overall='ok' or 'skipped', exits 1 on
'fail' so a wrapping `cron @daily` can alert on regression.

Output is JSON to stdout for easy parsing; one human-readable summary
line to stderr so operators tailing logs see drift fast.
"""

import json
import os
import sys


def main():
    dry = '--dry-run' in sys.argv

    # Make the app package importable.
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    # Boot a Flask app context so AIService can read config.
    from app import create_app  # type: ignore
    app = create_app()
    with app.app_context():
        from app.services.ai_surface_health import run_health_check
        result = run_health_check(exercise_ai=not dry)

    print(json.dumps(result, indent=2, default=str))

    summary = (
        f"AI surface health: overall={result['overall']} "
        f"ok={result['ok']} fail={result['fail']} skipped={result['skipped']}"
    )
    print(summary, file=sys.stderr)

    if result['overall'] == 'fail':
        # Print only failed surface names for fast triage.
        for s in result['surfaces']:
            if s['status'] == 'fail':
                print(f"  FAIL {s['name']}: {s.get('detail', '')}", file=sys.stderr)
        sys.exit(1)
    sys.exit(0)


if __name__ == '__main__':
    main()
