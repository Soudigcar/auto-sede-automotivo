type JsonRecord = Record<string, any>;

function compactText(value: unknown, maxLength = 20_000) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function parseJsonRecord(value: unknown): JsonRecord | null {
  const direct = asRecord(value);
  if (direct) return direct;
  if (typeof value !== 'string' || !value.trim()) return null;

  try {
    return asRecord(JSON.parse(value));
  } catch {
    return null;
  }
}

function uniqueText(values: unknown[], maxLength = 500) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const text = compactText(value, maxLength);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }

  return result;
}

function combineText(values: unknown[], options: unknown[] = []) {
  const sections = uniqueText(values, 20_000);
  const labels = uniqueText(options, 500);
  if (labels.length) sections.push(`Opções: ${labels.join(' · ')}`);
  return compactText(sections.join(' | '), 20_000);
}

function rootPayload(value: unknown) {
  return parseJsonRecord(value) || {};
}

function unwrapMessage(value: unknown) {
  const root = rootPayload(value);
  let message = asRecord(root.message) || root;

  for (let index = 0; index < 6; index += 1) {
    const nested =
      asRecord(message.ephemeralMessage)?.message ||
      asRecord(message.viewOnceMessage)?.message ||
      asRecord(message.viewOnceMessageV2)?.message ||
      asRecord(message.viewOnceMessageV2Extension)?.message ||
      asRecord(message.documentWithCaptionMessage)?.message ||
      asRecord(message.editedMessage)?.message;
    const nestedRecord = asRecord(nested);
    if (!nestedRecord) break;
    message = nestedRecord;
  }

  return { root, message };
}

function rawMessageType(value: unknown, message: JsonRecord) {
  const root = rootPayload(value);
  const declared = compactText(root.messageType, 100);
  if (declared) return declared;

  return Object.keys(message).find((key) => key !== 'messageContextInfo' && key.endsWith('Message')) || '';
}

function buttonLabels(buttons: unknown) {
  if (!Array.isArray(buttons)) return [];

  return buttons.flatMap((button: any) => {
    const params = parseJsonRecord(button?.buttonParamsJson);
    return uniqueText([
      button?.buttonText?.displayText,
      button?.displayText,
      button?.text,
      button?.title,
      button?.quickReplyButton?.displayText,
      button?.urlButton?.displayText,
      button?.callButton?.displayText,
      params?.display_text,
      params?.displayText,
      params?.title,
      params?.text
    ]);
  });
}

function listLabels(listMessage: any) {
  if (!Array.isArray(listMessage?.sections)) return [];

  return listMessage.sections.flatMap((section: any) =>
    Array.isArray(section?.rows)
      ? section.rows.flatMap((row: any) => uniqueText([row?.title, row?.description]))
      : []
  );
}

function responseFromJson(value: unknown): string {
  const parsed = parseJsonRecord(value);
  if (!parsed) return '';

  const direct = uniqueText([
    parsed.display_text,
    parsed.displayText,
    parsed.selected_display_text,
    parsed.selectedDisplayText,
    parsed.title,
    parsed.text,
    parsed.name,
    parsed.label,
    parsed.id
  ]);
  if (direct.length) return direct[0];

  for (const nestedValue of Object.values(parsed)) {
    const nested = parseJsonRecord(nestedValue);
    if (!nested) continue;
    const text = responseFromJson(nested);
    if (text) return text;
  }

  return '';
}

function interactiveContent(interactive: any) {
  if (!interactive) return '';
  return combineText(
    [interactive?.header?.title, interactive?.body?.text, interactive?.footer?.text],
    buttonLabels(interactive?.nativeFlowMessage?.buttons)
  );
}

function templateContent(template: any) {
  if (!template) return '';

  const interactive = interactiveContent(template?.interactiveMessageTemplate);
  if (interactive) return interactive;

  const hydrated = template?.hydratedTemplate || template?.hydratedFourRowTemplate || {};
  return combineText(
    [hydrated?.hydratedTitleText, hydrated?.hydratedContentText, hydrated?.hydratedFooterText],
    buttonLabels(hydrated?.hydratedButtons)
  );
}

export function isEvolutionPlaceholderBody(value: unknown) {
  return /^\[Mensagem [^\]]+\]$/i.test(compactText(value, 500));
}

export function evolutionMessageContent(value: unknown) {
  const { message } = unwrapMessage(value);

  const directText = compactText(
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
    ''
  );
  if (directText) return directText;

  const buttonsResponse = message.buttonsResponseMessage;
  if (buttonsResponse) {
    return compactText(buttonsResponse.selectedDisplayText || buttonsResponse.selectedButtonId) || '[Resposta de botão]';
  }

  const listResponse = message.listResponseMessage;
  if (listResponse) {
    return compactText(
      listResponse.title ||
      listResponse.description ||
      listResponse.singleSelectReply?.selectedRowId
    ) || '[Resposta de lista]';
  }

  const templateReply = message.templateButtonReplyMessage;
  if (templateReply) {
    return compactText(
      templateReply.selectedDisplayText ||
      templateReply.selectedId ||
      templateReply.selectedIndex
    ) || '[Resposta de modelo]';
  }

  const interactiveResponse = message.interactiveResponseMessage;
  if (interactiveResponse) {
    const nativeResponse = interactiveResponse.nativeFlowResponseMessage || {};
    return compactText(
      interactiveResponse.body?.text ||
      responseFromJson(nativeResponse.paramsJson) ||
      responseFromJson(nativeResponse.responseJson) ||
      nativeResponse.name
    ) || '[Resposta interativa]';
  }

  const buttons = message.buttonsMessage;
  if (buttons) {
    const content = combineText(
      [buttons.headerText, buttons.contentText, buttons.text, buttons.footerText],
      buttonLabels(buttons.buttons)
    );
    if (content) return content;
  }

  const list = message.listMessage;
  if (list) {
    const content = combineText(
      [list.title, list.description, list.footerText, list.buttonText],
      listLabels(list)
    );
    if (content) return content;
  }

  const interactive = interactiveContent(message.interactiveMessage);
  if (interactive) return interactive;

  const template = templateContent(message.templateMessage);
  if (template) return template;

  if (message.imageMessage) return '[Imagem]';
  if (message.videoMessage) return '[Vídeo]';
  if (message.audioMessage) return '[Áudio]';
  if (message.documentMessage) return compactText(message.documentMessage?.fileName, 500) || '[Documento]';
  if (message.stickerMessage) return '[Figurinha]';
  if (message.contactMessage || message.contactsArrayMessage) return '[Contato]';
  if (message.locationMessage || message.liveLocationMessage) return '[Localização]';

  const type = rawMessageType(value, message);
  return `[Mensagem ${compactText(type, 80) || 'não textual'}]`;
}

export function evolutionMessageType(value: unknown) {
  const { message } = unwrapMessage(value);
  const rawType = rawMessageType(value, message).replace(/Message$/i, '').toLowerCase();

  if (!rawType || rawType === 'conversation' || rawType === 'extendedtext') return 'text';
  if (rawType.includes('image')) return 'image';
  if (rawType.includes('video')) return 'video';
  if (rawType.includes('audio')) return 'audio';
  if (rawType.includes('document')) return 'document';
  if (rawType.includes('sticker')) return 'sticker';
  if (rawType.includes('location')) return 'location';
  if (rawType.includes('contact')) return 'contacts';
  if (
    rawType.includes('button') ||
    rawType.includes('interactive') ||
    rawType.includes('template') ||
    rawType.includes('list')
  ) return 'interactive';

  return rawType.slice(0, 80);
}

export function evolutionDisplayBody(body: unknown, rawPayload: unknown) {
  const current = compactText(body);
  if (current && !isEvolutionPlaceholderBody(current)) return current;

  const extracted = evolutionMessageContent(rawPayload);
  if (extracted && !isEvolutionPlaceholderBody(extracted)) return extracted;

  return current || extracted;
}
