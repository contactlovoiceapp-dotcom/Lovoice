/* Types for the moderation feature: report reasons (5 canonical), report and block input shapes. */

export const REPORT_REASONS = ['harassment', 'hate', 'inappropriate', 'spam', 'other'] as const;
export type ReportReason = typeof REPORT_REASONS[number];

export type ReportTargetKind = 'voice' | 'message' | 'profile';

export interface ReportInput {
  targetKind: ReportTargetKind;
  targetId: string;
  targetUserId: string | null;
  reason: ReportReason;
  freeText: string;
}

export interface BlockInput {
  blockedUserId: string;
}
