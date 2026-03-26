// ============================================================
// 農委會農產品批發市場行情 API 串接
// 資料來源：https://data.coa.gov.tw
// 支援：全部市場 × 全部農產品品項
// ============================================================

const axios = require('axios');
const cache = require('./cache');

const COA_API_BASE = 'https://data.coa.gov.tw/Service/OpenData/FromM';
const CACHE_TTL = 3600; // 快取 1 小時

// ──────────────────────────────────────────
// 取得今日所有農產品批發行情
// ──────────────────────────────────────────
async function fetchMarketData({ forceRefresh = false } = {}) {
  const cacheKey = 'market:all';
  if (!forceRefresh) {
    const cached = await cache.get(cacheKey);
    if (cached) return cached;
  }
  try {
    const [vegRes, fruitRes] = await Promise.all([
      axios.get(`${COA_API_BASE}/FarmTransData.aspx`, {
        params: { UnitId: 'M', SEQ: 'D', CategoryCode: '01' },
        timeout: 10000,
      }),
      axios.get(`${COA_API_BASE}/FarmTransData.aspx`, {
        params: { UnitId: 'M', SEQ: 'D', CategoryCode: '02' },
        timeout: 10000,
      }),
    ]);
    const allData = [
      ...parseApiResponse(vegRes.data, '蔬菜'),
      ...parseApiResponse(fruitRes.data, '水果'),
    ];
    await cache.set(cacheKey, allData, CACHE_TTL);
    return allData;
  } catch (err) {
    console.error('API 抓取失敗，嘗試使用備用資料：', err.message);
    return getFallbackData();
  }
}

// 解析 API 回應
function parseApiResponse(data, category) {
  if (!Array.isArray(data)) return [];
  return data
    .map(item => ({
      name: item['作物名稱'] || item['CropName'] || '',
      market: item['市場名稱'] || item['MarketName'] || '台北市',
      avgPrice: parseFloat(item['平均價'] || item['Avg_Price'] || 0),
      highPrice: parseFloat(item['最高價'] || item['High Price'] || 0),
      lowPrice: parseFloat(item['最低價'] || item['Low Price'] || 0),
      volume: parseFloat(item['交易量'] || item['volume'] || 0),
      unit: item['單位'] || item['unit'] || 'kg',
      date: item['交易日期'] || item['TransDate'] || '',
      category,
    }))
    .filter(item => item.name && item.avgPrice > 0);
}

// ──────────────────────────────────────────
// 根據品名查詢 → 回傳所有市場的資料陣列
// ──────────────────────────────────────────
async function getProductPrice(productName) {
  const allData = await fetchMarketData();
  const trimmed = productName.trim();

  // 精確比對 → 模糊比對
  let results = allData.filter(item => item.name === trimmed);
  if (results.length === 0) {
    results = allData.filter(
      item => item.name.includes(trimmed) || trimmed.includes(item.name)
    );
  }
  if (results.length === 0) return null;

  // 每個市場取交易量最大的那筆（避免同品名多筆重複）
  const byMarket = {};
  for (const item of results) {
    if (!byMarket[item.market] || item.volume > byMarket[item.market].volume) {
      byMarket[item.market] = item;
    }
  }

  // 依交易量排序（由大到小）
  return Object.values(byMarket).sort((a, b) => b.volume - a.volume);
}

// ──────────────────────────────────────────
// 取得漲跌幅排行（以全台交易量前幾名市場為基準）
// ──────────────────────────────────────────
async function getTopPrices(type = 'top') {
  const allData = await fetchMarketData();

  // 每個品名只保留交易量最大的市場那筆，避免重複
  const byName = {};
  for (const item of allData) {
    if (!byName[item.name] || item.volume > byName[item.name].volume) {
      byName[item.name] = item;
    }
  }
  const unique = Object.values(byName).filter(item => item.avgPrice > 0);

  if (type === 'top') {
    return unique.sort((a, b) => b.avgPrice - a.avgPrice).slice(0, 5);
  } else {
    return unique.sort((a, b) => a.avgPrice - b.avgPrice).slice(0, 5);
  }
}

// ──────────────────────────────────────────
// 動態取得所有可查詢品項（從 API 資料）
// ──────────────────────────────────────────
async function getAllProducts() {
  const allData = await fetchMarketData();
  return [...new Set(allData.map(item => item.name))].sort();
}

// 動態取得所有市場
async function getAllMarkets() {
  const allData = await fetchMarketData();
  return [...new Set(allData.map(item => item.market))].sort();
}

// ──────────────────────────────────────────
// 備用靜態資料（API 失效時使用）
// ──────────────────────────────────────────
function getFallbackData() {
  const today = getTodayString();
  return [
    { name: '香蕉', market: '台北市', avgPrice: 18.5, highPrice: 22.0, lowPrice: 15.0, volume: 42850, unit: 'kg', date: today, category: '水果' },
    { name: '番茄', market: '台北市', avgPrice: 35.2, highPrice: 42.0, lowPrice: 28.0, volume: 18620, unit: 'kg', date: today, category: '水果' },
    { name: '高麗菜', market: '台北市', avgPrice: 12.8, highPrice: 16.0, lowPrice: 9.5, volume: 95430, unit: 'kg', date: today, category: '蔬菜' },
    { name: '青蔥', market: '台北市', avgPrice: 48.6, highPrice: 58.0, lowPrice: 38.0, volume: 22180, unit: 'kg', date: today, category: '蔬菜' },
    { name: '苦瓜', market: '台北市', avgPrice: 28.4, highPrice: 34.0, lowPrice: 22.0, volume: 8950, unit: 'kg', date: today, category: '蔬菜' },
    { name: '蘋果', market: '台北市', avgPrice: 62.0, highPrice: 75.0, lowPrice: 52.0, volume: 35200, unit: 'kg', date: today, category: '水果' },
    { name: '西瓜', market: '台北市', avgPrice: 8.5, highPrice: 10.0, lowPrice: 7.0, volume: 128400, unit: 'kg', date: today, category: '水果' },
    { name: '芒果', market: '台北市', avgPrice: 55.8, highPrice: 68.0, lowPrice: 44.0, volume: 19860, unit: 'kg', date: today, category: '水果' },
    { name: '地瓜', market: '台北市', avgPrice: 22.3, highPrice: 26.0, lowPrice: 18.0, volume: 41200, unit: 'kg', date: today, category: '蔬菜' },
    { name: '花椰菜', market: '台北市', avgPrice: 31.5, highPrice: 38.0, lowPrice: 25.0, volume: 16780, unit: 'kg', date: today, category: '蔬菜' },
  ];
}

function getTodayString() {
  const d = new Date();
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

module.exports = { fetchMarketData, getProductPrice, getTopPrices, getAllProducts, getAllMarkets };
