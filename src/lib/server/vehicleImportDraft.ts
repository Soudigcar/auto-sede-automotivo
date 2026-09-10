import { createHash } from 'node:crypto';
import type { ImportEvidence } from './vehicleTargetExtraction';

export const CONFIRMABLE_FIELDS = [
  'brand', 'model', 'version', 'manufacture_year', 'model_year', 'mileage',
  'color', 'fuel', 'transmission', 'price', 'description', 'image_urls', 'image_url'
] as const;

/** Saved values come from server metadata, never an AI response or a client lock map. */
export function confirmedFields(metadata: Record<string, any>, draft?: Record<string, any>) {
  const previous = metadata.manual_confirmed_fields || {};
  const values = draft || ((metadata.draft_saved_at || metadata.reviewed_by_master || metadata.reviewed_by_store)
    ? metadata.imported_preview || metadata.final_preview : null);
  return {
    ...previous,
    ...(values ? Object.fromEntries(CONFIRMABLE_FIELDS.filter(k => k in values).map(k => [k, values[k]])) : {})
  };
}

export function preserveConfirmedFields(imported: Record<string, any>, metadata: Record<string, any>) {
  const locks = confirmedFields(metadata);
  const result = { ...imported };
  for (const key of CONFIRMABLE_FIELDS) if (Object.hasOwn(locks, key)) result[key] = locks[key];
  // Reusing an optimized text after manual numeric changes can reintroduce stale claims.
  if (!Object.hasOwn(locks, 'description') && ['price', 'mileage', 'transmission'].some(k => Object.hasOwn(locks, k) && locks[k] !== imported[k])) {
    result.description = metadata.imported_preview?.description || metadata.source_description || '';
  }
  return result;
}

export function canReuseImport(metadata: Record<string, any>, evidence: ImportEvidence) {
  return Boolean(evidence.target.matched && metadata.imported_preview
    && metadata.import_evidence?.extractor_version === evidence.extractor_version
    && metadata.import_evidence?.target?.url === evidence.target.url
    && metadata.import_evidence?.content_hash === evidence.content_hash);
}

/** Explicit target evidence outranks a stale parser draft. AI cannot invent numeric facts. */
export function resolveEvidenceValues(base: Record<string, any>, evidence?: ImportEvidence | null) {
  const result = { ...base };
  if (!evidence) return result;
  for (const field of ['price', 'mileage']) result[field] = field === 'price' ? 0 : '';
  if (!evidence.target.matched) return result;
  try {
    if (decodeURI(new URL(base.source_url).href) !== decodeURI(new URL(evidence.target.url).href)) return result;
  } catch { return result; }
  for (const field of CONFIRMABLE_FIELDS) {
    const proof = evidence.provenance[field];
    if (proof?.field === field && proof.target_entity_match === true && proof.confidence === 100) result[field] = proof.value;
  }
  return result;
}

/** Preview diagnostics intentionally exclude raw descriptions, contact data and arbitrary attributes. */
export function importDiagnostic(evidence: ImportEvidence, before: Record<string, any>, after: Record<string, any>) {
  const values = (v: Record<string, any>) => ({ price: Number(v.price) || 0, mileage: String(v.mileage || '').replace(/[^\d., Kkm]/g, '').slice(0, 40) });
  return {
    event: 'vehicle_import_target', version: evidence.extractor_version, content_hash: evidence.content_hash,
    target_matched: evidence.target.matched,
    target_reference: createHash('sha256').update(evidence.target.url).digest('hex'),
    fields: Object.values(evidence.provenance).map(p => ({ field: p.field, source_type: p.source_type, confidence: p.confidence, target_entity_match: p.target_entity_match })),
    rejected: evidence.rejected,
    before_ai: values(before), after_ai: values(after)
  };
}
