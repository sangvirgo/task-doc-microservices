import { expectTypeOf, it } from 'vitest';
import { tasksApi } from '@/api/tasks';
import { retentionApi } from '@/api/retention';
import type {
  TaskCommentResult,
  TaskReviewResult,
  TaskSubmissionResult,
} from '@/types/task';
import type {
  DisposalApprovalResult,
  RetentionHoldPlacementResult,
  RetentionHoldReleaseResult,
} from '@/types/retention';
import type { SecurityAlert } from '@/types/admin';
import type { TransferPackage } from '@/types/records';

it('matches task mutation response DTOs from the backend', () => {
  expectTypeOf<Awaited<ReturnType<typeof tasksApi.comment>>>()
    .toEqualTypeOf<TaskCommentResult>();
  expectTypeOf<Awaited<ReturnType<typeof tasksApi.submit>>>()
    .toEqualTypeOf<TaskSubmissionResult>();
  expectTypeOf<Awaited<ReturnType<typeof tasksApi.review>>>()
    .toEqualTypeOf<TaskReviewResult>();
});

it('matches retention mutation response DTOs from the backend', () => {
  expectTypeOf<Awaited<ReturnType<typeof retentionApi.placeHold>>>()
    .toEqualTypeOf<RetentionHoldPlacementResult>();
  expectTypeOf<Awaited<ReturnType<typeof retentionApi.approve>>>()
    .toEqualTypeOf<DisposalApprovalResult>();
  expectTypeOf<Awaited<ReturnType<typeof retentionApi.releaseHold>>>()
    .toEqualTypeOf<RetentionHoldReleaseResult>();
});

it('includes the fields returned by backend DTOs', () => {
  expectTypeOf<TransferPackage>().toHaveProperty('manifest');
  expectTypeOf<TransferPackage>().toHaveProperty('metadata');
  expectTypeOf<TransferPackage>().toHaveProperty('checksums');
  expectTypeOf<TransferPackage>().toHaveProperty('package_checksum');
  expectTypeOf<TransferPackage>().toHaveProperty('signature');
  expectTypeOf<TransferPackage>().toHaveProperty('receipt');
  expectTypeOf<SecurityAlert>().toHaveProperty('metadata');
});
