// ============================================================
// 農業部農產品批發市場行情 API 串接
// 雙資料源：
//   1. data.moa.gov.tw  → 19個報導站，有逐市場明細
//   2. amis.afa.gov.tw  → 47個市場全資料，含芭樂/番石榴等
// ============================================================
const axios = require('axios');
const cache = require('./cache');

// 模擬瀏覽器 Headers，避免 AMIS 伺服器拒絕非瀏覽器請求
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
};


const MOA_API = 'https://data.moa.gov.tw/Service/OpenData/FromM/FarmTransData.aspx';
const AMIS_FRUIT_URL        = 'https://amis.afa.gov.tw/fruit/FruitProdDayTransInfo.aspx';
const AMIS_FRUIT_MARKET_URL = 'https://amis.afa.gov.tw/fruit/FruitMarketTransInfoCP.aspx';
const AMIS_VEG_URL          = 'https://amis.afa.gov.tw/veg/VegProdDayTransInfo.aspx';
const AMIS_VEG_MARKET_URL   = 'https://amis.afa.gov.tw/veg/VegMarketTransInfoCP.aspx';

const CACHE_TTL = 3600;

// 目標品項關鍵字：查詢逐市場行情用
const AMIS_WANTED = ['番石榴', '香蕉', '金鑽鳳梨', '鳳梨', '柳橙', '奇異果', '紅龍果', '洋香瓜', '苦苣', '高麗菜', '西瓜', '芒果'];

// 常用別名：使用者慣用名 → API 實際名稱
const ALIASES = {
  '芭樂': '番石榴', '番石榴': '番石榴',
  '芭蕉': '香蕉',
  '鳳梨': '金鑽鳳梨',
  '柳丁': '柳橙', '柳橙': '柳橙',
  '奇異果': '奇異果',
  '火龍果': '紅龍果', '紅龍果': '紅龍果',
  '哈密瓜': '洋香瓜', '洋香瓜': '洋香瓜',
  '苦苣': '苦苣',
};

// ──────────────────────────────────────────
// 主函式：合併兩個資料源
// ──────────────────────────────────────────
async function fetchMarketData({ forceRefresh = false } = {}) {
  const cacheKey = 'market:all';
  if (!forceRefresh) {
    const cached = await cache.get(cacheKey);
    if (cached) return cached;
  }
  const [moaData, amisData] = await Promise.allSettled([
    fetchMoaData(),
    fetchAmisData(),
  ]);
  const moa  = moaData.status  === 'fulfilled' ? moaData.value  : [];
  const amis = amisData.status === 'fulfilled' ? amisData.value : [];

  // 合併：MOA + AMIS（AMIS 現有逐市場名稱，兩者市場命名不同，直接合併）
  const allData = [...moa, ...amis];
  console.log(`✅ 資料合併完成：MOA ${moa.length} 筆 + AMIS ${amis.length} 筆 = 共 ${allData.length} 筆`);

  if (allData.length > 0) {
    await cache.set(cacheKey, allData, CACHE_TTL);
  }
  return allData.length > 0 ? allData : getFallbackData();
}

// ──────────────────────────────────────────
// 資料源 1：農業部開放資料（19個報導站）
// ──────────────────────────────────────────
async function fetchMoaData() {
  try {
    const resp = await axios.get(MOA_API, { params: { '$top': 5000 }, timeout: 30000 });
    return parseMoaResponse(resp.data);
  } catch (err) {
    console.error('MOA API 失敗:', err.message);
    return [];
  }
}

function parseMoaResponse(data) {
  if (!Array.isArray(data)) return [];
  return data
    .map(item => ({
      name:      (item['作物名稱'] || '').trim(),
      market:    (item['市場名稱'] || '台北市場').trim(),
      avgPrice:  parseFloat(item['平均價'] || 0),
      highPrice: parseFloat(item['上價']   || 0),
      lowPrice:  parseFloat(item['下價']   || 0),
      midPrice:  parseFloat(item['中價']   || 0),
      volume:    parseFloat(item['交易量'] || 0),
      unit:      'kg',
      date:      (item['交易日期'] || '').replace(/\./g, '/'),
      category:  getCategoryName(item['種類代碼'] || ''),
    }))
    .filter(d => d.name && d.name !== '休市' && d.avgPrice > 0
               && (d.category === '蔬菜' || d.category === '水果'));
}

// ──────────────────────────────────────────
// 資料源 2：AMIS 農產品批發市場行情站
// 兩階段：
//   Phase 1: GET+POST 概覽頁取得產品代碼清單
//   Phase 2: GET+POST 市場比較頁取得逐市場行情
// ──────────────────────────────────────────
async function fetchAmisData() {
  const results = [];
  const today = getTodayRoc();

  for (const [overviewUrl, marketUrl, category] of [
    [AMIS_FRUIT_URL, AMIS_FRUIT_MARKET_URL, '水果'],
    [AMIS_VEG_URL,   AMIS_VEG_MARKET_URL,   '蔬菜'],
  ]) {
    try {
      // Phase 1a: GET 概覽頁取得 ViewState
      const getResp = await axios.get(overviewUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: 60000,
      });
      const html1  = getResp.data;
      const vs     = extractHidden(html1, '__VIEWSTATE');
      const vsg    = extractHidden(html1, '__VIEWSTATEGENERATOR');
      const ev     = extractHidden(html1, '__EVENTVALIDATION');
      const cookie = (getResp.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');

      if (!vs) { console.warn(`AMIS GET 未取得 ViewState: ${overviewUrl}`); continue; }

      // Phase 1b: POST 概覽頁取得產品代碼清單
      const overviewBody = buildOverviewPost({ vs, vsg, ev, today });
      const overviewResp = await axios.post(overviewUrl, overviewBody, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent':   'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Cookie':       cookie,
          'Referer':      overviewUrl,
        },
        timeout: 65000,
      });
      const productCodes = parseProductCodes(overviewResp.data, today);
      console.log(`AMIS ${category} 概覽共 ${productCodes.length} 個產品代碼`);

      // 篩選要查逐市場的品項
      const wanted = productCodes.filter(p =>
        AMIS_WANTED.some(kw => p.name.includes(kw))
      );
      if (wanted.length === 0) { console.warn(`AMIS ${category} 無符合目標的品項`); continue; }

      // Phase 2a: GET 市場比較頁取得 ViewState
      const mktGetResp = await axios.get(marketUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: 60000,
      });
      const mktVs     = extractHidden(mktGetResp.data, '__VIEWSTATE');
      const mktVsg    = extractHidden(mktGetResp.data, '__VIEWSTATEGENERATOR');
      const mktEv     = extractHidden(mktGetResp.data, '__EVENTVALIDATION');
      const mktCookie = (mktGetResp.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');

      if (!mktVs) { console.warn(`AMIS 市場頁未取得 ViewState: ${marketUrl}`); continue; }

      // Phase 2b: 並行查詢每個目標品項的逐市場行情
      const marketResults = await Promise.all(
        wanted.map(async ({ code, name }) => {
          try {
            const mktBody = buildMarketPost({ vs: mktVs, vsg: mktVsg, ev: mktEv, today, productCode: code });
            const mktResp = await axios.post(marketUrl, mktBody, {
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent':   'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Cookie':       mktCookie,
                'Referer':      marketUrl,
              },
              timeout: 65000,
            });
            const items = parseAmisMarketHtml(mktResp.data, name, category);
            console.log(`AMIS ${name}(${code}) 取得 ${items.length} 個市場`);
            return items;
          } catch (e) {
            console.error(`AMIS 市場查詢失敗 ${code}:`, e.code, e.message, String(e));
            return [];
          }
        })
      );
      results.push(...marketResults.flat());

    } catch (err) {
      console.error(`AMIS ${category} 失敗:`, err.code, err.message, String(err));
    }
  }
  return results;
}

// 建立概覽頁 POST body
function buildOverviewPost({ vs, vsg, ev, today }) {
  return new URLSearchParams({
    '__EVENTTARGET': '', '__EVENTARGUMENT': '',
    '__VIEWSTATE': vs, '__VIEWSTATEGENERATOR': vsg, '__EVENTVALIDATION': ev,
    'ctl00$contentPlaceHolder$ucDateScope$rblDateScope':      'P',
    'ctl00$contentPlaceHolder$ucSolarLunar$radlSolarLunar':   'S',
    'ctl00$contentPlaceHolder$txtSTransDate':                  today,
    'ctl00$contentPlaceHolder$txtETransDate':                  today,
    'ctl00$contentPlaceHolder$hfldMarketNo':                   '',
    'ctl00$contentPlaceHolder$hfldProductNo':                  '',
    'ctl00$contentPlaceHolder$hfldProductType':                '',
    'ctl00$contentPlaceHolder$btnQuery':                       '查詢',
  }).toString();
}

// 建立市場比較頁 POST body（FruitMarketTransInfoCP / VegMarketTransInfoCP）
function buildMarketPost({ vs, vsg, ev, today, productCode }) {
  return new URLSearchParams({
    '__EVENTTARGET': '', '__EVENTARGUMENT': '',
    '__VIEWSTATE': vs, '__VIEWSTATEGENERATOR': vsg, '__EVENTVALIDATION': ev,
    'ctl00$contentPlaceHolder$ucDateScope$rblDateScope':      'P',
    'ctl00$contentPlaceHolder$ucSolarLunar$radlSolarLunar':   'S',
    'ctl00$contentPlaceHolder$ucDatePeriod$rblDatePeriod':    'D',
    'ctl00$contentPlaceHolder$txtCurrSTransDate':              today,
    'ctl00$contentPlaceHolder$txtCurrETransDate':              today,
    'ctl00$contentPlaceHolder$txtPrevSTransDate':              today,
    'ctl00$contentPlaceHolder$txtPrevETransDate':              today,
    'ctl00$contentPlaceHolder$hfldMarketNo':                   '',
    'ctl00$contentPlaceHolder$hfldProductNo':                  productCode,
    'ctl00$contentPlaceHolder$hfldProductType':                '',
    'ctl00$contentPlaceHolder$radlUnit':                       '1',
    'ctl00$contentPlaceHolder$btnQuery':                       '查詢',
  }).toString();
}

// 從概覽頁 HTML 解析所有產品代碼（如 P3 → 番石榴 帝王芭）
function parseProductCodes(html, today) {
  const trRegex = new RegExp('<tr[^>]*>([\\s\\S]*?)</tr>', 'gi');
  const tdRegex = new RegExp('<td[^>]*>([\\s\\S]*?)</td>', 'gi');
  const products = new Map();
  let trMatch;
  while ((trMatch = trRegex.exec(html)) !== null) {
    const cells = [];
    let tdMatch;
    const tdCopy = new RegExp(tdRegex.source, 'gi');
    while ((tdMatch = tdCopy.exec(trMatch[1])) !== null) {
      cells.push(tdMatch[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim());
    }
    if (cells.length < 8) continue;
    if (!cells[0].startsWith(today.slice(0, 7))) continue;
    const productRaw = cells[1].trim();
    const codeMatch  = productRaw.match(/^([A-Z][0-9]*) /);
    if (!codeMatch) continue;
    const code   = codeMatch[1];
    const name   = productRaw.replace(/^[A-Z][0-9]* /, '').trim();
    const volume = parseFloat((cells[7] || '0').replace(/,/g, '')) || 0;
    if (!products.has(code) || volume > (products.get(code).volume || 0)) {
      products.set(code, { code, name, volume });
    }
  }
  return Array.from(products.values());
}

// 解析市場比較頁（FruitMarketTransInfoCP）行情
// 欄位：代號 | 市場 | 本期平均價 | 上期平均價 | 價差 | 增減% | 本期交易量 | 上期交易量 | 量差 | 增減%
function parseAmisMarketHtml(html, productName, category) {
  const results = [];
  const trRegex = new RegExp('<tr[^>]*>([\\s\\S]*?)</tr>', 'gi');
  const tdRegex = new RegExp('<td[^>]*>([\\s\\S]*?)</td>', 'gi');
  const today   = getTodayRoc();
  let trMatch;
  while ((trMatch = trRegex.exec(html)) !== null) {
    const cells = [];
    let tdMatch;
    const tdCopy = new RegExp(tdRegex.source, 'gi');
    while ((tdMatch = tdCopy.exec(trMatch[1])) !== null) {
      cells.push(tdMatch[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim());
    }
    if (cells.length !== 10) continue;
    // 市場代號應為純數字
    const marketCode = cells[0].replace(/,/g, '').trim();
    if (!/^[0-9]+$/.test(marketCode)) continue;
    const marketName = cells[1].replace(/[　\s]+/g, '').trim();
    const avgPrice   = parseFloat(cells[2].replace(/,/g, '')) || 0;
    const volume     = parseFloat(cells[6].replace(/,/g, '')) || 0;
    if (!marketName || avgPrice <= 0) continue;
    results.push({
      name:       productName,
      market:     marketName,
      avgPrice,
      highPrice:  avgPrice,
      midPrice:   avgPrice,
      lowPrice:   avgPrice,
      volume,
      unit:       'kg',
      date:       today,
      category,
    });
  }
  return results;
}

// 從 HTML 中擷取隱藏欄位值
function extractHidden(html, name) {
  const m = html.match(new RegExp(`id="${name}"[^>]*value="([^"]*)"`));
  return m ? m[1] : null;
}

// ──────────────────────────────────────────
// 品名查詢：回傳所有市場資料陣列
// ──────────────────────────────────────────
async function getProductPrice(productName) {
  const allData = await fetchMarketData();
  const trimmed = productName.trim();
  const resolved = ALIASES[trimmed] || trimmed;

  let results = allData.filter(d => d.name === resolved);
  if (!results.length)
    results = allData.filter(d => d.name.includes(resolved) || resolved.includes(d.name));
  if (!results.length && resolved !== trimmed)
    results = allData.filter(d => d.name.includes(trimmed) || trimmed.includes(d.name));
  if (!results.length) return null;

  // 每市場取交易量最大的一筆
  const byMarket = {};
  for (const item of results) {
    if (!byMarket[item.market] || item.volume > byMarket[item.market].volume)
      byMarket[item.market] = item;
  }
  return Object.values(byMarket).sort((a, b) => b.volume - a.volume);
}

// ──────────────────────────────────────────
// 漲跌幅排行
// ──────────────────────────────────────────
async function getTopPrices(type = 'top') {
  const allData = await fetchMarketData();
  const byName  = {};
  for (const item of allData) {
    if (!byName[item.name] || item.volume > byName[item.name].volume)
      byName[item.name] = item;
  }
  const unique = Object.values(byName).filter(d => d.avgPrice > 0);
  return type === 'top'
    ? unique.sort((a, b) => b.avgPrice - a.avgPrice).slice(0, 5)
    : unique.sort((a, b) => a.avgPrice - b.avgPrice).slice(0, 5);
}

async function getAllProducts() {
  const allData = await fetchMarketData();
  return [...new Set(allData.map(d => d.name))].sort();
}
async function getAllMarkets() {
  const allData = await fetchMarketData();
  return [...new Set(allData.map(d => d.market))].sort();
}

// ──────────────────────────────────────────
// 工具函式
// ──────────────────────────────────────────
function getCategoryName(code) {
  const map = { 'N01': '蔬菜', 'N02': '蔬菜', 'N03': '蔬菜',
                'N04': '水果', 'N05': '水果', 'N06': '花卉', 'N07': '花卉' };
  return map[code] || '農產品';
}

function getTodayRoc() {
  const d = new Date();
  const roc = d.getFullYear() - 1911;
  return `${roc}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
}
function getTodayString() {
  const d = new Date();
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
}

// ──────────────────────────────────────────
// 備用資料（API 全部失效時）
// ──────────────────────────────────────────
function getFallbackData() {
  const today = getTodayString();
  return [
    { name: '香蕉',        market: '台北市場', avgPrice: 39.8, highPrice: 41.1, lowPrice: 38.2, volume: 1980,  unit: 'kg', date: today, category: '水果' },
    { name: '番石榴 珍珠芭', market: '台北二',   avgPrice: 19.2, highPrice: 28.0, lowPrice: 13.0, volume: 23405, unit: 'kg', date: today, category: '水果' },
    { name: '高麗菜',      market: '台北市場', avgPrice: 12.8, highPrice: 16.0, lowPrice:  9.5, volume: 95430, unit: 'kg', date: today, category: '蔬菜' },
    { name: '西瓜 大西瓜',  market: '台北二',   avgPrice:  8.5, highPrice: 10.0, lowPrice:  7.0, volume: 50000, unit: 'kg', date: today, category: '水果' },
    { name: '芒果',        market: '台北市場', avgPrice: 55.8, highPrice: 68.0, lowPrice: 44.0, volume: 19860, unit: 'kg', date: today, category: '水果' },
  ];
}

module.exports = { fetchMarketData, getProductPrice, getTopPrices, getAllProducts, getAllMarkets };
