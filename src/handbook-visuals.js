// Audited against the bundled, unmodified PDFs. Pages are one-based PDF positions,
// not the printed page labels. See docs/handbook-visual-audit.md for scope and gaps.
export const HANDBOOK_VISUALS = {
  'cert-basic-training': {
    status: 'illustrated',
    summary: 'Original diagrams explain escape planning, extinguisher use and utility identification. Practical response skills still need hands-on training.',
    pages: [
      { page: 31, title: 'Household escape plan', description: 'A floor plan shows exit routes, alarms and an outside meeting point.' },
      { page: 172, title: 'Fire extinguisher sequence', description: 'The original P.A.S.S. illustrations accompany the manual’s fire-safety instructions.' },
      { page: 176, title: 'Electrical panel identification', description: 'Diagrams identify circuit breakers and fuse boxes beside the source’s safety instructions.' },
      { page: 177, title: 'Gas meter identification', description: 'A meter drawing shows valve orientation beside the source’s utility safety cautions.' },
    ],
  },
  'stanford-emergency-manual': {
    status: 'illustrated',
    summary: 'Clinical cognitive aids include a team-resource diagram and procedure illustrations for trained professionals.',
    pages: [
      { page: 54, title: 'Clinical team coordination', description: 'A crisis-resource-management wheel groups leadership, communication and team responsibilities.' },
      { page: 17, title: 'Clinical airway illustrations', description: 'Original procedure drawings for trained clinical teams; not a self-treatment guide.' },
    ],
  },
  'basic-emergency-care': {
    status: 'illustrated',
    summary: 'The clinical skills chapter contains many original positioning and procedure drawings for trained health workers.',
    pages: [
      { page: 154, title: 'Clinical airway positioning', description: 'Original adult and paediatric airway-positioning drawings in the clinical skills chapter.' },
      { page: 188, title: 'Clinical team positioning', description: 'A team-positioning drawing accompanies the trained-provider immobilization exercise.' },
      { page: 193, title: 'Clinical immobilization', description: 'Original immobilization drawings and a supervised skill-assessment checklist.' },
    ],
  },
  'emergency-wound-care': {
    status: 'illustrated',
    summary: 'Small action pictograms support the wound-care checklist. They are an overview, not a detailed technique sequence.',
    pages: [
      { page: 1, title: 'Wound-care safety overview', description: 'Pictograms identify washing, protecting wounds, avoiding floodwater and seeking medical help.' },
    ],
  },
  'are-you-ready': {
    status: 'illustrated',
    summary: 'Household-planning graphics and a small earthquake-action sequence support the preparedness guidance.',
    pages: [
      { page: 10, title: 'Earthquake protective actions', description: 'Three small figures illustrate the source’s drop, cover and hold-on sequence.' },
      { page: 27, title: 'Prepared-home overview', description: 'An illustrated home-planning overview connects communications, evacuation, alerts, records and supplies.' },
    ],
  },
  'emergency-drinking-water': {
    status: 'illustrated',
    summary: 'Equipment and clarification illustrations accompany the original water-treatment instructions and tables.',
    pages: [
      { page: 1, title: 'Water-treatment equipment', description: 'Drawings show boiling equipment, bleach and a dropper beside the complete source instructions.' },
      { page: 2, title: 'Water clarification illustration', description: 'A cloth-filtration drawing accompanies the guidance; the original dosing table remains on the same page.' },
    ],
  },
  'food-water-emergencies': {
    status: 'illustrated',
    summary: 'Small refrigerator, thermometer and disinfection-equipment pictures support the food and water checklists.',
    pages: [
      { page: 2, title: 'Cold-storage safety', description: 'Refrigerator and appliance-thermometer pictures accompany the outage and restoration checklist.' },
      { page: 3, title: 'Water-treatment comparison', description: 'The source compares boiling and disinfection, with a supporting bleach-container and measuring-spoon picture.' },
    ],
  },
  'generator-safety': {
    status: 'illustrated',
    summary: 'Carbon-monoxide warning pictograms support the safety checklist; the source does not include a generator-placement diagram.',
    pages: [
      { page: 1, title: 'Carbon monoxide safety pictograms', description: 'The original pictograms explain why senses cannot detect carbon monoxide and identify a CO alarm.' },
    ],
  },
  'disaster-response-safety': {
    status: 'reference',
    summary: 'A text-led worker-safety reference with no task diagrams. Use the illustrated cleanup skill alongside this detailed guide.',
    pages: [],
  },
};

// Empty arrays mean there is no suitable task picture in these nine PDFs.
// Skills have their own companion illustrations; never substitute clinical
// procedure drawings from the professional manuals for beginner instruction.
export const SKILL_HANDBOOK_VISUALS = {
  'make-fire': [],
  'stay-warm': [],
  'stop-bleeding': [],
  'protect-wounds': [
    { bookId: 'emergency-wound-care', page: 1, title: 'CDC wound-care overview' },
  ],
  'safe-water': [
    { bookId: 'emergency-drinking-water', page: 1, title: 'EPA water-treatment illustrations' },
    { bookId: 'emergency-drinking-water', page: 2, title: 'EPA water clarification illustration' },
  ],
  'food-outage': [
    { bookId: 'food-water-emergencies', page: 2, title: 'FDA cold-storage safety pictures' },
  ],
  'temporary-shelter': [],
  'repair-kit': [],
  'safe-room': [],
  'navigate': [],
  'communications': [],
  'evacuate': [
    { bookId: 'cert-basic-training', page: 31, title: 'FEMA household escape-plan example' },
  ],
  'generator-co': [
    { bookId: 'generator-safety', page: 1, title: 'CDC carbon monoxide warning pictograms' },
  ],
  'sanitation': [],
  'storm-shelter': [],
  'safe-cleanup': [],
};
