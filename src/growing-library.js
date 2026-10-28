import { FARM_GUIDE_VISUALS } from './farm-visuals.js';
import { illustrationDataUrl } from './guide-illustration.js';
import { CROP_GUIDES } from './growing-crops.js';
import { FRUIT_GUIDES } from './growing-fruit.js';
import { FARM_METHOD_GUIDES, LIVESTOCK_GUIDES } from './growing-livestock.js';

export const FARM_GUIDES_REVIEWED_AT = '2026-10-28';
export const FARM_GUIDE_GROUPS = {
  vegetables: 'Vegetables', fruit: 'Fruit', herbs: 'Herbs', staples: 'Staple crops',
  nuts: 'Nuts', livestock: 'Livestock', 'farm-methods': 'Farm methods',
};
export const FARM_GUIDE_CLIMATES = {
  temperate: 'Temperate / cold climates', 'warm-climate': 'Warm climates', 'all-climates': 'General guidance',
};
const groupOrder = Object.keys(FARM_GUIDE_GROUPS);
export const FARM_GUIDES = [...CROP_GUIDES, ...FRUIT_GUIDES, ...LIVESTOCK_GUIDES, ...FARM_METHOD_GUIDES]
  .sort((a, b) => groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group) || a.title.localeCompare(b.title));

const normalize = value => String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const searchText = new Map(FARM_GUIDES.map(guide => [guide.id, normalize([
  guide.title, guide.summary, guide.season, FARM_GUIDE_GROUPS[guide.group],
  FARM_GUIDE_CLIMATES[guide.climate], ...guide.keywords, ...guide.steps,
  ...guide.sources.flatMap(source => [source.title, source.publisher, source.region]),
].join(' '))]));

export function filterFarmGuides({ query = '', group = 'all', climate = 'all', scope = 'all' } = {}) {
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  return FARM_GUIDES.filter(guide => (
    (group === 'all' || guide.group === group)
    && (climate === 'all' || guide.climate === climate)
    && (scope === 'all' || (scope === 'grow' ? !['livestock', 'farm-methods'].includes(guide.group) : guide.group === scope))
    && words.every(word => searchText.get(guide.id).includes(word))
  ));
}

const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const sourceLink = source => {
  try {
    const url = new URL(source.url);
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    return `<li><a href="${escape(url.href)}" rel="noreferrer">${escape(source.title)}</a> — ${escape(source.publisher)} · ${escape(source.region)} (online)</li>`;
  } catch { return ''; }
};

const guidePicture = guide => {
  const visual = FARM_GUIDE_VISUALS[guide.id];
  if (!visual) return '';
  return `<figure><img src="${escape(illustrationDataUrl(visual))}" alt="${escape(visual.alt)}"><figcaption><strong>${escape(visual.title)}</strong><br>${escape(visual.caption)}</figcaption></figure>`;
};

// Only original PrepVault checklists and task pictures are exported. Publisher manuals remain links.
export function farmGuidesToHtml(guides = FARM_GUIDES) {
  if (!guides.length) throw new Error('Choose at least one guide to download.');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><meta name="referrer" content="no-referrer"><title>PrepVault · Growing & livestock field guide</title><style>
body{margin:0;background:#f5f5f0;color:#29382e;font:16px/1.7 system-ui,sans-serif}main{max-width:900px;margin:auto;padding:48px 24px}h1{font-size:38px;line-height:1.2;letter-spacing:-1px}h2{font-size:25px;line-height:1.3}h3{font-size:15px}a{color:#365a41}header,nav,article{padding:24px;background:#fff;border:1px solid #dfe5da;border-radius:10px;margin-bottom:18px}header p,article p{max-width:75ch}.eyebrow,.meta{font-size:12px;color:#657260}.eyebrow{letter-spacing:1.3px;text-transform:uppercase}.index{columns:2;column-gap:28px;padding-left:22px}.index li{break-inside:avoid;margin:4px 0}.note{border-left:3px solid #96a68b;padding-left:15px;font-size:14px}.sources{font-size:13px;padding-left:20px;overflow-wrap:anywhere}.top{font-size:12px}figure{margin:22px 0;border:1px solid #dfe5da;border-radius:8px;overflow:hidden;break-inside:avoid}figure img{display:block;width:100%;height:auto}figcaption{padding:12px 16px;font-size:13px;line-height:1.7;border-top:1px solid #dfe5da}footer{font-size:13px;color:#657260}@media(max-width:550px){main{padding:20px 12px}header,nav,article{padding:18px}h1{font-size:29px}.index{columns:1}}@media print{body{background:white;font-size:11pt}main{max-width:none;padding:0}header,nav,article{border:0;padding:12px 0}article{break-before:page}h1{font-size:26pt}h2{font-size:20pt}a{color:inherit}.sources a::after{content:" (" attr(href) ")";font-size:9pt}.top{display:none}}
</style></head><body><main><header id="top"><p class="eyebrow">PREPVAULT · REFERENCE LIBRARY</p><h1>Growing & livestock.</h1><p>${guides.length} practical starter guides for growing food and caring for animals.</p><p class="meta">Sources reviewed ${FARM_GUIDES_REVIEWED_AT}. This file opens without internet, JavaScript or account sign-in. Use your browser’s Print command for a paper copy or PDF.</p><p class="note">These original checklists and their embedded task pictures help you plan; linked publisher manuals contain the detailed instructions and need internet access. Save those separately before going offline. Check local frost dates, varieties, soil, water and animal-care requirements. Climate labels describe guide focus, not suitability for your property.</p></header>
<nav aria-label="Guide contents"><h2>Find a guide</h2><ol class="index">${guides.map((guide, index) => `<li><a href="#guide-${index}">${escape(guide.title)}</a> <small>· ${escape(FARM_GUIDE_GROUPS[guide.group])}</small></li>`).join('')}</ol></nav>
${guides.map((guide, index) => `<article id="guide-${index}"><p class="eyebrow">${escape(FARM_GUIDE_GROUPS[guide.group])}</p><h2>${escape(guide.title)}</h2><p>${escape(guide.summary)}</p><p class="meta">${escape(FARM_GUIDE_CLIMATES[guide.climate])} · ${escape(guide.season)}</p>${guidePicture(guide)}<h3>Start here</h3><ol>${guide.steps.map(step => `<li>${escape(step)}</li>`).join('')}</ol><p class="note">${escape(guide.caution)}</p><h3>Full guides & manuals · online</h3><ul class="sources">${guide.sources.map(sourceLink).join('')}</ul><a class="top" href="#top">Back to contents ↑</a></article>`).join('')}
<footer>PrepVault starter notes · A curated collection, not every crop, breed or local condition. Keep veterinary contacts and local agricultural advice with your plan.</footer></main></body></html>`;
}
