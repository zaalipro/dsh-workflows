import type { WorkflowGateInfo } from './supervisor/types.js';
import { type AskUserQuestionItem } from '@deepseek-ai/dsh-user-questions';
export declare const name = "workflow-user-questions";
export declare const inject: readonly ["workflowSupervisor", "userQuestions"];
/** Convert a parked workflow gate into the exact existing question UI data. */
export declare function workflowGateQuestion(displayName: string, gate: WorkflowGateInfo): AskUserQuestionItem;
/** Register the exact-Agent question bridge and an awaited lifetime disposer. */
export declare function apply(ctx: any): (() => Promise<void>);
//# sourceMappingURL=user-questions.d.ts.map