import { parseBranchArguments, preflightBranch, type BranchTarget, type InstallationManifest } from './metrics-branch-preflight';

export type HostedBranchTarget = BranchTarget & { targetMode: 'branch' };

const crmStub = {
  slug: 'meta-leads-backfill-temp',
  version: 8,
  sha256: '5aba291847f70956f33734fd1954a4ec66c78505ff860bcc4decf753d692f466',
} as const;

export function parseHostedBranchArguments(args: string[]): HostedBranchTarget {
  const index = args.indexOf('--target-mode');
  if (index < 0 || args[index + 1] !== 'branch') throw new Error('Explicit hosted branch target mode required');
  const withoutMode = args.filter((_, position) => position !== index && position !== index + 1);
  return { ...parseBranchArguments(withoutMode), targetMode: 'branch' };
}

export function validateHostedEdgeInventory(target: HostedBranchTarget, functions: unknown): void {
  if (!Array.isArray(functions)) throw new Error('Invalid Edge Function inventory');
  if (target.kind === 'autocar') {
    if (functions.length !== 0) throw new Error('AUTOCAR homologation branch must not expose Edge Functions');
    return;
  }
  if (functions.length !== 1) throw new Error('CRM homologation Edge Function inventory mismatch');
  const fn = functions[0] as Record<string, unknown>;
  if (fn.slug !== crmStub.slug || fn.status !== 'ACTIVE' || fn.version !== crmStub.version ||
      fn.verify_jwt !== true || fn.ezbr_sha256 !== crmStub.sha256) {
    throw new Error('CRM homologation Edge Function stub mismatch');
  }
}

async function providerJson(url: string, accessToken: string, transport: typeof fetch): Promise<unknown> {
  try {
    const response = await transport(url, {
      method: 'GET', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new Error('Provider request failed');
    return await response.json();
  } catch {
    throw new Error('Official homologation metadata unavailable');
  }
}

export async function preflightHostedBranch(
  target: HostedBranchTarget,
  manifest: InstallationManifest,
  accessToken: string | undefined,
  transport: typeof fetch = fetch,
) {
  if (!accessToken?.trim()) throw new Error('Management API authentication required');
  const verified = await preflightBranch(target, manifest, accessToken, transport);
  const functions = await providerJson(`https://api.supabase.com/v1/projects/${target.projectRef}/functions`, accessToken, transport);
  validateHostedEdgeInventory(target, functions);
  return { ...verified, targetMode: 'branch' as const, definitionVersion: 'branch-metadata-v2' as const };
}
