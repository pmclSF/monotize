import chalk from 'chalk';
import type {
  AnalyzeResult,
  CircularDependency,
  CrossDependency,
  DependencyConflict,
  FileCollision,
  PackageInfo,
} from '../types/index.js';
import { createLogger, formatHeader, formatList } from '../utils/logger.js';
import { createTempDir, removeDir } from '../utils/fs.js';
import { validateRepoSources } from '../utils/validation.js';
import { analyzeDependencies } from '../analyzers/dependencies.js';
import { detectFileCollisions } from '../analyzers/files.js';
import { detectCircularDependencies, computeHotspots } from '../analyzers/graph.js';
import { cloneOrCopyRepos } from '../strategies/copy.js';
import { getConflictSummary } from '../resolvers/dependencies.js';

/**
 * CLI options passed from commander
 */
interface CLIAnalyzeOptions {
  verbose?: boolean;
  json?: boolean;
}

/**
 * Detect cross-dependencies between packages
 */
export function detectCrossDependencies(packages: PackageInfo[]): CrossDependency[] {
  const crossDeps: CrossDependency[] = [];
  const packageNames = new Set(packages.map((p) => p.name));

  for (const pkg of packages) {
    // Check all dependency types
    const depTypes = ['dependencies', 'devDependencies', 'peerDependencies'] as const;

    for (const depType of depTypes) {
      const deps = pkg[depType];
      for (const [depName] of Object.entries(deps)) {
        if (packageNames.has(depName)) {
          crossDeps.push({
            fromPackage: pkg.name,
            toPackage: depName,
            currentVersion: deps[depName],
            dependencyType: depType,
          });
        }
      }
    }
  }

  return crossDeps;
}

/**
 * Calculate complexity score based on analysis results
 * Score from 0-100 where higher = more complex
 */
function calculateComplexityScore(
  packages: PackageInfo[],
  conflicts: DependencyConflict[],
  collisions: FileCollision[],
  crossDeps: CrossDependency[],
  peerConflicts: DependencyConflict[] = [],
  circularDeps: CircularDependency[] = []
): number {
  let score = 0;

  // Package count contribution (0-20 points)
  score += Math.min(packages.length * 2, 20);

  // Dependency conflicts contribution (0-40 points)
  for (const conflict of conflicts) {
    switch (conflict.severity) {
      case 'incompatible':
        score += 10;
        break;
      case 'major':
        score += 5;
        break;
      case 'minor':
        score += 1;
        break;
    }
  }
  score = Math.min(score, 60); // Cap at 60 for conflicts

  // Peer conflicts: +5 each
  score += peerConflicts.length * 5;

  // Circular dependencies: +10 each
  score += circularDeps.length * 10;

  // File collisions contribution (0-20 points)
  score += Math.min(collisions.length * 2, 20);

  // Cross-dependencies (0-20 points) - can reduce complexity if well-structured
  // But many cross-deps can indicate tight coupling
  if (crossDeps.length > 0 && crossDeps.length <= packages.length) {
    // Healthy amount of cross-deps
    score += 5;
  } else if (crossDeps.length > packages.length * 2) {
    // Too many cross-deps = complexity
    score += 15;
  }

  return Math.min(Math.round(score), 100);
}

/**
 * Generate recommendations based on analysis
 */
function generateRecommendations(
  packages: PackageInfo[],
  conflicts: DependencyConflict[],
  collisions: FileCollision[],
  crossDeps: CrossDependency[],
  peerConflicts: DependencyConflict[] = [],
  circularDeps: CircularDependency[] = []
): string[] {
  const recommendations: string[] = [];

  // Conflict recommendations
  const conflictSummary = getConflictSummary(conflicts);

  if (conflictSummary.incompatible > 0) {
    recommendations.push(
      `Found ${conflictSummary.incompatible} incompatible dependency conflict(s). ` +
        `Consider using --no-hoist to isolate package dependencies.`
    );
  }

  if (conflictSummary.major > 0) {
    recommendations.push(
      `Found ${conflictSummary.major} major version conflict(s). ` +
        `Review these packages and consider updating to compatible versions.`
    );
  }

  // Cross-dependency recommendations
  if (crossDeps.length > 0) {
    const usingWorkspaceProtocol = crossDeps.filter((d) =>
      d.currentVersion.startsWith('workspace:')
    );

    if (usingWorkspaceProtocol.length < crossDeps.length) {
      recommendations.push(
        `Found ${crossDeps.length - usingWorkspaceProtocol.length} cross-dependencies ` +
          `not using workspace protocol. These will be automatically updated.`
      );
    }
  }

  // File collision recommendations
  const mergeable = collisions.filter((c) => c.suggestedStrategy === 'merge');
  if (mergeable.length > 0) {
    recommendations.push(
      `Found ${mergeable.length} file(s) that can be automatically merged ` +
        `(e.g., .gitignore files).`
    );
  }

  // Package structure recommendations
  if (packages.length > 5) {
    recommendations.push(
      `With ${packages.length} packages, consider using --workspace-tool turbo or nx ` +
        `for better task orchestration and caching.`
    );
  }

  // Check for common scripts
  const hasCommonScripts = {
    build: packages.filter((p) => p.scripts.build).length,
    test: packages.filter((p) => p.scripts.test).length,
    lint: packages.filter((p) => p.scripts.lint).length,
  };

  if (hasCommonScripts.build > 0 && hasCommonScripts.build < packages.length) {
    recommendations.push(
      `Only ${hasCommonScripts.build}/${packages.length} packages have a build script. ` +
        `Consider standardizing scripts across packages.`
    );
  }

  // Peer dependency recommendations
  if (peerConflicts.length > 0) {
    recommendations.push(
      `Found ${peerConflicts.length} peer dependency violation(s). ` +
        `Review peer dependency requirements and update versions to satisfy constraints.`
    );
  }

  // Circular dependency recommendations
  if (circularDeps.length > 0) {
    recommendations.push(
      `Found ${circularDeps.length} circular dependency cycle(s). ` +
        `Consider restructuring packages to break cycles, or extract shared code into a common package.`
    );
  }

  // Low-confidence findings
  const lowConfidence = [...conflicts, ...peerConflicts].filter((c) => c.confidence === 'low');
  if (lowConfidence.length > 0) {
    recommendations.push(
      `${lowConfidence.length} finding(s) have low confidence due to complex version ranges. ` +
        `Manual verification is recommended.`
    );
  }

  return recommendations;
}

/**
 * Print analysis results in human-readable format
 */
function printAnalysisReport(result: AnalyzeResult, verbose: boolean): void {
  const logger = createLogger(verbose);

  logger.log(formatHeader('Repository Analysis'));

  // Packages
  logger.log(chalk.bold('\nPackages found:'));
  logger.log(
    formatList(
      result.packages.map((p) => `${p.name}@${p.version} (from ${p.repoName})`)
    )
  );

  // Dependency conflicts
  if (result.conflicts.length > 0) {
    const summary = getConflictSummary(result.conflicts);
    logger.log(chalk.bold('\nDependency conflicts:'));
    logger.log(
      `  ${chalk.red(summary.incompatible)} incompatible, ` +
        `${chalk.yellow(summary.major)} major, ` +
        `${chalk.gray(summary.minor)} minor`
    );

    if (verbose) {
      for (const conflict of result.conflicts) {
        const severityColor =
          conflict.severity === 'incompatible'
            ? chalk.red
            : conflict.severity === 'major'
              ? chalk.yellow
              : chalk.gray;

        logger.log(`  ${severityColor('•')} ${conflict.name}`);
        for (const v of conflict.versions) {
          logger.log(`    - ${v.version} (${v.source})`);
        }
      }
    }
  } else {
    logger.log(chalk.bold('\nDependency conflicts:'));
    logger.log('  None detected');
  }

  // File collisions
  if (result.collisions.length > 0) {
    logger.log(chalk.bold('\nFile collisions:'));
    for (const collision of result.collisions) {
      logger.log(
        `  • ${collision.path} (in: ${collision.sources.join(', ')}) → ${collision.suggestedStrategy}`
      );
    }
  } else {
    logger.log(chalk.bold('\nFile collisions:'));
    logger.log('  None detected');
  }

  // Cross-dependencies
  if (result.crossDependencies.length > 0) {
    logger.log(chalk.bold('\nCross-dependencies:'));
    for (const dep of result.crossDependencies) {
      logger.log(
        `  • ${dep.fromPackage} → ${dep.toPackage} (${dep.currentVersion})`
      );
    }
  }

  // Findings Breakdown
  if (result.findings) {
    const { declaredConflicts, resolvedConflicts, peerConflicts } = result.findings;
    const totalFindings = declaredConflicts.length + resolvedConflicts.length + peerConflicts.length;

    if (totalFindings > 0) {
      logger.log(chalk.bold('\nFindings breakdown:'));

      if (declaredConflicts.length > 0) {
        logger.log(`  Declared conflicts: ${declaredConflicts.length}`);
        if (verbose) {
          for (const c of declaredConflicts) {
            const badge = c.confidence === 'high' ? chalk.green('[HIGH]') : c.confidence === 'medium' ? chalk.yellow('[MED]') : chalk.gray('[LOW]');
            logger.log(`    ${badge} ${c.name}: ${c.versions.map((v) => `${v.version} (${v.source})`).join(', ')}`);
          }
        }
      }

      if (resolvedConflicts.length > 0) {
        logger.log(`  Resolved conflicts: ${resolvedConflicts.length}`);
        if (verbose) {
          for (const c of resolvedConflicts) {
            const badge = c.confidence === 'high' ? chalk.green('[HIGH]') : c.confidence === 'medium' ? chalk.yellow('[MED]') : chalk.gray('[LOW]');
            logger.log(`    ${badge} ${c.name}: ${c.versions.map((v) => `${v.version} (${v.source})`).join(', ')}`);
          }
        }
      }

      if (peerConflicts.length > 0) {
        logger.log(`  Peer constraint violations: ${peerConflicts.length}`);
        if (verbose) {
          for (const c of peerConflicts) {
            const badge = c.confidence === 'low' ? chalk.gray('[LOW]') : chalk.yellow('[MED]');
            logger.log(`    ${badge} ${c.name}: ${c.versions.map((v) => `${v.version} (${v.source})`).join(' vs ')}`);
          }
        }
      }
    }
  }

  // Circular Dependencies
  if (result.circularDependencies && result.circularDependencies.length > 0) {
    logger.log(chalk.bold('\nCircular dependencies:'));
    for (const cycle of result.circularDependencies) {
      logger.log(`  ${chalk.red('⟳')} ${cycle.cycle.join(' → ')} → ${cycle.cycle[0]}`);
    }
  }

  // Hotspots
  if (result.hotspots && result.hotspots.length > 0) {
    const topHotspots = result.hotspots.slice(0, 5);
    logger.log(chalk.bold('\nDependency hotspots:'));
    for (const hotspot of topHotspots) {
      const conflictMark = hotspot.hasConflict ? chalk.red(' ⚠ conflict') : '';
      logger.log(`  • ${hotspot.name} (${hotspot.dependentCount} packages)${conflictMark}`);
    }
  }

  // Decisions Required
  if (result.findings && result.findings.decisions.length > 0) {
    logger.log(chalk.bold('\nDecisions required:'));
    for (const decision of result.findings.decisions) {
      logger.log(`  ${chalk.yellow('?')} ${decision.description}`);
      if (decision.suggestedAction) {
        logger.log(`    ${chalk.cyan('→')} ${decision.suggestedAction}`);
      }
    }
  }

  // Complexity score
  logger.log(chalk.bold('\nComplexity score:'));
  const scoreColor =
    result.complexityScore < 30
      ? chalk.green
      : result.complexityScore < 60
        ? chalk.yellow
        : chalk.red;
  const scoreLabel =
    result.complexityScore < 30
      ? 'Low'
      : result.complexityScore < 60
        ? 'Medium'
        : 'High';
  logger.log(`  ${scoreColor(`${result.complexityScore}/100`)} (${scoreLabel})`);

  // Recommendations
  if (result.recommendations.length > 0) {
    logger.log(chalk.bold('\nRecommendations:'));
    for (const rec of result.recommendations) {
      logger.log(`  ${chalk.cyan('→')} ${rec}`);
    }
  }

  logger.log('');
}

/**
 * Main analyze command handler
 */
export async function analyzeCommand(
  repos: string[],
  options: CLIAnalyzeOptions
): Promise<void> {
  const logger = createLogger(options.verbose);
  let tempDir: string | null = null;

  try {
    // Step 1: Validate repo sources
    if (!options.json) {
      logger.info('Validating repository sources...');
    }

    const validation = await validateRepoSources(repos);

    if (!validation.valid) {
      if (options.json) {
        console.log(
          JSON.stringify(
            { error: 'Validation failed', errors: validation.errors },
            null,
            2
          )
        );
      } else {
        for (const error of validation.errors) {
          logger.error(error);
        }
      }
      process.exit(1);
    }

    if (!options.json) {
      logger.success(`Found ${validation.sources.length} repositories to analyze`);
    }

    // Step 2: Create temp working directory
    tempDir = await createTempDir();

    // Step 3: Clone/copy each repo to temp dir
    if (!options.json) {
      logger.info('Fetching repositories...');
    }

    // Create a silent logger for JSON mode to avoid mixing output
    const silentLogger = {
      info: () => {},
      success: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
      log: () => {},
    };

    const repoPaths = await cloneOrCopyRepos(validation.sources, tempDir, {
      logger: options.json ? silentLogger : logger,
      verbose: options.verbose,
    });

    // Step 4: Run dependency analysis
    if (!options.json) {
      logger.info('Analyzing dependencies...');
    }

    const depAnalysis = await analyzeDependencies(repoPaths);

    // Step 5: Run file collision detection
    if (!options.json) {
      logger.info('Detecting file collisions...');
    }

    const collisions = await detectFileCollisions(repoPaths);

    // Step 6: Detect cross-dependencies
    const crossDependencies = detectCrossDependencies(depAnalysis.packages);

    // Step 6b: Detect circular dependencies
    const circularDependencies = detectCircularDependencies(crossDependencies);

    // Step 6c: Compute hotspots
    const hotspots = computeHotspots(depAnalysis.packages, depAnalysis.conflicts);

    // Extract peer conflicts for scoring
    const peerConflicts = depAnalysis.findings?.peerConflicts ?? [];

    // Step 7: Calculate complexity score
    const complexityScore = calculateComplexityScore(
      depAnalysis.packages,
      depAnalysis.conflicts,
      collisions,
      crossDependencies,
      peerConflicts,
      circularDependencies
    );

    // Step 8: Generate recommendations
    const recommendations = generateRecommendations(
      depAnalysis.packages,
      depAnalysis.conflicts,
      collisions,
      crossDependencies,
      peerConflicts,
      circularDependencies
    );

    // Build result
    const result: AnalyzeResult = {
      packages: depAnalysis.packages,
      conflicts: depAnalysis.conflicts,
      collisions,
      crossDependencies,
      complexityScore,
      recommendations,
      circularDependencies: circularDependencies.length > 0 ? circularDependencies : undefined,
      hotspots: hotspots.length > 0 ? hotspots : undefined,
      findings: depAnalysis.findings,
    };

    // Output
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printAnalysisReport(result, options.verbose || false);
    }

    // Cleanup
    if (tempDir) {
      await removeDir(tempDir);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (options.json) {
      console.log(JSON.stringify({ error: message }, null, 2));
    } else {
      logger.error(`Analysis failed: ${message}`);
    }

    if (tempDir) {
      try {
        await removeDir(tempDir);
      } catch {
        // Ignore cleanup errors
      }
    }

    process.exit(1);
  }
}
