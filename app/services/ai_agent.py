"""
AI conversational agent ("Ask AI") — Phase 13.9.

PMO's pattern: Claude with tool-use over a registry of read-only DB
queries. Users ask "show me overdue reports for KEN grants" and get a
grounded answer from live data.

Tools are RBAC-checked + org-scoped. Each tool has a JSON schema for
input + a handler that returns a JSON-serializable result. The agent
runs in a single Claude call with `tools=[...]` exposed; Claude picks
which tool to call (or skips and answers from context). A retry loop
with max 3 tool-use iterations limits runaway loops.

Cost control:
  - Tools are cheap (Prisma/SQLAlchemy queries; no AI cost)
  - Only the orchestration costs tokens (Sonnet — accuracy matters)
  - Per-user rate limit via `ai_qa` policy in batch 31
"""

import json
import logging
from datetime import date, datetime, timezone

from app.extensions import db

logger = logging.getLogger('kuja')

# ---------------------------------------------------------------------------
# Tool registry
# ---------------------------------------------------------------------------
# Each tool has:
#   name        unique identifier
#   description plain-English string Claude reads to decide when to call it
#   schema      JSONSchema for the input
#   roles       set of allowed user roles (gates the tool entirely)
#   handler     fn(args, current_user) -> JSON-serializable result
#
# Add tools by appending to TOOLS. Stay under ~12 tools — too many and
# Claude struggles to pick the right one.


def _tool_list_my_grants(args, current_user):
    """List grants visible to the current user.

    Donor: their published + draft grants. NGO: open + awarded grants.
    Admin: all.
    """
    from app.models import Grant
    role = current_user.role
    org_id = getattr(current_user, 'org_id', None)
    q = Grant.query
    if role == 'donor':
        q = q.filter_by(donor_org_id=org_id)
    elif role == 'ngo':
        q = q.filter(Grant.status.in_(('open', 'closed')))
    status_filter = (args or {}).get('status')
    if status_filter:
        q = q.filter_by(status=status_filter)
    rows = q.order_by(Grant.created_at.desc()).limit(20).all()
    return [{
        'id': g.id, 'title': g.title, 'status': g.status,
        'deadline': g.deadline.isoformat() if g.deadline else None,
        'total_funding': g.total_funding,
    } for g in rows]


def _tool_list_overdue_reports(args, current_user):
    """List overdue reports the current user is responsible for."""
    from app.models import Report
    today = date.today()
    role = current_user.role
    org_id = getattr(current_user, 'org_id', None)
    q = Report.query.filter(Report.due_date < today, Report.status.in_(('draft', 'revision_requested')))
    if role == 'ngo':
        q = q.filter_by(submitted_by_org_id=org_id)
    elif role == 'donor':
        from app.models import Grant
        my_grants = [g.id for g in Grant.query.filter_by(donor_org_id=org_id).all()]
        if not my_grants:
            return []
        q = q.filter(Report.grant_id.in_(my_grants))
    rows = q.order_by(Report.due_date.asc()).limit(15).all()
    return [{
        'id': r.id, 'grant_id': r.grant_id, 'report_type': r.report_type,
        'due_date': r.due_date.isoformat() if r.due_date else None,
        'days_overdue': (today - r.due_date).days if r.due_date else None,
        'status': r.status, 'org_name': getattr(r, 'org_name', None),
    } for r in rows]


def _tool_list_open_risks(args, current_user):
    """List open + mitigating risks the current user owns or can see."""
    from app.models import Risk
    role = current_user.role
    org_id = getattr(current_user, 'org_id', None)
    q = Risk.query.filter(Risk.status.in_(('open', 'mitigating')))
    if role == 'donor':
        q = q.filter_by(owner_user_id=current_user.id)
    elif role == 'ngo':
        # NGO sees risks attached to their org or applications.
        q = q.filter(
            db.or_(
                db.and_(Risk.subject_kind == 'org', Risk.subject_id == org_id),
            )
        )
    rows = q.order_by(Risk.severity.asc(), Risk.due_date.asc().nullslast()).limit(20).all()
    return [r.to_dict() for r in rows]


def _tool_list_pending_applications(args, current_user):
    """For donors: applications awaiting their decision."""
    if current_user.role not in ('donor', 'admin'):
        return {'error': 'donor_only'}
    from app.models import Application, Grant, Organization
    org_id = getattr(current_user, 'org_id', None)
    if current_user.role == 'donor':
        my_grants = [g.id for g in Grant.query.filter_by(donor_org_id=org_id).all()]
        if not my_grants:
            return []
        q = Application.query.filter(Application.grant_id.in_(my_grants))
    else:
        q = Application.query
    q = q.filter(Application.status.in_(('submitted', 'under_review')))
    rows = q.order_by(Application.submitted_at.desc().nullslast()).limit(15).all()
    out = []
    for a in rows:
        org = db.session.get(Organization, a.ngo_org_id) if a.ngo_org_id else None
        out.append({
            'id': a.id, 'grant_id': a.grant_id,
            'ngo_name': org.name if org else None,
            'status': a.status,
            'ai_score': a.ai_score, 'final_score': a.final_score,
            'submitted_at': a.submitted_at.isoformat() if a.submitted_at else None,
        })
    return out


def _tool_grant_compliance_health(args, current_user):
    """Return the 4-pillar compliance health for one grant the user can see."""
    from app.models import Grant
    grant_id = (args or {}).get('grant_id')
    if not grant_id:
        return {'error': 'grant_id required'}
    g = db.session.get(Grant, int(grant_id))
    if not g:
        return {'error': 'grant_not_found'}
    if current_user.role == 'donor' and g.donor_org_id != getattr(current_user, 'org_id', None):
        return {'error': 'forbidden'}
    if current_user.role == 'ngo':
        return {'error': 'compliance health is donor-side only'}
    from app.services.compliance_health import calculate_grant_compliance_health
    return calculate_grant_compliance_health(int(grant_id))


def _tool_org_search(args, current_user):
    """Search organizations by name or country (donor + admin only)."""
    if current_user.role not in ('donor', 'admin'):
        return {'error': 'donor_only'}
    from app.models import Organization
    query = (args or {}).get('query', '').strip()
    if not query:
        return []
    rows = Organization.query.filter(
        db.or_(
            Organization.name.ilike(f'%{query}%'),
            Organization.country.ilike(f'%{query}%'),
        )
    ).limit(15).all()
    return [{
        'id': o.id, 'name': o.name, 'country': getattr(o, 'country', None),
        'sectors': getattr(o, 'sectors', None), 'mission': (getattr(o, 'mission', None) or '')[:200],
    } for o in rows]


def _tool_recent_activity(args, current_user):
    """Recent activity from the audit log: status changes, decisions, AI runs."""
    from sqlalchemy import text
    limit = min(int((args or {}).get('limit', 20)), 50)
    try:
        rows = db.session.execute(
            text("""
                SELECT created_at, endpoint, role, success
                FROM ai_call_logs
                WHERE org_id = :oid
                ORDER BY created_at DESC
                LIMIT :lim
            """),
            {"oid": getattr(current_user, 'org_id', None), "lim": limit},
        ).fetchall()
        return [{
            'ts': r[0].isoformat() if r[0] else None,
            'endpoint': r[1], 'role': r[2], 'success': bool(r[3]),
        } for r in rows]
    except Exception as e:
        return {'error': str(e)[:120]}


def _tool_my_assessments(args, current_user):
    """List assessments for the current org (NGO only, or admin all)."""
    from app.models import Assessment
    org_id = getattr(current_user, 'org_id', None)
    q = Assessment.query
    if current_user.role == 'ngo':
        q = q.filter_by(organization_id=org_id)
    rows = q.order_by(Assessment.created_at.desc()).limit(10).all()
    return [{
        'id': a.id, 'framework': getattr(a, 'framework', None),
        'score': getattr(a, 'score', None),
        'completed_at': a.completed_at.isoformat() if getattr(a, 'completed_at', None) else None,
    } for a in rows]


TOOLS = [
    {
        'name': 'list_my_grants',
        'description': "List the user's visible grants. Donors see their own; NGOs see open/closed. Optionally filter by status.",
        'schema': {
            'type': 'object',
            'properties': {
                'status': {'type': 'string', 'enum': ['draft', 'open', 'closed']},
            },
        },
        'roles': {'donor', 'ngo', 'admin', 'reviewer'},
        'handler': _tool_list_my_grants,
    },
    {
        'name': 'list_overdue_reports',
        'description': 'List overdue reports the user is responsible for, sorted by days overdue.',
        'schema': {'type': 'object', 'properties': {}},
        'roles': {'donor', 'ngo', 'admin'},
        'handler': _tool_list_overdue_reports,
    },
    {
        'name': 'list_open_risks',
        'description': "List open or mitigating risks visible to the user. Useful for 'what needs my attention?' questions.",
        'schema': {'type': 'object', 'properties': {}},
        'roles': {'donor', 'ngo', 'admin', 'reviewer'},
        'handler': _tool_list_open_risks,
    },
    {
        'name': 'list_pending_applications',
        'description': 'For donors: applications awaiting decision (submitted or under_review).',
        'schema': {'type': 'object', 'properties': {}},
        'roles': {'donor', 'admin'},
        'handler': _tool_list_pending_applications,
    },
    {
        'name': 'grant_compliance_health',
        'description': "Get the 4-pillar compliance health score for one grant. Returns score, band (on_track/at_risk/high_risk), and per-pillar breakdown.",
        'schema': {
            'type': 'object',
            'properties': {'grant_id': {'type': 'integer'}},
            'required': ['grant_id'],
        },
        'roles': {'donor', 'admin'},
        'handler': _tool_grant_compliance_health,
    },
    {
        'name': 'org_search',
        'description': 'Search NGOs by name or country. Donor + admin only.',
        'schema': {
            'type': 'object',
            'properties': {'query': {'type': 'string'}},
            'required': ['query'],
        },
        'roles': {'donor', 'admin'},
        'handler': _tool_org_search,
    },
    {
        'name': 'recent_activity',
        'description': "Recent AI calls + activity for the user's org. Useful for 'what happened today?' questions.",
        'schema': {
            'type': 'object',
            'properties': {'limit': {'type': 'integer', 'minimum': 1, 'maximum': 50}},
        },
        'roles': {'donor', 'ngo', 'admin', 'reviewer'},
        'handler': _tool_recent_activity,
    },
    {
        'name': 'my_assessments',
        'description': 'List capacity assessments for the current org. NGO sees own; admin sees all.',
        'schema': {'type': 'object', 'properties': {}},
        'roles': {'ngo', 'admin'},
        'handler': _tool_my_assessments,
    },
]


def get_tools_for_role(role: str):
    """Return tool list filtered by role + reshaped for Anthropic's `tools` param."""
    return [
        {
            'name': t['name'],
            'description': t['description'],
            'input_schema': t['schema'],
        }
        for t in TOOLS if role in t['roles']
    ]


def find_tool(name: str):
    for t in TOOLS:
        if t['name'] == name:
            return t
    return None


# ---------------------------------------------------------------------------
# Agent runner
# ---------------------------------------------------------------------------

def run_agent(query: str, current_user, *, max_steps: int = 3) -> dict:
    """Run the conversational agent. Returns:

    {
      'answer': str,                    # natural-language answer
      'tools_used': [tool_name, ...],   # for transparency
      'data': { tool_name: result },    # raw tool output, for the UI to render
      'source': 'claude' | 'fallback',
    }
    """
    from app.services.ai_service import AIService
    client = AIService._get_client()
    if not client:
        return {
            'answer': "AI assistant is not configured. Try a specific search instead.",
            'tools_used': [], 'data': {}, 'source': 'fallback',
        }

    role = current_user.role
    available_tools = get_tools_for_role(role)
    if not available_tools:
        return {
            'answer': 'No tools are available for your role.',
            'tools_used': [], 'data': {}, 'source': 'fallback',
        }

    system = (
        "You are Kuja's data assistant. Answer the user's question using "
        "the read-only tools provided. Keep answers concise — 1-3 sentences "
        "of narrative, then point at the data. If a tool returns nothing, "
        "say so plainly; don't hallucinate. Never expose raw IDs unless the "
        "user explicitly asks for them. Never invent organizations or grants."
    )

    messages = [{"role": "user", "content": query}]
    tools_used = []
    data_collected = {}

    try:
        scoped = client.with_options(timeout=AIService._resolve_timeout('chat'))
        for _ in range(max_steps):
            resp = scoped.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=1024,
                system=system,
                tools=available_tools,
                messages=messages,
            )
            stop_reason = getattr(resp, 'stop_reason', None)
            if stop_reason == 'tool_use':
                # Find the tool_use block(s) and run handlers.
                tool_results = []
                for block in (resp.content or []):
                    if getattr(block, 'type', None) == 'tool_use':
                        name = getattr(block, 'name', None)
                        tool_input = getattr(block, 'input', None) or {}
                        tool = find_tool(name)
                        if not tool or role not in tool['roles']:
                            result = {'error': 'tool_unavailable'}
                        else:
                            try:
                                result = tool['handler'](tool_input, current_user)
                            except Exception as e:
                                logger.error(f"Tool {name} failed: {e}")
                                result = {'error': str(e)[:200]}
                        tools_used.append(name)
                        data_collected[name] = result
                        tool_results.append({
                            'type': 'tool_result',
                            'tool_use_id': getattr(block, 'id', None),
                            'content': json.dumps(result, default=str)[:8000],
                        })
                # Append the assistant turn (the tool_use block) + the tool results
                # so Claude can synthesize the final answer.
                messages.append({'role': 'assistant', 'content': resp.content})
                messages.append({'role': 'user', 'content': tool_results})
                continue
            # Stop reason 'end_turn' or other — extract text and return.
            answer_parts = []
            for block in (resp.content or []):
                if getattr(block, 'type', None) == 'text':
                    answer_parts.append(getattr(block, 'text', ''))
            return {
                'answer': '\n\n'.join(answer_parts).strip() or 'No answer generated.',
                'tools_used': tools_used,
                'data': data_collected,
                'source': 'claude',
            }
        # Max steps hit without end_turn.
        return {
            'answer': 'I gathered some data but reached the step limit. Try asking a more specific question.',
            'tools_used': tools_used,
            'data': data_collected,
            'source': 'claude',
        }
    except Exception as e:
        logger.error(f"Agent run failed: {e}")
        return {
            'answer': "I couldn't complete that request. Try rephrasing or asking a simpler question.",
            'tools_used': tools_used,
            'data': data_collected,
            'source': 'fallback',
        }
