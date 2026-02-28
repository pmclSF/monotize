import type { PrepPatch, RepoPrepAnalysis } from '../types/index.js';

/**
 * Options controlling which patches to generate
 */
export interface PatchGenerationOptions {
  targetNodeVersion?: string;
  targetPackageManager?: string;
}

/**
 * Build a unified diff string from old and new line arrays.
 * For new files (oldLines empty), uses "--- /dev/null".
 * Computes hunk headers with the specified context lines.
 */
export function buildUnifiedDiff(
  filePath: string,
  oldLines: string[],
  newLines: string[],
  context = 3
): string {
  const isNewFile = oldLines.length === 0;
  const header = isNewFile
    ? `--- /dev/null\n+++ b/${filePath}`
    : `--- a/${filePath}\n+++ b/${filePath}`;

  if (isNewFile) {
    const hunk = `@@ -0,0 +1,${newLines.length} @@`;
    const additions = newLines.map((l) => `+${l}`).join('\n');
    return `${header}\n${hunk}\n${additions}\n`;
  }

  // Find first and last changed line indices
  let firstChange = -1;
  let lastChangeOld = -1;
  let lastChangeNew = -1;
  const maxLen = Math.max(oldLines.length, newLines.length);

  for (let i = 0; i < maxLen; i++) {
    const oldLine = i < oldLines.length ? oldLines[i] : undefined;
    const newLine = i < newLines.length ? newLines[i] : undefined;
    if (oldLine !== newLine) {
      if (firstChange === -1) firstChange = i;
      if (i < oldLines.length) lastChangeOld = i;
      if (i < newLines.length) lastChangeNew = i;
    }
  }

  if (firstChange === -1) {
    return '';
  }

  // Clamp last change indices
  if (lastChangeOld === -1) lastChangeOld = firstChange - 1;
  if (lastChangeNew === -1) lastChangeNew = firstChange - 1;

  // Compute hunk boundaries with context
  const hunkStartOld = Math.max(0, firstChange - context);
  const hunkEndOld = Math.min(oldLines.length - 1, lastChangeOld + context);
  const hunkStartNew = Math.max(0, firstChange - context);
  const hunkEndNew = Math.min(newLines.length - 1, lastChangeNew + context);

  const oldCount = Math.max(0, hunkEndOld - hunkStartOld + 1);
  const newCount = Math.max(0, hunkEndNew - hunkStartNew + 1);

  const hunkHeader = `@@ -${hunkStartOld + 1},${oldCount} +${hunkStartNew + 1},${newCount} @@`;

  const lines: string[] = [];

  // Context lines before the change
  for (let i = hunkStartOld; i < firstChange; i++) {
    lines.push(` ${oldLines[i]}`);
  }

  // Removed lines from old
  for (let i = firstChange; i <= lastChangeOld; i++) {
    lines.push(`-${oldLines[i]}`);
  }

  // Added lines from new
  for (let i = firstChange; i <= lastChangeNew; i++) {
    lines.push(`+${newLines[i]}`);
  }

  // Context lines after the change
  const contextAfterStart = Math.max(lastChangeOld, lastChangeNew) + 1;
  const contextAfterEndOld = hunkEndOld;
  for (let i = contextAfterStart; i <= contextAfterEndOld && i < oldLines.length; i++) {
    lines.push(` ${oldLines[i]}`);
  }

  return `${header}\n${hunkHeader}\n${lines.join('\n')}\n`;
}

/**
 * Generate a patch for .nvmrc
 * Returns null if the file already has the correct version.
 */
export function generateNvmrcPatch(
  repoName: string,
  currentContent: string | null,
  targetVersion: string
): PrepPatch | null {
  const trimmed = currentContent?.trim() ?? null;
  if (trimmed === targetVersion) return null;

  const oldLines = trimmed !== null ? [trimmed] : [];
  const newLines = [targetVersion];

  const content = buildUnifiedDiff('.nvmrc', oldLines, newLines);
  if (!content) return null;

  return {
    filename: `${repoName}/nvmrc.patch`,
    content,
    repoName,
    targetFile: '.nvmrc',
    patchType: 'node-version',
  };
}

/**
 * Generate a patch for .node-version
 * Returns null if the file already has the correct version.
 */
export function generateNodeVersionFilePatch(
  repoName: string,
  currentContent: string | null,
  targetVersion: string
): PrepPatch | null {
  const trimmed = currentContent?.trim() ?? null;
  if (trimmed === targetVersion) return null;

  const oldLines = trimmed !== null ? [trimmed] : [];
  const newLines = [targetVersion];

  const content = buildUnifiedDiff('.node-version', oldLines, newLines);
  if (!content) return null;

  return {
    filename: `${repoName}/node-version.patch`,
    content,
    repoName,
    targetFile: '.node-version',
    patchType: 'node-version',
  };
}

/**
 * Generate a patch for engines.node in package.json.
 * Returns null if engines.node already matches `>=<target>`.
 */
export function generateEnginesNodePatch(
  repoName: string,
  packageJson: Record<string, unknown>,
  targetVersion: string
): PrepPatch | null {
  const targetEngines = `>=${targetVersion}`;
  const engines = packageJson.engines as Record<string, string> | undefined;
  const currentEnginesNode = engines?.node;

  if (currentEnginesNode === targetEngines) return null;

  const oldJson = JSON.stringify(packageJson, null, 2);
  const oldLines = oldJson.split('\n');

  const newPkgJson = { ...packageJson };
  const newEngines = { ...(engines || {}), node: targetEngines };
  newPkgJson.engines = newEngines;

  const newJson = JSON.stringify(newPkgJson, null, 2);
  const newLines = newJson.split('\n');

  const content = buildUnifiedDiff('package.json', oldLines, newLines);
  if (!content) return null;

  return {
    filename: `${repoName}/engines-node.patch`,
    content,
    repoName,
    targetFile: 'package.json',
    patchType: 'node-version',
  };
}

/**
 * Generate a patch to add a placeholder build script.
 * Returns null if the repo already has a build script.
 */
export function generateBuildScriptPatch(
  repoName: string,
  packageJson: Record<string, unknown>,
  hasBuildScript: boolean
): PrepPatch | null {
  if (hasBuildScript) return null;

  const oldJson = JSON.stringify(packageJson, null, 2);
  const oldLines = oldJson.split('\n');

  const newPkgJson = { ...packageJson };
  const scripts = { ...(packageJson.scripts as Record<string, string> || {}) };
  scripts.build = 'echo "TODO: add build script"';
  newPkgJson.scripts = scripts;

  const newJson = JSON.stringify(newPkgJson, null, 2);
  const newLines = newJson.split('\n');

  const content = buildUnifiedDiff('package.json', oldLines, newLines);
  if (!content) return null;

  return {
    filename: `${repoName}/build-script.patch`,
    content,
    repoName,
    targetFile: 'package.json',
    patchType: 'build-script',
  };
}

/**
 * Generate a patch for the packageManager field in package.json.
 * Returns null if it already matches the target.
 */
export function generatePMFieldPatch(
  repoName: string,
  packageJson: Record<string, unknown>,
  targetPMField: string
): PrepPatch | null {
  const current = packageJson.packageManager as string | undefined;
  if (current === targetPMField) return null;

  const oldJson = JSON.stringify(packageJson, null, 2);
  const oldLines = oldJson.split('\n');

  const newPkgJson = { ...packageJson, packageManager: targetPMField };

  const newJson = JSON.stringify(newPkgJson, null, 2);
  const newLines = newJson.split('\n');

  const content = buildUnifiedDiff('package.json', oldLines, newLines);
  if (!content) return null;

  return {
    filename: `${repoName}/package-manager.patch`,
    content,
    repoName,
    targetFile: 'package.json',
    patchType: 'package-manager-field',
  };
}

/**
 * Generate all applicable patches for a single repo.
 */
export function generatePatchesForRepo(
  analysis: RepoPrepAnalysis,
  options: PatchGenerationOptions
): PrepPatch[] {
  const patches: PrepPatch[] = [];

  if (options.targetNodeVersion) {
    const nvmrc = generateNvmrcPatch(analysis.repoName, analysis.nvmrc, options.targetNodeVersion);
    if (nvmrc) patches.push(nvmrc);

    const nodeVer = generateNodeVersionFilePatch(analysis.repoName, analysis.nodeVersion, options.targetNodeVersion);
    if (nodeVer) patches.push(nodeVer);

    const engines = generateEnginesNodePatch(analysis.repoName, analysis.packageJson, options.targetNodeVersion);
    if (engines) patches.push(engines);
  }

  const buildScript = generateBuildScriptPatch(analysis.repoName, analysis.packageJson, analysis.hasBuildScript);
  if (buildScript) patches.push(buildScript);

  if (options.targetPackageManager) {
    const pmField = generatePMFieldPatch(analysis.repoName, analysis.packageJson, options.targetPackageManager);
    if (pmField) patches.push(pmField);
  }

  return patches;
}
