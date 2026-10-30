import { useEffect, useRef, useState } from 'react';
import { Icon } from './brand.jsx';
import { isLocalEdition } from './runtime-mode.js';
import './radio-talk.css';

const ECHOLINK_URL = 'https://webapp.echolink.org/';
const COUNTRY_GUIDANCE = {
  '': {
    echo: 'Canadian and US amateurs can use EchoLink. Choose where your licence was issued for the matching validation instructions.',
    remote: 'RemoteHamRadio accepts US and eligible CEPT-country call signs. Check its account and station eligibility before subscribing.',
    docs: 'https://secure.echolink.org/validation_docs.htm',
    docsLabel: 'Licence document requirements',
  },
  CA: {
    echo: 'Use your Canadian amateur call sign. EchoLink validates your ISED certificate showing that call sign.',
    remote: 'Canadian licence holders should confirm eligibility with RemoteHamRadio before subscribing. Its CEPT accounts can transmit only at eligible CEPT-country stations.',
    docs: 'https://secure.echolink.org/validation_docs.htm',
    docsLabel: 'Canadian licence document requirements',
  },
  US: {
    echo: 'Use your US amateur call sign. EchoLink validation requires the original FCC Official Copy PDF downloaded from ULS.',
    remote: 'Use your FCC amateur call sign. RemoteHamRadio approves your account and the stations available to you.',
    docs: 'https://www.echolink.org/validation/uls/',
    docsLabel: 'Get your FCC Official Copy',
  },
};

function ProviderLink({ href, children, primary = false, onClick }) {
  return <a className={`pv-inventory-button pv-inventory-button-${primary ? 'primary' : 'secondary'}`} href={href} onClick={onClick} target="_blank" rel="noopener noreferrer">{children}<span aria-hidden="true"> ↗</span><span className="pv-inventory-sr-only"> (opens in a new tab)</span></a>;
}

export default function RadioTalk() {
  const [country, setCountry] = useState('');
  const [embedded, setEmbedded] = useState(false);
  const openButton = useRef(null);
  const panelHeading = useRef(null);
  const localEdition = isLocalEdition();
  const guidance = COUNTRY_GUIDANCE[country];
  useEffect(() => { if (embedded) panelHeading.current?.focus(); }, [embedded]);
  const closePanel = () => { setEmbedded(false); openButton.current?.focus(); };

  return <div className="pv-comms-stack pv-radio-talk">
    <section className="pv-inventory-workspace" aria-labelledby="radio-services-title">
      <div className="pv-radio-services-heading">
        <div><p className="pv-inventory-eyebrow">CANADA & UNITED STATES</p><h2 id="radio-services-title">Radio services.</h2><p>Sign in with your own service account to talk from your laptop. No radio equipment required.</p></div>
        <label className="pv-comms-field">Licence issued in<select value={country} onChange={event => setCountry(event.target.value)}><option value="">Choose a country</option><option value="CA">Canada</option><option value="US">United States</option></select></label>
      </div>
      <div className="pv-radio-services-list">
        <article className="pv-radio-service" aria-labelledby="echolink-service-title">
          <div className="pv-radio-service-title"><span className="pv-radio-talk-icon"><Icon name="radio" size={22}/></span><div><h3 id="echolink-service-title">EchoLink Web</h3><p>Canada & US · Free · Internet required</p></div></div>
          <p>Talk to other amateurs and participating radio repeaters. Sign in here using the official EchoLink page, or open it in its own tab.</p>
          <div className="pv-radio-service-guidance"><p>{guidance.echo}</p><a href={guidance.docs} target="_blank" rel="noopener noreferrer">{guidance.docsLabel} ↗</a></div>
          <div className="pv-radio-service-actions">
            {!localEdition && <button ref={openButton} type="button" className="pv-inventory-button pv-inventory-button-primary" aria-expanded={embedded} aria-controls="echolink-panel" onClick={() => embedded ? panelHeading.current?.focus() : setEmbedded(true)}>{embedded ? 'Go to EchoLink panel' : 'Sign in inside Comms'}</button>}
            <ProviderLink href={ECHOLINK_URL} primary={localEdition} onClick={closePanel}>Sign in on EchoLink</ProviderLink>
          </div>
          <p className="pv-radio-service-account">New account? Open EchoLink and enter your call sign to begin. <a href="https://www.echolink.org/validation/" target="_blank" rel="noopener noreferrer">Validate or recover an account ↗</a></p>
          {localEdition && <p className="pv-radio-service-account">The local edition opens online services in their own tab. An internet connection is required.</p>}
        </article>
        <article className="pv-radio-service" aria-labelledby="remoteham-service-title">
          <div className="pv-radio-service-title"><span className="pv-radio-talk-icon"><Icon name="radio" size={22}/></span><div><h3 id="remoteham-service-title">RemoteHamRadio</h3><p>Remote HF stations · Paid membership & airtime</p></div></div>
          <p>Control a real remote amateur radio through its browser console. Its sign-in and controls open in a separate provider tab.</p>
          <div className="pv-radio-service-guidance"><p>{guidance.remote}</p><a href="https://www.remotehamradio.com/" target="_blank" rel="noopener noreferrer">Current pricing & service details ↗</a></div>
          <div className="pv-radio-service-actions"><ProviderLink href="https://my.remotehamradio.com/users/sign_in">Sign in to RemoteHamRadio</ProviderLink><ProviderLink href="https://my.remotehamradio.com/join">Create account</ProviderLink></div>
          <p className="pv-radio-service-account">Connection time is metered, including time spent listening. Review the provider’s plan before connecting to a station.</p>
        </article>
      </div>
      <div className="pv-radio-services-note"><Icon name="lock" size={16}/><p>Each person uses their own provider account. Passwords and licence documents go directly to the service; PrepVault does not collect them. Country selection provides guidance and does not verify a licence.</p></div>
    </section>

    {embedded && !localEdition && <section className="pv-inventory-workspace pv-radio-provider-panel" id="echolink-panel" aria-labelledby="echolink-panel-title">
      <div className="pv-comms-section-heading"><div><h2 id="echolink-panel-title" tabIndex={-1} ref={panelHeading}>EchoLink · Sign in & talk</h2><p>Official provider: webapp.echolink.org · Leaving Radio services closes this panel.</p></div><button type="button" className="pv-inventory-button pv-inventory-button-secondary" onClick={closePanel}>Close radio panel</button></div>
      <p className="pv-radio-embed-help">Use EchoLink’s own sign-in and transmit controls below. If sign-in, audio or microphone access does not work here, <a href={ECHOLINK_URL} onClick={closePanel} target="_blank" rel="noopener noreferrer">open the official app in its own tab ↗</a>.</p>
      <iframe title="Official EchoLink Web sign-in and radio controls" src={ECHOLINK_URL} sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" allow="microphone https://webapp.echolink.org; autoplay https://webapp.echolink.org" referrerPolicy="no-referrer"/>
    </section>}

    <details className="pv-comms-disclosure pv-inventory-workspace">
      <summary><span>Using EchoLink to reach a radio station</span><Icon name="chevron" size={17}/></summary>
      <div className="pv-radio-talk-detail"><ol><li>Sign in with your personal validated call sign, without a -R or -L suffix.</li><li>Choose an available station: -R links to a repeater; -L links to a simplex radio channel. Calls between computer users can stay entirely online.</li><li>Allow microphone access when ready. Keep the provider page in front and use its Transmit control or hold the spacebar.</li></ol><p>EchoLink requires licence validation even for listening. Public scanner feeds in the Radio tab remain receive-only.</p><a href="https://secure.echolink.org/faq_webapp.htm" target="_blank" rel="noopener noreferrer">Official EchoLink browser guide ↗</a></div>
    </details>
  </div>;
}
