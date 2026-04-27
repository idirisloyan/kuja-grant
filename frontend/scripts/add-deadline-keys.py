"""Add deadline.* keys + reuse status.* keys for the local StatusChip."""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2] / "frontend" / "src" / "i18n"

KEYS = {
    "en": {
        "deadline.overdue": "{n}d overdue",
        "deadline.due_today": "Due today",
        "deadline.days_left": "{n}d left",
        "applications.no_responses": "No responses submitted",
    },
    "ar": {
        "deadline.overdue": "متأخّر بـ {n} يوم",
        "deadline.due_today": "مستحق اليوم",
        "deadline.days_left": "متبقّي {n} يوم",
        "applications.no_responses": "لم يتم تقديم أي ردود",
    },
    "fr": {
        "deadline.overdue": "{n}j en retard",
        "deadline.due_today": "Échéance aujourd'hui",
        "deadline.days_left": "{n}j restants",
        "applications.no_responses": "Aucune réponse soumise",
    },
    "es": {
        "deadline.overdue": "{n}d de retraso",
        "deadline.due_today": "Vence hoy",
        "deadline.days_left": "{n}d restantes",
        "applications.no_responses": "No se han enviado respuestas",
    },
    "sw": {
        "deadline.overdue": "siku {n} zimepita",
        "deadline.due_today": "Inaisha leo",
        "deadline.days_left": "siku {n} zilizosalia",
        "applications.no_responses": "Hakuna majibu yaliyowasilishwa",
    },
    "so": {
        "deadline.overdue": "{n} maalmood ka dib",
        "deadline.due_today": "Maanta ayuu dhammaadayaa",
        "deadline.days_left": "{n} maalmood ayaa hadhay",
        "applications.no_responses": "Wax jawaab ah lama gudbin",
    },
}

for lang, additions in KEYS.items():
    p = ROOT / f"{lang}.json"
    data = json.loads(p.read_text(encoding="utf-8"))
    added = 0
    for k, v in additions.items():
        if k not in data:
            data[k] = v
            added += 1
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{lang}: +{added}")
