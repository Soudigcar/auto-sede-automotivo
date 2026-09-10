import { forbiddenMetricsRefs, metricsBranch } from '../../src/lib/commercialMetricsHomologation';

export type BranchKind = 'crm' | 'autocar';
export type BranchTarget = {
  kind: BranchKind;
  projectRef: string;
  expectedParentRef: string;
  branchName: string;
  apiUrl: string;
};
export type InstallationManifest = {
  approved: boolean;
  branch: string;
  crmProjectRef: string | null;
  autocarProjectRef: string | null;
};
const parents = { crm: 'wufikrdgyxrsszlbpfmv', autocar: 'icmwdggbvijexjgrvsbl' };
const names = { crm: 'metrics-crm-homologation', autocar: 'metrics-autocar-homologation' };
const validRef = (value: unknown): value is string => typeof value === 'string' && /^[a-z]{20}$/.test(value) && !forbiddenMetricsRefs.includes(value);

export function parseBranchArguments(args: string[]): BranchTarget {
  const flags = ['--kind', '--project-ref', '--expected-parent-ref', '--branch-name', '--api-url'];
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index], value = args[index + 1];
    if (!flags.includes(flag) || values.has(flag) || !value || value.startsWith('--')) throw new Error('Explicit branch arguments required');
    values.set(flag, value);
  }
  if (values.size !== flags.length || !['crm', 'autocar'].includes(values.get('--kind')!)) throw new Error('Explicit branch arguments required');
  return { kind: values.get('--kind') as BranchKind, projectRef: values.get('--project-ref')!, expectedParentRef: values.get('--expected-parent-ref')!, branchName: values.get('--branch-name')!, apiUrl: values.get('--api-url')! };
}

export function validateBranchTarget(target: BranchTarget, manifest: InstallationManifest): void {
  if (!['crm', 'autocar'].includes(target.kind) || !manifest.approved || manifest.branch !== metricsBranch ||
      !validRef(manifest.crmProjectRef) || !validRef(manifest.autocarProjectRef) || manifest.crmProjectRef === manifest.autocarProjectRef ||
      !validRef(target.projectRef) || target.projectRef !== (target.kind === 'crm' ? manifest.crmProjectRef : manifest.autocarProjectRef) ||
      target.expectedParentRef !== parents[target.kind] || target.branchName !== names[target.kind] ||
      target.apiUrl !== `https://${target.projectRef}.supabase.co`) throw new Error('Unauthorized branch target');
}

export function validateBranchMetadata(target: BranchTarget, manifest: InstallationManifest, metadata: unknown): void {
  validateBranchTarget(target, manifest);
  if (!metadata || typeof metadata !== 'object') throw new Error('Missing official branch metadata');
  const branch = metadata as Record<string, unknown>;
  if (branch.project_ref !== target.projectRef || branch.parent_project_ref !== target.expectedParentRef ||
      branch.name !== target.branchName || branch.is_default !== false || branch.with_data !== false ||
      branch.status !== 'FUNCTIONS_DEPLOYED' || branch.preview_project_status !== 'ACTIVE_HEALTHY') throw new Error('Branch metadata mismatch');
}

// Only the official Management API is contacted. This function never executes SQL.
export async function preflightBranch(target: BranchTarget, manifest: InstallationManifest, accessToken: string | undefined, transport: typeof fetch = fetch) {
  validateBranchTarget(target, manifest);
  if (!accessToken?.trim()) throw new Error('Management API authentication required');
  let payload: unknown;
  try {
    const response = await transport(`https://api.supabase.com/v1/projects/${target.expectedParentRef}/branches`, {
      method: 'GET', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new Error('Metadata unavailable');
    payload = await response.json();
  } catch {
    // Do not include provider bodies, headers, credentials, or transport errors.
    throw new Error('Official branch metadata unavailable');
  }
  if (!Array.isArray(payload)) throw new Error('Invalid official branch metadata');
  const matches = payload.filter((item: unknown) => item && typeof item === 'object' && (item as Record<string, unknown>).project_ref === target.projectRef);
  if (matches.length !== 1) throw new Error('Branch identity not unique or missing');
  validateBranchMetadata(target, manifest, matches[0]);
  return { ...target, verifiedAt: new Date().toISOString(), definitionVersion: 'branch-metadata-v1' as const };
}
