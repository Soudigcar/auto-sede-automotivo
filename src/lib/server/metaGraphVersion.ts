const FALLBACK_META_GRAPH_VERSION = 'v25.0';

export function effectiveMetaGraphVersion(value: unknown) {
  const candidate = String(value || '').trim();
  const match = /^v(\d+)\.0$/.exec(candidate);
  if (!match) return FALLBACK_META_GRAPH_VERSION;
  return Number(match[1]) < 25 ? FALLBACK_META_GRAPH_VERSION : candidate;
}

export { FALLBACK_META_GRAPH_VERSION };
