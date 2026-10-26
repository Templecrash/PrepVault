import { useId, useState } from 'react';
import { Icon } from './brand.jsx';
import { computeRationing } from './rationing.js';
import './rationing.css';

const format = value => value.toLocaleString(undefined, { maximumFractionDigits: 1 });

export default function RationingPlanner({ items, rationPeople, setRationPeople, dailyCalTarget, setDailyCalTarget, onResetPeople, showSummary = true }) {
  const [personName, setPersonName] = useState('');
  const id = useId();
  const result = computeRationing(items, rationPeople.length, dailyCalTarget);
  const addPerson = event => {
    event.preventDefault();
    if (!personName.trim()) return;
    const person = { id: `rp-${typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`, name: personName.trim() };
    setRationPeople(current => [...current, person]);
    setPersonName('');
  };
  return <section className="pv-rationing" aria-label="Rationing planner">
    {showSummary && <>
      <header className="pv-rationing-heading"><div><h2>Rationing planner</h2><p>How long your recorded food and stored water could last.</p></div><Icon name="leaf" size={21}/></header>
      <div className="pv-rationing-summary" aria-live="polite">
        <div><span>Food</span><strong>{result.foodDays ?? '—'}<small> days</small></strong><p>{format(result.totalCalories)} calories recorded</p></div>
        <div><span>Stored water</span><strong>{result.waterDays ?? '—'}<small> days</small></strong><p>{format(result.totalWaterGal)} gallons recorded</p></div>
        <div><span>Planning for</span><strong>{result.peopleCount}<small> {result.peopleCount === 1 ? 'person' : 'people'}</small></strong><p>{format(result.dailyCalTarget)} calories per day each</p></div>
      </div>
    </>}
    <p className="pv-rationing-assumption">Estimates use your selected calorie target and 1 gallon of stored water per person per day.</p>
    {result.omittedFoodCount > 0 && <p className="pv-rationing-notice">{result.omittedFoodCount} food {result.omittedFoodCount === 1 ? 'entry is' : 'entries are'} excluded because calorie or serving information is missing.</p>}
    {!result.peopleCount && <p className="pv-rationing-notice" role="status">Add a person below to calculate how long your supplies could last.</p>}
    <div className="pv-rationing-controls">
      <section className="pv-rationing-card" aria-labelledby={`${id}-target`}>
        <div className="pv-rationing-card-title"><h3 id={`${id}-target`}>Daily calorie target</h3><output htmlFor={`${id}-slider`}>{format(dailyCalTarget)}<span> per person</span></output></div>
        <label className="pv-rationing-range-label" htmlFor={`${id}-slider`}>Calories per person per day</label>
        <input id={`${id}-slider`} className="pv-rationing-slider" type="range" min={1000} max={3000} step={100} value={dailyCalTarget} onChange={event => setDailyCalTarget(Number(event.target.value))}/>
        <div className="pv-rationing-range-ends"><span>1,000</span><span>3,000</span></div>
        <div className="pv-rationing-presets" aria-label="Calorie target presets">{[2000, 1500, 1200].map(target => <button key={target} type="button" aria-pressed={dailyCalTarget === target} onClick={() => setDailyCalTarget(target)}>{format(target)} cal</button>)}</div>
      </section>
      <section className="pv-rationing-card" aria-labelledby={`${id}-people`}>
        <div className="pv-rationing-card-title"><h3 id={`${id}-people`}>People in this plan</h3>{onResetPeople ? <button className="pv-rationing-reset" type="button" onClick={onResetPeople}>Use household size</button> : <span>{rationPeople.length}</span>}</div>
        <div className="pv-rationing-people">{rationPeople.map(person => <span key={person.id}>{person.name}<button type="button" aria-label={`Remove ${person.name} from rationing plan`} onClick={() => setRationPeople(current => current.filter(entry => entry.id !== person.id))}><Icon name="close" size={12}/></button></span>)}</div>
        <form className="pv-rationing-add-person" onSubmit={addPerson}><input aria-label="Person name for rationing" placeholder="Add a person…" maxLength={80} value={personName} onChange={event => setPersonName(event.target.value)}/><button type="submit" className="pv-button pv-secondary" disabled={!personName.trim()}><Icon name="plus" size={15}/>Add</button></form>
      </section>
    </div>
    <details className="pv-rationing-breakdown">
      <summary>Inventory breakdown <span>{result.foodItems.length} food · {result.waterItems.length} stored water</span></summary>
      <div className="pv-rationing-inventories">
        <section aria-labelledby={`${id}-food`}><h3 id={`${id}-food`}>Food inventory</h3>{result.foodItems.length ? <>
          <div className="pv-rationing-table-wrap"><table><thead><tr><th scope="col">Item</th><th scope="col">Quantity</th><th scope="col">Cal / serving</th><th scope="col">Total cal</th></tr></thead><tbody>{result.foodItems.map(item => <tr key={item.id}><th scope="row">{item.name}</th><td>{format(item.quantity)}</td><td>{item.hasCalorieData ? format(item.caloriesPerServing) : 'Not recorded'}</td><td>{format(item.totalCalories)}</td></tr>)}</tbody><tfoot><tr><th scope="row" colSpan={3}>Recorded total</th><td>{format(result.totalCalories)}</td></tr></tfoot></table></div>
          {result.peopleCount > 0 && <p className="pv-rationing-footnote">{format(result.totalCalories / result.peopleCount)} recorded calories per person across all stock.</p>}
        </> : <p className="pv-rationing-empty">Add food supplies to your inventory to include them here.</p>}</section>
        <section aria-labelledby={`${id}-water`}><h3 id={`${id}-water`}>Stored water</h3>{result.waterItems.length ? <><dl className="pv-rationing-water-list">{result.waterItems.map(item => <div key={item.id}><dt>{item.name}</dt><dd>{format(item.gallons)} gal</dd></div>)}<div className="is-total"><dt>Recorded total</dt><dd>{format(result.totalWaterGal)} gal</dd></div></dl>{result.peopleCount > 0 && <p className="pv-rationing-footnote">{format(result.totalWaterGal / result.peopleCount)} gallons per person across all stock.</p>}</> : <p className="pv-rationing-empty">Add stored water to your inventory to include it here.</p>}</section>
      </div>
    </details>
    <details className="pv-rationing-breakdown">
      <summary>Meal portions <span>From your recorded food</span></summary>
      <p className="pv-rationing-footnote">One recorded serving per person. These portions are separate from the daily calorie target.</p>
      {result.mealSuggestions.length ? <div className="pv-rationing-portions">{result.mealSuggestions.map(item => <div key={item.id}><span><strong>{format(item.unitsNeeded)} {item.unit} of {item.name}</strong><small>{format(item.servings)} servings per unit · {format(item.caloriesPerServing)} calories per serving · {format(item.quantity)} {item.unit} in stock</small></span>{item.shortOnStock && <span className="pv-rationing-short">Not enough stock</span>}</div>)}</div> : <p className="pv-rationing-empty">{result.peopleCount ? 'Record food quantities, calories and servings to calculate meal portions.' : 'Add a person to calculate meal portions.'}</p>}
    </details>
  </section>;
}
