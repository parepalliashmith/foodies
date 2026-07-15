// Fetch a unique CC-licensed photo per MENU ITEM (not just per category) from Wikimedia Commons.
// Image filenames must match the `img` field computed in app.js: `${cat.key}__${globalIndex}`,
// where globalIndex increments once per item in the exact same CATEGORIES -> subcats -> items order.
const https = require('https');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const UA = 'FoodiesMenuApp/1.0 (local dev script for a small restaurant menu site; contact: abhiparepalli@gmail.com)';
const ITEMS_DIR = path.join(__dirname, '..', 'images', 'items');
const PROGRESS_PATH = path.join(ITEMS_DIR, 'CREDITS.json');

// --- Load CATEGORIES from menu-data.js without a browser ---
const menuDataCode = fs.readFileSync(path.join(__dirname, '..', 'menu-data.js'), 'utf8');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(menuDataCode + '\nthis.__CATEGORIES__ = CATEGORIES;', sandbox);
const CATEGORIES = sandbox.__CATEGORIES__;

// --- Build the flat item list with filesystem-safe img ids (mirrors app.js ITEMS) ---
const FILLER_WORDS = /\b(spl|special|foodies|chef|regular|offer|customised|advance|paid|balance|due|complementary|item|combo\s*\d*)\b/gi;
const SIZE_WORDS = /\b\d+\s?(g|kg|gm|gms|ml|l|lit|litre|pcs?|pics?|pieces?|plates?|pc)\b/gi;

// Beverage categories search better as "drink"/"bottle" than "food".
const BEVERAGE_CATS = new Set(['cooldrinks', 'juices', 'milkshakes', 'lassies', 'mojitos']);

// Known brands need their exact real-world name + a product-photo-friendly suffix —
// generic cleanup (stripping sizes, appending "food") returns nothing useful for these.
const BRAND_OVERRIDES = [
  [/thums up/i, 'Thums Up cans'],
  [/^drink\b/i, 'soft drink glass'],
  [/^soft drink\b/i, 'soft drink bottles shelf'],
  [/\bmaaza\b/i, 'Maaza mango drink bottle'],
  [/\bsprite\b/i, 'Sprite bottle'],
  [/coca[\s-]?cola/i, 'Coca-Cola bottle'],
  [/\blimca\b/i, 'Limca bottle'],
  [/\bfanta\b/i, 'Fanta bottle'],
  [/appy fizz/i, 'Appy Fizz bottle'],
  [/\bmonster\b/i, 'Monster energy drink can'],
  [/predator energy/i, 'energy drink can'],
  [/empty glass/i, 'clear glass cup'],
  [/water/i, 'bottled water product'],
  [/\bsoda\b|goli soda|charged/i, 'Soft Drink drink'],
  [/pulpy orange/i, 'orange juice bottle'],
  [/diet coke/i, 'Diet Coke bottles store'],
  [/apple pop/i, 'apple juice bottle'],
  [/kwality\s?wall/i, 'ice cream tub'],
  [/cream bell/i, 'ice cream tub'],
  [/cornetto/i, 'Cornetto ice cream cone'],
  [/magnum/i, 'Magnum ice cream bar'],
];

function cleanQuery(name, catName, catKey) {
  for (const [re, override] of BRAND_OVERRIDES) {
    if (re.test(name)) return override;
  }
  let q = name.replace(/\([^)]*\)/g, ' ').replace(FILLER_WORDS, ' ').replace(SIZE_WORDS, ' ')
    .replace(/[^a-zA-Z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (q.length < 3) q = name.replace(/[^a-zA-Z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (q.length < 3) q = catName;
  const suffix = BEVERAGE_CATS.has(catKey) ? 'drink' : 'food';
  return `${q} ${suffix}`;
}

const allItems = [];
let gi = 0;
CATEGORIES.forEach(cat => {
  cat.subcats.forEach(sub => {
    sub.items.forEach(([name, price]) => {
      allItems.push({ img: `${cat.key}__${gi}`, name, query: cleanQuery(name, cat.name, cat.key), catKey: cat.key });
      gi++;
    });
  });
});

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function apiGet(query, attempt = 1) {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=3&gsrnamespace=6&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=400&format=json`;
  const body = await new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': UA } }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    }).on('error', reject);
  });
  if (body.status === 429 && attempt <= 5) { await sleep(1500 * attempt); return apiGet(query, attempt + 1); }
  try { return JSON.parse(body.data); } catch { return null; }
}

async function download(url, dest, attempt = 1) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': UA } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return download(res.headers.location, dest, attempt).then(resolve, reject);
      }
      if (res.statusCode === 429 && attempt <= 5) {
        res.resume();
        return sleep(1500 * attempt).then(() => download(url, dest, attempt + 1)).then(resolve, reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', reject);
  });
}

async function fetchOne(entry) {
  const dest = path.join(ITEMS_DIR, `${entry.img}.jpg`);
  if (fs.existsSync(dest)) return { ...entry, status: 'skip' };
  let json = await apiGet(entry.query);
  let pages = json && json.query && json.query.pages;
  let usedQuery = entry.query;
  if (!pages) {
    // fallback to a broader query: just the item name without "food" cleanup extras
    usedQuery = entry.catKey.replace(/([A-Z])/g, ' $1') + ' food';
    json = await apiGet(usedQuery);
    pages = json && json.query && json.query.pages;
  }
  if (!pages) return { ...entry, status: 'miss' };
  const candidates = Object.values(pages).filter(p => p.imageinfo && /\.(jpe?g|png)$/i.test(p.imageinfo[0].url));
  if (!candidates.length) return { ...entry, status: 'miss' };
  const page = candidates[0];
  const info = page.imageinfo[0];
  const imgUrl = info.thumburl || info.url;
  await sleep(350);
  await download(imgUrl, dest);
  return { ...entry, status: 'ok', usedQuery, sourceTitle: page.title, license: (info.extmetadata && info.extmetadata.LicenseShortName && info.extmetadata.LicenseShortName.value) || 'Unknown' };
}

async function main() {
  const startAt = Number(process.argv[2] || 0);
  const endAt = Number(process.argv[3] || allItems.length);
  const slice = allItems.slice(startAt, endAt);
  const results = fs.existsSync(PROGRESS_PATH) ? JSON.parse(fs.readFileSync(PROGRESS_PATH)) : [];
  let ok = 0, miss = 0, skip = 0;
  for (const entry of slice) {
    try {
      const r = await fetchOne(entry);
      if (r.status === 'ok') { ok++; results.push(r); }
      else if (r.status === 'skip') { skip++; }
      else { miss++; console.log(`[MISS] ${entry.img} "${entry.name}"`); }
    } catch (e) {
      miss++; console.log(`[ERR] ${entry.img} "${entry.name}": ${e.message}`);
    }
    await sleep(500);
    if ((ok + miss) % 25 === 0) {
      fs.writeFileSync(PROGRESS_PATH, JSON.stringify(results, null, 2));
      console.log(`... progress: ok=${ok} miss=${miss} skip=${skip} of ${slice.length}`);
    }
  }
  fs.writeFileSync(PROGRESS_PATH, JSON.stringify(results, null, 2));
  console.log(`\nDone slice [${startAt},${endAt}). ok=${ok} miss=${miss} skip=${skip}. Total items in menu: ${allItems.length}`);
}

main();
