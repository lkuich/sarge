import type { ProjectShareRole } from './sarge-demo';

interface CloudflareEmailSender {
  send(message: {
    to: string;
    from: { email: string; name: string };
    subject: string;
    text: string;
    html: string;
  }): Promise<unknown>;
}

export interface ProjectInviteEmailInput {
  to: string;
  projectName: string;
  inviterLabel: string;
  role: ProjectShareRole;
  appUrl: string;
  emailSender?: CloudflareEmailSender;
  emailFrom?: string;
}

export interface ProjectAccessNotificationEmailInput {
  to: string;
  projectName: string;
  role?: ProjectShareRole;
  appUrl: string;
  action: 'role-updated' | 'access-removed';
  emailSender?: CloudflareEmailSender;
  emailFrom?: string;
}

export type ProjectInviteEmailResult =
  | { sent: true }
  | { sent: false; warning: string };

export const sendProjectInviteEmail = async (
  input: ProjectInviteEmailInput,
): Promise<ProjectInviteEmailResult> => {
  const from = input.emailFrom?.trim();

  if (!input.emailSender || !from) {
    return {
      sent: false,
      warning: 'Project invite saved, but email was not sent. Configure the Cloudflare Email binding and SARGE_EMAIL_FROM to send invites.',
    };
  }

  try {
    const title = `${input.inviterLabel} shared a project with you`;
    const body = `${input.inviterLabel} shared ${input.projectName} with you on Sarge.`;
    await input.emailSender.send({
      to: input.to,
      from: { email: from, name: 'Sarge' },
      subject: `${input.inviterLabel} shared ${input.projectName} with you`,
      text: [
        body,
        `Role: ${input.role}`,
        `Open Sarge to view the project: ${input.appUrl}`,
      ].join('\n\n'),
      html: buildSargeEmailHtml({
        appUrl: input.appUrl,
        eyebrow: 'Project invite',
        title,
        body,
        ctaLabel: 'Open Sarge',
        details: [
          { label: 'Project', value: input.projectName },
          { label: 'Role', value: input.role },
        ],
      }),
    });

    return { sent: true };
  } catch (error) {
    console.error('Unable to send project invite email with Cloudflare Email', error);
    return {
      sent: false,
      warning: 'Project invite saved, but email was not sent. Check the Cloudflare Email configuration and try again.',
    };
  }
};

export const sendProjectAccessNotificationEmail = async (
  input: ProjectAccessNotificationEmailInput,
): Promise<ProjectInviteEmailResult> => {
  const from = input.emailFrom?.trim();

  if (!input.emailSender || !from) {
    return {
      sent: false,
      warning: 'Project access changed, but email was not sent. Configure the Cloudflare Email binding and SARGE_EMAIL_FROM to send access notices.',
    };
  }

  const subject =
    input.action === 'role-updated'
      ? `Your access to ${input.projectName} changed`
      : `Your access to ${input.projectName} was removed`;
  const summary =
    input.action === 'role-updated'
      ? `Your Sarge access for ${input.projectName} was changed to ${input.role}.`
      : `Your Sarge access for ${input.projectName} was removed.`;
  const title = input.action === 'role-updated' ? 'Access updated' : 'Access removed';
  const linkText = input.action === 'role-updated' ? 'Open Sarge' : 'View Sarge';

  try {
    await input.emailSender.send({
      to: input.to,
      from: { email: from, name: 'Sarge' },
      subject,
      text: [summary, `Open Sarge: ${input.appUrl}`].join('\n\n'),
      html: buildSargeEmailHtml({
        appUrl: input.appUrl,
        eyebrow: 'Project access',
        title,
        body: summary,
        ctaLabel: linkText,
        details: [
          { label: 'Project', value: input.projectName },
          ...(input.role ? [{ label: 'Role', value: input.role }] : []),
        ],
      }),
    });

    return { sent: true };
  } catch (error) {
    console.error('Unable to send project access notification email with Cloudflare Email', error);
    return {
      sent: false,
      warning: 'Project access changed, but email was not sent. Check the Cloudflare Email configuration and try again.',
    };
  }
};

const buildSargeEmailHtml = (input: {
  appUrl: string;
  eyebrow: string;
  title: string;
  body: string;
  ctaLabel: string;
  details: Array<{ label: string; value: string }>;
}) => {
  const origin = getAppOrigin(input.appUrl);
  const logoUrl = `${origin}/sarge-logo-dark.svg`;
  const detailRows = input.details
    .map(
      (detail) => `
        <tr>
          <td style="padding:12px 0;border-top:1px solid #e5e7eb;color:#6b7280;font-size:13px;line-height:18px;">${escapeHtml(detail.label)}</td>
          <td align="right" style="padding:12px 0;border-top:1px solid #e5e7eb;color:#111827;font-size:13px;font-weight:700;line-height:18px;">${escapeHtml(detail.value)}</td>
        </tr>`,
    )
    .join('');

  return `<!doctype html>
<html>
  <body style="margin:0;background:#f3f4f6;padding:0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;border-collapse:collapse;width:100%;">
      <tr>
        <td align="center" style="padding:28px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;max-width:560px;width:100%;">
            <tr>
              <td style="padding:0 0 14px 0;">
                <img src="${escapeHtml(logoUrl)}" width="118" height="29" alt="Sarge" style="border:0;display:block;height:auto;max-width:118px;">
              </td>
            </tr>
            <tr>
              <td style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 12px 32px rgba(17,24,39,0.08);overflow:hidden;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;">
                  <tr>
                    <td style="background:#111827;padding:22px 24px;">
                      <p style="color:#93c5fd;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;letter-spacing:0.08em;line-height:16px;margin:0 0 10px 0;text-transform:uppercase;">${escapeHtml(input.eyebrow)}</p>
                      <h1 style="color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:26px;font-weight:800;line-height:32px;margin:0;">${escapeHtml(input.title)}</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:24px;">
                      <p style="color:#374151;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;margin:0 0 20px 0;">${escapeHtml(input.body)}</p>
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 22px 0;width:100%;">
                        ${detailRows}
                      </table>
                      <a href="${escapeHtml(input.appUrl)}" style="background:#2563eb;border-radius:10px;color:#ffffff;display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:800;line-height:20px;padding:12px 18px;text-decoration:none;">${escapeHtml(input.ctaLabel)}</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 4px 0 4px;">
                <p style="color:#6b7280;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;margin:0;">Sarge keeps your tracking setup observable and easy to verify.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};

const getAppOrigin = (appUrl: string) => {
  try {
    return new URL(appUrl).origin;
  } catch {
    return 'https://sargetrack.app';
  }
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
