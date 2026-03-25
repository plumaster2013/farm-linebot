// ============================================================
// 農產品批發市場行情查詢 LINE Bot - 主程式
// ============================================================
const express = require('express');
const line = require('@line/bot-sdk');
const cron = require('node-cron');
const { fetchMarketData, getProductPrice, getTopPrices, getAllProducts } = require('./marketApi');
const { buildPriceMessage, buildHelpMessage, buildTopMessage, buildFlexMessage } = require('./messageBuilder');
const cache = require('./cache');

const app = express();

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new line.Client(lineConfig);

// ── Webhook 路由 ─────────────────────────────────────────────
app.post('/webhook', line.middleware(lineConfig), async (req, res) => {
  try {
    const results = await Promise.all(req.body.events.map(handleEvent));
    res.json(results);
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).end();
  }
});

// ── 健康檢查 ─────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// ── 事件處理器 ───────────────────────────────────────────────
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return null;

  const userId = event.source.userId;
  const text = event.message.text.trim();

  console.log(`[${new Date().toLocaleString('zh-TW')}] User ${userId}: ${text}`);

  const replyToken = event.replyToken;
  const msg = await processCommand(text);

  return client.replyMessage(replyToken, msg);
}

// ── 指令解析器 ───────────────────────────────────────────────
async function processCommand(text) {
  const normalized = text.toLowerCase().replace(/\s+/g, '');

  if (['幫助', '說明', 'help', '?', '？'].includes(normalized)) {
    return buildHelpMessage();
  }

  if (normalized.includes('漲幅') || normalized.includes('跌幅') || normalized.includes('排行')) {
    const type = normalized.includes('跌') ? 'down' : 'up';
    const data = await getTopPrices(type);
    return buildTopMessage(data, type);
  }

  if (normalized.includes('全部') || normalized.includes('所有品項') || normalized === '品項') {
    const products = await getAllProducts();
    return buildProductListMessage(products);
  }

  const queryPatterns = [
    /^查(.+)$/,
    /^(.+)行情$/,
    /^(.+)價格?$/,
    /^(.+)多少$/,
    /^(.+)今天$/,
    /^(.+)今日$/,
  ];

  for (const pattern of queryPatterns) {
    const match = text.match(pattern);
    if (match) {
      const productName = match[1].trim();
      const data = await getProductPrice(productName);
      if (data) return buildFlexMessage(data);
      return {
        type: 'text',
        text: `❌ 查無「${productName}」的行情資料。\n\n請輸入「幫助」查看支援品項，或嘗試其他寫法（如：香蕉、蘋果、番茄）`,
      };
    }
  }

  const data = await getProductPrice(text);
  if (data) return buildFlexMessage(data);

  return buildHelpMessage();
}

function buildProductListMessage(products) {
  const list = products.map(p => `• ${p}`).join('\n');
  return {
    type: 'text',
    text: `📋 今日可查詢品項：\n\n${list}\n\n輸入品名即可查詢，例如：「香蕉」`,
  };
}

// ── 排程：每天早上 6:30 自動更新快取 ─────────────────────────
cron.schedule('30 6 * * *', async () => {
  console.log('[Cron] 開始更新農產品行情快取...');
  try {
    await fetchMarketData({ forceRefresh: true });
    console.log('[Cron] 快取更新完成');
  } catch (err) {
    console.error('[Cron] 更新失敗:', err);
  }
}, { timezone: 'Asia/Taipei' });

// ── 啟動伺服器 ───────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌱 農產品行情 LINE Bot 啟動於 port ${PORT}`);
});
