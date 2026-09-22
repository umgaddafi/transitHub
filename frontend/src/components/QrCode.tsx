import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface QrCodeProps {
  value: string;
  size?: number;
  className?: string;
}

export function QrCode({ value, size = 128, className = '' }: QrCodeProps) {
  const [svg, setSvg] = useState<string>('');

  useEffect(() => {
    let active = true;
    QRCode.toString(value, {
      type: 'svg',
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then(result => {
        if (active) setSvg(result);
      })
      .catch(() => {
        if (active) setSvg('');
      });

    return () => {
      active = false;
    };
  }, [value, size]);

  if (!svg) {
    return (
      <div
        className={`bg-slate-100 flex items-center justify-center rounded-lg text-slate-400 text-xs ${className}`}
        style={{ width: size, height: size }}
        role="img"
        aria-label="QR Code Loading"
      >
        QR
      </div>
    );
  }

  return (
    <div
      className={`inline-block shrink-0 ${className}`}
      dangerouslySetInnerHTML={{ __html: svg }}
      role="img"
      aria-label={`QR Code for ${value}`}
    />
  );
}

