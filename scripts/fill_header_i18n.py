"""Phase 134 — Fill the three header keys that lag in fr/sw/so/es.

Idempotent: if already present, leaves alone.
"""
import json
import os

ROOT = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'src', 'i18n')

# (key, fr, sw, so, es)
ROWS = [
    ('header.logout',
     'Se déconnecter',
     'Toka',
     'Ka bax',
     'Cerrar sesión'),
    ('header.notification_settings',
     'Paramètres de notification',
     'Mipangilio ya arifa',
     'Dejinta digniinta',
     'Configuración de notificaciones'),
    ('nav.metrics',
     'Mesures de la plateforme',
     'Vipimo vya jukwaa',
     'Cabbiraadaha goobta',
     'Métricas de la plataforma'),
]

LOC_IDX = {'fr': 1, 'sw': 2, 'so': 3, 'es': 4}

for locale, idx in LOC_IDX.items():
    path = os.path.join(ROOT, f'{locale}.json')
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    added = 0
    for row in ROWS:
        key = row[0]
        val = row[idx]
        if key not in data:
            data[key] = val
            added += 1
    data = {k: data[k] for k in sorted(data.keys())}
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print(f'{locale}: added {added} keys')
