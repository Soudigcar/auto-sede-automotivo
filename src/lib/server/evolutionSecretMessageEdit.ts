import { createDecipheriv, hkdfSync } from 'node:crypto';

const MESSAGE_EDIT_TYPE = 2;
const MESSAGE_EDIT_INFO = 'Message Edit';
const EDIT_FALLBACK = 'Mensagem editada — conteúdo atualizado não pôde ser recuperado.';

type JsonRecord = Record<string, any>;

type FoldOptions = {
  ownPhoneByNumberId?: Record<string, string | null | undefined>;
};

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function byteArray(value: unknown): Buffer | null {
  if (Buffer.isBuffer(value)) return value;
  if (Array.isArray(value)) {
    const bytes = value.map(Number);
    if (!bytes.length || bytes.some((item) => !Number.isInteger(item) || item < 0 || item > 255)) return null;
    return Buffer.from(bytes);
  }
  const record = asRecord(value);
  if (!record) return null;
  if (record.type === 'Buffer' && Array.isArray(record.data)) return byteArray(record.data);
  const numericKeys = Object.keys(record).filter((key) => /^\d+$/.test(key)).sort((a, b) => Number(a) - Number(b));
  return numericKeys.length ? byteArray(numericKeys.map((key) => record[key])) : null;
}

function compact(value: unknown, max = 500) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function canonicalJid(value: unknown) {
  const raw = compact(value, 180);
  if (!raw.includes('@')) return '';
  const [local, server] = raw.split('@', 2);
  const normalizedLocal = local.split(':')[0];
  return normalizedLocal && server ? `${normalizedLocal}@${server.toLowerCase()}` : '';
}

function phoneJid(value: unknown) {
  const digits = compact(value, 80).replace(/\D/g, '');
  return digits.length >= 8 ? `${digits}@s.whatsapp.net` : '';
}

function unique(values: unknown[]) {
  return Array.from(new Set(values.map(canonicalJid).filter(Boolean)));
}

function secretEdit(rawPayload: unknown) {
  const root = asRecord(rawPayload) || {};
  const message = asRecord(root.message) || root;
  const secret = asRecord(message.secretEncryptedMessage);
  if (!secret || Number(secret.secretEncType) !== MESSAGE_EDIT_TYPE) return null;
  const target = asRecord(secret.targetMessageKey) || {};
  const targetId = compact(target.id, 250);
  if (!targetId) return null;
  return { root, secret, target, targetId };
}

function originalMessageSecret(rawPayload: unknown) {
  const root = asRecord(rawPayload) || {};
  const message = asRecord(root.message) || root;
  const context = asRecord(message.messageContextInfo) || asRecord(root.messageContextInfo) || {};
  return byteArray(context.messageSecret);
}

function varint(buffer: Buffer, offset: number) {
  let value = 0;
  let shift = 0;
  let cursor = offset;
  while (cursor < buffer.length && shift <= 49) {
    const byte = buffer[cursor++];
    value += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) return { value, offset: cursor };
    shift += 7;
  }
  return null;
}

function lengthDelimitedFields(buffer: Buffer) {
  const fields = new Map<number, Buffer[]>();
  let offset = 0;
  while (offset < buffer.length) {
    const tag = varint(buffer, offset);
    if (!tag) break;
    offset = tag.offset;
    const field = tag.value >>> 3;
    const wire = tag.value & 7;
    if (wire === 2) {
      const length = varint(buffer, offset);
      if (!length) break;
      offset = length.offset;
      const end = offset + length.value;
      if (end > buffer.length) break;
      const values = fields.get(field) || [];
      values.push(buffer.subarray(offset, end));
      fields.set(field, values);
      offset = end;
    } else if (wire === 0) {
      const value = varint(buffer, offset);
      if (!value) break;
      offset = value.offset;
    } else if (wire === 1) {
      offset += 8;
    } else if (wire === 5) {
      offset += 4;
    } else {
      break;
    }
  }
  return fields;
}

function utf8Text(buffer?: Buffer) {
  if (!buffer?.length) return '';
  const text = buffer.toString('utf8').replace(/\u0000/g, '').trim();
  return text && !text.includes('\ufffd') ? text : '';
}

function editedContentFromProto(plaintext: Buffer) {
  const top = lengthDelimitedFields(plaintext);
  const conversation = utf8Text(top.get(1)?.[0]);
  if (conversation) return { body: conversation, messageType: 'text' };

  const extended = top.get(6)?.[0];
  if (extended) {
    const text = utf8Text(lengthDelimitedFields(extended).get(1)?.[0]);
    if (text) return { body: text, messageType: 'text' };
  }

  const image = top.get(3)?.[0];
  if (image) {
    const caption = utf8Text(lengthDelimitedFields(image).get(3)?.[0]);
    return { body: caption || '[Imagem]', messageType: 'image' };
  }

  const video = top.get(9)?.[0];
  if (video) {
    const caption = utf8Text(lengthDelimitedFields(video).get(7)?.[0]);
    return { body: caption || '[Vídeo]', messageType: 'video' };
  }

  return null;
}

function senderCandidates(edit: ReturnType<typeof secretEdit>, original: any, ownPhone?: string | null) {
  if (!edit) return { modification: [], original: [] };
  const eventKey = asRecord(edit.root.key) || {};
  const originalRoot = asRecord(original?.raw_payload) || {};
  const originalKey = asRecord(originalRoot.key) || {};
  const fromMe = eventKey.fromMe === true || String(eventKey.fromMe) === 'true';
  const own = phoneJid(ownPhone);

  const modification = unique(fromMe
    ? [own, eventKey.participant, originalKey.participant, eventKey.remoteJidAlt, eventKey.remoteJid]
    : [eventKey.participant, eventKey.remoteJidAlt, eventKey.remoteJid, originalKey.participant, originalKey.remoteJidAlt, originalKey.remoteJid, own]);

  const targetFromMe = edit.target.fromMe === true || String(edit.target.fromMe) === 'true';
  const originalSenders = targetFromMe
    ? modification
    : unique([edit.target.participant, edit.target.remoteJidAlt, edit.target.remoteJid, originalKey.participant, originalKey.remoteJidAlt, originalKey.remoteJid, ...modification]);

  return { modification, original: originalSenders };
}

export function decryptEvolutionMessageEdit(editMessage: any, originalMessage: any, ownPhone?: string | null) {
  const edit = secretEdit(editMessage?.raw_payload ?? editMessage);
  if (!edit) return null;
  const baseSecret = originalMessageSecret(originalMessage?.raw_payload);
  const iv = byteArray(edit.secret.encIv ?? edit.secret.encIV);
  const payload = byteArray(edit.secret.encPayload);
  if (!baseSecret || !iv || !payload || baseSecret.length !== 32 || iv.length !== 12 || payload.length <= 16) return null;

  const { modification, original } = senderCandidates(edit, originalMessage, ownPhone);
  for (const modificationSender of modification) {
    for (const originalSender of original) {
      try {
        const info = Buffer.from(`${edit.targetId}${originalSender}${modificationSender}${MESSAGE_EDIT_INFO}`, 'utf8');
        const key = Buffer.from(hkdfSync('sha256', baseSecret, Buffer.alloc(0), info, 32));
        const ciphertext = payload.subarray(0, payload.length - 16);
        const authTag = payload.subarray(payload.length - 16);
        const decipher = createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);
        const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        const content = editedContentFromProto(plaintext);
        if (content) return content;
      } catch {
        // Authentication failure is expected while trying safe JID candidates.
      }
    }
  }
  return null;
}

function providerId(value: unknown) {
  const text = compact(value, 500);
  if (!text) return '';
  const parts = text.split(':');
  return parts[parts.length - 1] || text;
}

export function foldEvolutionMessageEdits(messageRows: any[], options: FoldOptions = {}) {
  const rows = Array.isArray(messageRows) ? messageRows : [];
  const originals = new Map<string, any>();
  for (const row of rows) {
    const id = providerId(row?.wa_message_id);
    if (id && !secretEdit(row?.raw_payload)) originals.set(id, row);
  }

  const edits = new Map<string, any>();
  for (const row of rows) {
    const edit = secretEdit(row?.raw_payload);
    if (!edit) continue;
    const original = originals.get(edit.targetId);
    if (!original) continue;
    const ownPhone = options.ownPhoneByNumberId?.[String(row?.whatsapp_number_id || original?.whatsapp_number_id || '')];
    const decrypted = decryptEvolutionMessageEdit(row, original, ownPhone);
    edits.set(edit.targetId, {
      row,
      body: decrypted?.body || original.body || EDIT_FALLBACK,
      messageType: decrypted?.messageType || original.message_type || 'text',
      unavailable: !decrypted
    });
  }

  return rows.flatMap((row) => {
    if (secretEdit(row?.raw_payload)) return [];
    const id = providerId(row?.wa_message_id);
    const edit = id ? edits.get(id) : null;
    if (!edit) return [row];
    return [{
      ...row,
      body: edit.body,
      message_type: edit.messageType,
      edited: true,
      edited_at: edit.row.sent_at || edit.row.created_at || null,
      edit_content_unavailable: edit.unavailable
    }];
  });
}

export function evolutionSecretMessageEditTarget(rawPayload: unknown) {
  return secretEdit(rawPayload)?.targetId || '';
}

export const evolutionMessageEditFallback = EDIT_FALLBACK;
