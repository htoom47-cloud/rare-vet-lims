import { useEffect, useState } from 'react';
import { portalBreederAPI } from '../../services/portalApi';
import AnimalTypeIcon from './AnimalTypeIcon';
import { cn } from '../../lib/utils';

export default function HerdAnimalPhoto({
  animalId,
  hasPhoto,
  animalType,
  className,
  iconSize = 28,
  bust = 0,
}) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    if (!animalId || !hasPhoto) {
      setSrc(null);
      return undefined;
    }
    let objectUrl;
    let cancelled = false;
    portalBreederAPI.photoBlob(animalId)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [animalId, hasPhoto, bust]);

  if (src) {
    return (
      <img
        src={src}
        alt=""
        className={cn('object-cover bg-muted', className)}
      />
    );
  }

  return (
    <div className={cn('flex items-center justify-center bg-muted text-muted-foreground', className)}>
      <AnimalTypeIcon type={animalType} size={iconSize} />
    </div>
  );
}
