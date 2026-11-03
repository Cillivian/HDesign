import { useEffect, useState } from 'react';
import { getAssetUrl } from '../../store/persistence';

/**
 * Resolve the underlay asset blob URL and decode it into an HTMLImageElement
 * ready for Konva. Re-runs when the reference asset changes.
 */
export function useUnderlayImage(assetId: string | null): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!assetId) {
      setImage(null);
      return () => {
        cancelled = true;
      };
    }
    getAssetUrl(assetId)
      .then((url) => {
        if (!url || cancelled) return;
        const element = new window.Image();
        element.onload = () => {
          if (!cancelled) setImage(element);
        };
        element.onerror = () => {
          if (!cancelled) setImage(null);
        };
        element.src = url;
      })
      .catch(() => {
        if (!cancelled) setImage(null);
      });
    return () => {
      cancelled = true;
    };
  }, [assetId]);

  return image;
}
