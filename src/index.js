// ============================================================
// 農產品批發行情 LINE Bot — 主程式
// 支援：全台市場 × 全部農產品品項
// ============================================================

const express = require('express');
const line = require('@line/bot-sdk');
const { fetchMarketData, getProductPrice, getTopPrices, getAllProducts, getAllMarkets } = require('./marketApi');
const { buildFlexMessage, buildHelpMessage, buildTopMessage } = require('./messageBuilder');
const cron = require('node-cron');

const config = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
};

const client = new line.Client(config);
const app = express();

// ──────────────────────────────────────────
// Webhook 路由
// ──────────────────────────────────────────
app.post('/webhook', line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then(() => res.json({ status: 'ok' }))
    .catch(err => {
      console.error('Webhook error:', err);
      res.status(500).json({ error: err.message });
    });
});

// 健康檢查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ──────────────────────────────────────────
// 事件處理
// ──────────────────────────────────────────
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return;

  const text = event.message.text.trim();
  console.log(`[訊息] ${text}`);

  try {
    const reply = await processCommand(text);
    if (reply) {
      await client.replyMessage(event.replyToken, reply);
    }
  } catch (err) {
    console.error('processCommand error:', err);
    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: '抱歉，查詢時發生錯誤，請稍後再試。',
    });
  }
}

// ──────────────────────────────────────────
// 指令解析
// ──────────────────────────────────────────
async function processCommand(text) {
  const t = text.trim();

  // ── 漲幅排行
  if (/漲幅|漲價|最貴|最高/.test(t)) {
    const items = await getTopPrices('top');
    return buildTopMessage('今日均價最高 TOP 5', items, true);
  }

  // ── 跌幅排行
  if (/跌幅|跌價|最便宜|最低/.test(t)) {
    const items = await getTopPrices('bottom');
    return buildTopMessage('今日均價最低 TOP 5', items, false);
  }

  // ── 所有品項清單
  if (/所有品項|全部品項|品項列表|有哪些|查什麼/.test(t)) {
    const products = await getAllProducts();
    const markets = await getAllMarkets();
    const productText = products.join('　');
    return {
      type: 'text',
      text: `📋 今日可查詢品項（共 ${products.length} 項）：\n${productText}\n\n🏪 今日有資料的市場（共 ${markets.length} 個）：\n${markets.join('　')}`,
    };
  }

  // ── 說明 / 幫助
  if (/說明|幫助|help|使用方法|怎麼用/.test(t)) {
    const products = await getAllProducts();
    return buildHelpMessage(products);
  }

  // ── 品項查詢：「查 XXX」、「XXX 行情」、或直接輸入品名
  let productName = t;
  productName = productName.replace(/^查\s*/, '');
  productName = productName.replace(/\s*行情$/, '');
  productName = productName.replace(/\s*價格$/, '');
  productName = productName.replace(/\s*批發$/, '');
  productName = productName.trim();

  if (productName.length >= 1) {
    const results = await getProductPrice(productName);
    return buildFlexMessage(productName, results);
  }

  // ── 預設說明
  const products = await getAllProducts();
  return buildHelpMessage(products);
}

// ──────────────────────────────────────────
// 每天早上 6:30 自動刷新行情快取
// ──────────────────────────────────────────
cron.schedule('30 6 * * *', async () => {
  console.log('🔄 定時刷新農產品行情快取...');
  try {
    await fetchMarketData({ forceRefresh: true });
    console.log('✅ 行情快取刷新完成');
  } catch (err) {
    console.error('快取刷新失敗：', err.message);
  }
}, { timezone: 'Asia/Taipei' });

// ──────────────────────────────────────────
// 啟動伺服器
// ──────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌾 農產品行情 LINE Bot 啟動於 port ${PORT}`);
  console.log(`   支援：全台市場 × 全部農產品品項`);
  // 啟動時預先載入資料
  fetchMarketData().then(data => {
    console.log(`✅ 行情資料載入完成，共 ${data.length} 筆`);
  }).catch(err => {
    console.warn('⚠️ 初始資料載入失敗，將使用備用資料：', err.message);
  });
});
