import { evolutionRequest } from '@/lib/server/evolution';

export function sendEvolutionMedia(instanceName: string, number: string, mediaUrl: string, caption = '') {
  return evolutionRequest(`/message/sendMedia/${encodeURIComponent(instanceName)}`, {
    method: 'POST',
    body: {
      number,
      mediatype: 'image',
      mimetype: 'image/jpeg',
      media: mediaUrl,
      caption,
      fileName: 'veiculo.jpg',
      delay: 500,
      linkPreview: false
    }
  });
}
