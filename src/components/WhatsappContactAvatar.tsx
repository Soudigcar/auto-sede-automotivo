'use client';

import { useEffect, useState } from 'react';

type Props = {
  name: string;
  src?: string;
  imageClassName?: string;
  onImageError?: () => void;
};

export function whatsappContactInitials(value: string) {
  const parts = String(value || 'Cliente').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'C';
  return `${parts[0]?.[0] || ''}${parts[1]?.[0] || ''}`.toUpperCase();
}

export function WhatsappContactAvatar({
  name,
  src,
  imageClassName = 'absolute inset-0 h-full w-full object-cover',
  onImageError
}: Props) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  return (
    <>
      <span aria-hidden="true">{whatsappContactInitials(name)}</span>
      {src && !failed ? (
        // Blob URLs vêm de um proxy autenticado e não são otimizáveis pelo next/image.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={`Foto de ${name}`}
          className={imageClassName}
          onError={() => {
            setFailed(true);
            onImageError?.();
          }}
        />
      ) : null}
    </>
  );
}
