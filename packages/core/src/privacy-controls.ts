import type { EventPayload } from "./event-schema.js";

export const REDACTED_VALUE = "[REDACTED]";

const sargeOwnedPropertyPrefix = "sarge_";
const defaultPiiKeyPattern = /(^|_|\b)(email|e-mail|phone|phone_number|tel|password|passwd|token|secret|authorization|address|street|city|state|zip|postal|postcode|card|cc|credit_card|ssn|sin|ip|ip_address)($|_|\b)/i;
const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const phonePattern = /(?:\+?\d[\s().-]*){10,}/;
const ipv4Pattern = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;
const cardCandidatePattern = /(?:\d[ -]?){13,19}/;

export type PropertyPolicyMode = "blocklist" | "allowlist";

export interface PrivacySettings {
  piiRedactionEnabled?: boolean;
  propertyPolicyMode?: PropertyPolicyMode;
  blockedPropertyKeys?: string[];
  allowedPropertyKeys?: string[];
  customRedactionKeys?: string[];
  customRedactionPatterns?: string[];
}

export const defaultPrivacySettings: Required<PrivacySettings> = {
  piiRedactionEnabled: true,
  propertyPolicyMode: "blocklist",
  blockedPropertyKeys: [],
  allowedPropertyKeys: [],
  customRedactionKeys: [],
  customRedactionPatterns: []
};

export const sanitizeEventPayload = (
  event: EventPayload,
  settings: PrivacySettings = {}
): EventPayload => {
  const resolved = normalizePrivacySettings(settings);

  return {
    ...event,
    attribution: event.attribution ? { ...event.attribution } : undefined,
    context: event.context ? { ...event.context } : undefined,
    properties: sanitizeProperties(event.properties ?? {}, resolved)
  };
};

export const normalizePrivacySettings = (settings: PrivacySettings = {}): Required<PrivacySettings> => ({
  piiRedactionEnabled: settings.piiRedactionEnabled ?? defaultPrivacySettings.piiRedactionEnabled,
  propertyPolicyMode: settings.propertyPolicyMode ?? defaultPrivacySettings.propertyPolicyMode,
  blockedPropertyKeys: normalizeKeyList(settings.blockedPropertyKeys),
  allowedPropertyKeys: normalizeKeyList(settings.allowedPropertyKeys),
  customRedactionKeys: normalizeKeyList(settings.customRedactionKeys),
  customRedactionPatterns: settings.customRedactionPatterns?.map((pattern) => pattern.trim()).filter(Boolean) ?? []
});

const sanitizeProperties = (
  properties: Record<string, unknown>,
  settings: Required<PrivacySettings>
): Record<string, unknown> => {
  const output: Record<string, unknown> = {};
  const blockedKeys = new Set(settings.blockedPropertyKeys);
  const allowedKeys = new Set(settings.allowedPropertyKeys);
  const customRedactionKeys = new Set(settings.customRedactionKeys);
  const customPatterns = settings.customRedactionPatterns.flatMap((pattern) => {
    try {
      return [new RegExp(pattern, "i")];
    } catch {
      return [];
    }
  });

  for (const [key, value] of Object.entries(properties)) {
    const normalizedKey = normalizePropertyKey(key);
    const isSargeOwned = normalizedKey.startsWith(sargeOwnedPropertyPrefix);

    if (!isSargeOwned && blockedKeys.has(normalizedKey)) continue;
    if (
      !isSargeOwned &&
      settings.propertyPolicyMode === "allowlist" &&
      !allowedKeys.has(normalizedKey)
    ) {
      continue;
    }

    output[key] = sanitizePropertyValue(key, value, {
      piiRedactionEnabled: settings.piiRedactionEnabled,
      customRedactionKeys,
      customPatterns
    });
  }

  return output;
};

const sanitizePropertyValue = (
  key: string,
  value: unknown,
  options: {
    piiRedactionEnabled: boolean;
    customRedactionKeys: Set<string>;
    customPatterns: RegExp[];
  }
): unknown => {
  const normalizedKey = normalizePropertyKey(key);
  if (options.customRedactionKeys.has(normalizedKey)) return REDACTED_VALUE;
  if (options.piiRedactionEnabled && defaultPiiKeyPattern.test(normalizedKey)) return REDACTED_VALUE;

  if (typeof value === "string") {
    if (options.customPatterns.some((pattern) => pattern.test(value))) return REDACTED_VALUE;
    if (options.piiRedactionEnabled && containsPiiValue(value)) return REDACTED_VALUE;
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizePropertyValue(key, item, options));
  }

  if (value && typeof value === "object") {
    const nested: Record<string, unknown> = {};
    for (const [nestedKey, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      nested[nestedKey] = sanitizePropertyValue(nestedKey, nestedValue, options);
    }
    return nested;
  }

  return value;
};

const containsPiiValue = (value: string) =>
  emailPattern.test(value) ||
  phonePattern.test(value) ||
  ipv4Pattern.test(value) ||
  cardCandidatePattern.test(value);

const normalizeKeyList = (values: string[] | undefined) =>
  Array.from(new Set((values ?? []).map(normalizePropertyKey).filter(Boolean)));

const normalizePropertyKey = (value: string) => value.trim().toLowerCase();
