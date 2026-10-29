import { isLocalEdition } from './runtime-mode.js';
import { Brand, Icon } from './brand.jsx';
import './landing.css';

const BENEFITS = [
  { icon: 'box', title: 'Know what will last.', detail: 'See how far your food, water and essentials could go. Find the gaps before you need them.' },
  { icon: 'map', title: 'Know your next move.', detail: 'Keep routes, grab-and-go lists and important dates together, ready to put into action.' },
  { icon: 'book', title: 'Keep the knowledge close.', detail: 'Find practical handbooks, save supported guides offline and keep a backup of your plan.' },
];

const QUESTIONS = [
  ['What do I need to get started?', 'Just what you already know. Add your people and record a few supplies. Build the rest as you go. The demo is a separate, fictional household you can explore without changing your plan.'],
  ['How is my readiness calculated?', 'Coverage estimates use your recorded inventory, selected dependants and planning assumptions. They help you spot gaps, but aren’t a guarantee of safety. Check your supplies and keep your records up to date.'],
  ['Can I use it offline?', 'Your saved plan works on your device. Save supported handbooks for offline reading, export a backup or use the local edition. Live weather, route calculations, radio, AI and connected services need an internet connection.'],
  ['How are my plan and connections protected?', 'You can export your plan and create a password-encrypted backup. Working data on your device is not automatically encrypted, so protect access to it. The private advisor requires authorized owner sign-in and configured AI access. Camera, alarm and location-sharing features require supported services and their permissions.'],
];

function PlanLink({ children, href = '/app', onClick, className = '' }) {
  return <a className={className} href={href} onClick={event => {
    if (onClick && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) {
      event.preventDefault();
      onClick();
    }
  }}>{children}</a>;
}

function ExamplePlan() {
  return <figure className="pv-landing-preview" aria-labelledby="landing-preview-title" aria-describedby="landing-preview-caption">
    <header className="pv-landing-preview-header"><span><Icon name="grid" size={16}/>YOUR PLAN, AT A GLANCE</span><span>Example</span></header>
    <div className="pv-landing-preview-body">
      <div className="pv-landing-preview-heading"><h2 id="landing-preview-title">See where you stand.</h2><span>Stored supplies</span></div>
      <div className="pv-landing-coverage">
        {[{ name: 'Food', days: 35, icon: 'leaf', detail: '30-day target covered', progress: 100 }, { name: 'Water', days: 7, icon: 'water', detail: '7 days to 14-day target', progress: 50, review: true }].map(item => <div className={'pv-landing-coverage-item' + (item.review ? ' needs-review' : '')} key={item.name}>
          <span className="pv-landing-coverage-label"><Icon name={item.icon} size={17}/>{item.name}</span>
          <div className="pv-landing-coverage-value"><strong>{item.days}</strong><span>days</span></div>
          <span className="pv-landing-coverage-track" aria-hidden="true"><i style={{ width: item.progress + '%' }}/></span>
          <span className="pv-landing-coverage-detail"><Icon name={item.review ? 'plus' : 'check'} size={13}/>{item.detail}</span>
        </div>)}
      </div>
      <div className="pv-landing-next-step"><span className="pv-landing-next-icon"><Icon name="water" size={20}/></span><div><span>NEXT UP</span><h3>Build up your water reserve.</h3><p>One clear step toward your goal.</p></div><Icon name="arrow" size={18}/></div>
    </div>
    <figcaption id="landing-preview-caption">Illustrative data. Your estimates use your own records.</figcaption>
  </figure>;
}

export default function Welcome({ onEnter, onSetup, onSignIn, user, children }) {
  return <div className="pv-landing">
    <a className="pv-landing-skip" href="#landing-main">Skip to content</a>
    <header className="pv-landing-nav">
      <a className="pv-landing-brand" href={isLocalEdition() ? '/home' : '/'} aria-label="PrepVault home"><Brand/></a>
      <nav aria-label="Product navigation"><a href="#platform">Why PrepVault</a><a href="#questions">Questions</a></nav>
      <PlanLink className="pv-landing-open-plan" onClick={onEnter}>Open my plan<Icon name="arrow" size={15}/></PlanLink>
    </header>
    <main id="landing-main" tabIndex={-1}>
      <section className="pv-landing-hero" aria-labelledby="landing-title">
        <div className="pv-landing-hero-copy">
          <p className="pv-landing-eyebrow"><span/>PREPAREDNESS, MADE PRACTICAL</p>
          <h1 id="landing-title">Less guessing.<br/><span>More prepared.</span></h1>
          <p className="pv-landing-hero-description">Know what you have, see what’s missing, and build a plan for the people who count on you.</p>
          <div className="pv-landing-hero-actions"><PlanLink href="/app?setup=1" onClick={onSetup} className="pv-landing-button is-primary">Build my plan<Icon name="arrow" size={18}/></PlanLink><a href="/demo" className="pv-landing-demo-link">Explore the demo<Icon name="arrow" size={15}/></a></div>
          <p className="pv-landing-hero-note">Start with what you already have. Build from there.</p>
        </div>
        <ExamplePlan/>
      </section>
      <section className="pv-landing-benefits" id="platform" aria-labelledby="landing-benefits-title">
        <h2 id="landing-benefits-title">Your essentials. Your next steps. One place.</h2>
        <div id="how-it-works" className="pv-landing-benefit-grid">{BENEFITS.map(benefit => <article key={benefit.title}><Icon name={benefit.icon} size={23}/><h3>{benefit.title}</h3><p>{benefit.detail}</p></article>)}</div>
      </section>
      <section className="pv-landing-faq" id="questions" aria-labelledby="landing-faq-title"><div><p className="pv-landing-eyebrow">A FEW DETAILS</p><h2 id="landing-faq-title">Before you start.</h2></div><div>{QUESTIONS.map(([question, answer]) => <details key={question}><summary>{question}<span aria-hidden="true"><Icon name="plus" size={17}/></span></summary><p>{answer}</p></details>)}</div></section>
      <section className="pv-landing-final" aria-labelledby="landing-final-title"><div><h2 id="landing-final-title">Make your next step a plan.</h2><p>Add your first few supplies. See what needs attention.</p></div><PlanLink href="/app?setup=1" onClick={onSetup} className="pv-landing-button is-primary">Build my plan<Icon name="arrow" size={18}/></PlanLink></section>
    </main>
    <footer className="pv-landing-footer"><a href={isLocalEdition() ? '/home' : '/'} aria-label="PrepVault home"><Brand/></a><nav aria-label="Footer navigation"><a href="/demo">Explore the demo</a><PlanLink onClick={onEnter}>Open my plan</PlanLink>{onSignIn && !user && <PlanLink onClick={onSignIn}>Sign in</PlanLink>}</nav><small>PrepVault · Prepared for real life.</small></footer>
    {children}
  </div>;
}
