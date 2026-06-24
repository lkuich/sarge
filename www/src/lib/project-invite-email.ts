import sgMail from '@sendgrid/mail';
import type { ProjectShareRole } from './sarge-demo';

export interface ProjectInviteEmailInput {
  to: string;
  projectName: string;
  inviterLabel: string;
  role: ProjectShareRole;
  appUrl: string;
  sendgridApiKey?: string;
  emailFrom?: string;
}

export type ProjectInviteEmailResult =
  | { sent: true }
  | { sent: false; warning: string };

export const sendProjectInviteEmail = async (
  input: ProjectInviteEmailInput,
): Promise<ProjectInviteEmailResult> => {
  const apiKey = input.sendgridApiKey?.trim();
  const from = input.emailFrom?.trim();

  if (!apiKey || !from) {
    return {
      sent: false,
      warning: 'Project invite saved, but email was not sent. Configure SENDGRID_API_KEY and SARGE_EMAIL_FROM to send invites.',
    };
  }

  try {
    sgMail.setApiKey(apiKey);
    await sgMail.send({
      to: input.to,
      from,
      subject: `${input.inviterLabel} shared ${input.projectName} with you`,
      text: [
        `${input.inviterLabel} shared ${input.projectName} with you on Sarge.`,
        `Role: ${input.role}`,
        `Open Sarge to view the project: ${input.appUrl}`,
      ].join('\n\n'),
      html: `<p>${escapeHtml(input.inviterLabel)} shared <strong>${escapeHtml(input.projectName)}</strong> with you on Sarge.</p><p>Role: ${input.role}</p><p><a href="${escapeHtml(input.appUrl)}">Open Sarge</a></p>`,
    });

    return { sent: true };
  } catch (error) {
    console.error('Unable to send project invite email with SendGrid', error);
    return {
      sent: false,
      warning: 'Project invite saved, but email was not sent. Check the SendGrid configuration and try again.',
    };
  }
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
