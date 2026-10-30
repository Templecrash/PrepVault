import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './brand.jsx';
import { useDialogFocus } from './useDialogFocus.js';
import { illustrationDataUrl } from './guide-illustration.js';
import './guide-illustration.css';

function LargeIllustration({ visual, src, onClose }) {
  const ref = useDialogFocus(onClose);
  const titleId = useId();
  const [downloadError, setDownloadError] = useState('');
  const downloadPicture = () => {
    let url;
    try {
      url = URL.createObjectURL(new Blob([visual.svg], { type: 'image/svg+xml;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${visual.id}.svg`;
      document.body.append(link);
      link.click();
      link.remove();
      setDownloadError('');
    } catch {
      setDownloadError('The picture could not be downloaded. Try again in this browser.');
    } finally {
      if (url) setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
  };
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);
  return <div className="pv-picture-backdrop" onClick={onClose}>
    <section className="pv-picture-dialog" ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={event => event.stopPropagation()}>
      <header><div><p>ILLUSTRATED REFERENCE</p><h2 id={titleId}>{visual.title}</h2></div><button type="button" className="pv-icon-button" onClick={onClose} aria-label="Close diagram"><Icon name="close"/></button></header>
      <p className="pv-picture-pan-hint">Swipe across the picture to see all labels.</p>
      <div className="pv-picture-expanded" tabIndex={0} role="region" aria-label="Enlarged diagram. Scroll horizontally on small screens."><img src={src} alt={visual.alt}/></div>
      <footer><div><p>{visual.caption}</p>{downloadError && <p role="alert">{downloadError}</p>}</div><button type="button" onClick={downloadPicture}><Icon name="download" size={16}/>Download picture</button></footer>
    </section>
  </div>;
}

export default function GuideIllustration({ visual }) {
  const [expanded, setExpanded] = useState(false);
  if (!visual) return null;
  const src = illustrationDataUrl(visual);
  if (!src) return null;
  return <>
    <figure className="pv-guide-picture">
      <div className="pv-guide-picture-heading"><span>Task picture</span><button type="button" onClick={() => setExpanded(true)} aria-label={`Enlarge ${visual.title} diagram`}>Enlarge <Icon name="search" size={14}/></button></div>
      <img src={src} alt={visual.alt} loading="lazy" decoding="async"/>
      <figcaption><strong>{visual.title}</strong><p>{visual.caption}</p></figcaption>
    </figure>
    {expanded && createPortal(<LargeIllustration visual={visual} src={src} onClose={() => setExpanded(false)}/>, document.body)}
  </>;
}
