import type {
  ConflictStrategy,
  WorkspaceTool,
  WorkflowMergeStrategy,
} from '../types/index.js';

const CONFLICT_STRATEGIES: readonly ConflictStrategy[] = ['highest', 'lowest', 'prompt'];
const WORKSPACE_TOOLS: readonly WorkspaceTool[] = ['turbo', 'nx', 'none'];
const WORKFLOW_STRATEGIES: readonly WorkflowMergeStrategy[] = ['combine', 'keep-first', 'keep-last', 'skip'];

export function parseConflictStrategy(input: string): ConflictStrategy | null {
  const normalized = input.trim().toLowerCase();
  return (CONFLICT_STRATEGIES as readonly string[]).includes(normalized)
    ? (normalized as ConflictStrategy)
    : null;
}

export function parseWorkspaceTool(input: string): WorkspaceTool | null {
  const normalized = input.trim().toLowerCase();
  return (WORKSPACE_TOOLS as readonly string[]).includes(normalized)
    ? (normalized as WorkspaceTool)
    : null;
}

export function parseWorkflowStrategy(input: string): WorkflowMergeStrategy | null {
  const normalized = input.trim().toLowerCase();
  return (WORKFLOW_STRATEGIES as readonly string[]).includes(normalized)
    ? (normalized as WorkflowMergeStrategy)
    : null;
}
