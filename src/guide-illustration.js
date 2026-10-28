// Original, bundled diagrams only: no network request is needed to display a picture.
export function illustrationDataUrl(visual) {
  if (!visual?.svg || typeof visual.svg !== 'string') return '';
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(visual.svg)}`;
}

export function handbookStartPage(value, pageCount) {
  const last = Number.isSafeInteger(pageCount) && pageCount > 0 ? pageCount : 1;
  return Math.min(last, Math.max(1, Math.floor(Number(value)) || 1));
}
