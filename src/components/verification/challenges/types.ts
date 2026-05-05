/**
 * Shared types for verification challenges.
 * Each challenge component receives a ChallengeSpec and reports back via
 * onPass / onFail. Specs come from `HumanVerificationService.pickChallenges()`.
 */

import type { ChallengeId, ChallengeSpec } from '../../../services/HumanVerificationService';

export type FailReason = 'timeout' | 'invalid' | 'cancelled' | 'unsupported';

export interface ChallengeProps {
  spec: ChallengeSpec;
  onPass: () => void;
  onFail: (reason: FailReason, detail?: string) => void;
}

export type { ChallengeId, ChallengeSpec };
