import type {
  CrossDependency,
  CircularDependency,
  PackageInfo,
  DependencyConflict,
  DependencyHotspot,
} from '../types/index.js';

/**
 * DFS-based cycle detection on cross-dependency graph.
 * Returns all unique cycles found.
 */
export function detectCircularDependencies(
  crossDeps: CrossDependency[]
): CircularDependency[] {
  // Build adjacency list with edge types
  const adj = new Map<
    string,
    Array<{ to: string; edgeType: 'dependencies' | 'devDependencies' | 'peerDependencies' }>
  >();
  const allNodes = new Set<string>();

  for (const dep of crossDeps) {
    allNodes.add(dep.fromPackage);
    allNodes.add(dep.toPackage);

    const edges = adj.get(dep.fromPackage) || [];
    edges.push({ to: dep.toPackage, edgeType: dep.dependencyType });
    adj.set(dep.fromPackage, edges);
  }

  const cycles: CircularDependency[] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const stack: Array<{ node: string; edgeType: 'dependencies' | 'devDependencies' | 'peerDependencies' }> = [];

  // Track found cycles by their canonical form to avoid duplicates
  const foundCycles = new Set<string>();

  function dfs(node: string): void {
    visited.add(node);
    inStack.add(node);
    stack.push({ node, edgeType: 'dependencies' }); // placeholder edge type for start

    const edges = adj.get(node) || [];
    for (const edge of edges) {
      if (!visited.has(edge.to)) {
        stack[stack.length - 1] = { node, edgeType: edge.edgeType };
        dfs(edge.to);
      } else if (inStack.has(edge.to)) {
        // Found a cycle — extract it
        const cycleStart = stack.findIndex((s) => s.node === edge.to);
        if (cycleStart >= 0) {
          const cycleNodes: string[] = [];
          const edgeTypes: Array<'dependencies' | 'devDependencies' | 'peerDependencies'> = [];

          for (let i = cycleStart; i < stack.length; i++) {
            cycleNodes.push(stack[i].node);
            // Edge type is from the next stack entry, or the current back-edge for the last one
            if (i < stack.length - 1) {
              edgeTypes.push(stack[i + 1].edgeType || 'dependencies');
            }
          }
          edgeTypes.push(edge.edgeType); // closing edge back to start

          // Canonical form: sort to find smallest rotation
          const canonical = canonicalizeCycle(cycleNodes);
          const key = canonical.join('->');
          if (!foundCycles.has(key)) {
            foundCycles.add(key);
            cycles.push({ cycle: cycleNodes, edgeTypes });
          }
        }
      }
    }

    stack.pop();
    inStack.delete(node);
  }

  for (const node of allNodes) {
    if (!visited.has(node)) {
      dfs(node);
    }
  }

  return cycles;
}

/**
 * Canonicalize a cycle by rotating to start with the smallest element.
 */
function canonicalizeCycle(cycle: string[]): string[] {
  if (cycle.length === 0) return cycle;
  let minIdx = 0;
  for (let i = 1; i < cycle.length; i++) {
    if (cycle[i] < cycle[minIdx]) {
      minIdx = i;
    }
  }
  return [...cycle.slice(minIdx), ...cycle.slice(0, minIdx)];
}

/**
 * Top N most-depended-on packages, sorted by dependent count.
 */
export function computeHotspots(
  packages: PackageInfo[],
  conflicts: DependencyConflict[],
  limit = 10
): DependencyHotspot[] {
  // Count how many packages depend on each external dependency
  const depCounts = new Map<string, { count: number; ranges: Set<string> }>();
  const conflictNames = new Set(conflicts.map((c) => c.name));

  for (const pkg of packages) {
    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
      ...pkg.peerDependencies,
    };

    for (const [name, version] of Object.entries(allDeps)) {
      const existing = depCounts.get(name) || { count: 0, ranges: new Set<string>() };
      existing.count++;
      existing.ranges.add(version);
      depCounts.set(name, existing);
    }
  }

  // Convert to hotspots, filter to only those referenced by 2+ packages
  const hotspots: DependencyHotspot[] = [];
  for (const [name, data] of depCounts) {
    if (data.count >= 2) {
      hotspots.push({
        name,
        dependentCount: data.count,
        hasConflict: conflictNames.has(name),
        versionRanges: [...data.ranges],
      });
    }
  }

  // Sort descending by count, then alphabetically by name
  hotspots.sort((a, b) => b.dependentCount - a.dependentCount || a.name.localeCompare(b.name));

  return hotspots.slice(0, limit);
}
