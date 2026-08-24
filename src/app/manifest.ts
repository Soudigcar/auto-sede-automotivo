import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/login',
    name: 'Auto Controle Automotivo',
    short_name: 'Auto Controle',
    description: 'Gestão automotiva de leads, vendas, estoque e atendimento.',
    start_url: '/login',
    scope: '/',
    display: 'standalone',
    background_color: '#070A12',
    theme_color: '#070A12',
    orientation: 'any',
    categories: ['business', 'productivity'],
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png'
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png'
      },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable'
      }
    ]
  };
}
