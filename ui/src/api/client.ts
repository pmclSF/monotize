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
