import { useEffect, useRef, useState } from 'react';
import heic2any from 'heic2any';

type SmartImageProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  src: string;
};

function isHeicUrl(url: string): boolean {
  const withoutQuery = url.split('?')[0].toLowerCase();
  return withoutQuery.endsWith('.heic') || withoutQuery.endsWith('.heif');
}

export function SmartImage({ src, ...imgProps }: SmartImageProps) {
  const [displaySrc, setDisplaySrc] = useState<string>(src);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function convertIfNeeded() {
      setDisplaySrc(src);

      if (!isHeicUrl(src)) return;

      try {
        const response = await fetch(src, { mode: 'cors' });
        const blob = await response.blob();

        const isHeic =
          blob.type.includes('heic') ||
          blob.type.includes('heif') ||
          isHeicUrl(src);

        if (!isHeic) return;

        const converted = await heic2any({ blob, toType: 'image/png' });
        const outBlob = Array.isArray(converted) ? converted[0] : converted;
        const url = URL.createObjectURL(outBlob);

        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }

        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = url;
        setDisplaySrc(url);
      } catch (err) {
        // If conversion fails, keep original src; the <img> may error but UI remains stable
      }
    }

    convertIfNeeded();

    return () => {
      cancelled = true;
    };
  }, [src]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  return <img src={displaySrc} {...imgProps} />;
}


