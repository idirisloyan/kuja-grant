"""Proximate community-endorsement models — Phase 628 (June 2026).

The bet from docs/PROXIMATE_FUND_DESIGN.md §3.1: replace the registration
check (which structurally excludes Sudan's informal community groups)
with the SoP-defined relational-validation route — 2 independent COI-
checked endorsements + verified bank account + endorser reputation
floor.

Maps to SOP 6 §4 Step 1: "For informal groups without registration, the
relational-validation route applies: two independent community
endorsements, account verification and reputation check (adapted from
the Sudan pilot's SOP 8 logic) substitute for registration documents."

Three tables, one file (cohesion + v0 simplicity):

  ProximatePartner — an informal group that's been nominated. Lives in
    the Proximate tenant (network_id is enforced at the route layer
    against current_user's network). Carries the partner's account
    details for the character-for-character bank verify (Sudan pilot
    lesson, hard-coded into the disbursement readiness check at SOP 10
    §4 Step 1).

  Endorser — a registered community member who can endorse. Lifecycle:
    self-register → pending → light-KYC approved → active. Reputation
    score starts at 50 (neutral) and moves with ground-truth feedback
    from past endorsements. The COI signal fields (locality, village,
    family_name, employer) are what the Endorsement auto-check
    compares against the partner.

  Endorsement — one endorser's vouch for one partner. Three Y/N
    questions per the wireframe + voice-note URL per question (the
    Whisper API scaffolding from Phase 96 transcribes these
    asynchronously). The COI auto-check populates coi_signals at
    submit time; a non-empty signals dict means the endorsement is
    flagged for review rather than counted toward the 2-of-N
    trust-floor.

V0 scope deliberately narrow:
  - No reputation algorithm yet (field exists, stays at 50 until
    Phase 631 ground-truth-feedback loop lands)
  - No voice transcription (URL fields ready; wiring follows)
  - No location-pin validation (lat/lng captured, not enforced)
  - Audit-chain integration deferred (audit_chain_seq column ready)

The trust-floor helper on ProximatePartner is the load-bearing piece —
returns the exact checklist the wireframe Screen 3 renders.
"""

from datetime import datetime, timezone

from app.extensions import db
from app.utils.helpers import _json_load, _json_dump


# ---- Status vocabs ----------------------------------------------------

PARTNER_STATUSES = (
    "nominated",           # someone submitted the intake form
    "endorsements_open",   # ready to collect endorsements
    "dd_pending",          # 2+ endorsements collected, bank verify in flight
    "dd_clear",            # passed Tier 1 relational validation (SOP 6 §4)
    "dd_failed",           # endorsements didn't meet trust-floor; can re-apply
    "suspended",           # intervention measure applied (SOP 13)
)

# Maps onto SOP 6's tiered model. Tier 1 is what relational validation
# unlocks; Tier 2/3 require registration docs + the heavier-touch DD
# pathway (Phase 632+).
PARTNER_TIERS = (
    "tier_1_relational",
    "tier_2_standard",
    "tier_3_full",
)

# Phase 636 — capital classification per SOP 13. The disbursement
# vehicle and oversight intensity changes by amount class. Thresholds
# in USD-equivalent (Sudan pilot — the SoP is denominated in USD even
# when disbursement happens in SDG or hawala).
CAPITAL_CLASSES = ("small", "medium", "large")
CAPITAL_CLASS_THRESHOLDS_USD = {
    'small_max': 5_000,    # < $5k = small
    'medium_max': 50_000,  # $5k - $50k = medium; > $50k = large
}


def classify_capital(usd_amount: float) -> str:
    """Map a disbursement USD amount to its SOP 13 capital class."""
    if usd_amount is None or usd_amount < 0:
        return 'small'
    if usd_amount < CAPITAL_CLASS_THRESHOLDS_USD['small_max']:
        return 'small'
    if usd_amount < CAPITAL_CLASS_THRESHOLDS_USD['medium_max']:
        return 'medium'
    return 'large'

ENDORSER_STATUSES = (
    "pending",      # self-registered; awaiting light-KYC review
    "approved",     # active
    "suspended",    # endorsements paused (e.g., repeated low-quality vouches)
)


# ---- ProximatePartner -------------------------------------------------

class ProximatePartner(db.Model):
    """An informal group nominated for Proximate funding via the
    relational-validation route (SOP 6 §4 Step 1)."""

    __tablename__ = "proximate_partners"
    __table_args__ = (
        db.Index("ix_proximate_partners_network_status", "network_id", "status"),
    )

    id = db.Column(db.Integer, primary_key=True)
    network_id = db.Column(
        db.Integer,
        db.ForeignKey("networks.id"),
        nullable=False,
        index=True,
    )

    # Bilingual name (Sudan partners are Arabic-first; English label
    # for downstream donor reporting where Arabic isn't rendered).
    name = db.Column(db.String(200), nullable=False)
    name_ar = db.Column(db.String(200), nullable=True)

    # Location — for COI auto-check + audit-trail location pin
    locality = db.Column(db.String(120), nullable=True)
    country = db.Column(db.String(80), nullable=False, default="SD")

    contact_phone = db.Column(db.String(40), nullable=True)
    contact_email = db.Column(db.String(320), nullable=True)

    # Bank verify — these are what the Sudan-pilot "character-for-
    # character" check at SOP 10 §4 Step 1 compares against the
    # disbursement-time payee details. Stored as plain text for the
    # field officer's verify workflow; encryption-at-rest is a
    # platform concern (DB encryption + Railway managed Postgres).
    bank_account_holder_name = db.Column(db.String(200), nullable=True)
    bank_account_number = db.Column(db.String(80), nullable=True)
    bank_name = db.Column(db.String(160), nullable=True)
    bank_swift_or_iban = db.Column(db.String(80), nullable=True)
    bank_verified_at = db.Column(db.DateTime, nullable=True)

    # Nominator — usually a Proximate field coordinator or an existing
    # Endorser. Tracks who put this partner forward (audit trail).
    nominated_by_user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=True,
    )

    # Free-form intake metadata — voice-note URLs, photos of operations,
    # references. Schema deliberately loose for v0; tightens after the
    # first pilot in Sudan tells us what fields actually matter.
    intake_form_json = db.Column(db.Text, nullable=True)

    status = db.Column(
        db.String(40), nullable=False, default="nominated", index=True,
    )
    trust_tier = db.Column(db.String(40), nullable=True)

    # Phase 636 — capital class. Defaults to 'small' (most common +
    # safest default); secretariat sets to medium/large via the
    # partner-detail PATCH (Phase 638+) or it's computed at
    # disbursement time from the grant amount via classify_capital().
    capital_class = db.Column(
        db.String(40), nullable=False, default="small", index=True,
    )

    nominated_at = db.Column(
        db.DateTime, nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    dd_cleared_at = db.Column(db.DateTime, nullable=True)

    sanctions_flag = db.Column(db.Boolean, nullable=True, default=False)
    sanctions_checked_at = db.Column(db.DateTime, nullable=True)
    sanctions_summary_json = db.Column(db.Text, nullable=True)
    created_at = db.Column(
        db.DateTime, nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at = db.Column(
        db.DateTime, nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # --- helpers ----------------------------------------------------

    def get_intake_form(self) -> dict:
        val = _json_load(self.intake_form_json)
        return val if isinstance(val, dict) else {}

    def set_intake_form(self, value) -> None:
        self.intake_form_json = _json_dump(value or {})

    def trust_floor_signals(self) -> dict:
        """Compute the exact checklist the wireframe Screen 3 renders.
        Returns each signal with a boolean + supporting count where
        useful. Two independent COI-clean endorsements is the
        load-bearing piece — single endorsement, or two with shared COI
        signals, do not pass.

        This method is the single source of truth for "is this partner
        cleared for Tier 1?" — DO NOT inline the threshold logic
        elsewhere; call this instead.
        """
        endorsements = Endorsement.query.filter_by(partner_id=self.id).all()
        coi_clean = [e for e in endorsements if e.coi_check_passed]
        # Independence check: COI-clean endorsements from distinct
        # endorsers (no double-counting if one endorser somehow
        # submitted twice — should be blocked at the route layer too).
        distinct_endorsers = {e.endorser_id for e in coi_clean}

        # Reputation floor: every endorser whose vouch counts must
        # themselves be reputation ≥ 75 (placeholder until Phase 631
        # algorithm; for v0 the gate just needs the score to exist).
        REPUTATION_FLOOR = 75
        reputation_ok = True
        for e in coi_clean:
            endorser = Endorser.query.get(e.endorser_id)
            if not endorser or endorser.reputation_score < REPUTATION_FLOOR:
                reputation_ok = False
                break

        bank_ok = bool(self.bank_verified_at)
        endorsements_ok = len(distinct_endorsers) >= 2

        return {
            "endorsements_independent_count": len(distinct_endorsers),
            "endorsements_required": 2,
            "endorsements_ok": endorsements_ok,
            "bank_verified": bank_ok,
            "endorsers_meet_reputation_floor": reputation_ok and bool(coi_clean),
            "reputation_floor": REPUTATION_FLOOR,
            # Top-level: are ALL gates green? This is what the route
            # checks before transitioning status to dd_clear.
            "ready_for_dd_clear": endorsements_ok and bank_ok and reputation_ok,
        }

    def to_dict(self) -> dict:
        signals = self.trust_floor_signals()
        return {
            "id": self.id,
            "network_id": self.network_id,
            "name": self.name,
            "name_ar": self.name_ar,
            "locality": self.locality,
            "country": self.country,
            "contact_phone": self.contact_phone,
            "contact_email": self.contact_email,
            "bank_account_holder_name": self.bank_account_holder_name,
            "bank_name": self.bank_name,
            "bank_verified_at": (
                self.bank_verified_at.isoformat() if self.bank_verified_at else None
            ),
            "nominated_by_user_id": self.nominated_by_user_id,
            "source": (
                "self" if self.nominated_by_user_id is None else "staff"
            ),
            "intake_form": self.get_intake_form(),
            "status": self.status,
            "trust_tier": self.trust_tier,
            "capital_class": self.capital_class,
            "nominated_at": self.nominated_at.isoformat() if self.nominated_at else None,
            "dd_cleared_at": self.dd_cleared_at.isoformat() if self.dd_cleared_at else None,
            "sanctions_flag": bool(self.sanctions_flag),
            "sanctions_checked_at": (
                self.sanctions_checked_at.isoformat() if self.sanctions_checked_at else None
            ),
            "sanctions_summary": _json_load(self.sanctions_summary_json) or None,
            "trust_floor_signals": signals,
        }


# ---- Endorser ---------------------------------------------------------

class Endorser(db.Model):
    """A registered community member who can endorse a Proximate
    partner. Every endorser is also a User (auth + identity); this
    table layers the Sudan-context COI signals + reputation score on
    top of the User row.
    """

    __tablename__ = "proximate_endorsers"
    __table_args__ = (
        db.UniqueConstraint(
            "network_id", "user_id",
            name="uq_proximate_endorser_user_per_network",
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    network_id = db.Column(
        db.Integer,
        db.ForeignKey("networks.id"),
        nullable=False,
        index=True,
    )
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    # Sudan-context COI signals — compared against partner fields at
    # endorsement-submit time. Self-reported during onboarding;
    # cross-checked against gov-ID OCR when that lands in Phase 631+.
    locality = db.Column(db.String(120), nullable=True)
    country = db.Column(db.String(80), nullable=False, default="SD")
    village_name = db.Column(db.String(160), nullable=True)
    family_name = db.Column(db.String(160), nullable=True)
    employer = db.Column(db.String(200), nullable=True)

    # Light KYC artefacts — uploaded during onboarding.
    gov_id_doc_id = db.Column(
        db.Integer, db.ForeignKey("documents.id"), nullable=True,
    )
    selfie_doc_id = db.Column(
        db.Integer, db.ForeignKey("documents.id"), nullable=True,
    )
    reference_user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=True,
    )

    # Reputation — starts at neutral 50 and moves with ground-truth
    # feedback from past endorsements. Phase 631 lands the algorithm;
    # for v0 we just need the column to exist + a sane default that
    # passes the trust-floor (which requires ≥ 75).
    # IMPORTANT: the floor at 50 means new endorsers can't push a
    # partner past the trust-floor on their own. By design — new
    # endorsers need to accumulate reputation through other vouches
    # before their endorsement counts in a clear.
    reputation_score = db.Column(db.Integer, nullable=False, default=50)
    endorsements_count = db.Column(db.Integer, nullable=False, default=0)

    status = db.Column(
        db.String(40), nullable=False, default="pending", index=True,
    )

    registered_at = db.Column(
        db.DateTime, nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    approved_at = db.Column(db.DateTime, nullable=True)
    suspended_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(
        db.DateTime, nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at = db.Column(
        db.DateTime, nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    def to_dict(self, *, include_coi: bool = False) -> dict:
        data = {
            "id": self.id,
            "network_id": self.network_id,
            "user_id": self.user_id,
            "locality": self.locality,
            "country": self.country,
            "reputation_score": self.reputation_score,
            "endorsements_count": self.endorsements_count,
            "status": self.status,
            "registered_at": self.registered_at.isoformat() if self.registered_at else None,
            "approved_at": self.approved_at.isoformat() if self.approved_at else None,
        }
        if include_coi:
            # Only surface the COI fields to the endorser themselves
            # (or to platform admins). Not exposed in public endpoints.
            data.update({
                "village_name": self.village_name,
                "family_name": self.family_name,
                "employer": self.employer,
            })
        return data


# ---- Endorsement ------------------------------------------------------

# The three Y/N questions from the wireframe + SoP. Stored as columns
# rather than JSON because we need to query "all endorsements where
# q1_real = True" for analytics.
Q1_LABEL_EN = "Is this organisation real and operating on the ground?"
Q1_LABEL_AR = "هل هذه المنظمة حقيقية وتعمل على الأرض؟"
Q2_LABEL_EN = "Do you trust the leadership?"
Q2_LABEL_AR = "هل تثق بمن يقودها؟"
Q3_LABEL_EN = "Would you accept aid through them?"
Q3_LABEL_AR = "هل تقبل المساعدة من خلالهم؟"


class Endorsement(db.Model):
    """One endorser's vouch for one partner. The auto-COI check runs
    at submit-time and populates coi_signals; coi_check_passed = True
    means this endorsement counts toward the partner's trust-floor.
    """

    __tablename__ = "proximate_endorsements"
    __table_args__ = (
        db.UniqueConstraint(
            "partner_id", "endorser_id",
            name="uq_proximate_endorsement_one_per_endorser",
        ),
        db.Index(
            "ix_proximate_endorsements_partner", "partner_id", "coi_check_passed",
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    partner_id = db.Column(
        db.Integer,
        db.ForeignKey("proximate_partners.id"),
        nullable=False,
        index=True,
    )
    endorser_id = db.Column(
        db.Integer,
        db.ForeignKey("proximate_endorsers.id"),
        nullable=False,
        index=True,
    )

    # The three Y/N answers — all required.
    q1_real = db.Column(db.Boolean, nullable=False)
    q2_trust = db.Column(db.Boolean, nullable=False)
    q3_accept_aid = db.Column(db.Boolean, nullable=False)

    # Voice notes — one per question. URLs point at S3 / local storage
    # via the document service; transcription via Whisper API
    # (Phase 96) runs async and stuffs the transcript back into the
    # document record. URL fields are nullable for v0; the route layer
    # warns rather than rejects on missing voice notes.
    q1_voice_doc_id = db.Column(
        db.Integer, db.ForeignKey("documents.id"), nullable=True,
    )
    q2_voice_doc_id = db.Column(
        db.Integer, db.ForeignKey("documents.id"), nullable=True,
    )
    q3_voice_doc_id = db.Column(
        db.Integer, db.ForeignKey("documents.id"), nullable=True,
    )

    # Phase 640 — Whisper transcripts captured at submit time.
    # Endorser records a short voice note per question on a low-end
    # phone, the client transcribes via /api/whisper/transcribe, and
    # the resulting text travels in the payload. Stored separately
    # from the (currently unused) document fields above so the
    # secretariat can read the transcript without needing the audio
    # file infrastructure to be operational.
    q1_transcript = db.Column(db.Text, nullable=True)
    q2_transcript = db.Column(db.Text, nullable=True)
    q3_transcript = db.Column(db.Text, nullable=True)

    # COI auto-check — populated at submit-time by compute_coi_signals().
    # A non-empty signals dict means the endorsement is FLAGGED; it
    # still records (audit trail) but does not count toward the
    # trust-floor.
    coi_check_passed = db.Column(db.Boolean, nullable=False, default=True)
    coi_signals_json = db.Column(db.Text, nullable=True)

    # Geolocation at submission — for audit-trail location pin and
    # later analytics (e.g., were all endorsements submitted from one
    # IP / one geocluster — Sybil signal).
    location_lat = db.Column(db.Float, nullable=True)
    location_lng = db.Column(db.Float, nullable=True)

    # Forward-link into the audit chain (populated when Phase 631
    # wires the chain integration; nullable for v0).
    audit_chain_seq = db.Column(db.Integer, nullable=True)

    submitted_at = db.Column(
        db.DateTime, nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    created_at = db.Column(
        db.DateTime, nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    def get_coi_signals(self) -> dict:
        val = _json_load(self.coi_signals_json)
        return val if isinstance(val, dict) else {}

    def set_coi_signals(self, value) -> None:
        self.coi_signals_json = _json_dump(value or {})

    @staticmethod
    def compute_coi_signals(*, partner: ProximatePartner,
                            endorser: "Endorser") -> dict:
        """Compare endorser's COI fields against partner. Returns a
        dict of triggered signals; empty dict = no COI = endorsement
        counts toward trust-floor.

        Case-insensitive substring match on the four Sudan-context
        signals from the SoP (village, family, employer, locality).
        Liberal match because Arabic transliteration variance is real
        — false-positives flag for human review, false-negatives let
        bad endorsements through. We bias toward false-positives.
        """
        signals = {}

        def _matches(a: str | None, b: str | None) -> bool:
            if not a or not b:
                return False
            al, bl = a.strip().lower(), b.strip().lower()
            if not al or not bl:
                return False
            return al == bl or al in bl or bl in al

        # Locality match (e.g., partner in القضارف, endorser from القضارف)
        if _matches(endorser.locality, partner.locality):
            signals["shared_locality"] = {
                "endorser": endorser.locality,
                "partner": partner.locality,
            }

        # Village — substring match against partner name / intake
        # form. Partner doesn't have a structured 'village' field;
        # check name + locality.
        if endorser.village_name and (
            _matches(endorser.village_name, partner.name)
            or _matches(endorser.village_name, partner.name_ar)
            or _matches(endorser.village_name, partner.locality)
        ):
            signals["shared_village"] = endorser.village_name

        # Family name — match against partner name (informal groups
        # often carry the founding family's name) AND the partner's
        # bank-account-holder name.
        if endorser.family_name and (
            _matches(endorser.family_name, partner.name)
            or _matches(endorser.family_name, partner.name_ar)
            or _matches(endorser.family_name, partner.bank_account_holder_name)
        ):
            signals["shared_family_name"] = endorser.family_name

        # Employer — typically caught by name match (the partner IS
        # the employer for the endorser if there's a shared employer).
        if endorser.employer and (
            _matches(endorser.employer, partner.name)
            or _matches(endorser.employer, partner.name_ar)
        ):
            signals["shared_employer"] = endorser.employer

        return signals

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "partner_id": self.partner_id,
            "endorser_id": self.endorser_id,
            "answers": {
                "q1_real": self.q1_real,
                "q2_trust": self.q2_trust,
                "q3_accept_aid": self.q3_accept_aid,
            },
            "voice_notes": {
                "q1": self.q1_voice_doc_id,
                "q2": self.q2_voice_doc_id,
                "q3": self.q3_voice_doc_id,
            },
            "transcripts": {
                "q1": self.q1_transcript,
                "q2": self.q2_transcript,
                "q3": self.q3_transcript,
            },
            "coi_check_passed": self.coi_check_passed,
            "coi_signals": self.get_coi_signals(),
            "location": (
                {"lat": self.location_lat, "lng": self.location_lng}
                if self.location_lat is not None else None
            ),
            "audit_chain_seq": self.audit_chain_seq,
            "submitted_at": self.submitted_at.isoformat() if self.submitted_at else None,
        }
