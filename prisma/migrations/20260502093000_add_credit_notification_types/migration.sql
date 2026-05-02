-- Add credit-control notification types for persistent admin notification read state.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CREDIT_TERMS_OVERDUE';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CREDIT_LIMIT_EXCEEDED';
