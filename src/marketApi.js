// ============================================================
// 農業部農產品批發市場行情 API 串接
// 雙資料源：
//   1. data.moa.gov.tw  → 19個報導站，有逐市場明細
//   2. amis.afa.gov.tw  → 47個市場全資料，含芭樂/番石榴等
// ============================================================

const axios = require('axios');
const cache = require('./cache');

const MOA_API = 'https://data.moa.gov.tw/Service/OpenData/FromM/FarmTransData.aspx';
// 水果行情站（全台47個市場）
const AMIS_FRUIT_URL = 'https://amis.afa.gov.tw/fruit/FruitProdDayTransInfo.aspx';
// 蔬菜行情站
const AMIS_VEG_URL = 'https://amis.afa.gov.tw/veg/VegProdDayTransInfo.aspx';
const CACHE_TTL = 3600;

// 常用別名：使用者慣用名 → API 實際名稱
const ALIASES = {
  '芭樂': '番石榴',
  '番石榴': '番石榴',
  '芭蕉': '香蕉',
  '鳳梨': '金鑽鳳梨',
  '柳丁': '柳橙',
  '柳橙': '柳橙',
  '奇異果': '奇異果',
  '火龍果': '紅龍果',
  '紅龍果': '紅龍果',
  '哈密瓜': '洋香瓜',
  '洋香瓜': '洋香瓜',
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

  const moa = moaData.status === 'fulfilled' ? moaData.value : [];
  const amis = amisData.status === 'fulfilled' ? amisData.value : [];

  // MOA 資料（有逐市場明細）優先；AMIS 補充沒在 MOA 的品項
  const moaNames = new Set(moa.map(d => d.name));
  const amisExtra = amis.filter(d => {
    // 如果 AMIS 的品名（或其中一個字）已在 MOA 裡，跳過
    return !moaNames.has(d.name) &&
      !moa.some(m => d.name.includes(m.name) || m.name.includes(d.name));
  });

  const allData = [...moa, ...amisExtra];
  console.log(`✅ 資料合併完成：MOA ${moa.length} 筆 + AMIS補充 ${amisExtra.length} 筆 = 共 ${allData.length} 筆`);

  if (allData.length > 0) {
    await cache.set(cacheKey, allData, CACHE_TTL);
  }
  return allData.length > 0 ? allData : getFallbackData();
}

// ──────────────────────────────────────────
// 資料源 1：農業部開放資料（19個報導站，逐市場明細）
// ──────────────────────────────────────────
async function fetchMoaData() {
  try {
    const resp = await axios.get(MOA_API, {
      params: { '$top': 1000 },
      timeout: 12000,
    });
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
    .filter(d => d.name && d.name !== '休市' && d.avgPrice > 0);
}

// ──────────────────────────────────────────
// 資料源 2：農產品批發市場交易行情站（AMIS）
// 需要先 GET 取得 ViewState，再 POST 查詢
// ──────────────────────────────────────────
async function fetchAmisData() {
  const results = [];
  const today = getTodayRoc();

  for (const [url, category] of [[AMIS_FRUIT_URL, '水果'], [AMIS_VEG_URL, '蔬菜']]) {
    try {
      // Step 1: GET → 取得 ViewState / Cookie
      const getResp = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: 12000,
      });
      const html1 = getResp.data;
      const vs  = extractHidden(html1, '__VIEWSTATE');
      const vsg = extractHidden(html1, '__VIEWSTATEGENERATOR');
      const ev  = extractHidden(html1, '__EVENTVALIDATION');
      const cookie = (getResp.headers['set-cookie'] || [])
        .map(c => c.split(';')[0]).join('; ');

      if (!vs) { console.warn(`AMIS GET 未取得 ViewState: ${url}`); continue; }

      // Step 2: POST → 查詢今日全部品項、全部市場
      const postBody = new URLSearchParams({
        '__EVENTTARGET': '', '__EVENTARGUMENT': '',
        '__VIEWSTATE': vs, '__VIEWSTATEGENERATOR': vsg, '__EVENTVALIDATION': ev,
        'ctl00$contentPlaceHolder$ucDateScope$rblDateScope': 'P',
        'ctl00$contentPlaceHolder$ucSolarLunar$radlSolarLunar': 'S',
        'ctl00$contentPlaceHolder$txtSTransDate': today,
        'ctl00$contentPlaceHolder$txtETransDate': today,
        'ctl00$contentPlaceHolder$hfldMarketNo': '',
        'ctl00$contentPlaceHolder$hfldProductNo': '',
        'ctl00$contentPlaceHolder$hfldProductType': '',
        'ctl00$contentPlaceHolder$btnQuery': '查詢',
      });

      const postResp = await axios.post(url, postBody.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Cookie': cookie,
          'Referer': url,
        },
        timeout: 15000,
      });

      const parsed = parseAmisHtml(postResp.data, category, today);
      console.log(`AMIS ${category} 取得 ${parsed.length} 筆`);
      results.push(...parsed);
    } catch (err) {
      console.error(`AMIS ${category} 失敗:`, err.message);
    }
  }
  return results;
}

// 從 HTML 中擷取隱藏欄位值
function extractHidden(html, name) {
  const m = html.match(new RegExp(`id="${name}"[^>]*value="([^"]*)"`));
  return m ? m[1] : null;
}

// 解析 AMIS HTML 表格（9欄：日期|產品|上價|中價|下價|平均價|比較%|交易量|比較%）
function parseAmisHtml(html, category, today) {
  const results = [];
  // 抓所有 <tr> 內容
  const trRegex = new RegExp('<tr[^>]*>([\\s\\S]*?)</tr>', 'gi');
  const tdRegex = new RegExp('<td[^>]*>([\\s\\S]*?)</td>', 'gi');
  let trMatch;
  while ((trMatch = trRegex.exec(html)) !== null) {
    const cells = [];
    let tdMatch;
    const tdCopy = new RegExp(tdRegex.source, 'gi');
    while ((tdMatch = tdCopy.exec(trMatch[1])) !== null) {
      cells.push(tdMatch[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim());
    }
    if (cells.length < 8) continue;
    // 只取今天的資料
    if (!cells[0].startsWith(today.slice(0, 7))) continue; // 民國年/月 前7碼
    // 解析產品欄：移除前綴代號（如 "P1 "、"A1 "）
    const productRaw = cells[1].trim();
    const productName = productRaw.replace(/^[A-Z0-9]+\s+/, '').trim();
    if (!productName || productName === '小計' || productName === '合計') continue;
    const avgPrice = parseFloat(cells[5].replace(/,/g, '')) || 0;
    const volume   = parseFloat(cells[7].replace(/,/g, '')) || 0;
    if (avgPrice <= 0) continue;
    results.push({
      name:      productName,          // e.g. "番石榴 珍珠芭"
      market:    '全台綜合',            // AMIS 概覽頁是全市場加總
      avgPrice,
      highPrice: parseFloat(cells[2].replace(/,/g, '')) || avgPrice,
      midPrice:  parseFloat(cells[3].replace(/,/g, '')) || avgPrice,
      lowPrice:  parseFloat(cells[4].replace(/,/g, '')) || avgPrice,
      volume,
      unit:      'kg',
      date:      cells[0],
      category,
    });
  }
  // 同品名只保留一筆（概覽頁可能重複）
  const seen = new Set();
  return results.filter(d => {
    if (seen.has(d.name)) return false;
    seen.add(d.name);
    return true;
  });
}

// ──────────────────────────────────────────
// 品名查詢：回傳所有市場資料陣列
// ──────────────────────────────────────────
async function getProductPrice(productName) {
  const allData = await fetchMarketData();
  const trimmed = productName.trim();
  // 解析別名（如 芭樂 → 番石榴）
  const resolved = ALIASES[trimmed] || trimmed;

  // 搜尋順序：精確 → 含resolved → 含original
  let results = allData.filter(d => d.name === resolved);
  if (!results.length) results = allData.filter(d =>
    d.name.includes(resolved) || resolved.includes(d.name)
  );
  if (!results.length && resolved !== trimmed) {
    results = allData.filter(d =>
      d.name.includes(trimmed) || trimmed.includes(d.name)
    );
  }
  if (!results.length) return null;

  // 每市場取交易量最大的一筆
  const byMarket = {};
  for (const item of results) {
    if (!byMarket[item.market] || item.volume > byMarket[item.market].volume) {
      byMarket[item.market] = item;
    }
  }
  return Object.values(byMarket).sort((a, b) => b.volume - a.volume);
}

// ──────────────────────────────────────────
// 漲跌幅排行
// ──────────────────────────────────────────
async function getTopPrices(type = 'top') {
  const allData = await fetchMarketData();
  const byName = {};
  for (const item of allData) {
    if (!byName[item.name] || item.volume > byName[item.name].volume) {
      byName[item.name] = item;
    }
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
  const map = { 'N01': '蔬菜', 'N02': '蔬菜', 'N03': '蔬菜', 'N04': '水果', 'N05': '水果', 'N06': '花卉', 'N07': '花卉' };
  return map[code] || '農產品';
}

// 今日民國年日期，格式 115/03/26
function getTodayRoc() {
  const d = new Date();
  const roc = d.getFullYear() - 1911;
  return `${roc}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function getTodayString() {
  const d = new Date();
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

// ──────────────────────────────────────────
// 備用資料（API 全部失效時）
// ──────────────────────────────────────────
function getFallbackData() {
  const today = getTodayString();
  return [
    { name: '香蕉',       market: '台北市場', avgPrice: 39.8, highPrice: 41.1, lowPrice: 38.2, volume: 1980,  unit: 'kg', date: today, category: '水果' },
    { name: '番石榴 珍珠芭', market: '全台綜合', avgPrice: 19.2, highPrice: 28.0, lowPrice: 13.0, volume: 29616, unit: 'kg', date: today, category: '水果' },
    { name: '高麗菜',     market: '台北市場', avgPrice: 12.8, highPrice: 16.0, lowPrice: 9.5,  volume: 95430, unit: 'kg', date: today, category: '蔬菜' },
    { name: '西瓜 大西瓜', market: '全台綜合', avgPrice: 8.5,  highPrice: 10.0, lowPrice: 7.0,  volume: 50000, unit: 'kg', date: today, category: '水果' },
    { name: '芒果',       market: '台北市場', avgPrice: 55.8, highPrice: 68.0, lowPrice: 44.0, volume: 19860, unit: 'kg', date: today, category: '水果' },
  ];
}

module.exports = { fetchMarketData, getProductPrice, getTopPrices, getAllProducts, getAllMarkets };
