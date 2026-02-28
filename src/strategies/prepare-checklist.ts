import type { PrepCheckItem, PrepPatch, RepoPrepAnalysis } from '../types/index.js';

/**
 * Options for rendering the checklist
 */
export interface ChecklistRenderOptions {
  includeAutoFixed?: boolean;
}

/**
 * Generate checklist items from repo analyses and generated patches.
 * Items with matching patches are marked as autoFixed.
 */
export function generateChecklistItems(
  repos: RepoPrepAnalysis[],
  patches: PrepPatch[]
): PrepCheckItem[] {
  const items: PrepCheckItem[] = [];

  // Build a set of (repoName, patchType) for quick lookup
  const patchSet = new Set(
    patches.map((p) => `${p.repoName}:${p.patchType}`)
  );

  for (const repo of repos) {
    // Node version checks
    if (!repo.nvmrc) {
      const autoFixed = patchSet.has(`${repo.repoName}:node-version`);
      items.push({
        repoName: repo.repoName,
        category: 'node-version',
        title: 'Missing .nvmrc',
        description: `${repo.repoName} does not have a .nvmrc file to pin the Node.js version.`,
        autoFixed,
        severity: autoFixed ? 'info' : 'warn',
      });
    }

    if (!repo.nodeVersion) {
      const autoFixed = patchSet.has(`${repo.repoName}:node-version`);
      items.push({
        repoName: repo.repoName,
        category: 'node-version',
        title: 'Missing .node-version',
        description: `${repo.repoName} does not have a .node-version file.`,
        autoFixed,
        severity: autoFixed ? 'info' : 'warn',
      });
    }

    // Engines check
    if (!repo.enginesNode) {
      const autoFixed = patchSet.has(`${repo.repoName}:node-version`);
      items.push({
        repoName: repo.repoName,
        category: 'engines',
        title: 'Missing engines.node',
        description: `${repo.repoName}/package.json does not specify engines.node.`,
        autoFixed,
        severity: autoFixed ? 'info' : 'warn',
      });
    }

    // Build script check
    if (!repo.hasBuildScript) {
      const autoFixed = patchSet.has(`${repo.repoName}:build-script`);
      items.push({
        repoName: repo.repoName,
        category: 'build-script',
        title: 'Missing build script',
        description: `${repo.repoName}/package.json does not have a "build" script. A placeholder was ${autoFixed ? 'added' : 'not added'}.`,
        autoFixed,
        severity: autoFixed ? 'info' : 'action-required',
      });
    }

    // Package manager field check
    if (!repo.existingPackageManagerField) {
      const autoFixed = patchSet.has(`${repo.repoName}:package-manager-field`);
      items.push({
        repoName: repo.repoName,
        category: 'package-manager',
        title: 'Missing packageManager field',
        description: `${repo.repoName}/package.json does not have a "packageManager" field.`,
        autoFixed,
        severity: autoFixed ? 'info' : 'warn',
      });
    }
  }

  // Cross-repo checks: inconsistent node versions
  const nodeVersions = new Set<string>();
  for (const repo of repos) {
    if (repo.nvmrc) nodeVersions.add(repo.nvmrc);
    if (repo.nodeVersion) nodeVersions.add(repo.nodeVersion);
  }
  if (nodeVersions.size > 1) {
    items.push({
      repoName: null,
      category: 'node-version',
      title: 'Inconsistent Node.js versions',
      description: `Repos use different Node.js versions: ${[...nodeVersions].join(', ')}. Consider standardizing.`,
      autoFixed: false,
      severity: 'action-required',
    });
  }

  // Cross-repo checks: inconsistent package managers
  const packageManagers = new Set<string>();
  for (const repo of repos) {
    if (repo.existingPackageManagerField) {
      const pm = repo.existingPackageManagerField.split('@')[0];
      packageManagers.add(pm);
    }
  }
  if (packageManagers.size > 1) {
    items.push({
      repoName: null,
      category: 'package-manager',
      title: 'Inconsistent package managers',
      description: `Repos use different package managers: ${[...packageManagers].join(', ')}. Monorepo requires a single package manager.`,
      autoFixed: false,
      severity: 'action-required',
    });
  }

  return items;
}

/**
 * Render checklist items as a Markdown document.
 */
export function renderChecklistMarkdown(
  items: PrepCheckItem[],
  options: ChecklistRenderOptions = {}
): string {
  const { includeAutoFixed = true } = options;

  const filteredItems = includeAutoFixed
    ? items
    : items.filter((item) => !item.autoFixed);

  if (filteredItems.length === 0) {
    return '# Pre-Migration Checklist\n\nAll checks passed. No action required.\n';
  }

  const lines: string[] = [];
  lines.push('# Pre-Migration Checklist');
  lines.push('');

  // Summary table
  const autoFixedCount = filteredItems.filter((i) => i.autoFixed).length;
  const actionCount = filteredItems.filter((i) => i.severity === 'action-required').length;
  const warnCount = filteredItems.filter((i) => i.severity === 'warn').length;
  const infoCount = filteredItems.filter((i) => i.severity === 'info').length;

  lines.push('## Summary');
  lines.push('');
  lines.push(`| Status | Count |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Auto-fixed | ${autoFixedCount} |`);
  lines.push(`| Action required | ${actionCount} |`);
  lines.push(`| Warnings | ${warnCount} |`);
  lines.push(`| Info | ${infoCount} |`);
  lines.push(`| **Total** | **${filteredItems.length}** |`);
  lines.push('');

  // Cross-repo items
  const crossRepoItems = filteredItems.filter((i) => i.repoName === null);
  if (crossRepoItems.length > 0) {
    lines.push('## Cross-Repository Issues');
    lines.push('');
    for (const item of crossRepoItems) {
      const marker = item.autoFixed ? '[AUTO-FIXED]' : '[ ]';
      lines.push(`- ${marker} **${item.title}** (${item.severity})`);
      lines.push(`  ${item.description}`);
    }
    lines.push('');
  }

  // Per-repo items
  const repoNames = [...new Set(filteredItems.filter((i) => i.repoName !== null).map((i) => i.repoName!))];
  for (const repoName of repoNames) {
    const repoItems = filteredItems.filter((i) => i.repoName === repoName);
    lines.push(`## ${repoName}`);
    lines.push('');
    for (const item of repoItems) {
      const marker = item.autoFixed ? '[AUTO-FIXED]' : '[ ]';
      lines.push(`- ${marker} **${item.title}** (${item.severity})`);
      lines.push(`  ${item.description}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
