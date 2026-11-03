import { useEffect, useState } from 'react';

export interface StageSize {
  width: number;
  height: number;
}

/** Track the pixel size of the canvas container (ResizeObserver based). */
export function useStageSize(ref: React.RefObject<HTMLElement | null>): StageSize {
  const [size, setSize] = useState<StageSize>({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = (width: number, height: number) => {
      setSize((current) =>
        current.width === width && current.height === height ? current : { width, height },
      );
    };
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      update(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(element);
    update(element.clientWidth, element.clientHeight);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}
