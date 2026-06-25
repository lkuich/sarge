import { neon } from "@neondatabase/serverless";
import type { AccountRole } from "./sarge-demo";

export type NotificationCategoryId =
  | "tracking_stopped"
  | "page_health_failure"
  | "usage_limit_risk"
  | "billing_action_needed"
  | "collaboration_access";

export interface CloudflareEmailSender {
  send(message: {
    to: string;
    from: { email: string; name: string };
    subject: string;
    text: string;
    html: string;
  }): Promise<unknown>;
}

export interface NotificationCategory {
  id: NotificationCategoryId;
  label: string;
  description: string;
  defaultBehavior: string;
  toggleable: boolean;
  requiresAlertsPlan: boolean;
}

export interface PersistedNotificationPreference {
  category: string;
  emailEnabled: boolean;
}

export interface NotificationPreferenceView {
  category: NotificationCategory;
  emailEnabled: boolean;
}

export interface NotificationDeliveryRepository {
  hasDelivery(input: {
    workspaceId: string;
    recipientEmail: string;
    category: NotificationCategoryId;
    fingerprint: string;
  }): Promise<boolean>;
  recordDelivery(input: {
    workspaceId: string;
    siteId?: string | null;
    siteEnvironmentId?: string | null;
    userId?: string | null;
    recipientEmail: string;
    category: NotificationCategoryId;
    fingerprint: string;
    subject: string;
    status: "sent" | "failed" | "skipped";
    error?: string | null;
  }): Promise<void>;
}

export type NotificationSendResult =
  | { sent: true }
  | { sent: false; skipped: "duplicate" | "not_configured"; error?: string };

type SqlClient = ReturnType<typeof neon>;

export const notificationCategories: NotificationCategory[] = [
  {
    id: "tracking_stopped",
    label: "Tracking stopped",
    description: "Production projects that recently had events stop receiving traffic.",
    defaultBehavior: "Admins are notified immediately.",
    toggleable: true,
    requiresAlertsPlan: true,
  },
  {
    id: "page_health_failure",
    label: "Page health failures",
    description: "Tracked Production URLs start returning 404, 5xx, timeout, DNS/TLS, or redirect failures.",
    defaultBehavior: "Admins are notified once per failing condition.",
    toggleable: true,
    requiresAlertsPlan: true,
  },
  {
    id: "usage_limit_risk",
    label: "Usage limit risk",
    description: "Workspace event or project usage reaches 80%, 95%, or 100% of plan limits.",
    defaultBehavior: "Admins are notified at each material threshold.",
    toggleable: true,
    requiresAlertsPlan: true,
  },
  {
    id: "billing_action_needed",
    label: "Billing action needed",
    description: "Payment fails, a subscription is canceled, or the workspace needs billing attention.",
    defaultBehavior: "Admins are notified when Stripe reports an action is needed.",
    toggleable: true,
    requiresAlertsPlan: false,
  },
  {
    id: "collaboration_access",
    label: "Collaboration and access changes",
    description: "Project invites, role changes, and access removals for affected users.",
    defaultBehavior: "Always sent as transactional access notices.",
    toggleable: false,
    requiresAlertsPlan: false,
  },
];

export const getDefaultEmailEnabled = (category: NotificationCategoryId, role: AccountRole) => {
  if (category === "collaboration_access") return true;
  return role === "admin";
};

export const mergeNotificationPreferences = (
  role: AccountRole,
  persistedPreferences: PersistedNotificationPreference[],
): NotificationPreferenceView[] => {
  const persistedByCategory = new Map(
    persistedPreferences
      .filter((preference): preference is { category: NotificationCategoryId; emailEnabled: boolean } =>
        isNotificationCategory(preference.category),
      )
      .map((preference) => [preference.category, preference.emailEnabled]),
  );

  return notificationCategories.map((category) => ({
    category,
    emailEnabled: persistedByCategory.get(category.id) ?? getDefaultEmailEnabled(category.id, role),
  }));
};

export const buildNotificationFingerprint = (input: {
  category: NotificationCategoryId;
  workspaceId: string;
  resourceId: string;
  severity?: string;
}) => [input.category, input.workspaceId, input.resourceId, input.severity].filter(Boolean).join(":");

export const loadNotificationPreferences = async (input: {
  databaseUrl?: string;
  workspaceId: string;
  userId: string;
  role: AccountRole;
}): Promise<NotificationPreferenceView[]> => {
  if (!input.databaseUrl || input.workspaceId === "setup" || input.workspaceId === "shared") {
    return mergeNotificationPreferences(input.role, []);
  }

  const sql = neon(input.databaseUrl);
  const rows = (await sql`
    SELECT category, "emailEnabled"
    FROM "NotificationPreference"
    WHERE "workspaceId" = ${input.workspaceId}
      AND "userId" = ${input.userId}
  `) as PersistedNotificationPreference[];

  return mergeNotificationPreferences(input.role, rows);
};

export const saveNotificationPreferences = async (input: {
  databaseUrl?: string;
  workspaceId: string;
  userId: string;
  email: string;
  role: AccountRole;
  enabledCategoryIds: NotificationCategoryId[];
  editableCategoryIds?: NotificationCategoryId[];
}): Promise<{ success: true } | { success: false; error: string }> => {
  if (!input.databaseUrl) return { success: false, error: "DATABASE_URL is not configured." };
  if (input.workspaceId === "setup" || input.workspaceId === "shared") {
    return { success: false, error: "Create or open a workspace before saving notification preferences." };
  }
  if (!input.email.trim()) return { success: false, error: "A verified email address is required." };

  const enabled = new Set(input.enabledCategoryIds);
  const sql = neon(input.databaseUrl);
  const editable = new Set(input.editableCategoryIds ?? notificationCategories.map((category) => category.id));
  const writableCategories = notificationCategories.filter((category) => category.toggleable && editable.has(category.id));

  if (writableCategories.length > 0) {
    await sql.transaction(
      writableCategories.map((category) => sql`
      INSERT INTO "NotificationPreference" (
        id,
        "workspaceId",
        "userId",
        email,
        category,
        "emailEnabled",
        "updatedAt"
      )
      VALUES (
        ${`ntfp_${crypto.randomUUID()}`},
        ${input.workspaceId},
        ${input.userId},
        ${input.email.trim().toLowerCase()},
        ${category.id},
        ${enabled.has(category.id)},
        NOW()
      )
      ON CONFLICT ("workspaceId", "userId", category) DO UPDATE
      SET email = EXCLUDED.email,
          "emailEnabled" = EXCLUDED."emailEnabled",
          "updatedAt" = NOW()
      `),
    );
  }

  return { success: true };
};

export const createNotificationDeliveryRepository = (databaseUrl: string): NotificationDeliveryRepository => {
  const sql = neon(databaseUrl);

  return {
    async hasDelivery(input) {
      const rows = (await sql`
        SELECT id
        FROM "NotificationDelivery"
        WHERE "workspaceId" = ${input.workspaceId}
          AND "recipientEmail" = ${input.recipientEmail}
          AND category = ${input.category}
          AND fingerprint = ${input.fingerprint}
        LIMIT 1
      `) as { id: string }[];

      return Boolean(rows.at(0));
    },
    async recordDelivery(input) {
      await sql`
        INSERT INTO "NotificationDelivery" (
          id,
          "workspaceId",
          "siteId",
          "siteEnvironmentId",
          "userId",
          "recipientEmail",
          category,
          fingerprint,
          subject,
          status,
          error,
          "sentAt"
        )
        VALUES (
          ${`ntfd_${crypto.randomUUID()}`},
          ${input.workspaceId},
          ${input.siteId ?? null},
          ${input.siteEnvironmentId ?? null},
          ${input.userId ?? null},
          ${input.recipientEmail},
          ${input.category},
          ${input.fingerprint},
          ${input.subject},
          ${input.status},
          ${input.error ?? null},
          ${input.status === "sent" ? new Date() : null}
        )
        ON CONFLICT ("workspaceId", "recipientEmail", category, fingerprint) DO NOTHING
      `;
    },
  };
};

export const sendNotificationWithDedupe = async (input: {
  repository: NotificationDeliveryRepository;
  emailSender?: CloudflareEmailSender;
  emailFrom?: string;
  workspaceId: string;
  siteId?: string | null;
  siteEnvironmentId?: string | null;
  userId?: string | null;
  recipientEmail: string;
  category: NotificationCategoryId;
  fingerprint: string;
  subject: string;
  text: string;
  html: string;
}): Promise<NotificationSendResult> => {
  const from = input.emailFrom?.trim();
  if (!input.emailSender || !from) {
    await input.repository.recordDelivery({ ...input, status: "failed", error: "Email sender is not configured." });
    return { sent: false, skipped: "not_configured", error: "Email sender is not configured." };
  }

  if (await input.repository.hasDelivery(input)) {
    await input.repository.recordDelivery({ ...input, status: "skipped", error: "Duplicate alert fingerprint." });
    return { sent: false, skipped: "duplicate" };
  }

  try {
    await input.emailSender.send({
      to: input.recipientEmail,
      from: { email: from, name: "Sarge" },
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    await input.repository.recordDelivery({ ...input, status: "sent" });
    return { sent: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown email error.";
    await input.repository.recordDelivery({ ...input, status: "failed", error: message });
    return { sent: false, skipped: "not_configured", error: message };
  }
};

const isNotificationCategory = (value: string): value is NotificationCategoryId =>
  notificationCategories.some((category) => category.id === value);
