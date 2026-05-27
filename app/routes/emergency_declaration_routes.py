"""Emergency Declaration routes — Phase 36 (May 2026).

The big workflow. Endpoints under /api/declarations/*:

  Drafting + lifecycle:
    GET    /api/declarations                       — list in current network
    POST   /api/declarations                       — create draft (admin)
    GET    /api/declarations/<id>                  — detail with sigs+docs
    PUT    /api/declarations/<id>                  — update draft (admin)
    POST   /api/declarations/<id>/submit           — draft → in_review
    POST   /api/declarations/<id>/cancel           — drafter withdraws
    POST   /api/declarations/<id>/close            — closeout post-grants

  Signers:
    POST   /api/declarations/<id>/signers          — add signer slots (admin)
    DELETE /api/declarations/<id>/signers/<sid>    — remove (admin, draft only)

  Signing actions (the signer themselves; uses re-auth):
    POST   /api/declarations/<id>/signatures/<sid>/sign    — affirm + sign
    POST   /api/declarations/<id>/signatures/<sid>/recuse  — recuse with reason
    POST   /api/declarations/<id>/signatures/<sid>/reject  — reject with reason

  Documents:
    POST   /api/declarations/<id>/documents        — attach a Document (admin)

Auto-activation: after every sign/recuse/reject, the route invokes
declaration.maybe_activate() — if the signed-count threshold is reached
and no rejections, the declaration transitions to signed_active and the
moment is audit-anchored. Grant auto-creation + pre-disbursement re-check
land in Phase 36b.
"""

import logging
from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user

from app.extensions import db
from app.models import (
    EmergencyDeclaration, DeclarationSignature, DeclarationDocument,
    Fund, FundWindow, User, Document, Grant,
    CrisisMonitoringReport, CrisisMonitoringRow,
    SIGNATURE_METHODS, DOCUMENT_KINDS,
)
from app.utils.network import get_current_network_id
from app.utils.helpers import get_request_json
from app.utils.decorators import role_required
from app.services.reauth_service import verify_reauth

logger = logging.getLogger("kuja")

emergency_bp = Blueprint("emergency", __name__, url_prefix="/api/declarations")


def _scope(d: EmergencyDeclaration) -> bool:
    nid = get_current_network_id()
    return not nid or d.network_id == nid


# =============================================================================
# Lifecycle
# =============================================================================

@emergency_bp.route("", methods=["GET"])
@login_required
def api_list_declarations():
    network_id = get_current_network_id()
    if not network_id:
        return jsonify({"success": False, "error": "Network not resolved"}), 400
    status = request.args.get("status")
    q = EmergencyDeclaration.query.filter_by(network_id=network_id)
    if status:
        q = q.filter_by(status=status)
    rows = q.order_by(EmergencyDeclaration.created_at.desc()).limit(100).all()
    return jsonify({
        "success": True,
        "declarations": [d.to_dict() for d in rows],
    })


@emergency_bp.route("", methods=["POST"])
@role_required("admin")
def api_create_declaration():
    network_id = get_current_network_id()
    if not network_id:
        return jsonify({"success": False, "error": "Network not resolved"}), 400

    body = get_request_json() or {}
    fund_id = body.get("fund_id")
    window_id = body.get("window_id")
    title = (body.get("title") or "").strip()
    if not (fund_id and window_id and title):
        return jsonify({
            "success": False,
            "error": "fund_id, window_id, and title are required",
        }), 400

    # Scope check: fund + window must belong to the resolved network.
    fund = Fund.query.get(fund_id)
    window = FundWindow.query.get(window_id)
    if not fund or fund.network_id != network_id:
        return jsonify({"success": False, "error": "Fund not in this network"}), 400
    if not window or window.fund_id != fund.id:
        return jsonify({"success": False, "error": "Window does not belong to fund"}), 400

    # Evidence link is RECOMMENDED at draft but required before submit.
    evidence_row_id = body.get("evidence_row_id")
    evidence_report_id = body.get("evidence_report_id")
    if evidence_row_id:
        row = CrisisMonitoringRow.query.get(evidence_row_id)
        if not row:
            return jsonify({"success": False, "error": "Evidence row not found"}), 400
        # Cache the parent report on the declaration for fast lookup
        if not evidence_report_id:
            evidence_report_id = row.report_id

    d = EmergencyDeclaration(
        network_id=network_id,
        fund_id=fund_id,
        window_id=window_id,
        evidence_row_id=evidence_row_id,
        evidence_report_id=evidence_report_id,
        title=title,
        crisis_type=(body.get("crisis_type") or "").strip() or None,
        region=(body.get("region") or "").strip() or None,
        country=((body.get("country") or "").strip().upper() or None),
        severity=(body.get("severity") or "").strip() or None,
        summary_md=(body.get("summary_md") or "").strip() or None,
        proposed_total_amount=body.get("proposed_total_amount"),
        status="draft",
        created_by_user_id=current_user.id,
    )
    if isinstance(body.get("shortlisted_org_ids"), list):
        d.set_shortlisted_org_ids(body["shortlisted_org_ids"])
    db.session.add(d)
    db.session.commit()
    return jsonify({"success": True, "declaration": d.to_dict()})


@emergency_bp.route("/<int:declaration_id>", methods=["GET"])
@login_required
def api_get_declaration(declaration_id):
    d = EmergencyDeclaration.query.get_or_404(declaration_id)
    if not _scope(d):
        return jsonify({"success": False, "error": "Wrong network context"}), 403
    return jsonify({"success": True, "declaration": d.to_dict(include_children=True)})


@emergency_bp.route("/<int:declaration_id>", methods=["PUT"])
@role_required("admin")
def api_update_declaration(declaration_id):
    d = EmergencyDeclaration.query.get_or_404(declaration_id)
    if not _scope(d):
        return jsonify({"success": False, "error": "Wrong network context"}), 403
    if d.status not in ("draft",):
        return jsonify({"success": False, "error": "Only drafts can be edited"}), 409

    body = get_request_json() or {}
    for fld in (
        "title", "crisis_type", "region", "country", "severity",
        "summary_md", "proposed_total_amount", "evidence_row_id",
        "evidence_report_id",
    ):
        if fld in body:
            setattr(d, fld, body[fld])
    if isinstance(body.get("shortlisted_org_ids"), list):
        d.set_shortlisted_org_ids(body["shortlisted_org_ids"])
    db.session.commit()
    return jsonify({"success": True, "declaration": d.to_dict()})


@emergency_bp.route("/<int:declaration_id>/submit", methods=["POST"])
@role_required("admin")
def api_submit_declaration(declaration_id):
    d = EmergencyDeclaration.query.get_or_404(declaration_id)
    if not _scope(d):
        return jsonify({"success": False, "error": "Wrong network context"}), 403

    # Gating: evidence row required before submission.
    if not d.evidence_row_id:
        return jsonify({
            "success": False,
            "error": "Declaration must cite a Crisis Monitoring row before submission",
        }), 400
    # Evidence row must reference a PUBLISHED report
    row = CrisisMonitoringRow.query.get(d.evidence_row_id)
    report = CrisisMonitoringReport.query.get(row.report_id) if row else None
    if not report or report.status != "published":
        return jsonify({
            "success": False,
            "error": "Evidence Crisis Monitoring report must be published",
        }), 400

    if not d.submit_for_signature(actor_email=current_user.email):
        return jsonify({
            "success": False,
            "error": (
                f"Cannot submit from status '{d.status}'. "
                f"Need ≥{d.required_signer_count()} signer slots; have {len(d.signatures)}."
            ),
        }), 400
    db.session.commit()
    return jsonify({"success": True, "declaration": d.to_dict(include_children=True)})


@emergency_bp.route("/<int:declaration_id>/cancel", methods=["POST"])
@role_required("admin")
def api_cancel_declaration(declaration_id):
    d = EmergencyDeclaration.query.get_or_404(declaration_id)
    if not _scope(d):
        return jsonify({"success": False, "error": "Wrong network context"}), 403
    body = get_request_json() or {}
    reason = (body.get("reason") or "").strip()
    if not reason:
        return jsonify({"success": False, "error": "reason is required"}), 400
    if not d.cancel(by_user_id=current_user.id, reason=reason, actor_email=current_user.email):
        return jsonify({
            "success": False,
            "error": f"Cannot cancel from status '{d.status}'",
        }), 400
    db.session.commit()
    return jsonify({"success": True, "declaration": d.to_dict()})


@emergency_bp.route("/<int:declaration_id>/create-shortlist-grants", methods=["POST"])
@role_required("admin")
def api_create_shortlist_grants(declaration_id):
    """Retroactively create grant drafts for a signed-active declaration.

    Use case: the secretariat activated a declaration without setting a
    shortlist (or needs to add more orgs after activation). This endpoint
    accepts a list of org_ids and creates one Grant draft per org under
    the parent FundWindow.

    Idempotent: skips orgs that already have a grant for this declaration
    (matched by title pattern from auto-creation: '<decl title> — Org #<id>').
    Audit-anchored as 'emergency.declaration.grants_added_retroactively'.
    """
    d = EmergencyDeclaration.query.get_or_404(declaration_id)
    if not _scope(d):
        return jsonify({"success": False, "error": "Wrong network context"}), 403
    if d.status != "signed_active":
        return jsonify({
            "success": False,
            "error": f"Only signed_active declarations can receive retroactive grants; status='{d.status}'",
        }), 409

    body = get_request_json() or {}
    org_ids = body.get("org_ids") or []
    if not isinstance(org_ids, list) or not org_ids:
        return jsonify({"success": False, "error": "org_ids is a required non-empty list"}), 400

    # Update the declaration's shortlist (idempotent merge — preserves
    # existing entries; deduplicates).
    existing = d.get_shortlisted_org_ids()
    merged = list({*existing, *(int(o) for o in org_ids if str(o).isdigit() or isinstance(o, int))})
    d.set_shortlisted_org_ids(merged)
    db.session.commit()

    # Re-run grant creation. The helper is idempotent (title-keyed).
    _create_grant_drafts_for_declaration(d)
    db.session.commit()

    d._anchor(
        action="emergency.declaration.grants_added_retroactively",
        actor_email=current_user.email,
        details={"declaration_id": d.id, "added_org_ids": org_ids, "merged_shortlist": merged},
    )
    db.session.commit()

    # Return the updated detail
    return jsonify({"success": True, "declaration": d.to_dict(include_children=True)})


@emergency_bp.route("/<int:declaration_id>/close", methods=["POST"])
@role_required("admin")
def api_close_declaration(declaration_id):
    d = EmergencyDeclaration.query.get_or_404(declaration_id)
    if not _scope(d):
        return jsonify({"success": False, "error": "Wrong network context"}), 403
    if not d.close(actor_email=current_user.email):
        return jsonify({
            "success": False,
            "error": f"Cannot close from status '{d.status}'",
        }), 400
    db.session.commit()
    return jsonify({"success": True, "declaration": d.to_dict()})


# =============================================================================
# Signer slots
# =============================================================================

@emergency_bp.route("/<int:declaration_id>/signers", methods=["POST"])
@role_required("admin")
def api_add_signer(declaration_id):
    d = EmergencyDeclaration.query.get_or_404(declaration_id)
    if not _scope(d):
        return jsonify({"success": False, "error": "Wrong network context"}), 403
    if d.status not in ("draft",):
        return jsonify({"success": False, "error": "Signers can only be added in draft"}), 409
    body = get_request_json() or {}
    user_id = body.get("user_id")
    if not user_id:
        return jsonify({"success": False, "error": "user_id required"}), 400
    u = User.query.get(user_id)
    if not u:
        return jsonify({"success": False, "error": "User not found"}), 404
    if DeclarationSignature.query.filter_by(
        declaration_id=declaration_id, signer_user_id=user_id,
    ).first():
        return jsonify({"success": False, "error": "User already a signer"}), 409
    s = DeclarationSignature(
        declaration_id=declaration_id,
        signer_user_id=user_id,
        required_order=int(body.get("required_order") or (len(d.signatures))),
        status="pending",
    )
    db.session.add(s)
    db.session.commit()
    return jsonify({"success": True, "signature": s.to_dict()})


@emergency_bp.route("/<int:declaration_id>/signers/<int:sig_id>", methods=["DELETE"])
@role_required("admin")
def api_remove_signer(declaration_id, sig_id):
    d = EmergencyDeclaration.query.get_or_404(declaration_id)
    if not _scope(d):
        return jsonify({"success": False, "error": "Wrong network context"}), 403
    if d.status not in ("draft",):
        return jsonify({"success": False, "error": "Signers can only be removed in draft"}), 409
    s = DeclarationSignature.query.filter_by(
        id=sig_id, declaration_id=declaration_id,
    ).first_or_404()
    db.session.delete(s)
    db.session.commit()
    return jsonify({"success": True})


# =============================================================================
# Signing actions
# =============================================================================

def _load_my_signature(declaration_id: int, sig_id: int):
    """Return the signature row IF it belongs to declaration_id AND
    the current user is the assigned signer (or admin)."""
    s = DeclarationSignature.query.filter_by(
        id=sig_id, declaration_id=declaration_id,
    ).first_or_404()
    is_self = s.signer_user_id == current_user.id
    is_admin = current_user.role == "admin"
    if not (is_self or is_admin):
        return None
    return s


def _finalize_after_signature(d: EmergencyDeclaration):
    """After a sign/recuse/reject, see if the declaration should activate
    or cancel automatically. On activation, auto-create draft grants for
    every shortlisted org."""
    if d.rejected_count() > 0 and d.status == "in_review":
        d.status = "cancelled"
        d.status_reason = "Rejected by a signer"
        db.session.flush()
        d._anchor(
            action="emergency.declaration.cancelled_by_signer",
            actor_email=current_user.email,
            details={"declaration_id": d.id},
        )
        return

    transitioned = d.maybe_activate(actor_email=current_user.email)
    if transitioned:
        _create_grant_drafts_for_declaration(d)


def _create_grant_drafts_for_declaration(d: EmergencyDeclaration) -> None:
    """On signed_active, materialise one draft Grant per shortlisted org.

    Each grant is linked to the window via fund_window_id (Phase 34 link),
    starts in 'draft' status (donor org = network's default donor? — for
    now we use the declaration creator's org as donor placeholder), and
    references the proposed per-org amount split evenly.

    Per-org amounts can be tailored by the secretariat before publish.
    """
    org_ids = d.get_shortlisted_org_ids()
    if not org_ids:
        return  # nothing to do

    # Get the parent window to use as the funding context
    window = FundWindow.query.get(d.window_id)
    if not window:
        logger.warning(
            f"Declaration {d.id} signed_active but window {d.window_id} missing"
        )
        return

    # Donor org: use the declaration creator's org. If the creator has no
    # org (typical for platform admins), look up any donor org on the
    # network as a placeholder. The secretariat can reassign before
    # publish.
    creator = User.query.get(d.created_by_user_id) if d.created_by_user_id else None
    donor_org_id = (creator.org_id if creator and creator.org_id else None)
    if not donor_org_id:
        # Fall back to the first donor org we can find (preserves the
        # NOT NULL constraint on grants.donor_org_id).
        from app.models import Organization
        donor = Organization.query.filter_by(org_type="donor").first()
        donor_org_id = donor.id if donor else None
    if not donor_org_id:
        logger.warning(
            f"Declaration {d.id} signed_active but no donor org available — "
            "skipping grant auto-creation"
        )
        return

    # Per-org amount: even split of proposed_total_amount.
    per_org_amount = None
    if d.proposed_total_amount is not None and len(org_ids) > 0:
        try:
            per_org_amount = float(d.proposed_total_amount) / len(org_ids)
        except Exception:
            per_org_amount = None
    if per_org_amount is None and window.max_grant_amount is not None:
        per_org_amount = float(window.max_grant_amount)

    created = []
    for org_id in org_ids:
        # Idempotency: skip if a grant for this declaration + org already
        # exists (re-running activation shouldn't duplicate).
        existing = Grant.query.filter_by(
            fund_window_id=window.id,
            donor_org_id=donor_org_id,
            title=f"{d.title} — Org #{org_id}",
        ).first()
        if existing:
            continue
        g = Grant(
            donor_org_id=donor_org_id,
            title=f"{d.title} — Org #{org_id}",
            description=d.summary_md or "",
            total_funding=per_org_amount,
            currency="USD",  # window currency is on the parent fund; fine for draft
            status="draft",
            fund_window_id=window.id,
        )
        db.session.add(g)
        created.append({"org_id": org_id, "title": g.title})

    if created:
        db.session.flush()
        d._anchor(
            action="emergency.declaration.grants_auto_created",
            actor_email=current_user.email,
            details={
                "declaration_id": d.id,
                "window_id": window.id,
                "grants_created": created,
                "per_org_amount": per_org_amount,
            },
        )
        logger.info(
            f"Declaration {d.id} activated: created {len(created)} draft grant(s)"
        )


@emergency_bp.route(
    "/<int:declaration_id>/signatures/<int:sig_id>/sign",
    methods=["POST"],
)
@login_required
def api_sign(declaration_id, sig_id):
    d = EmergencyDeclaration.query.get_or_404(declaration_id)
    if not _scope(d):
        return jsonify({"success": False, "error": "Wrong network context"}), 403
    if d.status != "in_review":
        return jsonify({
            "success": False,
            "error": f"Declaration is in status '{d.status}', not in_review",
        }), 409
    s = _load_my_signature(declaration_id, sig_id)
    if s is None:
        return jsonify({"success": False, "error": "Not your signature slot"}), 403

    body = get_request_json() or {}
    method = (body.get("signature_method") or "totp").strip()
    declared_no_coi = bool(body.get("declared_no_coi", False))

    if not declared_no_coi:
        return jsonify({
            "success": False,
            "error": "Must affirm declared_no_coi=true to sign. Use /recuse if you have a conflict.",
        }), 400
    if method not in SIGNATURE_METHODS:
        return jsonify({"success": False, "error": f"Unknown signature_method '{method}'"}), 400

    # Phase 36b — verify the chosen re-auth factor. For self-sign, the
    # signer themselves provides the factor. For manual_admin, an admin
    # is attesting on behalf of the signer (paper-signature ceremony).
    is_self_signing = (s.signer_user_id == current_user.id)
    target_user = User.query.get(s.signer_user_id)

    # manual_admin requires the actor to be an admin AND distinct from the signer
    if method == "manual_admin" and is_self_signing:
        return jsonify({
            "success": False,
            "error": "manual_admin signature cannot be used for self-signing",
        }), 400

    # Skip re-auth for the manual_admin path (admin override is the
    # attestation itself); enforce for the user-facing methods.
    if method != "manual_admin":
        reauth = verify_reauth(
            user=target_user,
            method=method,
            totp_code=body.get("totp_code"),
            webauthn_assertion=body.get("webauthn_assertion"),
            acting_admin=current_user if current_user.role == "admin" else None,
        )
        if not reauth["ok"]:
            return jsonify({
                "success": False,
                "error": reauth["message"],
                "code": reauth["code"],
            }), 400
        token_hint = reauth.get("code", "")[:40]
    else:
        # Admin override path
        reauth = verify_reauth(
            user=target_user, method="manual_admin",
            acting_admin=current_user,
        )
        if not reauth["ok"]:
            return jsonify({
                "success": False,
                "error": reauth["message"],
                "code": reauth["code"],
            }), 400
        token_hint = f"manual_admin:by_user_{current_user.id}"

    if not s.sign(method=method, declared_no_coi=True, token_hint=token_hint):
        return jsonify({
            "success": False,
            "error": f"Cannot sign from status '{s.status}'",
        }), 400
    _finalize_after_signature(d)
    db.session.commit()
    return jsonify({
        "success": True,
        "signature": s.to_dict(),
        "declaration": d.to_dict(include_children=True),
    })


@emergency_bp.route(
    "/<int:declaration_id>/signatures/<int:sig_id>/recuse",
    methods=["POST"],
)
@login_required
def api_recuse(declaration_id, sig_id):
    d = EmergencyDeclaration.query.get_or_404(declaration_id)
    if not _scope(d):
        return jsonify({"success": False, "error": "Wrong network context"}), 403
    if d.status != "in_review":
        return jsonify({"success": False, "error": f"Declaration in status '{d.status}'"}), 409
    s = _load_my_signature(declaration_id, sig_id)
    if s is None:
        return jsonify({"success": False, "error": "Not your signature slot"}), 403

    body = get_request_json() or {}
    reason = (body.get("reason") or "").strip()
    if not reason:
        return jsonify({"success": False, "error": "Recusal reason is required"}), 400

    if not s.recuse(reason=reason):
        return jsonify({"success": False, "error": f"Cannot recuse from status '{s.status}'"}), 400
    # Audit anchor for the recusal — important for governance transparency.
    d._anchor(
        action="emergency.declaration.signer_recused",
        actor_email=current_user.email,
        details={
            "declaration_id": d.id, "signer_user_id": s.signer_user_id,
            "reason": s.recusal_reason,
        },
    )
    _finalize_after_signature(d)
    db.session.commit()
    return jsonify({
        "success": True,
        "signature": s.to_dict(),
        "declaration": d.to_dict(include_children=True),
    })


@emergency_bp.route(
    "/<int:declaration_id>/signatures/<int:sig_id>/reject",
    methods=["POST"],
)
@login_required
def api_reject_signature(declaration_id, sig_id):
    d = EmergencyDeclaration.query.get_or_404(declaration_id)
    if not _scope(d):
        return jsonify({"success": False, "error": "Wrong network context"}), 403
    if d.status != "in_review":
        return jsonify({"success": False, "error": f"Declaration in status '{d.status}'"}), 409
    s = _load_my_signature(declaration_id, sig_id)
    if s is None:
        return jsonify({"success": False, "error": "Not your signature slot"}), 403

    body = get_request_json() or {}
    reason = (body.get("reason") or "").strip()
    if not reason:
        return jsonify({"success": False, "error": "Rejection reason is required"}), 400

    if not s.reject(reason=reason):
        return jsonify({"success": False, "error": f"Cannot reject from status '{s.status}'"}), 400
    d._anchor(
        action="emergency.declaration.signer_rejected",
        actor_email=current_user.email,
        details={
            "declaration_id": d.id, "signer_user_id": s.signer_user_id,
            "reason": s.rejection_reason,
        },
    )
    _finalize_after_signature(d)
    db.session.commit()
    return jsonify({
        "success": True,
        "signature": s.to_dict(),
        "declaration": d.to_dict(include_children=True),
    })


# =============================================================================
# Supporting documents
# =============================================================================

@emergency_bp.route("/<int:declaration_id>/documents", methods=["POST"])
@role_required("admin")
def api_attach_document(declaration_id):
    d = EmergencyDeclaration.query.get_or_404(declaration_id)
    if not _scope(d):
        return jsonify({"success": False, "error": "Wrong network context"}), 403
    body = get_request_json() or {}
    document_id = body.get("document_id")
    kind = (body.get("kind") or "other").strip().lower()
    if kind not in DOCUMENT_KINDS:
        return jsonify({"success": False, "error": f"Invalid kind '{kind}'"}), 400
    if document_id is not None:
        doc = Document.query.get(document_id)
        if not doc:
            return jsonify({"success": False, "error": "Document not found"}), 404
    dd = DeclarationDocument(
        declaration_id=declaration_id,
        document_id=document_id,
        kind=kind,
        note=(body.get("note") or "").strip() or None,
        uploaded_by_user_id=current_user.id,
    )
    db.session.add(dd)
    db.session.commit()
    return jsonify({"success": True, "document": dd.to_dict()})
