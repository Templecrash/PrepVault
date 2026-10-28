// Original, concise field notes; the linked publishers retain their full guides.
// URLs and supporting guidance checked 2026-10-28. Calendar dates are deliberately
// omitted: growers must match the cultivar, frost dates and conditions at their site.
const mn = (title, slug, section = 'gardening-in-minnesota') => ({
  title, publisher: 'University of Minnesota Extension',
  url: `https://extension.umn.edu/garden-and-home/yard-and-garden/${section}/${slug}`,
  region: 'Minnesota / Upper Midwest, United States',
});
const usu = (title, slug) => ({
  title, publisher: 'Utah State University Extension',
  url: `https://extension.usu.edu/yardandgarden/research/${slug}`,
  region: 'Utah / Intermountain West, United States',
});
const crop = (id, title, group, season, summary, steps, caution, sources, keywords = [], climate = 'temperate') => ({
  id: `crop-${id}`, title, group, climate, season, summary, steps, caution, sources, keywords,
});

export const CROP_GUIDES = [
  crop('tomatoes', 'Tomatoes', 'vegetables', 'Warm season', 'Plan a supported, sunlit crop for fresh eating or preserving.', [
    'Choose a variety that can ripen within your frost-free season; start seedlings indoors or buy sturdy plants.',
    'Move plants outside once frost risk has passed and the ground has warmed. Add stakes or cages when planting.',
    'Keep watering consistent and collect remaining fruit before autumn frost.',
  ], 'Excess nitrogen can favour leaves over fruit. Base soil amendments on a soil test.',
  [mn('Growing tomatoes in home gardens', 'growing-tomatoes')], ['tomato', 'cherry', 'roma', 'paste', 'sauce', 'solanum']),

  crop('peppers', 'Sweet & hot peppers', 'vegetables', 'Warm season', 'Match bell, chilli and other pepper varieties to your growing season.', [
    'Start plants indoors well before outdoor planting, or buy healthy, compact transplants.',
    'Wait for reliably warm nights before moving plants to the garden.',
    'Use moisture-conserving mulch once conditions suit it, and avoid excessive nitrogen feeding.',
  ], 'Cold nights slow establishment; a warm day alone does not mean planting conditions are ready.',
  [mn('Growing peppers in home gardens', 'growing-peppers')], ['pepper', 'bell', 'chilli', 'chili', 'jalapeno', 'capsicum']),

  crop('eggplant', 'Eggplant', 'vegetables', 'Warm season', 'Grow aubergines from sturdy transplants in a warm, sheltered spot.', [
    'Choose a locally adapted variety, especially where summers are short.',
    'Transplant after nights stay warm; install supports without disturbing established roots later.',
    'Clip usable-size fruit from the plant with shears rather than pulling it off.',
  ], 'Eggplant performs poorly in a cool season. Soil-warming mulch cannot replace a suitable growing window.',
  [mn('Growing eggplant in home gardens', 'growing-eggplant')], ['aubergine', 'brinjal']),

  crop('snap-beans', 'Green & snap beans', 'vegetables', 'Warm season', 'Choose bush beans for compact beds or pole beans for vertical space.', [
    'Sow into warmed garden soil; avoid an unnecessary indoor transplant stage.',
    'Install a trellis when sowing climbing varieties.',
    'Pick tender pods before the seeds inside become prominent; keep checking for new pods.',
  ], 'Fresh-pod, shelling and dry-bean harvest stages differ. Check the variety and intended use.',
  [mn('Growing beans in home gardens', 'growing-beans')], ['bean', 'french bean', 'runner', 'pole', 'bush', 'wax bean']),

  crop('dry-beans', 'Dry & shelling beans', 'staples', 'Warm season', 'Plan a bean crop for mature seeds and pantry storage.', [
    'Select a dry-bean or shelling variety that can finish during your local season.',
    'Sow after the ground warms; support climbing plants at planting time.',
    'For dry beans, allow pods and seeds to dry fully before shelling and storing. Harvest shelling beans earlier.',
  ], 'Harvesting green pods reduces the seeds left for storage. Plan separate fresh and dry-bean rows if you want both.',
  [mn('Growing beans in home gardens', 'growing-beans')], ['kidney', 'pinto', 'black bean', 'navy bean', 'protein', 'pulse']),

  crop('peas', 'Peas', 'vegetables', 'Cool season', 'Grow shelling peas, sugar snaps or snow peas during cooler weather.', [
    'Sow when the soil is workable and drains well; choose the pod type you want to eat.',
    'Give tall varieties a trellis; shorter plants need less vertical space.',
    'Pick snow peas with flat tender pods, snaps while succulent, and shelling peas when filled; cool promptly.',
  ], 'Peas need relatively modest fertilization. Check soil needs instead of treating them like heavy-feeding crops.',
  [mn('Growing peas in home gardens', 'growing-peas')], ['pea', 'snow pea', 'sugar snap', 'shelling', 'mangetout']),

  crop('sweet-corn', 'Sweet corn', 'staples', 'Warm season', 'Plan variety compatibility, irrigation and a short harvest window.', [
    'Check the sweet-corn type and its isolation requirements before buying seed.',
    'Sow directly after the soil warms and provide water during dry weather.',
    'Check ears for filled kernels that release milky juice; harvest at eating maturity.',
  ], 'Different corn types can cross-pollinate and change eating quality. Use the full guide to plan separation.',
  [mn('Growing sweet corn in home gardens', 'growing-sweet-corn')], ['maize', 'corn', 'cob', 'pollination']),

  crop('potatoes', 'Potatoes', 'staples', 'Cool season', 'Raise a storage crop from healthy seed tubers.', [
    'Buy certified disease-free seed potatoes rather than relying on grocery potatoes.',
    'Plant when the soil has warmed, then mound soil around growing stems to keep tubers covered.',
    'Dig mature potatoes after the tops die back, handling tubers gently for storage.',
  ], 'Exposed tubers can turn green. Keep them covered and keep harvested potatoes out of light.',
  [mn('Growing potatoes in home gardens', 'growing-potatoes')], ['potato', 'russet', 'yukon', 'tuber', 'hilling']),

  crop('sweet-potatoes', 'Sweet potatoes', 'staples', 'Warm season', 'Grow a warm-season root crop from slips rather than seed potatoes.', [
    'Choose a variety whose maturity fits your warm season and obtain healthy rooted slips.',
    'Plant after frost danger in well-drained soil, with room for vines; water during establishment.',
    'Lift roots gently before soil freezes, then follow the guide’s curing and storage conditions.',
  ], 'A short or cool summer can limit yields. Sweet potatoes and true yams are different crops.',
  [usu('How to Grow Sweet Potatoes in Your Garden', 'sweet-potatoes-in-the-garden')], ['sweet potato', 'slips', 'ipomoea', 'roots'], 'warm-climate'),

  crop('carrots', 'Carrots', 'vegetables', 'Cool season', 'Prepare a fine seedbed for fresh roots or winter storage.', [
    'Sow directly into loose, well-drained soil; do not start taproots in transplant pots.',
    'Keep the surface moist through slow germination, then thin seedlings so roots can expand.',
    'Harvest at a useful size and loosen soil before lifting to avoid broken roots.',
  ], 'Dry spells and compacted soil reduce root quality. Match the root shape to the depth of your bed.',
  [mn('Growing carrots and parsnips in home gardens', 'growing-carrots-and-parsnips')], ['carrot', 'root crop', 'storage']),

  crop('parsnips', 'Parsnips', 'vegetables', 'Cool season', 'Give this long-season root crop deep soil and time to develop.', [
    'Sow directly into deep, loose soil and mark the row while germination is slow.',
    'Thin crowded plants and maintain soil moisture as roots grow.',
    'Lift roots carefully in late autumn; cold conditions can improve flavour.',
  ], 'Shallow or rocky beds are a poor fit for long roots. Harvest overwintered roots before spring flowering.',
  [mn('Growing carrots and parsnips in home gardens', 'growing-carrots-and-parsnips')], ['parsnip', 'winter root', 'taproot']),

  crop('beets', 'Beets', 'vegetables', 'Cool season', 'Grow roots and edible greens from the same planting.', [
    'Choose a sunny, well-drained bed and sow while conditions suit a cool-season crop.',
    'Thin seedlings to avoid crowding; keep the seedbed and developing roots evenly supplied with moisture.',
    'Lift roots at the size wanted, before they become overly large and fibrous.',
  ], 'Heat and drought can make roots woody; crowding can prevent useful root development.',
  [usu('How to Grow Beets in Your Garden', 'beets-in-the-garden')], ['beetroot', 'beet', 'greens', 'golden beet']),

  crop('radishes', 'Radishes & daikon', 'vegetables', 'Cool season', 'Use small salad radishes or larger autumn roots for different harvests.', [
    'Loosen the bed to suit the root length; daikon needs more depth than round radishes.',
    'Direct-sow in a cool growing window and keep roots from drying out.',
    'Harvest promptly at usable size; loosen soil under long roots before lifting.',
  ], 'Summer heat and water stress can produce woody, hot-tasting roots. Follow the selected variety’s season guidance.',
  [mn('Growing radishes in home gardens', 'growing-radishes')], ['radish', 'daikon', 'mooli', 'winter radish']),

  crop('turnips', 'Turnips', 'vegetables', 'Cool season', 'A relatively quick root crop for a cool growing window.', [
    'Sow directly in spring or for an autumn harvest, using timing suited to your area.',
    'Thin the row and water steadily so the roots have room to develop.',
    'Harvest roots young and tender instead of waiting for maximum size.',
  ], 'Rotate with other plant families. Heat, drought and oversized roots can reduce eating quality.',
  [mn('Growing turnips and rutabagas in home gardens', 'growing-turnips-and-rutabagas')], ['turnip', 'brassica', 'root']),

  crop('rutabagas', 'Rutabagas', 'vegetables', 'Cool season', 'Plan a longer growing period for an autumn root harvest.', [
    'Count back from a cool autumn harvest to allow the cultivar enough time to mature.',
    'Sow directly and thin more widely than small turnips.',
    'Maintain moisture through summer and lift mature roots for cooking and storage.',
  ], 'Rutabagas are not fast salad turnips. Drought can make the roots bitter or woody.',
  [mn('Growing turnips and rutabagas in home gardens', 'growing-turnips-and-rutabagas')], ['swede', 'rutabaga', 'winter roots']),

  crop('broccoli', 'Broccoli', 'vegetables', 'Cool season', 'Time head formation for moderate weather and retain plants for side shoots.', [
    'Select spring- or autumn-suited varieties and use your local frost dates to schedule starts.',
    'Harden transplants gradually and keep them supplied with water and nutrients.',
    'Cut the main head at harvest, then watch for smaller side shoots.',
  ], 'Keep brassicas moving through a crop rotation; heat during head formation reduces quality.',
  [mn('Growing broccoli in home gardens', 'growing-broccoli')], ['broccoli', 'calabrese', 'brassica', 'side shoots']),

  crop('cabbage', 'Cabbage', 'vegetables', 'Cool season', 'Grow firm heads for fresh meals, storage or tested fermentation recipes.', [
    'Choose a planting window that lets heads develop in cooler weather.',
    'Harden transplants before planting; leave room for the chosen head size.',
    'Keep moisture steady through growth and use row cover where early insect pressure is a problem.',
  ], 'Water stress can prevent good heads or create bitter leaves. Rotate away from other brassicas.',
  [mn('Growing cabbage in home gardens', 'growing-cabbage')], ['red cabbage', 'savoy', 'white cabbage', 'slaw']),

  crop('cauliflower', 'Cauliflower & Romanesco', 'vegetables', 'Cool season', 'Plan steady growth and a cool finish for compact heads.', [
    'Choose a variety and planting date that suit the local spring or autumn season.',
    'Transplant hardened seedlings into fertile soil and prevent drought stress.',
    'Check whether the variety needs its head shaded by leaves; white and coloured types differ.',
  ], 'Temperature and moisture stress can spoil head formation. Green, purple and orange types need light for their colour.',
  [mn('Growing cauliflower in home gardens', 'growing-cauliflower')], ['cauliflower', 'romanesco', 'curd']),

  crop('brussels-sprouts', 'Brussels sprouts', 'vegetables', 'Cool season', 'Allow a long growing season for sprouts that mature in cool weather.', [
    'Work backward from an autumn harvest; use transplants where the growing season is short.',
    'Grow in fertile, well-drained soil and keep plants watered during establishment and growth.',
    'Watch lower sprouts first as maturity progresses upward along the stalk.',
  ], 'This is not a quick crop. Choose maturity timing for your local autumn conditions.',
  [mn('Growing Brussels sprouts in home gardens', 'growing-brussels-sprouts')], ['brussels sprout', 'brussel sprouts', 'brassica']),

  crop('kale', 'Kale', 'vegetables', 'Cool season', 'Build repeated leaf harvests from a cool-season bed.', [
    'Sow or transplant into a sunny, fertile site during a suitable cool growing window.',
    'Keep moisture steady and watch leaves for aphids, caterpillars and flea beetle damage.',
    'Pick older outer leaves while leaving younger growth to continue producing.',
  ], 'Hardiness varies with variety and conditions; do not assume a planting will survive your entire winter.',
  [usu('How to Grow Kale in Your Garden', 'kale-in-the-garden')], ['kale', 'curly kale', 'lacinato', 'leafy green']),

  crop('kohlrabi', 'Kohlrabi', 'vegetables', 'Cool season', 'Grow a crisp swollen stem without heat or moisture stress.', [
    'Direct-sow in a cool spring or autumn growing window.',
    'Thin plants to their cultivar spacing and maintain steady growth with adequate moisture.',
    'Harvest stems while small and tender, before they become woody.',
  ], 'Kohlrabi’s edible bulb is above ground. Oversized stems are often less pleasant to eat.',
  [mn('Growing kohlrabi in home gardens', 'growing-kohlrabi')], ['kohl rabi', 'kohlrabi', 'brassica']),

  crop('lettuce', 'Lettuce', 'vegetables', 'Cool season', 'Choose loose-leaf or heading types for regular salads.', [
    'Prepare a fine seedbed and sow lightly, or plant hardened seedlings.',
    'Allow spacing for the chosen mature size and keep shallow roots consistently moist.',
    'Pick leaves while tender, leaving younger leaves for another harvest where appropriate.',
  ], 'Long days, heat and dry conditions can trigger flowering and bitterness. Repeat small sowings in suitable seasons.',
  [mn('Growing lettuce, endive and radicchio in home gardens', 'growing-lettuce-endive-and-radicchio')], ['lettuce', 'romaine', 'butterhead', 'salad', 'iceberg']),

  crop('spinach', 'Spinach', 'vegetables', 'Cool season', 'Use a cool growing window for tender leaves before bolting.', [
    'Direct-sow into a prepared bed during suitable cool weather.',
    'Keep plants watered and thin to match baby-leaf or larger-plant harvests.',
    'Harvest individual leaves while retaining young growth for further picking.',
  ], 'Spinach responds to day length as well as temperature and may bolt even with good watering.',
  [mn('Growing spinach and Swiss chard in home gardens', 'growing-spinach-and-swiss-chard')], ['spinach', 'baby leaf', 'greens']),

  crop('swiss-chard', 'Swiss chard', 'vegetables', 'Cool season', 'A leafy crop that can provide several rounds of harvest.', [
    'Direct-sow or transplant into a prepared, well-drained bed.',
    'Keep soil from drying out; leaf production slows in hot or dry conditions.',
    'Pick individual usable leaves while leaving new growth for continued harvests.',
  ], 'Identify seedlings before weeding: related weeds can resemble young chard.',
  [mn('Growing spinach and Swiss chard in home gardens', 'growing-spinach-and-swiss-chard')], ['chard', 'silverbeet', 'rainbow chard', 'leaf beet']),

  crop('onions', 'Onions & scallions', 'vegetables', 'Varies by variety', 'Match onion day-length needs to your latitude before planting.', [
    'Choose locally suitable bulbing types, or bunching onions for green stalks.',
    'Start from seed, sets or transplants; use a sunny, well-drained bed with reliable moisture.',
    'Lift storage bulbs as tops fall and dry; cure with good airflow before storing.',
  ], 'The wrong day-length variety may produce disappointing bulbs. Extra fertilizer does not fix that mismatch.',
  [mn('Growing onions in home gardens', 'growing-onions')], ['onion', 'scallion', 'spring onion', 'bunching onion', 'long day', 'short day']),

  crop('garlic', 'Garlic', 'vegetables', 'Varies by variety', 'Choose adapted planting cloves for a crop that often overwinters.', [
    'Select locally suitable hardneck or softneck stock rather than assuming all garlic suits your climate.',
    'In cold climates, plant cloves in autumn in soil that drains well.',
    'Control weeds early and follow the guide’s maturity and curing steps for your variety.',
  ], 'Planting and harvest windows depend on climate. Elephant garlic is a leek relative and behaves differently.',
  [mn('Growing garlic in home gardens', 'growing-garlic')], ['garlic', 'hardneck', 'softneck', 'cloves', 'scapes']),

  crop('leeks', 'Leeks', 'vegetables', 'Cool season', 'Start early for long, pale stems later in the season.', [
    'Start indoors or obtain transplants with enough time for the variety to mature.',
    'Plant in a furrow that can be filled gradually, or mound soil to lengthen the pale shaft.',
    'Keep shallow roots well supplied with water and harvest as needed in cool weather.',
  ], 'Most leeks take a long season. A late start cannot be made up simply with additional feeding.',
  [mn('Growing leeks in home gardens', 'growing-leeks')], ['leek', 'allium', 'winter vegetable']),

  crop('cucumbers', 'Cucumbers', 'vegetables', 'Warm season', 'Choose compact bushes or supported vines for fresh or pickling fruit.', [
    'Plant after the ground warms; select a growth habit that fits your space.',
    'Provide a trellis for vining types where needed.',
    'Check the variety’s pollination requirements when planning neighbours and protective covers.',
  ], 'All-female varieties may need a pollen-producing partner, while some seedless types do not. Read the seed description.',
  [mn('Growing cucumbers in home gardens', 'growing-cucumbers')], ['cucumber', 'gherkin', 'pickle', 'trellis']),

  crop('summer-squash', 'Zucchini & summer squash', 'vegetables', 'Warm season', 'Harvest soft-skinned squash young and often.', [
    'Plant in warmed soil after frost risk, leaving space for the full plant.',
    'Keep roots watered and open protective covers when flowering requires pollinator access.',
    'Pick young tender fruits regularly and handle them gently to avoid bruising.',
  ], 'Oversized fruit becomes tougher. Monitor covers for heat buildup and plants for squash bugs.',
  [usu('How to Grow Summer and Winter Squash in Your Garden', 'summer-and-winter-squash-in-the-garden')], ['courgette', 'zucchini', 'pattypan', 'crookneck', 'summer squash']),

  crop('winter-squash', 'Winter squash', 'staples', 'Warm season', 'Grow mature, hard-rinded squash for meals beyond the growing season.', [
    'Choose a variety that will mature before frost and allow room for its vines.',
    'Plant into warm soil; maintain moisture and manage pests while fruit develops.',
    'Harvest fully coloured, hard-rinded fruit with stems attached and check stored fruit for decay.',
  ], 'Winter refers to storage use, not planting season. Storage life differs by squash type.',
  [usu('How to Grow Summer and Winter Squash in Your Garden', 'summer-and-winter-squash-in-the-garden')], ['butternut', 'acorn', 'buttercup', 'hubbard', 'storage squash']),

  crop('pumpkins', 'Pumpkins', 'vegetables', 'Warm season', 'Choose eating or carving varieties and budget for their space needs.', [
    'Use a sunny, fertile, well-drained bed and wait for warm soil before planting.',
    'Leave room for vines and remove protective covers when plants flower.',
    'Harvest once the rind is hard and the fruit has matured; avoid damaging the skin.',
  ], 'Very large pumpkin varieties require substantial space. Choose the variety for its intended use and season length.',
  [usu('How to Grow Pumpkins in Your Garden', 'pumpkins-in-the-garden')], ['pumpkin', 'pie pumpkin', 'winter storage']),

  crop('asparagus', 'Asparagus', 'vegetables', 'Perennial', 'Establish a long-lived bed and allow roots to build before heavy harvests.', [
    'Choose a permanent site with good drainage and test soil before planting crowns or seed.',
    'Follow crown depth instructions carefully and water during establishment.',
    'Delay harvesting while young plants establish; after the harvest season, retain ferns to rebuild reserves.',
  ], 'This is a multi-year investment. Repeatedly cutting all young growth weakens future production.',
  [mn('Growing asparagus in home gardens', 'growing-asparagus')], ['asparagus', 'crowns', 'perennial vegetable']),

  crop('okra', 'Okra', 'vegetables', 'Warm season', 'A heat-loving pod crop with compact options for shorter seasons.', [
    'Choose an early or compact variety if your summer is short.',
    'Plant in a sunny, well-drained site once conditions are reliably warm; start indoors if needed.',
    'Cut tender young pods frequently without snapping brittle branches.',
  ], 'Older pods become fibrous and leaving them on plants can reduce new production.',
  [usu('Okra in the Garden', 'okra-in-the-garden')], ['okra', 'gumbo', 'bhindi', 'lady fingers'], 'warm-climate'),

  crop('celery', 'Celery', 'vegetables', 'Cool season', 'Plan an early start and dependable irrigation for tender stalks.', [
    'Use healthy transplants in a fertile bed prepared using soil-test recommendations.',
    'Keep the shallow root zone consistently moist; drip irrigation can make this easier.',
    'Protect young plants from unsuitable cold conditions and monitor growth through the season.',
  ], 'Water stress makes stalks tough and stringy. Celery needs more consistent care than many garden crops.',
  [usu('How to Grow Celery in Your Garden', 'celery-in-the-garden')], ['celery', 'stalks', 'apium']),

  crop('basil', 'Basil', 'herbs', 'Warm season', 'Raise sweet, Thai or other culinary basils for fresh leaves.', [
    'Plant after frost danger in a sunny bed or a pot with drainage.',
    'Check container moisture often; pots dry faster than garden soil.',
    'Snip stems above a pair of leaves and prune regularly to encourage fresh leafy growth.',
  ], 'Basil is frost tender. Choose disease-resistant varieties where downy mildew is a recurring problem.',
  [mn('Growing basil in home gardens', 'growing-basil', 'yard-and-garden-problems')], ['basil', 'thai basil', 'pesto', 'ocimum']),

  crop('chives', 'Chives', 'herbs', 'Perennial', 'A small perennial clump for repeated fresh cuttings.', [
    'Plant rooted divisions in a sunny, well-drained site or draining container.',
    'Water when needed without heavy fertilization; divide crowded clumps periodically.',
    'Cut leaves close to the base and remove spent flower stalks if you do not want seed.',
  ], 'Indoor winter growth slows with low light; do not try to force it with excess fertilizer.',
  [mn('Growing chives in home gardens', 'growing-chives')], ['chive', 'garlic chive', 'allium', 'perennial herb']),

  crop('dill', 'Dill', 'herbs', 'Warm season', 'Plan separate harvest stages for fresh foliage and dry seed.', [
    'Direct-sow in a sunny spot with shelter from strong winds after frost risk.',
    'Keep the bed weeded and moist; repeat sowings to extend leaf availability.',
    'Cut foliage before flowers open, or let selected plants develop seed heads.',
  ], 'Dill dislikes root disturbance. Tall, hollow stems may need support in exposed sites.',
  [mn('Growing dill in home gardens', 'growing-dill')], ['dill', 'pickling herb', 'anethum']),

  crop('parsley', 'Parsley', 'herbs', 'Cool season', 'Grow flat-leaf or curly parsley in beds or well-lit containers.', [
    'Direct-sow in rich, well-drained soil and mark the row because germination can be slow.',
    'Keep the seedbed moist, then thin plants to give them room.',
    'Harvest the outside stalks near ground level while leaving younger growth.',
  ], 'Parsley is biennial but often grown as an annual where winter survival is unreliable.',
  [mn('Growing parsley in home gardens', 'growing-parsley')], ['parsley', 'flat leaf', 'curly parsley', 'petroselinum']),

  crop('cilantro', 'Cilantro & coriander', 'herbs', 'Cool season', 'Choose whether you want fresh leaves or ripe coriander seed.', [
    'Sow in a cool growing window, selecting a slower-bolting variety for leaves.',
    'Water during establishment and avoid waterlogged conditions; repeat small sowings for continuing leaf harvests.',
    'For seed, allow flowering and collect browning seed heads into a paper bag to finish drying.',
  ], 'Warm conditions shorten the leafy harvest. Seed production requires wider spacing and a different harvest stage.',
  [usu('Cilantro/Coriander in the Garden', 'cilantro-coriander-in-the-garden')], ['coriander', 'cilantro', 'dhania', 'chinese parsley']),

  crop('mint', 'Culinary mint', 'herbs', 'Perennial', 'Keep peppermint or spearmint available without letting it take over beds.', [
    'Buy a known culinary variety or divide a labelled plant to preserve its flavour.',
    'Use a container or confined root area, with adequate moisture and good drainage.',
    'Harvest leafy stems throughout growth and divide crowded plants as needed.',
  ], 'Mint spreads aggressively. Choose identified culinary plants; this guide does not recommend medicinal preparations.',
  [usu('How to Grow Mint in Your Garden', 'mint-in-the-garden')], ['mint', 'peppermint', 'spearmint', 'mentha']),

  crop('thyme', 'Thyme', 'herbs', 'Perennial', 'A compact culinary herb for a sunny, freely draining bed.', [
    'Choose a culinary variety suited to local winters.',
    'Plant in soil that drains readily; use containers with drainage holes.',
    'Snip usable growth and preserve surplus by a suitable drying or freezing method.',
  ], 'Wet roots are a problem. Confirm the variety’s hardiness before relying on outdoor overwintering.',
  [mn('Growing herbs in home gardens', 'growing-herbs')], ['thyme', 'thymus', 'culinary herbs']),

  crop('rosemary', 'Rosemary', 'herbs', 'Perennial', 'Plan warm-season growth and a suitable winter location.', [
    'Wait for warm conditions before moving young plants outdoors.',
    'Provide strong light and well-drained soil; avoid permanently wet containers.',
    'Harvest sprigs as needed and plan protected winter care where the variety is not hardy.',
  ], 'Perennial does not mean winter-hardy everywhere. Check regional advice before leaving plants outdoors.',
  [mn('Growing herbs in home gardens', 'growing-herbs')], ['rosemary', 'salvia rosmarinus', 'container herbs']),
];
