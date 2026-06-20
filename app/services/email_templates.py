"""
Phase 121 — Branded HTML email templates.

One central place to render the HTML version of system emails so the
NGO sees a properly formatted message with network branding (logo
text, color, sign-in CTA) instead of the prior plain-text wall.

The text body is always passed alongside the HTML so plain-text mail
clients still see the message. HTML uses table-based layout + inline
styles (the only thing Outlook + Gmail will both render reliably).
"""

from __future__ import annotations

import html as _html


KUJA_CLAY = '#a55636'
KUJA_SAND = '#fef7f0'
KUJA_TEXT = '#1f2937'
KUJA_MUTED = '#6b7280'


def _escape(s: str | None) -> str:
    return _html.escape(s or '', quote=True)


def _shell(*, title: str, network_name: str, brand_color: str, body_html: str,
           cta_label: str | None = None, cta_url: str | None = None) -> str:
    """Wrap a body fragment in the standard email shell.

    Outlook + Gmail compatible: tables, inline styles, no flex, no grid,
    no @media. Keeps the visual brand without breaking on legacy renderers.
    """
    cta_block = ''
    if cta_label and cta_url:
        cta_block = f"""
          <tr><td style="padding: 16px 24px 4px 24px;">
            <a href="{_escape(cta_url)}"
               style="display:inline-block; background:{brand_color}; color:#ffffff;
                      text-decoration:none; padding:10px 18px; border-radius:6px;
                      font-weight:600; font-size:14px;">
              {_escape(cta_label)}
            </a>
          </td></tr>
        """
    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>{_escape(title)}</title></head>
<body style="margin:0; padding:0; background:#f9fafb; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; color:{KUJA_TEXT};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9fafb;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"
             style="max-width:560px; background:#ffffff; border-radius:8px; overflow:hidden; border:1px solid #e5e7eb;">
        <tr><td style="background:{brand_color}; padding:16px 24px;">
          <span style="color:#ffffff; font-weight:700; font-size:16px; letter-spacing:0.3px;">
            {_escape(network_name)}
          </span>
        </td></tr>
        <tr><td style="padding:24px 24px 8px 24px;">
          <h1 style="margin:0 0 12px 0; font-size:18px; line-height:1.4; color:{KUJA_TEXT};">
            {_escape(title)}
          </h1>
          <div style="font-size:14px; line-height:1.55; color:{KUJA_TEXT};">
            {body_html}
          </div>
        </td></tr>
        {cta_block}
        <tr><td style="padding:24px 24px 16px 24px;">
          <hr style="border:none; border-top:1px solid #e5e7eb; margin:0 0 8px 0;">
          <p style="margin:0; font-size:12px; color:{KUJA_MUTED};">
            You're receiving this because your organization participates in {_escape(network_name)} on Kuja.
            Update your notification preferences from the account menu after signing in.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>"""


def membership_decision_html(*, network_name: str, applicant_org_name: str | None,
                             decision: str, reason: str | None = None,
                             sign_in_url: str = 'https://web-production-6f8a.up.railway.app/login') -> str:
    """HTML version of the membership decision email."""
    if decision == 'approved':
        title = f'Welcome — {network_name} membership approved'
        body_html = (
            f'<p>Hello{", " + _escape(applicant_org_name) if applicant_org_name else ""},</p>'
            f'<p>Your application to join <strong>{_escape(network_name)}</strong> '
            f'has been <strong>approved</strong> by the Oversight Body.</p>'
            f'<p>Sign in to see your dashboard, capacity score, and the declarations + '
            f'grants you\'re now eligible to participate in.</p>'
            f'<p style="color:{KUJA_MUTED}; font-size:13px;">— {_escape(network_name)} secretariat</p>'
        )
        cta = ('Sign in to your dashboard', sign_in_url)
    else:
        title = f'{network_name} membership decision'
        reason_block = ''
        if reason:
            reason_block = (
                f'<p style="background:{KUJA_SAND}; border-left:3px solid {KUJA_CLAY}; '
                f'padding:10px 12px; margin:12px 0; font-size:13px;">'
                f'<strong>Reason:</strong><br>{_escape(reason)}</p>'
            )
        body_html = (
            f'<p>Hello{", " + _escape(applicant_org_name) if applicant_org_name else ""},</p>'
            f'<p>Your application to join <strong>{_escape(network_name)}</strong> '
            f'was <strong>not approved</strong> at this time.</p>'
            f'{reason_block}'
            f'<p>You may re-apply after the cooldown period set by the Oversight Body. '
            f'Reach out to the secretariat if you have questions about the decision.</p>'
            f'<p style="color:{KUJA_MUTED}; font-size:13px;">— {_escape(network_name)} secretariat</p>'
        )
        cta = None

    return _shell(
        title=title,
        network_name=network_name,
        brand_color=KUJA_CLAY,
        body_html=body_html,
        cta_label=cta[0] if cta else None,
        cta_url=cta[1] if cta else None,
    )
