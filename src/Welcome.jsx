import { isLocalEdition } from './runtime-mode.js';
import { Brand, Icon } from './brand.jsx';
import './landing.css';

const FEATURES = [
  { icon: 'box', label: 'Inventory & readiness', title: 'Know what you have. See what needs you.', description: 'Bring food, water and supplies into one inventory. Compare coverage, find gaps, and keep expiry dates and storage locations close at hand.', large: true },
  { icon: 'map', label: 'Maps & Bug Out', title: 'Think through your next move.', description: 'Compare routes, save map references, and build a grab-and-go checklist before you need it.' },
  { icon: 'compass', label: 'Location & conditions', title: 'Keep an eye on your places.', description: 'Follow multiple locations, weather, official warnings and preparation news with concise briefings.' },
  { icon: 'vehicle', label: 'Vehicles & maintenance', title: 'Look after what gets you there.', description: 'Keep fuel, spare parts, maintenance records and upcoming service needs with each vehicle.' },
  { icon: 'calendar', label: 'Calendar & planning', title: 'Turn “sometime” into a plan.', description: 'Bring expiry dates, planting windows, service reminders and your own tasks into one calendar.' },
  { icon: 'book', reference: true, label: 'Reference & farm', title: 'Put useful knowledge within reach.', description: 'Browse practical skills, growing and livestock guides. Save supported handbooks for offline reference.' },
];

const QUESTIONS = [
  ['Where do I start?', 'Open your plan, add your household and record a few essentials. You can build the rest gradually. The separate demo lets you explore an example before adding your own information.'],
  ['Is the demo my actual plan?', 'No. The demo uses sample information in a separate workspace. Open my plan takes you to your own workspace; demo supplies are not a record of anything you own.'],
  ['Can I use PrepVault offline?', 'Your saved plan works on your device, and supported handbooks can be saved for offline reading. You can also export your data and use the local edition. Live weather, route calculation, radio streams, AI and connected services need an internet connection.'],
  ['What does the readiness information tell me?', 'Readiness and days of coverage are estimates based on what you record, the people included in your plan, and the planning assumptions. They help you find gaps and decide what to review. They are not a guarantee of safety or a substitute for checking your supplies.'],
  ['How do the private advisor and connections work?', 'Survival LLM uses app context to help assess supplies and plans. It requires configured AI access and an authorized owner sign-in. Cameras, alarms, live location sharing and radio services have their own account, permission, hardware or service requirements.'],
  ['Can I keep a copy of my information?', 'Yes. Settings & backups lets you export your plan, create a password-encrypted backup, and restore a saved copy. The working data on your device is not automatically encrypted, so protect access to that device and keep your backup password safe.'],
];

function PlanLink({ children, href = '/app', onClick, className = '' }) {
  return <a className={className} href={href} onClick={event => {
    if (onClick && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) {
      event.preventDefault();
      onClick();
    }
  }}>{children}</a>;
}

function ExampleDashboard() {
  return <figure className="pv-landing-preview" aria-labelledby="landing-preview-caption">
    <div className="pv-landing-preview-label"><span><i/>WORKSPACE / 001</span><span>Sample data</span></div>
    <div className="pv-landing-demo-window" aria-hidden="true">
      <div className="pv-landing-demo-rail" aria-hidden="true"><Brand compact/><span className="is-selected"><Icon name="grid" size={17}/></span><Icon name="leaf" size={17}/><Icon name="water" size={17}/><Icon name="box" size={17}/><Icon name="map" size={17}/><Icon name="calendar" size={17}/><Icon name="book" size={17}/><span className="pv-landing-demo-rail-bottom"><Icon name="settings" size={17}/></span></div>
      <div className="pv-landing-demo-content">
        <header className="pv-landing-demo-topbar"><span><Icon name="home" size={13}/>Example household</span><span><i/>Saved on this device</span></header>
        <div className="pv-landing-demo-heading"><div><span>READINESS OVERVIEW</span><h2>A little more ready.<br/><em>Every day.</em></h2></div><span className="pv-landing-demo-date"><Icon name="sun" size={21}/><strong>18°</strong><small>Example weather</small></span></div>
        <div className="pv-landing-demo-essentials">
          {[{ name: 'Food', value: '21', detail: 'days estimated', icon: 'leaf', tone: 'good', progress: 86 }, { name: 'Water', value: '7', detail: 'days estimated', icon: 'water', tone: 'review', progress: 39 }, { name: 'Medical', value: 'Review', detail: '2 dates to check', icon: 'shield', tone: 'attention', progress: 24 }].map(item => <div className={`pv-landing-demo-essential is-${item.tone}`} key={item.name}><div><Icon name={item.icon} size={15}/><span>{item.name}</span><i/></div><strong>{item.value}</strong><small>{item.detail}</small><span className="pv-landing-demo-meter"><i style={{ width: `${item.progress}%` }}/></span></div>)}
        </div>
        <div className="pv-landing-demo-bottom">
          <section className="pv-landing-demo-tasks"><h3>A little attention goes a long way.</h3><div><span><Icon name="water" size={14}/></span><p><strong>Review your water reserve</strong><small>7 days recorded for your household</small></p><Icon name="chevron" size={13}/></div><div><span><Icon name="vehicle" size={14}/></span><p><strong>Check the vehicle kit</strong><small>One useful task for this weekend</small></p><Icon name="chevron" size={13}/></div><footer><Icon name="calendar" size={12}/>Your next steps, in one place.</footer></section>
          <section className="pv-landing-demo-route"><div><Icon name="map" size={14}/><h3>A route, thought through.</h3></div><svg viewBox="0 0 210 130" fill="none" role="img" aria-label="Illustrative route connecting home, a stop and a destination"><path className="pv-landing-map-contour" d="M-10 34Q39-12 91 35T227 20M-10 53Q36 13 91 52T227 39M-10 73Q38 35 93 73T227 58M-10 93Q36 56 91 92T227 79M-10 112Q36 76 90 111T227 98"/><path className="pv-landing-map-road" d="M23 104C52 89 37 66 73 73S119 83 126 48 151 26 182 22"/><circle className="pv-landing-map-stop" cx="23" cy="104" r="5"/><circle className="pv-landing-map-stop" cx="101" cy="76" r="4"/><circle className="pv-landing-map-end" cx="182" cy="22" r="6"/><text x="30" y="121">Home</text><text x="73" y="59">Rest stop</text><text x="139" y="13">Destination</text></svg><small>Example route · Plan your stops</small></section>
        </div>
      </div>
    </div>
    <figcaption id="landing-preview-caption"><span>Illustrative plan. Your coverage depends on your own records.</span><a href="/demo">Explore the demo<Icon name="arrow" size={14}/></a></figcaption>
  </figure>;
}

function InventoryIllustration() {
  return <div className="pv-landing-inventory-example" aria-label="Illustrative inventory records">
    <div><span>IN YOUR INVENTORY</span><span>EXAMPLE RECORDS</span></div>
    {[{ icon: 'water', name: 'Stored water', location: 'Utility room', status: 'Review reserve' }, { icon: 'leaf', name: 'Pantry staples', location: 'Kitchen pantry', status: 'In stock' }, { icon: 'bolt', name: 'Backup power', location: 'Garage shelf', status: 'Check equipment' }].map(item => <div key={item.name}><span className="pv-landing-inventory-icon"><Icon name={item.icon} size={17}/></span><span><strong>{item.name}</strong><small>{item.location}</small></span><span>{item.status}</span></div>)}
  </div>;
}

export default function Welcome({ onEnter, onSetup, onSignIn, user, children }) {
  return <div className="pv-landing">
    <a className="pv-landing-skip" href="#landing-main">Skip to content</a>
    <header className="pv-landing-nav">
      <a className="pv-landing-brand" href={isLocalEdition() ? "/home" : "/"} aria-label="PrepVault home"><Brand/></a>
      <nav aria-label="Product navigation"><a href="#platform">The platform</a><a href="#how-it-works">How it works</a><a href="#questions">Questions</a></nav>
      <div className="pv-landing-nav-actions"><PlanLink className="pv-landing-button is-small is-outline" onClick={onEnter}>Open my plan<Icon name="arrow" size={15}/></PlanLink></div>
    </header>

    <main id="landing-main" tabIndex={-1}>
      <section className="pv-landing-hero" aria-labelledby="landing-title">
        <div className="pv-landing-hero-copy"><p className="pv-landing-eyebrow"><span/>PERSONAL PREPAREDNESS, IN FOCUS</p><h1 id="landing-title">Be ready.<br/><span>Keep living.</span></h1><p className="pv-landing-hero-intro">Less scattered information.<br/>A clearer plan for the people you care about.</p><p className="pv-landing-hero-description">Bring your supplies, places and plans together. See where you stand, what needs attention, and the next small step to take.</p><div className="pv-landing-hero-actions"><PlanLink href="/app?setup=1" onClick={onSetup} className="pv-landing-button is-primary">Start my plan<Icon name="arrow" size={18}/></PlanLink><a href="/demo" className="pv-landing-button is-outline"><Icon name="grid" size={17}/>View demo</a></div><p className="pv-landing-hero-note"><Icon name="compass" size={15}/>For everyday disruptions. And the unexpected.</p></div>
        <ExampleDashboard/>
      </section>

      <div className="pv-landing-principles" aria-label="What PrepVault brings together"><span>One place to prepare.</span><p><Icon name="box" size={18}/>Your supplies</p><p><Icon name="users" size={18}/>Your people</p><p><Icon name="map" size={18}/>Your next move</p><p><Icon name="book" size={18}/>Your knowledge</p></div>

      <section className="pv-landing-section" id="platform" aria-labelledby="landing-platform-title">
        <header className="pv-landing-section-heading"><div><p className="pv-landing-eyebrow"><span className="pv-landing-section-index">01 /</span> THE WHOLE PICTURE</p><h2 id="landing-platform-title">Preparedness has a lot of parts.<br/><span>Give them a place to come together.</span></h2></div><p>From a better-stocked pantry to a route out of town, build a plan that reflects your actual life.</p></header>
        <div className="pv-landing-feature-grid">{FEATURES.map(feature => <article className={`pv-landing-feature ${feature.large ? 'is-wide' : feature.reference ? 'is-reference' : ''}`} key={feature.label}><div className="pv-landing-feature-copy"><span className="pv-landing-feature-label"><Icon name={feature.icon} size={20}/>{feature.label}</span><h3>{feature.title}</h3><p>{feature.description}</p></div>{feature.large && <InventoryIllustration/>}{feature.reference && <div className="pv-landing-reference-topics" aria-label="Reference topics"><span><Icon name="shield" size={20}/>Practical skills</span><span><Icon name="leaf" size={20}/>Growing & livestock</span><span><Icon name="book" size={20}/>Manuals & handbooks</span></div>}</article>)}</div>
      </section>

      <section className="pv-landing-connected" aria-labelledby="landing-connected-title"><div><p className="pv-landing-eyebrow"><span className="pv-landing-section-index">02 /</span> CONTEXT, WHEN YOU NEED IT</p><h2 id="landing-connected-title">A plan you can<br/>think things through with.</h2><p>Use Survival LLM to assess supplies and explore ideas with the context of your plan. Bring supported camera feeds, alarm status and consent-based location sharing into the same workspace.</p><small>The private advisor requires authorized owner access and configured AI service. Connections require supported services and an internet connection.</small></div><div className="pv-landing-connected-cards"><article><span><Icon name="advisor" size={22}/></span><div><h3>Ask a better question.</h3><p>“What should I review in my water plan?”</p><small>Example prompt for your private advisor</small></div></article><article><span><Icon name="camera" size={22}/></span><div><h3>Keep your property in view.</h3><p>Cameras and alarm monitoring, together.</p><small>Connect supported providers in Surveillance</small></div></article><article><span><Icon name="radio" size={22}/></span><div><h3>Stay in the loop.</h3><p>Find streams and communication services.</p><small>Availability and service requirements vary</small></div></article></div></section>

      <section className="pv-landing-section pv-landing-workflow" id="how-it-works" aria-labelledby="landing-workflow-title"><header className="pv-landing-section-heading"><div><p className="pv-landing-eyebrow"><span className="pv-landing-section-index">03 /</span> START WHERE YOU ARE</p><h2 id="landing-workflow-title">A few useful steps.<br/><span>A little more peace of mind.</span></h2></div><p>You don’t need a perfect plan to start. You need a place to make progress.</p></header><ol>{[{ title: 'Start with what you have.', detail: 'Add your people and places, then record the essentials already in your cupboards, garage and kit.' }, { title: 'Make the plan practical.', detail: 'Review the gaps. Add routes, useful references, maintenance dates and a checklist for leaving in a hurry.' }, { title: 'Keep it ready for real life.', detail: 'Rotate supplies, revisit your assumptions and save a backup. Let the calendar keep the next step in sight.' }].map((step, index) => <li key={step.title}><span>0{index + 1}</span><h3>{step.title}</h3><p>{step.detail}</p></li>)}</ol></section>

      <aside className="pv-landing-ownership"><span><Icon name="lock" size={26}/></span><div><h2>Your plan. A copy you can keep.</h2><p>Export your information, create a password-encrypted backup, and save supported handbooks for offline reading. Keep useful preparation close, even when your connection isn’t.</p></div><a href="#questions">How it works<Icon name="arrow" size={16}/></a></aside>

      <section className="pv-landing-section pv-landing-faq" id="questions" aria-labelledby="landing-faq-title"><div><p className="pv-landing-eyebrow"><span className="pv-landing-section-index">04 /</span> GOOD TO KNOW</p><h2 id="landing-faq-title">A little clarity<br/>before you start.</h2><p>Preparation works better when you know what to expect.</p></div><div>{QUESTIONS.map(([question, answer]) => <details key={question}><summary>{question}<span aria-hidden="true"><Icon name="plus" size={17}/></span></summary><p>{answer}</p></details>)}</div></section>

      <section className="pv-landing-final" aria-labelledby="landing-final-title"><p className="pv-landing-eyebrow">MAKE ROOM FOR MORE CONFIDENCE</p><h2 id="landing-final-title">Your next step<br/>can be a small one.</h2><p>Take a look around. Then make a plan of your own.</p><div><PlanLink href="/app?setup=1" onClick={onSetup} className="pv-landing-button is-primary">Start my plan<Icon name="arrow" size={18}/></PlanLink><a href="/demo" className="pv-landing-button is-outline">View demo<Icon name="grid" size={17}/></a></div></section>
    </main>
    <footer className="pv-landing-footer"><div><a href={isLocalEdition() ? "/home" : "/"} aria-label="PrepVault home"><Brand/></a><span>Prepared for real life.</span></div><nav aria-label="Footer navigation"><a href="/demo">View demo</a><PlanLink onClick={onEnter}>Open my plan</PlanLink>{onSignIn && !user && <PlanLink onClick={onSignIn}>Sign in</PlanLink>}<a href="#questions">Questions</a></nav><small>PrepVault · Build a little more readiness, every day.</small></footer>
    {children}
  </div>;
}
