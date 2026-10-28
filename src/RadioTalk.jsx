import { Icon } from './brand.jsx';
import './radio-talk.css';

export default function RadioTalk() {
  return <div className="pv-comms-stack pv-radio-talk">
    <section className="pv-inventory-workspace" aria-labelledby="radio-talk-title">
      <div className="pv-radio-talk-heading">
        <span className="pv-radio-talk-icon"><Icon name="radio" size={25}/></span>
        <div><p className="pv-inventory-eyebrow">TWO-WAY AMATEUR RADIO</p><h2 id="radio-talk-title">Talk from your laptop.</h2><p>Use EchoLink Web to reach other radio amateurs and participating repeaters. Bring your laptop, microphone, internet and a validated amateur-radio call sign.</p></div>
      </div>
      <dl className="pv-radio-talk-facts">
        <div><dt>Service</dt><dd>EchoLink Web</dd></div>
        <div><dt>Cost</dt><dd>Free</dd></div>
        <div><dt>Your own radio</dt><dd>Not required</dd></div>
        <div><dt>Connection</dt><dd>Internet required</dd></div>
      </dl>
      <div className="pv-radio-talk-launch">
        <a className="pv-inventory-button pv-inventory-button-primary" href="https://webapp.echolink.org/" target="_blank" rel="noopener noreferrer">Open EchoLink Web <span aria-hidden="true">↗</span><span className="pv-inventory-sr-only"> (opens in a new tab)</span></a>
        <p>Opens the official EchoLink app in a separate tab. Your sign-in and microphone stay with EchoLink; PrepVault does not receive your password or control transmission.</p>
      </div>
      <ol className="pv-radio-talk-steps">
        <li><span aria-hidden="true">01</span><div><h3>Sign in with your call sign</h3><p>Use your personal call sign, without a -R or -L suffix. EchoLink guides new users through licence validation.</p><a href="https://www.echolink.org/validation/" target="_blank" rel="noopener noreferrer">Licence validation & account help ↗</a></div></li>
        <li><span aria-hidden="true">02</span><div><h3>Choose who to talk to</h3><p>Choose an available station. <strong>-R</strong> links to a radio repeater; <strong>-L</strong> links to a simplex radio channel. Direct calls between computer users can stay entirely online.</p></div></li>
        <li><span aria-hidden="true">03</span><div><h3>Listen, then speak</h3><p>Allow EchoLink’s microphone when ready. Keep its tab in front and use Transmit or hold the spacebar. Save stations in EchoLink’s favourites.</p></div></li>
      </ol>
      <div className="pv-radio-talk-footer"><p>EchoLink connects to participating amateur stations. It does not transmit on police scanner feeds or arbitrary frequencies.</p><a href="https://secure.echolink.org/faq_webapp.htm" target="_blank" rel="noopener noreferrer">Official browser guide ↗</a></div>
    </section>
    <details className="pv-comms-disclosure pv-inventory-workspace">
      <summary><span>New to amateur radio?</span><Icon name="chevron" size={17}/></summary>
      <div className="pv-radio-talk-detail"><p>EchoLink requires an amateur-radio licence and validated call sign, including for listening. Until you have one, use the public feeds in the Radio tab. You can return here when your licence is ready.</p><a href="https://secure.echolink.org/access_policies.htm" target="_blank" rel="noopener noreferrer">EchoLink access requirements ↗</a></div>
    </details>
    <details className="pv-comms-disclosure pv-inventory-workspace">
      <summary><span>Want to tune a remote HF radio?</span><Icon name="chevron" size={17}/></summary>
      <div className="pv-radio-talk-detail"><h3>RemoteHamRadio</h3><p>Operate a real remote amateur station through its browser console. This is a separate paid service with membership and metered connection charges. Check your call sign’s eligibility, station availability and current pricing before signing up.</p><a className="pv-inventory-button pv-inventory-button-secondary" href="https://www.remotehamradio.com/" target="_blank" rel="noopener noreferrer">Explore RemoteHamRadio ↗</a></div>
    </details>
  </div>;
}
