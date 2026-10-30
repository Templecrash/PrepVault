import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './brand.jsx';
import { useDialogFocus } from './useDialogFocus.js';
import './household-setup.css';

const STEPS = [
  { label: 'Heat & power', title: 'Your home systems', detail: 'Record the systems your home uses every day and when the power goes out.' },
  { label: 'Water', title: 'Your water sources', detail: 'Record where water comes from and the services your property relies on.' },
  { label: 'Location', title: 'Your surroundings', detail: 'A little context helps make your plans relevant to the place you live.' },
  { label: 'Household', title: 'Your household needs', detail: 'Set the assumptions for general planning and record any additional needs.' },
  { label: 'Capabilities', title: 'What you have in place', detail: 'Record the storage, training and systems that support your plan.' },
];
const OPTIONS = {
  heatSource: [['gas', 'Natural gas'], ['electric', 'Electric'], ['wood', 'Wood stove'], ['propane', 'Propane'], ['oil', 'Oil'], ['solar_thermal', 'Solar thermal'], ['none', 'None']],
  powerSource: [['grid', 'Grid only'], ['solar', 'Solar'], ['wind', 'Wind'], ['generator', 'Generator'], ['hybrid', 'Hybrid']],
  gridStatus: [['on_grid', 'On-grid'], ['off_grid', 'Off-grid'], ['hybrid', 'Hybrid']],
  hasGenerator: [[true, 'Yes'], [false, 'No']],
  generatorFuel: [['gas', 'Gasoline'], ['diesel', 'Diesel'], ['propane', 'Propane'], ['dual_fuel', 'Dual fuel']],
  waterSource: [['municipal', 'Municipal'], ['well', 'Well'], ['spring', 'Spring'], ['lake_river', 'Lake / river'], ['rain', 'Rain collection'], ['cistern', 'Cistern']],
  freshwaterAccess: [['lakefront', 'Lakefront property'], ['river_adjacent', 'River adjacent'], ['within_1km', 'Within 1 km'], ['none', 'None nearby']],
  sewage: [['municipal', 'Municipal sewer'], ['septic', 'Septic'], ['outhouse', 'Outhouse'], ['none', 'None']],
  populationDensity: [['urban', 'Urban', 'City center, high density'], ['suburban', 'Suburban', 'Residential area'], ['rural', 'Rural', 'Countryside, farms'], ['remote', 'Remote', 'Isolated, off-road']],
  geoRisks: [['flood', 'Flood zone'], ['wildfire', 'Wildfire'], ['tornado', 'Tornado'], ['earthquake', 'Earthquake'], ['coastal', 'Coastal storm'], ['extreme_cold', 'Extreme cold'], ['extreme_heat', 'Extreme heat']],
  climate: [['arctic', 'Arctic'], ['cold', 'Cold'], ['temperate', 'Temperate'], ['hot_dry', 'Hot & dry'], ['tropical', 'Tropical'], ['coastal', 'Coastal']],
  specialNeeds: [['elderly', 'Elderly (65+)'], ['children_under5', 'Children under 5'], ['children_5to12', 'Children 5–12'], ['medical', 'Medical conditions'], ['mobility', 'Mobility impaired']],
  pets: [['dogs', 'Dogs'], ['cats', 'Cats'], ['livestock_small', 'Small livestock'], ['livestock_large', 'Large livestock'], ['poultry', 'Poultry'], ['horses', 'Horses']],
  foodStorage: [['pantry', 'Pantry only'], ['root_cellar', 'Root cellar'], ['freeze_dried', 'Freeze-dried stash'], ['garden', 'Garden'], ['farm', 'Farm'], ['greenhouse', 'Greenhouse']],
  medicalTraining: [['none', 'None'], ['first_aid', 'First aid'], ['emt', 'EMT / paramedic'], ['nurse_doctor', 'Nurse / doctor']],
  commsCapability: [['cell_only', 'Cell phone'], ['ham', 'HAM radio'], ['satellite', 'Satellite phone'], ['cb', 'CB radio'], ['mesh', 'Mesh network']],
  defensivePosture: [['none', 'None'], ['basic', 'Basic locks'], ['security_system', 'Security system'], ['fortified', 'Fortified'], ['armed', 'Armed']],
};
const asArray = value => Array.isArray(value) ? value : value == null ? [] : [value];

function Choices({ name, label, value, onChange, multiple = false, options = OPTIONS[name] }) {
  const id = useId();
  return <fieldset className="pv-setup-choices">
    <legend>{label}<span>{multiple ? 'Select all that apply' : 'Select one'}</span></legend>
    <div>{options.map(([key, text, detail]) => <label key={String(key)} className={detail ? 'has-detail' : undefined}>
      <input type={multiple ? 'checkbox' : 'radio'} name={`${id}-${name}`} checked={multiple ? asArray(value).includes(key) : value === key} onChange={() => onChange(key)}/>
      <span><strong>{text}</strong>{detail && <small>{detail}</small>}</span>
    </label>)}</div>
  </fieldset>;
}

export default function HouseholdSetup({ step, setStep, profile, setProfile, people, setPeople, climate, setClimate, propAddress, setPropAddress, onComplete, onSkip, onPeople }) {
  const id = useId();
  const ref = useDialogFocus(onSkip);
  const heading = useRef(null);
  const content = useRef(null);
  const activeStep = Math.max(0, Math.min(STEPS.length - 1, Number.isInteger(step) ? step : 0));
  const previousStep = useRef(activeStep);
  useEffect(() => {
    if (previousStep.current === activeStep) return;
    previousStep.current = activeStep;
    content.current?.scrollTo({ top: 0, behavior: 'instant' });
    heading.current?.focus({ preventScroll: true });
  }, [activeStep]);
  const update = (field, value) => setProfile(current => ({ ...current, [field]: value }));
  const toggle = (field, value) => setProfile(current => {
    const selected = asArray(current[field]);
    return { ...current, [field]: selected.includes(value) ? selected.filter(entry => entry !== value) : [...selected, value] };
  });
  const choices = (field, label, multiple = true) => <Choices name={field} label={label} value={profile[field]} multiple={multiple} onChange={value => multiple ? toggle(field, value) : update(field, value)}/>;
  const finishStep = event => {
    event.preventDefault();
    if (activeStep < STEPS.length - 1) setStep(activeStep + 1);
    else onComplete({ ...profile, completedAt: new Date().toISOString() });
  };
  const goToPeople = () => { onSkip(); onPeople?.(); };

  return createPortal(<div className="pv-setup-backdrop" onClick={onSkip}>
    <section ref={ref} className="pv-setup-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} onClick={event => event.stopPropagation()}>
      <header className="pv-setup-header">
        <span className="pv-setup-mark"><Icon name="home" size={22}/></span>
        <div><span className="pv-setup-eyebrow">HOUSEHOLD SETUP</span><h2 id={`${id}-title`}>Make your plan fit your life.</h2><p id={`${id}-description`}>Start with what you know. You can update these details anytime.</p></div>
        <button type="button" className="pv-setup-close" onClick={onSkip} aria-label="Close household setup"><Icon name="close" size={20}/></button>
      </header>
      <div className="pv-setup-layout">
        <nav className="pv-setup-nav" aria-label="Household setup steps"><ol>{STEPS.map((entry, index) => <li key={entry.label}><button type="button" aria-current={activeStep === index ? 'step' : undefined} onClick={() => setStep(index)}><span aria-hidden="true">{index + 1}</span><strong>{entry.label}</strong></button></li>)}</ol><p>Every detail is optional.</p></nav>
        <form className="pv-setup-form" onSubmit={finishStep}>
          <div className="pv-setup-content" ref={content}>
            <div className="pv-setup-step-heading"><span>STEP {activeStep + 1} OF {STEPS.length}</span><h3 ref={heading} tabIndex={-1}>{STEPS[activeStep].title}</h3><p>{STEPS[activeStep].detail}</p></div>
            {activeStep === 0 && <>
              {choices('heatSource', 'Heat sources')}
              {choices('powerSource', 'Power sources')}
              {choices('gridStatus', 'Grid status', false)}
              {choices('hasGenerator', 'Backup generator', false)}
              {profile.hasGenerator === true && choices('generatorFuel', 'Generator fuel types')}
            </>}
            {activeStep === 1 && <>
              {choices('waterSource', 'Water sources')}
              {choices('freshwaterAccess', 'Fresh water access')}
              {choices('sewage', 'Sewage system', false)}
            </>}
            {activeStep === 2 && <>
              <label className="pv-setup-field"><span>Property address</span><input type="text" autoComplete="street-address" value={propAddress || ''} onChange={event => setPropAddress(event.target.value)} placeholder="Street address or general area"/></label>
              {choices('populationDensity', 'Population density', false)}
              <div className="pv-setup-field-row">
                <label className="pv-setup-field"><span>Property size <small>acres</small></span><input type="number" min="0" step="any" value={profile.propertyAcres ?? ''} onChange={event => update('propertyAcres', event.target.value === '' ? null : Number(event.target.value))} placeholder="Not recorded"/></label>
                <label className="pv-setup-field"><span>Nearest town <small>km</small></span><input type="number" min="0" step="any" value={profile.nearestTownKm ?? ''} onChange={event => update('nearestTownKm', event.target.value === '' ? null : Number(event.target.value))} placeholder="Not recorded"/></label>
              </div>
              {choices('geoRisks', 'Geographic risks')}
            </>}
            {activeStep === 3 && <>
              <div className="pv-setup-household">
                <div><h4 id={`${id}-people`}>General planning household</h4><p>Used by scenario and resource models.</p></div>
                <div className="pv-setup-stepper" role="group" aria-labelledby={`${id}-people`}><button type="button" aria-label="Decrease general planning household" disabled={people <= 1} onClick={() => setPeople(current => Math.max(1, current - 1))}>−</button><output aria-live="polite">{people}</output><button type="button" aria-label="Increase general planning household" disabled={people >= 20} onClick={() => setPeople(current => Math.min(20, current + 1))}>+</button></div>
              </div>
              <div className="pv-setup-people-note"><Icon name="users" size={19}/><div><p>Food and water count only people marked as dependants on Your People.</p>{onPeople && <button type="button" onClick={goToPeople}>Manage your people<Icon name="arrow" size={14}/></button>}</div></div>
              <Choices name="climate" label="Climate zone" value={climate} onChange={setClimate}/>
              {choices('specialNeeds', 'Additional needs')}
              {choices('pets', 'Pets & livestock')}
            </>}
            {activeStep === 4 && <>
              {choices('foodStorage', 'Food storage methods')}
              {choices('medicalTraining', 'Medical training')}
              {choices('commsCapability', 'Communication methods')}
              {choices('defensivePosture', 'Property security')}
            </>}
          </div>
          <footer className="pv-setup-footer">
            <button type="button" className="pv-setup-later" onClick={onSkip}>Finish later</button>
            <div>{activeStep > 0 && <button type="button" className="pv-button pv-secondary" onClick={() => setStep(activeStep - 1)}>Back</button>}<button type="submit" className="pv-button pv-primary">{activeStep === STEPS.length - 1 ? 'Finish setup' : 'Continue'}<Icon name={activeStep === STEPS.length - 1 ? 'check' : 'arrow'} size={16}/></button></div>
          </footer>
        </form>
      </div>
    </section>
  </div>, document.body);
}
