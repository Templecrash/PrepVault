import { Icon } from './brand.jsx';
import './local-service-notice.css';

export default function LocalServiceNotice({ title, children, path = '/' }) {
  return <section className="pv-local-service" aria-label={title}>
    <span className="pv-local-service-icon"><Icon name="home" size={25} /></span>
    <p className="pv-local-service-eyebrow">RUNNING ON THIS COMPUTER</p>
    <h2>{title}</h2>
    <p>{children}</p>
    <p>Your downloaded app keeps your plan on this computer. Online accounts and connected services run on the live site; opening it does not transfer your local plan.</p>
    <a className="pv-button pv-primary" href={`https://prepvault-xi.vercel.app${path}`} target="_blank" rel="noreferrer">Open live PrepVault<Icon name="arrow" size={16} /></a>
  </section>;
}
