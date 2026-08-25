'use client';

export function WhatsappMobileChromeGuard() {
  return (
    <style jsx global>{`
      @media (max-width: 1279px) {
        body:has(.whatsapp-mobile-v2) > header.fixed,
        body:has(.whatsapp-mobile-v2) header.fixed.inset-x-0.top-0,
        body:has(.whatsapp-mobile-v2) nav[aria-label='Navegação principal mobile'],
        body:has(.whatsapp-mobile-v2) nav[aria-label='Navegação principal Master'] {
          display: none !important;
        }

        body:has(.whatsapp-mobile-v2) {
          overflow: hidden !important;
          padding-top: 0 !important;
          padding-bottom: 0 !important;
        }

        body:has(.whatsapp-mobile-v2) .whatsapp-mobile-v2 {
          z-index: 500 !important;
        }
      }
    `}</style>
  );
}
