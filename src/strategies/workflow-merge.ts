import path from 'node:path';
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
 * Parse YAML content into a workflow object
 * Note: This is a simplified YAML parser for GitHub Actions workflows
 */
function parseYaml(content: string): GitHubWorkflow {
  const lines = content.split('\n');
  const result: Record<string, unknown> = {};
  const stack: { indent: number; obj: Record<string, unknown>; key?: string }[] = [
    { indent: -1, obj: result },
  ];

  let currentArray: unknown[] | null = null;
  let currentArrayKey: string | null = null;
  let currentArrayIndent = 0;

  for (const line of lines) {
    // Skip empty lines and comments
    if (!line.trim() || line.trim().startsWith('#')) {
      continue;
    }

    const indent = line.search(/\S/);
    const trimmed = line.trim();

    // Handle array items
    if (trimmed.startsWith('- ')) {
      const value = trimmed.slice(2).trim();

      if (currentArray && indent >= currentArrayIndent) {
        if (value.includes(':')) {
          // Object in array
          const [objKey, objValue] = value.split(':').map((s) => s.trim());
          const obj: Record<string, unknown> = {};
          if (objValue) {
            obj[objKey] = parseValue(objValue);
          } else {
            obj[objKey] = null;
          }
          currentArray.push(obj);
        } else {
          currentArray.push(parseValue(value));
        }
        continue;
      }
    }

    // Handle key-value pairs
    if (trimmed.includes(':')) {
      const colonIndex = trimmed.indexOf(':');
      const key = trimmed.slice(0, colonIndex).trim();
      const value = trimmed.slice(colonIndex + 1).trim();

      // Pop stack to find correct parent
      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }

      const parent = stack[stack.length - 1].obj;

      if (value === '' || value.startsWith('|') || value.startsWith('>')) {
        // Nested object or multiline string
        const newObj: Record<string, unknown> = {};
        parent[key] = newObj;
        stack.push({ indent, obj: newObj, key });
        currentArray = null;
        currentArrayKey = null;
      } else if (value === '[]' || value === '{}') {
        parent[key] = value === '[]' ? [] : {};
      } else {
        parent[key] = parseValue(value);
      }

      // Check if next line starts an array for this key
      currentArrayKey = key;
      currentArrayIndent = indent;
    }

    // Handle array start
    if (trimmed.startsWith('- ') && !currentArray) {
      // Pop stack to find correct parent
      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }

      const parent = stack[stack.length - 1].obj;
      if (currentArrayKey && parent[currentArrayKey] === undefined) {
        const arr: unknown[] = [];
        parent[currentArrayKey] = arr;
        currentArray = arr;
        currentArrayIndent = indent;

        const value = trimmed.slice(2).trim();
        if (value.includes(':')) {
          const [objKey, objValue] = value.split(':').map((s) => s.trim());
          const obj: Record<string, unknown> = {};
          if (objValue) {
            obj[objKey] = parseValue(objValue);
          }
          currentArray.push(obj);
        } else if (value) {
          currentArray.push(parseValue(value));
        }
      }
    }
  }

  return result as GitHubWorkflow;
}

/**
 * Parse a YAML value
 */
function parseValue(value: string): unknown {
  // Remove quotes
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  // Parse booleans
  if (value === 'true') return true;
  if (value === 'false') return false;

  // Parse null
  if (value === 'null' || value === '~') return null;

  // Parse numbers
  if (/^-?\d+$/.test(value)) return parseInt(value, 10);
  if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);

  return value;
}

/**
 * Convert a workflow object back to YAML string
 */
function stringifyYaml(obj: unknown, indent = 0): string {
  const prefix = '  '.repeat(indent);
  let result = '';

  if (obj === null || obj === undefined) {
    return 'null';
  }

  if (typeof obj !== 'object') {
    if (typeof obj === 'string') {
      // Quote strings with special characters
      if (obj.includes(':') || obj.includes('#') || obj.includes('\n') || obj.startsWith(' ') || obj.includes('\\') || obj.includes('"')) {
        // Escape backslashes first, then double quotes
        const escaped = obj.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        return `"${escaped}"`;
      }
      return obj;
    }
    return String(obj);
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) {
      return '[]';
    }
    for (const item of obj) {
      if (typeof item === 'object' && item !== null) {
        result += `${prefix}- `;
        const entries = Object.entries(item);
        if (entries.length > 0) {
          const [firstKey, firstValue] = entries[0];
          result += `${firstKey}: ${stringifyYaml(firstValue, 0)}\n`;
          for (let i = 1; i < entries.length; i++) {
            const [key, value] = entries[i];
            if (typeof value === 'object' && value !== null) {
              result += `${prefix}  ${key}:\n${stringifyYaml(value, indent + 2)}`;
            } else {
              result += `${prefix}  ${key}: ${stringifyYaml(value, 0)}\n`;
            }
          }
        }
      } else {
        result += `${prefix}- ${stringifyYaml(item, 0)}\n`;
      }
    }
    return result;
  }

  // Object
  const entries = Object.entries(obj);
  if (entries.length === 0) {
    return '{}';
  }

  for (const [key, value] of entries) {
    if (typeof value === 'object' && value !== null) {
      if (Array.isArray(value) && value.length === 0) {
        result += `${prefix}${key}: []\n`;
      } else if (!Array.isArray(value) && Object.keys(value).length === 0) {
        result += `${prefix}${key}: {}\n`;
      } else {
        result += `${prefix}${key}:\n${stringifyYaml(value, indent + 1)}`;
      }
    } else {
      result += `${prefix}${key}: ${stringifyYaml(value, 0)}\n`;
    }
  }

  return result;
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
