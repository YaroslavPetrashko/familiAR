import { useEffect, useState } from 'react';
import heic2any from 'heic2any';

interface HeicImageProps {
  src: string;
  alt: string;
  className?: string;
}

export function HeicImage({ src, alt, className }: HeicImageProps) {
  const [displaySrc, setDisplaySrc] = useState<string>(src);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const isHeic = src.toLowerCase().includes('.heic') || src.toLowerCase().includes('.heif');

    if (isHeic) {
      setLoading(true);
      fetch(src)
        .then((response) => response.blob())
        .then((blob) => heic2any({
          blob,
          toType: 'image/jpeg',
          quality: 0.8,
        }))
        .then((convertedBlob) => {
          const blobArray = Array.isArray(convertedBlob) ? convertedBlob : [convertedBlob];
          setDisplaySrc(URL.createObjectURL(blobArray[0]));
        })
        .catch((err) => {
          console.error('Error converting HEIC:', err);
        })
        .finally(() => {
          setLoading(false);
        });
    }

    return () => {
      if (displaySrc !== src && displaySrc.startsWith('blob:')) {
        URL.revokeObjectURL(displaySrc);
      }
    };
  }, [src]);

  if (loading) {
    return (
      <div className={`${className} flex items-center justify-center bg-gray-200`}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return <img src={displaySrc} alt={alt} className={className} />;
}
