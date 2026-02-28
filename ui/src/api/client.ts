async function post(endpoint: string, body: unknown): Promise<{ opId: string }> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(data.error || `Request failed: ${res.status}`);
  }

  return res.json();
}

export function postAnalyze(repos: string[]): Promise<{ opId: string }> {
  return post('/api/analyze', { repos });
}

export interface PlanOptions {
  output?: string;
  packagesDir?: string;
  conflictStrategy?: string;
  packageManager?: string;
  workspaceTool?: string;
  install?: boolean;
}

export function postPlan(repos: string[], options?: PlanOptions): Promise<{ opId: string }> {
  return post('/api/plan', { repos, options });
}

export function postApply(plan: string, out?: string): Promise<{ opId: string }> {
  return post('/api/apply', { plan, out });
}

export interface VerifyOptions {
  plan?: string;
  dir?: string;
  tier?: string;
}

export function postVerify(options: VerifyOptions): Promise<{ opId: string }> {
  return post('/api/verify', options);
}

// ─── Wizard State API ─────────────────────────────────────────────────────

export interface WizardStepState {
  id: string;
  status: 'pending' | 'in-progress' | 'completed' | 'skipped';
  startedAt?: string;
  completedAt?: string;
  skipRationale?: string;
  artifactPath?: string;
  lastOpId?: string;
}

export interface WizardGlobalOptions {
  outputDir: string;
  packagesDir: string;
  packageManager: string;
  conflictStrategy: string;
  workspaceTool: string;
  planPath?: string;
  targetNodeVersion?: string;
}

export interface WizardState {
  version: 1;
  createdAt: string;
  updatedAt: string;
  repos: string[];
  currentStep: string;
  steps: WizardStepState[];
  options: WizardGlobalOptions;
}

export async function getWizardState(): Promise<{ exists: boolean; state: WizardState | null }> {
  const res = await fetch('/api/wizard/state');
  if (!res.ok) {
    throw new Error(`Failed to fetch wizard state: ${res.status}`);
  }
  return res.json();
}

export async function putWizardState(state: WizardState): Promise<{ ok: boolean }> {
  const res = await fetch('/api/wizard/state', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(data.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export async function initWizard(repos: string[]): Promise<{ state: WizardState }> {
  const res = await fetch('/api/wizard/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repos }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(data.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

// ─── Prepare API ──────────────────────────────────────────────────────────

export interface PrepareOptions {
  targetNodeVersion?: string;
  targetPackageManager?: string;
}

export function postPrepare(repos: string[], options?: PrepareOptions): Promise<{ opId: string }> {
  return post('/api/prepare', { repos, options });
}

// ─── Configure API ────────────────────────────────────────────────────────

export interface ConfigureOptions {
  packagesDir: string;
  packageNames: string[];
  workspaceTool?: string;
}

export function postConfigure(options: ConfigureOptions): Promise<{ opId: string }> {
  return post('/api/configure', options);
}

// ─── Archive API ──────────────────────────────────────────────────────────

export async function postArchive(repos: string[]): Promise<Record<string, unknown>> {
  const res = await fetch('/api/archive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repos }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(data.error || `Request failed: ${res.status}`);
  }
  return res.json();
}
