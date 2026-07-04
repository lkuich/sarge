export const planEventLimits: Record<string, number | null> = {
  free: 50_000,
  starter: 250_000,
  growth: 2_000_000,
  scale: null,
};

export const planRetentionDays: Record<string, number | null> = {
  free: 7,
  starter: 30,
  growth: 90,
  scale: null,
};

export class UsageLimitExceededError extends Error {
  constructor(message = "Monthly event limit reached") {
    super(message);
    this.name = "UsageLimitExceededError";
  }
}

export interface WorkspaceUsageState {
  planId: string;
  currentPeriodStart: Date;
  currentPeriodEventCount: number;
}

export interface WorkspaceUsageDecision {
  allowed: boolean;
  periodStart: Date;
  eventCount: number;
}

export const getPlanEventLimit = (planId: string) =>
  Object.prototype.hasOwnProperty.call(planEventLimits, planId)
    ? planEventLimits[planId]
    : planEventLimits.free;

export const getPlanRetentionDays = (planId: string) =>
  Object.prototype.hasOwnProperty.call(planRetentionDays, planId)
    ? planRetentionDays[planId]
    : planRetentionDays.free;

export const buildPlanEventLimitSqlCase = (planIdExpression: string) => {
  const branches = Object.entries(planEventLimits)
    .map(([planId, limit]) => `WHEN '${planId}' THEN ${limit === null ? "NULL" : limit}`)
    .join("\n            ");

  return `CASE ${planIdExpression}
            ${branches}
            ELSE ${planEventLimits.free}
          END`;
};

export const buildPlanRetentionSqlCase = (planIdExpression: string) => {
  const branches = Object.entries(planRetentionDays)
    .map(([planId, days]) => `WHEN '${planId}' THEN ${days === null ? "NULL" : days}`)
    .join("\n            ");

  return `CASE ${planIdExpression}
            ${branches}
            ELSE ${planRetentionDays.free}
          END`;
};

export const buildPlanRetentionFilterSql = (occurredAtExpression: string, planIdExpression: string) => {
  const retentionDaysSqlCase = buildPlanRetentionSqlCase(planIdExpression);

  return `(${retentionDaysSqlCase} IS NULL
            OR ${occurredAtExpression} >= NOW() - make_interval(days => ${retentionDaysSqlCase}))`;
};

export const shouldResetUsagePeriod = (periodStart: Date, now = new Date()) => {
  const nextPeriodStart = new Date(periodStart);
  nextPeriodStart.setUTCMonth(nextPeriodStart.getUTCMonth() + 1);
  return nextPeriodStart <= now;
};

export const evaluateWorkspaceEventUsage = (
  usage: WorkspaceUsageState,
  now = new Date(),
): WorkspaceUsageDecision => {
  const shouldReset = shouldResetUsagePeriod(usage.currentPeriodStart, now);
  const periodStart = shouldReset ? now : usage.currentPeriodStart;
  const currentCount = shouldReset ? 0 : usage.currentPeriodEventCount;
  const limit = getPlanEventLimit(usage.planId);

  if (limit !== null && currentCount >= limit) {
    return {
      allowed: false,
      periodStart,
      eventCount: currentCount,
    };
  }

  return {
    allowed: true,
    periodStart,
    eventCount: currentCount + 1,
  };
};
