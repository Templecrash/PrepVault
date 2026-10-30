import { isLocalEdition } from './runtime-mode.js';
import LocalServiceNotice from './LocalServiceNotice.jsx';
import { useEffect, useRef, useState } from 'react';
import { Icon } from './brand.jsx';
import { RADIO_STATIONS, RadioPlayback, normalizeStreamUrl, readSavedStations, resolveStation } from './radio.js';
import './radio.css';
import RadioDirectory from './RadioDirectory.jsx';

function RadioPlayerOnline() {
  const audioRef = useRef(null);
  const playbackRef = useRef(null);
  const [saved, setSaved] = useState(() => readSavedStations(localStorage));
  const [selectedId, setSelectedId] = useState(() => {
    try { return localStorage.getItem('prepvault-scanner-feed') || RADIO_STATIONS[0]?.id; } catch { return RADIO_STATIONS[0]?.id; }
  });
  const [volume, setVolume] = useState(() => {
    try { const value = localStorage.getItem('prepvault-radio-volume'); return value === null ? 0.5 : Math.max(0, Math.min(1, Number(value) || 0)); } catch { return 0.5; }
  });
  const [playback, setPlayback] = useState({ status: 'idle', error: '' });
  const [customOpen, setCustomOpen] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [formError, setFormError] = useState('');
  const [saveError, setSaveError] = useState('');
  const station = resolveStation(selectedId, saved);
  const isActive = ['playing', 'connecting', 'buffering'].includes(playback.status);
  const stateLabels = { idle: 'Ready to listen', connecting: 'Connecting to station…', buffering: 'Buffering audio…', playing: volume === 0 ? 'Playing · muted' : 'Playing live', paused: 'Paused', error: 'Unable to connect' };

  useEffect(() => {
    const player = new RadioPlayback(audioRef.current, setPlayback);
    playbackRef.current = player;
    return () => { player.dispose(); playbackRef.current = null; };
  }, []);
  const savePreferences = (nextSaved = saved, nextStation = station, nextVolume = volume) => {
    try {
      localStorage.setItem('prepvault-user-channels', JSON.stringify(nextSaved));
      if (nextStation) localStorage.setItem('prepvault-scanner-feed', nextStation.id);
      localStorage.setItem('prepvault-radio-volume', String(nextVolume));
      setSaveError('');
    } catch { setSaveError('Your station preferences could not be saved on this device. Playback still works.'); }
  };

  const playDirectoryStation = next => {
    const nextSaved = [...saved.filter(entry => entry.id !== next.id), next];
    setSaved(nextSaved); setSelectedId(next.id); savePreferences(nextSaved, next);
    playbackRef.current?.start(next.url, volume);
  };
  const selectStation = id => {
    const next = resolveStation(id, saved);
    setSelectedId(next.id);
    savePreferences(saved, next);
    if (playbackRef.current?.wantsPlayback) playbackRef.current.start(next.url, volume);
    else playbackRef.current?.stop();
  };
  const addStation = event => {
    event.preventDefault();
    try {
      const streamUrl = normalizeStreamUrl(url);
      const next = { id: 'custom-' + crypto.randomUUID(), name: name.trim() || 'My radio stream', url: streamUrl, region: 'Custom stream', type: 'custom' };
      setSaved(previous => [...previous, next]);
      savePreferences([...saved, next], next);
      setSelectedId(next.id);
      setFormError(''); setName(''); setUrl(''); setCustomOpen(false);
      playbackRef.current?.start(next.url, volume);
    } catch (error) { setFormError(error.message); }
  };
  const officialIds = new Set(RADIO_STATIONS.map(entry => entry.id));
  const customStations = saved.filter(entry => !officialIds.has(entry.id));

  return <section className="pv-radio" aria-labelledby="radio-title" id="live-radio">
    <audio ref={audioRef} preload="none" aria-label="Live radio audio" />
    <div className="pv-radio-heading"><div><span className="pv-eyebrow"><Icon name="radio" size={16}/> LIVE RADIO</span><h2 id="radio-title">Your listening station.</h2><p>Find a local stream, or play one of your saved stations. Audio comes directly from the broadcaster.</p></div><span className={`pv-radio-status is-${playback.status}`} role="status"><i/>{stateLabels[playback.status]}</span></div>
    <RadioDirectory onPlay={playDirectoryStation} selectedId={station?.id}/>
    <div className="pv-radio-console">
      <span className="pv-radio-art"><Icon name="radio" size={36}/></span>
      <div className="pv-radio-station"><label htmlFor="radio-station">Station</label><select id="radio-station" value={station?.id || ''} onChange={event => selectStation(event.target.value)}><optgroup label="Featured stations · other regions">{RADIO_STATIONS.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</optgroup>{customStations.length > 0 && <optgroup label="Saved streams">{customStations.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</optgroup>}</select><p>{station?.region}{station?.frequency ? ` · ${station.frequency}` : ''}{station?.source && <> · <a href={station.source} target="_blank" rel="noreferrer">Station website ↗</a></>}</p></div>
      <button className="pv-button pv-primary pv-radio-play" disabled={!station} onClick={() => { savePreferences(); if (isActive) playbackRef.current?.pause(); else playbackRef.current?.start(station.url, volume); }}>{isActive ? <><span aria-hidden="true">Ⅱ</span> Pause radio</> : <><span aria-hidden="true">▶</span> {playback.status === 'error' ? 'Retry radio' : 'Play radio'}</>}</button>
    </div>
    <div className="pv-radio-toolbar"><label htmlFor="radio-volume">Volume</label><input id="radio-volume" type="range" min="0" max="1" step="0.05" value={volume} onChange={event => { const value = Number(event.target.value); setVolume(value); playbackRef.current?.setVolume(value); savePreferences(saved, station, value); }}/><output htmlFor="radio-volume">{Math.round(volume * 100)}%</output><button className="pv-radio-text-button" onClick={() => setCustomOpen(!customOpen)} aria-expanded={customOpen} aria-controls="radio-custom">{customOpen ? 'Close custom stream' : '+ Add your own stream'}</button>{station && !officialIds.has(station.id) && <button className="pv-radio-text-button" onClick={() => { playbackRef.current?.stop(); setSaved(previous => previous.filter(entry => entry.id !== station.id)); setSelectedId(RADIO_STATIONS[0]?.id); savePreferences(saved.filter(entry => entry.id !== station.id), RADIO_STATIONS[0]); }}>Remove saved stream</button>}</div>
    {playback.error && <p className="pv-radio-error" role="alert">{playback.error}</p>}
    {saveError && <p className="pv-radio-error" role="alert">{saveError}</p>}
    {customOpen && <form id="radio-custom" className="pv-radio-custom" onSubmit={addStation}><label className="pv-field">Station name<input value={name} onChange={event => setName(event.target.value)} placeholder="e.g. My local weather radio" maxLength={100}/></label><label className="pv-field">HTTPS audio stream<input value={url} onChange={event => setUrl(event.target.value)} placeholder="https://station.example/live.mp3" required type="url"/></label><p>Use a direct MP3 or AAC stream address. A station’s webpage or playlist link won’t play here.</p>{formError && <p className="pv-radio-error" role="alert">{formError}</p>}<button className="pv-button pv-primary" type="submit">Save & play stream</button></form>}
    <p className="pv-radio-note">Weather feeds cover the location shown and can be delayed or unavailable. Use your local weather radio and official alerts for urgent warnings.</p>
  </section>;
}

export default function RadioPlayer(props) {
  return isLocalEdition() ? <LocalServiceNotice title="Internet radio needs a connection." path="/">This local edition does not load external audio. Your saved channels and activity notes remain available in the plan; use the live site to play internet streams.</LocalServiceNotice> : <RadioPlayerOnline {...props} />;
}
