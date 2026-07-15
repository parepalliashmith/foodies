// One-off script: fetch one CC-licensed food photo per menu category from Wikimedia Commons.
const https = require('https');
const fs = require('fs');
const path = require('path');

const UA = 'FoodiesMenuApp/1.0 (local dev script for a small restaurant menu site; contact: abhiparepalli@gmail.com)';

const ALL_QUERIES = {
  pizza: 'pizza food',
  burger: 'hamburger food',
  sandwich: 'sandwich food',
  starters: 'manchurian indo chinese food',
  friedrice: 'fried rice food',
  biryani: 'biryani food',
  todayspecial: 'grilled chicken food',
  noodles: 'noodles food',
  puffsrolls: 'puff pastry snack',
  momos: 'momos food',
  wraps: 'wrap roll food',
  kids: 'french fries food',
  milkshakes: 'milkshake glass',
  cakes: 'birthday cake',
  pastries: 'pastry dessert',
  chat: 'pani puri indian street food',
  lassies: 'lassi drink',
  juices: 'fruit juice glass',
  cooldrinks: 'soft drink bottles',
  scoopings: 'ice cream scoop bowl',
  breads: 'bread bakery',
  combos: 'fast food meal tray',
  icecreams: 'ice cream cone',
  mojitos: 'mojito cocktail drink',
  bakerycookies: 'cookies bakery',
  general: 'grocery items shelf',
  indiansnacks: 'indian snacks food',
  importchocolates: 'chocolate bars',
};

const IMG_DIR = path.join(__dirname, '..', 'images');
// Skip categories that already have a saved jpg.
const QUERIES = Object.fromEntries(
  Object.entries(ALL_QUERIES).filter(([key]) => !fs.existsSync(path.join(IMG_DIR, `${key}.jpg`)))
);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function apiGet(query, attempt = 1) {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=5&gsrnamespace=6&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=700&format=json`;
  const body = await new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': UA } }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    }).on('error', reject);
  });
  if (body.status === 429 && attempt <= 4) {
    const wait = 2000 * attempt;
    await sleep(wait);
    return apiGet(query, attempt + 1);
  }
  return JSON.parse(body.data);
}

async function download(url, dest, attempt = 1) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': UA } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return download(res.headers.location, dest, attempt).then(resolve, reject);
      }
      if (res.statusCode === 429 && attempt <= 4) {
        res.resume();
        return sleep(2000 * attempt).then(() => download(url, dest, attempt + 1)).then(resolve, reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', reject);
  });
}

async function main() {
  const creditsPath = path.join(IMG_DIR, 'CREDITS.json');
  const results = fs.existsSync(creditsPath) ? JSON.parse(fs.readFileSync(creditsPath)) : [];
  for (const [key, query] of Object.entries(QUERIES)) {
    try {
      const json = await apiGet(query);
      const pages = json.query && json.query.pages;
      if (!pages) { console.log(`[MISS] ${key}: no results for "${query}"`); continue; }
      const candidates = Object.values(pages).filter(p => p.imageinfo && /\.(jpe?g|png)$/i.test(p.imageinfo[0].url));
      if (!candidates.length) { console.log(`[MISS] ${key}: no jpg/png candidates for "${query}"`); continue; }
      const page = candidates[0];
      const info = page.imageinfo[0];
      const imgUrl = info.thumburl || info.url;
      const dest = path.join(IMG_DIR, `${key}.jpg`);
      await sleep(600);
      await download(imgUrl, dest);
      const artist = (info.extmetadata && info.extmetadata.Artist && info.extmetadata.Artist.value.replace(/<[^>]+>/g, '')) || 'Unknown';
      const license = (info.extmetadata && info.extmetadata.LicenseShortName && info.extmetadata.LicenseShortName.value) || 'Unknown';
      results.push({ key, query, title: page.title, artist, license, sourcePage: `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}` });
      console.log(`[OK] ${key} <- ${page.title} (${license})`);
    } catch (e) {
      console.log(`[ERR] ${key}: ${e.message}`);
    }
    await sleep(1500);
  }
  fs.writeFileSync(creditsPath, JSON.stringify(results, null, 2));
  console.log(`\nDone. ${results.length}/${Object.keys(ALL_QUERIES).length} total images saved. See images/CREDITS.json`);
}

main();
