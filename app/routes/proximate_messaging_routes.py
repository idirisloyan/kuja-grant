"""Proximate messaging routes + automations — backlog items 1-18, 33
(July 2026).

The HTTP surface over ProximateMessaging (app/services/proximate_messaging.py),
plus the five automation entry points that other Proximate code calls when a
real-world event happens (a disbursement goes out, a partner clears DD, a
round activates).

Split out of proximate_routes.py rather than appended to it because that file
is already ~10.6k lines and the messaging surface has a genuinely different
authorisation story: three of these endpoints are unauthenticated (the Meta
webhook) or cron-authenticated, whereas proximate_routes.py is overwhelmingly
OB-session territory.

WHAT THIS MODULE WILL NOT DO
----------------------------
It will not report a send that did not happen. Every automation returns the
persisted ProximateMessage row (or a list of them); a row with
status='unsent' is the OB's manual to-do, not a failure to hide. The crons
return an explicit {'configured': False, 'skipped': ...} payload when no
provider is wired, rather than looping over recipients and reporting a
cheerful count of messages nobody received. Both of those shapes exist
because EmailService and MessagingService._send_log each shipped the
opposite behaviour and it cost us real partner contact.
"""

import base64
import hashlib
import hmac
import logging
import os

from datetime import datetime, timedelta, timezone

from flask import Blueprint, current_app, g, jsonify, request
from flask_login import current_user

from app.extensions import db
from app.models import (
    AuditChainEntry,
    Network,
    ProximateDisbursement,
    ProximateEndorserInvite,
    ProximateMessage,
    ProximateOutcomeAttestation,
    ProximatePartner,
    ProximateSessionWindow,
)
from app.services.proximate_messaging import (
    ProximateMessaging,
    detect_locale,
    normalise_phone,
)
from app.utils.helpers import get_request_json
from app.utils.network import ob_required

logger = logging.getLogger('kuja')

proximate_messaging_bp = Blueprint(
    'proximate_messaging', __name__, url_prefix='/api/proximate',
)

# Second blueprint, deliberately OUTSIDE /api/, carrying nothing but the
# provider callback. See _webhook_inbound's docstring for why this exists:
# app/middleware.py's csrf_protect rejects form-encoded POSTs under /api/,
# and Twilio (the transport actually wired on prod — see the July 2026
# Twilio WhatsApp work) only ever posts application/x-www-form-urlencoded.
# Meta's JSON callback works fine on the /api/ path and remains the
# documented one.
proximate_hooks_bp = Blueprint(
    'proximate_hooks', __name__, url_prefix='/hooks/proximate',
)


@proximate_messaging_bp.before_request
def _stamp_proximate_audit_scope():
    """Mirror of proximate_bp's before_request (QA 2026-07-14). Audit rows
    written while serving these routes belong to the Proximate tenant, but
    AuditChainEntry.append's fallback reads the HOST-resolved g.network,
    which is the default Kuja tenant for webhook and cron callers that send
    no tenant override. Without this the rows land on network_id=1.

    Duplicated rather than imported because importing from proximate_routes
    would pull that module's ~10.6k lines into this one's import graph for a
    12-line function.
    """
    try:
        net = getattr(g, 'network', None)
        if net is not None and getattr(net, 'slug', None) == 'proximate':
            g.audit_network_id = net.id
            return
        proximate = Network.query.filter_by(slug='proximate').first()
        if proximate:
            g.audit_network_id = proximate.id
    except Exception:
        pass


proximate_hooks_bp.before_request(_stamp_proximate_audit_scope)


# ---- Tenant guard -----------------------------------------------------


def _proximate_network():
    """Return the Proximate Network row for the current request, or None.

    Same shape as proximate_routes._proximate_network: host-resolved
    g.network is the source of truth, with an authenticated-user fallback
    for tests and direct hits that carry no Host override.
    """
    net = getattr(g, 'network', None)
    if net and net.slug == 'proximate':
        return net
    if current_user.is_authenticated:
        return Network.query.filter_by(slug='proximate').first()
    return None


def _require_proximate_tenant():
    """(network, None) if OK, else (None, error_response)."""
    net = _proximate_network()
    if not net:
        return None, (jsonify({
            'success': False,
            'error': 'Proximate tenant not active for this request',
        }), 403)
    return net, None


def _proximate_network_unauthenticated():
    """Tenant resolution for the webhook, which has no session and no
    trustworthy Host header (the provider calls us, not the browser)."""
    net = getattr(g, 'network', None)
    if net is not None and getattr(net, 'slug', None) == 'proximate':
        return net
    return Network.query.filter_by(slug='proximate').first()


def _cron_authorised() -> bool:
    """Bearer CRON_SECRET, identical to the existing Proximate crons."""
    secret = current_app.config.get('CRON_SECRET') or os.getenv('CRON_SECRET')
    auth = request.headers.get('Authorization', '')
    return bool(secret) and auth == f'Bearer {secret}'


def _not_configured_payload(job: str, **extra) -> dict:
    """The honest no-op body every messaging cron returns when there is no
    provider. Deliberately success=True — the cron ran correctly and did
    the right thing — with configured=False carrying the real news, so a
    green GitHub Actions run never implies messages went out."""
    body = {
        'success': True,
        'job': job,
        'configured': False,
        'skipped': 'messaging not configured — no WhatsApp/SMS provider '
                   'is wired, so no messages were attempted',
        'sent': 0,
        'examined': 0,
    }
    body.update(extra)
    return body


# ---- Link + formatting helpers ---------------------------------------


def _public_base() -> str:
    """Base URL for the partner/endorser token pages. Proximate has been
    host-native on proximate.kuja.org since 2026-07-20, so that is the
    default rather than the shared Railway hostname — a link on the shared
    host resolves to the Kuja tenant and shows the recipient nothing."""
    return (
        os.getenv('PROXIMATE_PUBLIC_BASE_URL')
        or os.getenv('KUJA_PUBLIC_BASE_URL')
        or 'https://proximate.kuja.org'
    ).rstrip('/')


def _token_link(path: str, token: str | None) -> str:
    """Build a public token URL. Returns '' for a missing token so the
    template renders without a dangling '?t=None' — render() tolerates an
    empty {link} and the OB sees an obviously-incomplete message rather
    than one that looks fine and 404s for the partner."""
    if not token:
        return ''
    return f'{_public_base()}{path}?t={token}'


def _fmt_amount(amount) -> str:
    """Whole dollars unless there are real cents. '$1,200' reads better
    than '$1200.00' in a 160-character SMS."""
    if amount is None:
        return ''
    try:
        v = float(amount)
    except (TypeError, ValueError):
        return str(amount)
    return f'${v:,.0f}' if abs(v - round(v)) < 0.005 else f'${v:,.2f}'


def _fmt_date(dt) -> str:
    """'24 Jul 2026'. Left in English/Latin numerals for both locales on
    purpose: Sudan partners read Western dates on bank and NGO paperwork,
    and an Arabic-Indic date in a WhatsApp body is more likely to be
    misread than an English one."""
    if not dt:
        return ''
    return dt.strftime('%d %b %Y')


def _learned_locale(network_id: int, phone: str | None) -> str | None:
    """The locale we OBSERVED this number replying in, if any.

    Beats every heuristic: if someone answered us in Arabic, write to them
    in Arabic regardless of what their record's name field looks like.
    """
    p = normalise_phone(phone)
    if not p:
        return None
    win = ProximateSessionWindow.query.filter_by(
        network_id=network_id, phone=p,
    ).first()
    return win.detected_locale if win and win.detected_locale else None


def _partner_locale(partner) -> str:
    """Locale for a partner. Learned-from-inbound first, then the presence
    of an Arabic name as the fallback signal. ProximatePartner has no
    language column; adding one is a schema change outside this wave."""
    learned = _learned_locale(partner.network_id, partner.contact_phone)
    if learned:
        return learned
    return 'ar' if partner.name_ar else 'en'


def _invitee_locale(network_id: int, invite) -> str:
    """Locale for an invited elder. Learned-from-inbound first, else infer
    from the script their own name is written in."""
    learned = _learned_locale(network_id, invite.invitee_phone)
    if learned:
        return learned
    return detect_locale(invite.invitee_name)


def _partner_label(partner, locale: str) -> str:
    """Arabic name when we're writing Arabic and we have one."""
    if locale == 'ar' and partner.name_ar:
        return partner.name_ar
    return partner.name


def _already_sent(*, network_id: int, template_key: str,
                  subject_kind: str, subject_id: int,
                  phone: str | None = None) -> bool:
    """Has this exact reminder already gone out?

    Dedup lives in the message log rather than in the audit chain (which is
    how the older Proximate crons dedup, by substring-matching a day key in
    details_json). The log is the better source here because it is the same
    table the send writes to, so there is no window where the send succeeded
    but the dedup marker did not — and 'never repeat' for the endorsement
    reminder has to mean never, not 'not today'.
    """
    q = ProximateMessage.query.filter_by(
        network_id=network_id,
        direction='out',
        template_key=template_key,
        subject_kind=subject_kind,
        subject_id=subject_id,
    )
    p = normalise_phone(phone)
    if p:
        q = q.filter(ProximateMessage.recipient_phone == p)
    return db.session.query(q.exists()).scalar()


def _e164(raw: str | None) -> str | None:
    """Normalise a provider-supplied number to leading-'+' E.164.

    This matters more than it looks. Meta reports `from`/`wa_id` as bare
    digits ('249912345678'), Twilio prefixes the channel
    ('whatsapp:+249912345678'), and every number we store from a partner
    or invite record carries the '+'. normalise_phone() in the service
    preserves whichever form it is handed, so without this the same human
    lands in the table under two different keys — and two things then fail
    silently: the 24-hour session window never matches (every free-form
    reply gets refused as 'outside the window'), and record_inbound's
    response attribution never finds the outbound it is answering, so
    response_rate stays null on every template forever.
    """
    if not raw:
        return None
    v = raw.strip()
    for prefix in ('whatsapp:', 'sms:', 'tel:'):
        if v.lower().startswith(prefix):
            v = v[len(prefix):].strip()
    digits = ''.join(ch for ch in v if ch.isdigit())
    return f'+{digits}' if digits else None


def _aware(dt):
    """Naive datetimes come back from SQLite (and from some of the older
    Proximate columns declared without timezone=True). Treat them as UTC
    so comparisons against now() don't raise."""
    if dt is None:
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def _audit(action: str, *, actor: str, subject_kind: str,
           subject_id: int | None, details: dict | None = None):
    """AuditChainEntry.append never raises, but keep the call sites short."""
    AuditChainEntry.append(
        action=action,
        actor_email=actor,
        subject_kind=subject_kind,
        subject_id=subject_id,
        details=details or {},
    )


# ======================================================================
# Automations — importable by other Proximate code.
#
# These do NOT gate on ProximateMessaging.configured(). That is
# deliberate and is the opposite of the cron behaviour below: when an
# event really happened, we want the message row to exist even if it
# could not be transmitted, because that unsent row IS the OB's
# "WhatsApp this person yourself" queue. A cron, by contrast, has no
# event behind it and would just manufacture busywork.
# ======================================================================


def send_disbursement_notify(disbursement) -> ProximateMessage | None:
    """Money has left. Tell the partner, and hand them their report link.

    Returns the persisted row, or None if there is no partner record to
    address (a data error the caller should not silently swallow).
    """
    partner = disbursement.partner or ProximatePartner.query.get(
        disbursement.partner_id,
    )
    if not partner:
        logger.warning(
            'Proximate messaging: disbursement %s has no partner; '
            'no notify sent', disbursement.id,
        )
        return None

    locale = _partner_locale(partner)
    return ProximateMessaging.send(
        network_id=disbursement.network_id,
        template_key='disbursement_notify',
        to_phone=partner.contact_phone,
        to_name=partner.name,
        locale=locale,
        subject_kind='disbursement',
        subject_id=disbursement.id,
        amount=_fmt_amount(disbursement.amount_usd),
        partner=_partner_label(partner, locale),
        purpose=disbursement.purpose or '',
        due=_fmt_date(_aware(disbursement.report_due_at)),
        link=_token_link('/proximate-report', disbursement.report_token),
    )


def send_report_ack(disbursement) -> ProximateMessage | None:
    """Their report landed. Close the loop so they aren't left wondering
    whether the voice note went anywhere."""
    partner = disbursement.partner or ProximatePartner.query.get(
        disbursement.partner_id,
    )
    if not partner:
        return None

    locale = _partner_locale(partner)
    return ProximateMessaging.send(
        network_id=disbursement.network_id,
        template_key='report_ack',
        to_phone=partner.contact_phone,
        to_name=partner.name,
        locale=locale,
        subject_kind='disbursement',
        subject_id=disbursement.id,
        partner=_partner_label(partner, locale),
    )


def send_endorsement_invite(invite) -> ProximateMessage | None:
    """Ask an elder to vouch. The invite carries its own one-shot token."""
    partner = ProximatePartner.query.get(invite.partner_id)
    if not partner:
        return None

    locale = _invitee_locale(partner.network_id, invite)
    return ProximateMessaging.send(
        network_id=partner.network_id,
        template_key='endorsement_invite',
        to_phone=invite.invitee_phone,
        to_name=invite.invitee_name,
        locale=locale,
        subject_kind='endorser_invite',
        subject_id=invite.id,
        name=invite.invitee_name or '',
        partner=_partner_label(partner, locale),
        link=_token_link('/proximate-endorse-invite', invite.invite_token),
    )


def send_partner_cleared(partner) -> list[ProximateMessage]:
    """Tell the elders who vouched that their word carried.

    Recipients are the invitees who actually submitted an endorsement
    (used_at set) — the people who took the risk of vouching. Deduped per
    phone so an elder who vouched twice is not messaged twice.
    """
    invites = ProximateEndorserInvite.query.filter(
        ProximateEndorserInvite.partner_id == partner.id,
        ProximateEndorserInvite.used_at.isnot(None),
        ProximateEndorserInvite.invitee_phone.isnot(None),
    ).all()

    sent: list[ProximateMessage] = []
    seen: set[str] = set()
    for inv in invites:
        phone = normalise_phone(inv.invitee_phone)
        if not phone or phone in seen:
            continue
        seen.add(phone)
        locale = _invitee_locale(partner.network_id, inv)
        sent.append(ProximateMessaging.send(
            network_id=partner.network_id,
            template_key='partner_cleared',
            to_phone=inv.invitee_phone,
            to_name=inv.invitee_name,
            locale=locale,
            subject_kind='partner',
            subject_id=partner.id,
            partner=_partner_label(partner, locale),
        ))
    return sent


def send_round_activated(round_obj) -> list[ProximateMessage]:
    """A new round is open — invite the community to nominate.

    Recipient pool is every distinct phone we have ever invited to endorse
    in this tenant. That is the only phone-reachable community list the
    schema actually holds: Endorser rows point at User, and User carries no
    phone number. Deduped per phone, and deduped per round via _already_sent
    so re-activating a round does not re-broadcast.
    """
    invites = (
        ProximateEndorserInvite.query
        .join(
            ProximatePartner,
            ProximatePartner.id == ProximateEndorserInvite.partner_id,
        )
        .filter(ProximatePartner.network_id == round_obj.network_id)
        .filter(ProximateEndorserInvite.invitee_phone.isnot(None))
        .all()
    )

    sent: list[ProximateMessage] = []
    seen: set[str] = set()
    for inv in invites:
        phone = normalise_phone(inv.invitee_phone)
        if not phone or phone in seen:
            continue
        seen.add(phone)
        if _already_sent(
            network_id=round_obj.network_id,
            template_key='round_activated',
            subject_kind='round',
            subject_id=round_obj.id,
            phone=phone,
        ):
            continue
        locale = _invitee_locale(round_obj.network_id, inv)
        title = (
            round_obj.title_ar
            if locale == 'ar' and round_obj.title_ar
            else round_obj.title
        )
        sent.append(ProximateMessaging.send(
            network_id=round_obj.network_id,
            template_key='round_activated',
            to_phone=inv.invitee_phone,
            to_name=inv.invitee_name,
            locale=locale,
            subject_kind='round',
            subject_id=round_obj.id,
            round=title,
            link=f'{_public_base()}/proximate-nominate',
        ))
    return sent


# ======================================================================
# OB-facing surface
# ======================================================================


@proximate_messaging_bp.route('/messages', methods=['GET'])
@ob_required
def api_list_messages():
    """The message log. ?direction=in|out & ?status= & ?limit=."""
    net, err = _require_proximate_tenant()
    if err:
        return err

    q = ProximateMessage.query.filter_by(network_id=net.id)

    direction = (request.args.get('direction') or '').strip().lower()
    if direction in ('in', 'out'):
        q = q.filter(ProximateMessage.direction == direction)

    status = (request.args.get('status') or '').strip().lower()
    if status:
        q = q.filter(ProximateMessage.status == status)

    # Capped: this feeds a triage list, not an export. The full history
    # goes out through the audit/data-export path.
    limit = request.args.get('limit', 100, type=int) or 100
    limit = max(1, min(limit, 500))

    rows = (
        q.order_by(ProximateMessage.created_at.desc())
        .limit(limit)
        .all()
    )
    return jsonify({
        'success': True,
        'messages': [m.to_dict() for m in rows],
    })


@proximate_messaging_bp.route('/messages/<int:message_id>/handled',
                              methods=['POST'])
@ob_required
def api_mark_message_handled(message_id):
    """Mark an inbound reply as dealt with, so it leaves the OB's queue."""
    net, err = _require_proximate_tenant()
    if err:
        return err

    msg = ProximateMessage.query.filter_by(
        id=message_id, network_id=net.id,
    ).first()
    if not msg:
        return jsonify({'success': False, 'error': 'Message not found'}), 404

    if msg.handled_at:
        return jsonify({
            'success': False,
            'error': 'Message already marked handled',
        }), 409

    msg.handled_at = datetime.now(timezone.utc)
    msg.handled_by_user_id = current_user.id
    db.session.commit()

    _audit(
        'proximate.message.handled',
        actor=current_user.email,
        subject_kind='proximate_message',
        subject_id=msg.id,
        details={'direction': msg.direction},
    )

    return jsonify({'success': True, 'message': msg.to_dict()})


@proximate_messaging_bp.route('/messages/reply', methods=['POST'])
@ob_required
def api_reply():
    """Free-form reply from the OB to a number that wrote to us.

    Two things here are not obvious.

    First, this does NOT go through ProximateMessaging.send(). send()
    renders its body from TEMPLATES by template_key; handed a free-form
    body it would render an empty string and persist a message row that
    looks sent but contains none of what the OB typed. Discarding the
    payload while returning success is precisely the EmailService bug. So
    we build the row with the operator's literal text and drive the same
    transport ladder via _attempt().

    Second, Meta only permits free-form (non-template) messages inside the
    24-hour window after the recipient's own last inbound. Outside it the
    provider rejects the send. We check first and record an unsent row with
    the reason rather than firing into a rejection — the row keeps the
    OB's text so they can resend or use a template later.

    `message_id` is accepted as an alternative to `phone` because
    ProximateMessage.to_dict() masks numbers ('•••1234'), so a client
    working from the log has no real number to send back.
    """
    net, err = _require_proximate_tenant()
    if err:
        return err

    data = get_request_json()
    body = (data.get('body') or '').strip()
    if not body:
        return jsonify({
            'success': False, 'error': 'A message body is required',
        }), 400

    # _e164 rather than normalise_phone: an operator who types the number
    # without a '+' must still hit the same session window as the webhook.
    phone = _e164(data.get('phone'))
    if not phone and data.get('message_id'):
        src = ProximateMessage.query.filter_by(
            id=data.get('message_id'), network_id=net.id,
        ).first()
        if src:
            phone = src.recipient_phone
    if not phone:
        return jsonify({
            'success': False,
            'error': 'A phone number (or message_id to resolve one) is required',
        }), 400

    # Reply in whatever language they last wrote to us in; fall back to
    # the script of the operator's own text.
    locale = _learned_locale(net.id, phone) or detect_locale(body)

    msg = ProximateMessage(
        network_id=net.id,
        direction='out',
        channel='manual',
        template_key=None,
        locale=locale,
        recipient_phone=phone,
        recipient_name=data.get('name'),
        body=body[:4000],
        subject_kind='reply',
        status='unsent',
    )
    db.session.add(msg)
    db.session.flush()

    # Order matters: an unconfigured provider is the more fundamental and
    # more actionable problem, and with no provider there is never a
    # session window either — so checking the window first would report
    # "outside the 24-hour window" to an operator whose real problem is
    # that nothing is wired at all.
    if not ProximateMessaging.configured():
        msg.error = 'no messaging provider configured — send manually'
        db.session.commit()
        return jsonify({
            'success': False,
            'code': 'err.not_configured',
            'error': msg.error,
            'message': msg.to_dict(),
        }), 503

    if not ProximateMessaging.session_open(net.id, phone):
        msg.error = (
            'outside the 24-hour session window — a free-form reply would be '
            'rejected by the provider; send a template or ask them to '
            'message first'
        )
        db.session.commit()
        return jsonify({
            'success': False,
            'code': 'err.session_closed',
            'error': msg.error,
            'message': msg.to_dict(),
        }), 409

    # Mutates msg; we commit. Sets status='sent' only on a real provider
    # success, 'unsent' when nothing is configured, 'queued'/'failed'
    # otherwise — so the truthiness below is trustworthy.
    ProximateMessaging._attempt(msg)
    db.session.commit()

    delivered = msg.status == 'sent'
    if delivered:
        _audit(
            'proximate.message.replied',
            actor=current_user.email,
            subject_kind='proximate_message',
            subject_id=msg.id,
            details={'channel': msg.channel},
        )

    return jsonify({
        'success': delivered,
        'error': None if delivered else (msg.error or 'message could not be sent'),
        'message': msg.to_dict(),
    }), (200 if delivered else 502)


@proximate_messaging_bp.route('/messaging/stats', methods=['GET'])
@ob_required
def api_messaging_stats():
    """Per-template delivery rollup for the OB tile. `configured` is
    surfaced alongside so a wall of zeroes reads as 'nothing is wired'
    rather than 'nobody is answering'."""
    net, err = _require_proximate_tenant()
    if err:
        return err

    days = request.args.get('days', 30, type=int) or 30
    days = max(1, min(days, 365))

    return jsonify({
        'success': True,
        'configured': ProximateMessaging.configured(),
        'channels': ProximateMessaging.status(),
        'days': days,
        'stats': ProximateMessaging.delivery_stats(net.id, days=days),
    })


# ======================================================================
# Provider webhook
# ======================================================================


def _verify_meta_signature(raw: bytes) -> bool:
    """X-Hub-Signature-256 over the raw body, keyed with the app secret.

    Unset secret => unverified-but-accepted, which is how Meta's own
    onboarding works before you turn signing on. Logged at warning level
    so it cannot become a permanent silent state.
    """
    secret = os.getenv('WHATSAPP_APP_SECRET')
    if not secret:
        logger.warning(
            'Proximate webhook: WHATSAPP_APP_SECRET unset — accepting '
            'inbound without signature verification',
        )
        return True

    header = request.headers.get('X-Hub-Signature-256', '')
    if not header.startswith('sha256='):
        return False
    expected = hmac.new(
        secret.encode('utf-8'), raw, hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, header.split('=', 1)[1])


def _verify_twilio_signature() -> bool:
    """X-Twilio-Signature over the full URL + sorted POST params.

    Twilio's scheme: concatenate the exact URL it called with each POST
    param as key+value in lexical key order, HMAC-SHA1 that with the
    account auth token, base64 it, compare to the header.

    This endpoint sits OUTSIDE /api/ precisely so the CSRF guard does
    not reject Twilio's form encoding — which means the signature is
    the only thing standing between the public internet and the OB's
    inbox. Without it, anyone could POST fabricated inbound messages,
    open 24-hour session windows for arbitrary numbers, or forge
    delivery receipts. Forged receipts are the worst of the three: this
    whole system exists to give people an evidence trail they can
    trust, and "delivered" has to mean delivered.

    Unset token => reject. This is deliberately the opposite of the
    Meta path's accept-when-unconfigured onboarding stance, because
    Twilio hands you the auth token at the same moment it gives you the
    number — there is no legitimate window where the webhook is live
    and the token is unknown.
    """
    token = os.getenv('TWILIO_AUTH_TOKEN')
    if not token:
        logger.warning(
            'Proximate webhook: TWILIO_AUTH_TOKEN unset — rejecting '
            'form-encoded inbound rather than trusting it',
        )
        return False

    header = request.headers.get('X-Twilio-Signature', '')
    if not header:
        return False

    # Behind Railway's proxy request.url can come back http://; Twilio
    # signed the https:// URL its console points at.
    url = request.url
    proto = request.headers.get('X-Forwarded-Proto')
    if proto == 'https' and url.startswith('http://'):
        url = 'https://' + url[len('http://'):]

    payload = url + ''.join(
        f'{k}{request.form[k]}' for k in sorted(request.form.keys())
    )
    expected = base64.b64encode(
        hmac.new(
            token.encode('utf-8'), payload.encode('utf-8'), hashlib.sha1,
        ).digest()
    ).decode('ascii')
    return hmac.compare_digest(expected, header)


@proximate_messaging_bp.route('/webhooks/whatsapp', methods=['GET'])
def api_whatsapp_verify():
    """Meta's subscription handshake: echo hub.challenge when the token
    matches. Plain text, not JSON — Meta compares the body byte-for-byte."""
    mode = request.args.get('hub.mode')
    token = request.args.get('hub.verify_token')
    challenge = request.args.get('hub.challenge', '')

    expected = os.getenv('WHATSAPP_VERIFY_TOKEN')
    if not expected:
        logger.error(
            'Proximate webhook: verification attempted but '
            'WHATSAPP_VERIFY_TOKEN is unset',
        )
        return jsonify({
            'success': False,
            'error': 'WHATSAPP_VERIFY_TOKEN not configured',
        }), 503

    if mode == 'subscribe' and token and hmac.compare_digest(token, expected):
        return challenge, 200, {'Content-Type': 'text/plain'}

    return jsonify({'success': False, 'error': 'verification failed'}), 403


def _handle_meta_payload(net, payload: dict) -> tuple[int, int]:
    """Walk Meta's entry[].changes[].value envelope.

    Returns (inbound_recorded, receipts_recorded).
    """
    inbound = receipts = 0
    for entry in (payload.get('entry') or []):
        for change in (entry.get('changes') or []):
            value = change.get('value') or {}

            # Map wa_id -> profile name so the log shows who wrote in.
            names = {}
            for c in (value.get('contacts') or []):
                wa_id = c.get('wa_id')
                nm = ((c.get('profile') or {}).get('name'))
                if wa_id and nm:
                    names[wa_id] = nm

            for m in (value.get('messages') or []):
                frm = m.get('from')
                if not frm:
                    continue
                # Only text carries a body we can act on. Media arrives as
                # an ID needing a separate authenticated fetch, which is
                # out of scope here — we still log the event so the OB
                # knows something came in and can open WhatsApp.
                if m.get('type') == 'text':
                    body = (m.get('text') or {}).get('body') or ''
                else:
                    body = f"[{m.get('type') or 'non-text'} message received]"
                row = ProximateMessaging.record_inbound(
                    network_id=net.id,
                    # Meta gives bare digits; store the '+' form so this
                    # matches the numbers on partner/invite records.
                    from_phone=_e164(frm),
                    body=body,
                    provider_message_id=m.get('id'),
                )
                if names.get(frm) and not row.recipient_name:
                    row.recipient_name = names[frm][:160]
                    db.session.commit()
                inbound += 1

            for s in (value.get('statuses') or []):
                mid, st = s.get('id'), s.get('status')
                if mid and st and ProximateMessaging.record_receipt(mid, st):
                    receipts += 1

    return inbound, receipts


def _handle_twilio_form(net, form) -> tuple[int, int]:
    """Twilio's form-encoded shape.

    Present because Twilio is the transport MessagingService actually
    talks to (TWILIO_WA_FROM / TWILIO_FROM_NUMBER); a webhook that only
    understood Meta's JSON would record nothing on the deployment we
    actually run. Numbers arrive channel-prefixed ('whatsapp:+2547…'),
    which _e164 strips.
    """
    inbound = receipts = 0

    sid = form.get('MessageSid') or form.get('SmsSid')
    status = form.get('MessageStatus') or form.get('SmsStatus')
    body = form.get('Body')
    frm = _e164(form.get('From'))

    # A status callback carries no Body; an inbound message does.
    if body is not None and frm:
        ProximateMessaging.record_inbound(
            network_id=net.id,
            from_phone=frm,
            body=body,
            provider_message_id=sid,
        )
        inbound += 1
    elif sid and status:
        if ProximateMessaging.record_receipt(sid, status):
            receipts += 1

    return inbound, receipts


def _webhook_inbound():
    """Inbound messages + delivery receipts.

    Unauthenticated by necessity — the provider has no session. Meta's
    JSON is signature-verified when WHATSAPP_APP_SECRET is set.

    Always returns HTTP 200, including on our own internal failures. That
    is a webhook convention, not sloppiness: a non-200 makes the provider
    retry the same payload for hours, and none of the failures reachable
    here (no Proximate tenant, malformed envelope) get better on retry.
    The JSON body still carries success=False and the reason, and the
    failure is logged at error level, so this is not a silent success.

    NOTE on routing: app/middleware.py's csrf_protect rejects any POST
    under /api/ that is neither JSON nor multipart. Meta posts JSON and is
    fine on the /api/ path. Twilio posts form-encoded and would be 403'd
    there, which is why proximate_hooks_bp exposes this same handler at
    /hooks/proximate/whatsapp. Point Twilio at that one.
    """
    net = _proximate_network_unauthenticated()
    if not net:
        logger.error(
            'Proximate webhook: no network with slug=proximate; '
            'inbound message dropped',
        )
        return jsonify({
            'success': False, 'error': 'Proximate tenant not provisioned',
        }), 200

    content_type = request.content_type or ''
    try:
        if 'application/json' in content_type:
            if not _verify_meta_signature(request.get_data() or b''):
                logger.warning(
                    'Proximate webhook: X-Hub-Signature-256 mismatch — '
                    'payload rejected',
                )
                return jsonify({
                    'success': False, 'error': 'signature verification failed',
                }), 403
            inbound, receipts = _handle_meta_payload(
                net, request.get_json(silent=True) or {},
            )
        else:
            if not _verify_twilio_signature():
                logger.warning(
                    'Proximate webhook: X-Twilio-Signature mismatch — '
                    'payload rejected',
                )
                return jsonify({
                    'success': False, 'error': 'signature verification failed',
                }), 403
            inbound, receipts = _handle_twilio_form(net, request.form)
    except Exception as exc:  # pragma: no cover - defensive
        db.session.rollback()
        logger.error(
            'Proximate webhook: failed to process payload: %s', exc,
            exc_info=True,
        )
        return jsonify({
            'success': False, 'error': 'failed to process payload',
        }), 200

    if inbound or receipts:
        logger.info(
            'Proximate webhook: recorded %s inbound, %s receipts',
            inbound, receipts,
        )
    return jsonify({
        'success': True, 'inbound': inbound, 'receipts': receipts,
    })


proximate_messaging_bp.add_url_rule(
    '/webhooks/whatsapp', 'api_whatsapp_webhook',
    _webhook_inbound, methods=['POST'],
)
proximate_hooks_bp.add_url_rule(
    '/whatsapp', 'api_whatsapp_webhook_form',
    _webhook_inbound, methods=['POST'],
)


# ======================================================================
# Crons — Bearer CRON_SECRET, every one a no-op when unconfigured.
# ======================================================================


@proximate_messaging_bp.route('/messaging/sweep-retries', methods=['POST'])
def api_cron_sweep_retries():
    """Re-attempt queued messages whose backoff has elapsed."""
    if not _cron_authorised():
        return jsonify({'success': False, 'error': 'forbidden'}), 403

    if not ProximateMessaging.configured():
        return jsonify(_not_configured_payload('sweep-retries'))

    result = ProximateMessaging.sweep_retries()
    logger.info(
        'Proximate cron: retry sweep examined %s, sent %s, failed %s',
        result.get('examined'), result.get('sent'), result.get('failed'),
    )
    return jsonify({
        'success': True, 'job': 'sweep-retries', 'configured': True, **result,
    })


@proximate_messaging_bp.route('/messaging/endorsement-reminder',
                              methods=['POST'])
def api_cron_endorsement_reminder():
    """One reminder, 48h after an endorsement invite, and never again.

    'Never again' is enforced by _already_sent against the message log
    rather than by a day-key in the audit chain: an elder who is chased
    twice about vouching for a neighbour is materially less likely to
    answer at all, so a dedup that resets daily would be worse than no
    reminder.
    """
    if not _cron_authorised():
        return jsonify({'success': False, 'error': 'forbidden'}), 403

    if not ProximateMessaging.configured():
        return jsonify(_not_configured_payload('endorsement-reminder'))

    cutoff = datetime.now(timezone.utc) - timedelta(hours=48)
    candidates = (
        ProximateEndorserInvite.query
        .filter(ProximateEndorserInvite.used_at.is_(None))
        .filter(ProximateEndorserInvite.invitee_phone.isnot(None))
        .all()
    )

    examined = sent = skipped = 0
    for inv in candidates:
        created = _aware(inv.created_at)
        if not created or created > cutoff:
            continue
        examined += 1

        partner = ProximatePartner.query.get(inv.partner_id)
        if not partner:
            continue

        if _already_sent(
            network_id=partner.network_id,
            template_key='endorsement_reminder',
            subject_kind='endorser_invite',
            subject_id=inv.id,
        ):
            skipped += 1
            continue

        locale = _invitee_locale(partner.network_id, inv)
        msg = ProximateMessaging.send(
            network_id=partner.network_id,
            template_key='endorsement_reminder',
            to_phone=inv.invitee_phone,
            to_name=inv.invitee_name,
            locale=locale,
            subject_kind='endorser_invite',
            subject_id=inv.id,
            name=inv.invitee_name or '',
            partner=_partner_label(partner, locale),
            link=_token_link(
                '/proximate-endorse-invite', inv.invite_token,
            ),
        )
        if msg.status == 'sent':
            sent += 1

    logger.info(
        'Proximate cron: endorsement reminder examined %s, sent %s, '
        'skipped %s (already reminded)', examined, sent, skipped,
    )
    return jsonify({
        'success': True, 'job': 'endorsement-reminder', 'configured': True,
        'examined': examined, 'sent': sent, 'skipped': skipped,
    })


@proximate_messaging_bp.route('/messaging/report-reminder', methods=['POST'])
def api_cron_report_reminder():
    """Nudge partners whose report falls due in 3 days. Once per
    disbursement — the overdue path is handled by the existing
    disbursement-nudge cron in proximate_routes.py, so repeating here
    would double up on the same partner."""
    if not _cron_authorised():
        return jsonify({'success': False, 'error': 'forbidden'}), 403

    if not ProximateMessaging.configured():
        return jsonify(_not_configured_payload('report-reminder'))

    now = datetime.now(timezone.utc)
    horizon = now + timedelta(days=3)

    due_soon = (
        ProximateDisbursement.query
        .filter(ProximateDisbursement.report_submitted_at.is_(None))
        .filter(ProximateDisbursement.report_due_at.isnot(None))
        .all()
    )

    examined = sent = skipped = 0
    for d in due_soon:
        due = _aware(d.report_due_at)
        # Window, not an equality test: a cron that misses a day (Actions
        # outage, redeploy) must still catch the reminder rather than skip
        # the partner entirely.
        if not due or not (now <= due <= horizon):
            continue
        examined += 1

        if _already_sent(
            network_id=d.network_id,
            template_key='report_reminder',
            subject_kind='disbursement',
            subject_id=d.id,
        ):
            skipped += 1
            continue

        partner = d.partner or ProximatePartner.query.get(d.partner_id)
        if not partner:
            continue

        locale = _partner_locale(partner)
        msg = ProximateMessaging.send(
            network_id=d.network_id,
            template_key='report_reminder',
            to_phone=partner.contact_phone,
            to_name=partner.name,
            locale=locale,
            subject_kind='disbursement',
            subject_id=d.id,
            partner=_partner_label(partner, locale),
            due=_fmt_date(due),
            link=_token_link('/proximate-report', d.report_token),
        )
        if msg.status == 'sent':
            sent += 1

    logger.info(
        'Proximate cron: report reminder examined %s, sent %s, skipped %s',
        examined, sent, skipped,
    )
    return jsonify({
        'success': True, 'job': 'report-reminder', 'configured': True,
        'examined': examined, 'sent': sent, 'skipped': skipped,
    })


@proximate_messaging_bp.route('/messaging/outcome-nudge', methods=['POST'])
def api_cron_outcome_nudge():
    """The day-85 'what lasted?' nudge on a 90-day outcome obligation.

    Anchored on due_at minus 5 days rather than spawned_at plus 85 so it
    stays correct if an obligation is ever spawned with a window other
    than the default 90. Open-ended on the late side (no upper bound past
    due) so an overdue attestation still gets its one nudge; _already_sent
    keeps it to one.
    """
    if not _cron_authorised():
        return jsonify({'success': False, 'error': 'forbidden'}), 403

    if not ProximateMessaging.configured():
        return jsonify(_not_configured_payload('outcome-nudge'))

    now = datetime.now(timezone.utc)

    pending = (
        ProximateOutcomeAttestation.query
        .filter(ProximateOutcomeAttestation.status == 'pending')
        .filter(ProximateOutcomeAttestation.submitted_at.is_(None))
        .all()
    )

    examined = sent = skipped = 0
    for o in pending:
        due = _aware(o.due_at)
        if not due or now < due - timedelta(days=5):
            continue
        examined += 1

        if _already_sent(
            network_id=o.network_id,
            template_key='outcome_reminder',
            subject_kind='outcome',
            subject_id=o.id,
        ):
            skipped += 1
            continue

        partner = ProximatePartner.query.get(o.partner_id)
        if not partner:
            continue

        locale = _partner_locale(partner)
        msg = ProximateMessaging.send(
            network_id=o.network_id,
            template_key='outcome_reminder',
            to_phone=partner.contact_phone,
            to_name=partner.name,
            locale=locale,
            subject_kind='outcome',
            subject_id=o.id,
            partner=_partner_label(partner, locale),
            link=_token_link('/proximate-outcome', o.report_token),
        )
        if msg.status == 'sent':
            sent += 1

    logger.info(
        'Proximate cron: outcome nudge examined %s, sent %s, skipped %s',
        examined, sent, skipped,
    )
    return jsonify({
        'success': True, 'job': 'outcome-nudge', 'configured': True,
        'examined': examined, 'sent': sent, 'skipped': skipped,
    })
