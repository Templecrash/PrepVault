export function Icon({ name = 'box', size = 20, ...props }) {
  const paths = {
    home: <><path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/></>,
    box: <><path d="m3 7 9-4 9 4v10l-9 4-9-4Z"/><path d="m3 7 9 5 9-5M12 12v9M7 5l10 5"/></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
    plus: <path d="M12 4v16M4 12h16"/>,
    arrow: <path d="M4 12h15m-6-6 6 6-6 6"/>,
    chevron: <path d="m8 5 7 7-7 7"/>,
    filter: <><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2"/><circle cx="15" cy="17" r="2"/></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>,
    scan: <><path d="M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5M3 12h18M7 7v2m4-2v2m4-2v2m3-2v2M7 15v2m4-2v2m4-2v2m3-2v2"/></>,
    edit: <><path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-4-4L5 15Z"/></>,
    trash: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    users: <><circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M17 5a3 3 0 0 1 0 6m1 3a5 5 0 0 1 3 5v2"/></>,
    ration: <><circle cx="12" cy="12" r="5"/><path d="M2 3v5c0 2 4 2 4 0V3M4 3v18M22 3c-3 3-3 8 0 9V3Zm0 9v9"/></>,
    radio: <><circle cx="12" cy="12" r="2"/><path d="M8 8a6 6 0 0 0 0 8m8-8a6 6 0 0 1 0 8M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14M12 14v7"/></>,
    leaf: <><path d="M20 3C8 2 2 8 5 16c8 4 15-2 15-13ZM4 21 15 10"/></>,
    shield: <><path d="M12 3 3 7v6c0 4 5 7 9 9 4-2 9-5 9-9V7Z"/><path d="m8 12 3 3 5-6"/></>,
    bolt: <path d="m13 2-9 12h7l-1 8 10-13h-7Z"/>,
    water: <path d="M12 2S5 10 5 14a7 7 0 0 0 14 0c0-4-7-12-7-12Z"/>,
    settings: <><path d="m9 3-1 3-3 1-2 4 2 3v4l4 3 3-1 4 1 3-3v-4l2-3-2-4-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/></>,
    compass: <><circle cx="12" cy="12" r="9"/><path d="m16 8-3 5-5 3 3-5Z"/></>,
    map: <><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2ZM9 3v16m6-14v16"/></>,
    bell: <><path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5ZM10 21h4"/></>,
    close: <path d="m6 6 12 12M6 18 18 6"/>,
    menu: <path d="M4 6h16M4 12h16M4 18h16"/>,
    download: <><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></>,
    key: <><circle cx="8" cy="8" r="5"/><path d="m11.5 11.5 9 9M17 17l3-3m-6 0 3-3"/></>,
    book: <><path d="M12 5C9 3 5 3 2 4v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1ZM12 5v15"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name] || paths.box}</svg>;
}

export function Brand({ compact = false }) {
  return <span className="pv-brand"><svg className="pv-mark" width="36" height="36" viewBox="0 0 36 36" aria-hidden="true"><rect width="36" height="36" rx="10" fill="currentColor"/><path d="M10 25V12l8-4 8 4v13M14 25V15l4-2 4 2v10M18 18v7" stroke="var(--paper, #fff)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>{!compact && <span>PrepVault</span>}</span>;
}
