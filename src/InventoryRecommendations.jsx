import { useId } from 'react';
import { Icon } from './brand.jsx';
import { buildInventoryRecommendations } from './inventory-recommendations.js';
import './inventory-recommendations.css';

export default function InventoryRecommendations({ items = [], categories = {}, categoryKey, propertyId, peopleCount = 0, dailyCalTarget = 2000, waterGalPerPerson = 1, alerts = [], onAdd, onEdit, onManagePeople, onRationing, onCategory, actions }) {
  const headingId = useId();
  const result = buildInventoryRecommendations({ items, categories, categoryKey, propertyId, peopleCount, dailyCalTarget, waterGalPerPerson, alerts });
  const actionFor = action => {
    if (action?.kind === 'edit' && onEdit) return () => onEdit(action.item);
    if (action?.kind === 'add' && onAdd) return () => onAdd(action.categoryKey);
    if (action?.kind === 'people' && onManagePeople) return onManagePeople;
    if (action?.kind === 'rationing' && onRationing) return onRationing;
    if (action?.kind === 'category' && action.categoryKey && onCategory) return () => onCategory(action.categoryKey);
    return null;
  };

  return <section className="pv-inventory-recommendations" aria-labelledby={headingId}>
    <header className="pv-inventory-recommendations-heading"><div><h2 id={headingId}>Recommended next steps</h2><p>Based on your recorded inventory{propertyId === 'all' ? ' across all locations' : ' for this location'}. Updated as your records change.</p></div>{actions && <div className="pv-inventory-recommendations-actions">{actions}</div>}</header>
    {result.coverage.length > 0 && <div className="pv-inventory-recommendations-coverage">{result.coverage.map(coverage => <div key={coverage.category}><span>{coverage.label}</span><strong>{coverage.days === null ? 'Days not yet known' : `${coverage.days.toLocaleString()} full ${coverage.days === 1 ? 'day' : 'days'}`}</strong><small>{coverage.note}</small></div>)}</div>}
    <div className="pv-inventory-recommendations-grid">{result.suggestions.map(suggestion => {
      const onAction = actionFor(suggestion.action);
      return <article className="pv-inventory-recommendation" key={suggestion.id}><span className="pv-inventory-recommendation-icon"><Icon name={suggestion.icon} size={18}/></span><h3>{suggestion.title}</h3><p>{suggestion.detail}</p>{onAction && <button type="button" onClick={onAction}>{suggestion.action.label}<Icon name="arrow" size={15}/></button>}</article>;
    })}</div>
    {categoryKey && <p className="pv-inventory-recommendations-note"><strong>{result.stockedTypes.length} types in stock</strong> · {result.recordedTypes.length} types recorded · {result.unrecordedTypes.length} not recorded. Types are options to consider, not a required shopping list.</p>}
  </section>;
}
