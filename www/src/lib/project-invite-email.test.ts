import { describe, expect, it } from "vitest";
import { sendProjectAccessNotificationEmail, sendProjectInviteEmail } from "./project-invite-email";

describe("project invite email templates", () => {
  it("sends project invites with a branded HTML template and plain text fallback", async () => {
    const messages: Array<{ subject: string; text: string; html: string }> = [];
    const emailSender = {
      async send(message: { subject: string; text: string; html: string }) {
        messages.push(message);
      },
    };

    const result = await sendProjectInviteEmail({
      to: "teammate@example.com",
      projectName: "Checkout Lab",
      inviterLabel: "A Sarge workspace admin",
      role: "view",
      appUrl: "https://sargetrack.app/app",
      emailSender,
      emailFrom: "invites@sargetrack.app",
    });

    expect(result.sent).toBe(true);
    expect(messages).toHaveLength(1);
    expect(messages[0].subject).toBe("A Sarge workspace admin shared Checkout Lab with you");
    expect(messages[0].text).toContain("A Sarge workspace admin shared Checkout Lab with you on Sarge.");
    expect(messages[0].html).toContain('<table role="presentation"');
    expect(messages[0].html).toContain('src="https://sargetrack.app/sarge-logo-dark.svg"');
    expect(messages[0].html).toContain("Checkout Lab");
    expect(messages[0].html).toContain("Role");
    expect(messages[0].html).toContain("view");
    expect(messages[0].html).toContain("Open Sarge");
    expect(messages[0].html).toContain("border-radius:12px");
  });

  it("sends access updates with the same branded HTML shell", async () => {
    const messages: Array<{ subject: string; text: string; html: string }> = [];
    const emailSender = {
      async send(message: { subject: string; text: string; html: string }) {
        messages.push(message);
      },
    };

    const result = await sendProjectAccessNotificationEmail({
      to: "teammate@example.com",
      projectName: "Checkout Lab",
      action: "role-updated",
      role: "edit",
      appUrl: "https://sargetrack.app/app",
      emailSender,
      emailFrom: "invites@sargetrack.app",
    });

    expect(result.sent).toBe(true);
    expect(messages[0].subject).toBe("Your access to Checkout Lab changed");
    expect(messages[0].html).toContain("Access updated");
    expect(messages[0].html).toContain("edit");
    expect(messages[0].html).toContain('src="https://sargetrack.app/sarge-logo-dark.svg"');
  });
});
