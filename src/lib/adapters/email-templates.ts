// The text of the emails the site sends. A template key names one of these; the variables are
// plain strings and are escaped before they reach the HTML. No clinical content ever goes in an
// email (CLAUDE.md): only a link and a time limit. The brand and wording are placeholders until
// the final texts arrive (Phase 8).

export type RenderedEmail = { subject: string; text: string; html: string };

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

/** A link we made ourselves: http or https only, no spaces or quotes that could break out of an attribute. */
const isSafeLink = (value: string) => /^https?:\/\/[^\s"'<>]+$/.test(value);

type Template = {
  required: readonly string[];
  render: (v: Record<string, string>) => RenderedEmail;
};

function page(
  title: string,
  intro: string,
  link: string,
  note: string,
): Pick<RenderedEmail, "html" | "text"> {
  const text = `${title}\n\n${intro}\n\n${link}\n\n${note}\n\nViniCure`;
  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#0f2a2e;line-height:1.5">
<h2 style="margin:0 0 12px">${escapeHtml(title)}</h2>
<p>${escapeHtml(intro)}</p>
<p><a href="${escapeHtml(link)}" style="background:#0f6b6b;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">Open the link</a></p>
<p style="font-size:13px;color:#4a5f63">If the button does not work, copy this address into your browser:<br>${escapeHtml(link)}</p>
<p style="font-size:13px;color:#4a5f63">${escapeHtml(note)}</p>
<p style="font-size:13px;color:#4a5f63">ViniCure</p></body></html>`;
  return { text, html };
}

const TEMPLATES: Record<string, Template> = {
  staff_invitation: {
    required: ["link", "role", "hours"],
    render: (v) => {
      const role =
        v.role === "doctor" ? "doctor" : v.role === "admin" ? "administrator" : "team member";
      const title = `You are invited to ViniCure as a ${role}`;
      const intro =
        "Use the link to set your password and your authenticator app. Nobody from ViniCure will ask you for your password or codes.";
      const note = `The link works once and expires in ${v.hours} hours. If you were not expecting this, ignore this email.`;
      return { subject: title, ...page(title, intro, v.link as string, note) };
    },
  },
  staff_password_reset: {
    required: ["link", "minutes"],
    render: (v) => {
      const title = "Reset your ViniCure password";
      const intro =
        "Use the link to choose a new password. Signing in will still ask for your authenticator code.";
      const note = `The link works once and expires in ${v.minutes} minutes. If you did not ask for this, ignore this email; your password has not changed.`;
      return { subject: title, ...page(title, intro, v.link as string, note) };
    },
  },
};

export const EMAIL_TEMPLATE_KEYS = Object.keys(TEMPLATES);

/** The email for a template key, or null when the key or its variables are not acceptable. */
export function renderEmail(
  templateKey: string,
  variables: Record<string, string>,
): RenderedEmail | null {
  const template = TEMPLATES[templateKey];
  if (!template) return null;
  for (const name of template.required) {
    if (typeof variables[name] !== "string" || variables[name] === "") return null;
  }
  if ("link" in variables && !isSafeLink(variables.link as string)) return null;
  return template.render(variables);
}
