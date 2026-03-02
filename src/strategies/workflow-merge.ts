import path from 'node:path';
import yaml from 'js-yaml';
import type { WorkflowMergeOptions, WorkflowMergeStrategy } from '../types/index.js';
import { pathExists, readFile, writeFile, ensureDir, listFiles } from '../utils/fs.js';

/**
 * GitHub Actions workflow structure (simplified)
 */
interface GitHubWorkflow {
  name?: string;
  on?: Record<string, unknown> | string | string[];
  env?: Record<string, string>;
  jobs?: Record<string, WorkflowJob>;
  [key: string]: unknown;
}

/**
 * A job in a GitHub Actions workflow
 */
interface WorkflowJob {
  name?: string;
  'runs-on'?: string;
  needs?: string | string[];
  steps?: WorkflowStep[];
  env?: Record<string, string>;
  [key: string]: unknown;
}

/**
 * A step in a GitHub Actions job
 */
interface WorkflowStep {
  name?: string;
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
  env?: Record<string, string>;
  id?: string;
  if?: string;
  [key: string]: unknown;
}

/**
 * Parse YAML content into a workflow object using js-yaml
 */
function parseYaml(content: string): GitHubWorkflow {
  const result = yaml.load(content);
  return (typeof result === 'object' && result !== null ? result : {}) as GitHubWorkflow;
}

/**
 * Convert a workflow object back to YAML string using js-yaml
 */
function stringifyYaml(obj: unknown): string {
  return yaml.dump(obj, { lineWidth: -1, noRefs: true, quotingType: '"' });
}

/**
 * Find workflow files in a repository
 */
async function findWorkflowFiles(repoPath: string): Promise<string[]> {
  const workflowDir = path.join(repoPath, '.github', 'workflows');

  if (!(await pathExists(workflowDir))) {
    return [];
  }

  const files = await listFiles(workflowDir);
  return files
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .map((f) => path.join(workflowDir, f));
}

/**
 * Merge workflow triggers
 */
function mergeTriggers(
  triggers: Array<Record<string, unknown> | string | string[]>
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};

  for (const trigger of triggers) {
    if (typeof trigger === 'string') {
      merged[trigger] = null;
    } else if (Array.isArray(trigger)) {
      for (const t of trigger) {
        if (typeof t === 'string') {
          merged[t] = null;
        }
      }
    } else if (typeof trigger === 'object' && trigger !== null) {
      for (const [key, value] of Object.entries(trigger)) {
        if (merged[key] === undefined) {
          merged[key] = value;
        } else if (typeof merged[key] === 'object' && typeof value === 'object') {
          // Merge objects
          merged[key] = { ...(merged[key] as Record<string, unknown>), ...(value as Record<string, unknown>) };
        }
      }
    }
  }

  return merged;
}

/**
 * Merge jobs from multiple workflows, prefixing job names with source
 */
function mergeJobs(
  workflowsWithNames: Array<{ name: string; workflow: GitHubWorkflow }>
): Record<string, WorkflowJob> {
  const mergedJobs: Record<string, WorkflowJob> = {};

  for (const { name, workflow } of workflowsWithNames) {
    if (!workflow.jobs) continue;

    for (const [jobId, job] of Object.entries(workflow.jobs)) {
      // Prefix job ID with package name to avoid collisions
      const prefixedJobId = `${name}-${jobId}`;

      // Update job name if present
      const updatedJob = { ...job };
      if (updatedJob.name) {
        updatedJob.name = `[${name}] ${updatedJob.name}`;
      } else {
        updatedJob.name = `[${name}] ${jobId}`;
      }

      // Update needs references to use prefixed names
      if (updatedJob.needs) {
        if (typeof updatedJob.needs === 'string') {
          updatedJob.needs = `${name}-${updatedJob.needs}`;
        } else if (Array.isArray(updatedJob.needs)) {
          updatedJob.needs = updatedJob.needs.map((n) => `${name}-${n}`);
        }
      }

      mergedJobs[prefixedJobId] = updatedJob;
    }
  }

  return mergedJobs;
}

/**
 * Merge multiple workflows into one
 */
function combineWorkflows(
  workflowsWithNames: Array<{ name: string; workflow: GitHubWorkflow }>
): GitHubWorkflow {
  if (workflowsWithNames.length === 0) {
    return { name: 'CI' };
  }

  if (workflowsWithNames.length === 1) {
    return workflowsWithNames[0].workflow;
  }

  // Merge triggers
  const triggers = workflowsWithNames
    .map((w) => w.workflow.on)
    .filter((t): t is Record<string, unknown> | string | string[] => t !== undefined);

  const mergedTriggers = mergeTriggers(triggers);

  // Merge environment variables
  const envVars: Record<string, string> = {};
  for (const { workflow } of workflowsWithNames) {
    if (workflow.env) {
      Object.assign(envVars, workflow.env);
    }
  }

  // Merge jobs with prefixes
  const mergedJobs = mergeJobs(workflowsWithNames);

  const result: GitHubWorkflow = {
    name: 'CI',
    on: mergedTriggers,
  };

  if (Object.keys(envVars).length > 0) {
    result.env = envVars;
  }

  if (Object.keys(mergedJobs).length > 0) {
    result.jobs = mergedJobs;
  }

  return result;
}

/**
 * Merge CI/CD workflows from multiple repositories
 */
export async function mergeWorkflows(
  repoPaths: Array<{ path: string; name: string }>,
  options: WorkflowMergeOptions
): Promise<void> {
  const { strategy, outputDir } = options;

  if (strategy === 'skip') {
    return;
  }

  // Find all workflow files
  const allWorkflows: Array<{ name: string; path: string; content: string }> = [];

  for (const repo of repoPaths) {
    const workflowFiles = await findWorkflowFiles(repo.path);
    for (const filePath of workflowFiles) {
      const content = await readFile(filePath);
      allWorkflows.push({
        name: repo.name,
        path: filePath,
        content,
      });
    }
  }

  if (allWorkflows.length === 0) {
    return;
  }

  // Create output directory
  const outputWorkflowDir = path.join(outputDir, '.github', 'workflows');
  await ensureDir(outputWorkflowDir);

  switch (strategy) {
    case 'keep-first': {
      // Keep workflows from the first repository only
      const firstRepoName = repoPaths[0]?.name;
      const firstRepoWorkflows = allWorkflows.filter((w) => w.name === firstRepoName);

      for (const workflow of firstRepoWorkflows) {
        const filename = path.basename(workflow.path);
        await writeFile(path.join(outputWorkflowDir, filename), workflow.content);
      }
      break;
    }

    case 'keep-last': {
      // Keep workflows from the last repository only
      const lastRepoName = repoPaths[repoPaths.length - 1]?.name;
      const lastRepoWorkflows = allWorkflows.filter((w) => w.name === lastRepoName);

      for (const workflow of lastRepoWorkflows) {
        const filename = path.basename(workflow.path);
        await writeFile(path.join(outputWorkflowDir, filename), workflow.content);
      }
      break;
    }

    case 'combine':
    default: {
      // Group workflows by filename
      const workflowsByFile = new Map<string, Array<{ name: string; content: string }>>();

      for (const workflow of allWorkflows) {
        const filename = path.basename(workflow.path);
        if (!workflowsByFile.has(filename)) {
          workflowsByFile.set(filename, []);
        }
        workflowsByFile.get(filename)!.push({
          name: workflow.name,
          content: workflow.content,
        });
      }

      // Merge each group
      for (const [filename, workflows] of workflowsByFile) {
        const parsedWorkflows = workflows.map((w) => ({
          name: w.name,
          workflow: parseYaml(w.content),
        }));

        const merged = combineWorkflows(parsedWorkflows);
        const yamlContent = stringifyYaml(merged);

        // Add header comment
        const header = `# Combined CI workflow from: ${workflows.map((w) => w.name).join(', ')}\n# Generated by monorepo-cli\n\n`;

        await writeFile(path.join(outputWorkflowDir, filename), header + yamlContent);
      }
      break;
    }
  }
}

/**
 * Pure variant of mergeWorkflows that returns file content instead of writing to disk.
 * Used by the plan command to serialize workflow merge results into an ApplyPlan.
 */
export async function mergeWorkflowsToFiles(
  repoPaths: Array<{ path: string; name: string }>,
  strategy: WorkflowMergeStrategy
): Promise<Array<{ relativePath: string; content: string }>> {
  if (strategy === 'skip') {
    return [];
  }

  // Find all workflow files
  const allWorkflows: Array<{ name: string; path: string; content: string }> = [];

  for (const repo of repoPaths) {
    const workflowFiles = await findWorkflowFiles(repo.path);
    for (const filePath of workflowFiles) {
      const content = await readFile(filePath);
      allWorkflows.push({
        name: repo.name,
        path: filePath,
        content,
      });
    }
  }

  if (allWorkflows.length === 0) {
    return [];
  }

  const result: Array<{ relativePath: string; content: string }> = [];

  switch (strategy) {
    case 'keep-first': {
      const firstRepoName = repoPaths[0]?.name;
      const firstRepoWorkflows = allWorkflows.filter((w) => w.name === firstRepoName);
      for (const workflow of firstRepoWorkflows) {
        const filename = path.basename(workflow.path);
        result.push({ relativePath: `.github/workflows/${filename}`, content: workflow.content });
      }
      break;
    }

    case 'keep-last': {
      const lastRepoName = repoPaths[repoPaths.length - 1]?.name;
      const lastRepoWorkflows = allWorkflows.filter((w) => w.name === lastRepoName);
      for (const workflow of lastRepoWorkflows) {
        const filename = path.basename(workflow.path);
        result.push({ relativePath: `.github/workflows/${filename}`, content: workflow.content });
      }
      break;
    }

    case 'combine':
    default: {
      // Group workflows by filename
      const workflowsByFile = new Map<string, Array<{ name: string; content: string }>>();

      for (const workflow of allWorkflows) {
        const filename = path.basename(workflow.path);
        if (!workflowsByFile.has(filename)) {
          workflowsByFile.set(filename, []);
        }
        workflowsByFile.get(filename)!.push({
          name: workflow.name,
          content: workflow.content,
        });
      }

      for (const [filename, workflows] of workflowsByFile) {
        const parsedWorkflows = workflows.map((w) => ({
          name: w.name,
          workflow: parseYaml(w.content),
        }));

        const merged = combineWorkflows(parsedWorkflows);
        const yamlContent = stringifyYaml(merged);
        const header = `# Combined CI workflow from: ${workflows.map((w) => w.name).join(', ')}\n# Generated by monorepo-cli\n\n`;

        result.push({ relativePath: `.github/workflows/${filename}`, content: header + yamlContent });
      }
      break;
    }
  }

  return result;
}

/**
 * Analyze workflows in repositories
 */
export async function analyzeWorkflows(
  repoPaths: Array<{ path: string; name: string }>
): Promise<{
  totalWorkflows: number;
  workflowsByRepo: Record<string, string[]>;
  commonTriggers: string[];
  conflicts: string[];
}> {
  const workflowsByRepo: Record<string, string[]> = {};
  const allTriggers = new Set<string>();
  const filenameCounts = new Map<string, number>();

  for (const repo of repoPaths) {
    const workflowFiles = await findWorkflowFiles(repo.path);
    workflowsByRepo[repo.name] = workflowFiles.map((f) => path.basename(f));

    for (const filePath of workflowFiles) {
      const filename = path.basename(filePath);
      filenameCounts.set(filename, (filenameCounts.get(filename) || 0) + 1);

      try {
        const content = await readFile(filePath);
        const workflow = parseYaml(content);

        if (workflow.on) {
          if (typeof workflow.on === 'string') {
            allTriggers.add(workflow.on);
          } else if (Array.isArray(workflow.on)) {
            for (const t of workflow.on) {
              if (typeof t === 'string') {
                allTriggers.add(t);
              }
            }
          } else if (typeof workflow.on === 'object') {
            for (const key of Object.keys(workflow.on)) {
              allTriggers.add(key);
            }
          }
        }
      } catch {
        // Ignore parse errors
      }
    }
  }

  // Find conflicts (same filename in multiple repos)
  const conflicts: string[] = [];
  for (const [filename, count] of filenameCounts) {
    if (count > 1) {
      conflicts.push(filename);
    }
  }

  const totalWorkflows = Object.values(workflowsByRepo).reduce(
    (sum, files) => sum + files.length,
    0
  );

  return {
    totalWorkflows,
    workflowsByRepo,
    commonTriggers: Array.from(allTriggers),
    conflicts,
  };
}
