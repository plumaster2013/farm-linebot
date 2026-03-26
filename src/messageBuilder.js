// ============================================================
// LINE Flex Message 建構器
// 支援：多市場行情顯示
// ============================================================

// ──────────────────────────────────────────
// 單一品項行情（多市場版）
// ──────────────────────────────────────────
function buildFlexMessage(productName, results) {
  if (!results || results.length === 0) {
    return {
      type: 'text',
      text: `找不到「${productName}」的行情資料。\n\n可能原因：\n• 品名有誤（請輸入中文名稱）\n• 今日無此品項交易\n\n輸入「所有品項」查看今日可查詢清單。`,
    };
  }

  const date = results[0].date || '';
  const category = results[0].category || '';

  // 依交易量排序（已在 API 層排序，這裡再確保一次）
  const sorted = [...results].sort((a, b) => b.volume - a.volume);

  const marketRows = sorted.map(item => ({
    type: 'box',
    layout: 'horizontal',
    contents: [
      {
        type: 'text',
        text: item.market,
        size: 'sm',
        color: '#444444',
        flex: 4,
      },
      {
        type: 'text',
        text: `$${item.avgPrice.toFixed(1)}`,
        size: 'sm',
        color: '#1a7a34',
        flex: 3,
        align: 'end',
        weight: 'bold',
      },
      {
        type: 'text',
        text: `${item.lowPrice.toFixed(1)}~${item.highPrice.toFixed(1)}`,
        size: 'xs',
        color: '#888888',
        flex: 4,
        align: 'end',
      },
      {
        type: 'text',
        text: item.volume >= 1000
          ? `${(item.volume / 1000).toFixed(1)}t`
          : `${item.volume}kg`,
        size: 'xs',
        color: '#aaaaaa',
        flex: 3,
        align: 'end',
      },
    ],
    margin: 'sm',
    paddingStart: '4px',
    paddingEnd: '4px',
  }));

  return {
    type: 'flex',
    altText: `${productName} 今日批發行情（${sorted.length} 市場）`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: `🌾 農產品批發行情　${category}`,
            size: 'xs',
            color: '#ffffffaa',
          },
          {
            type: 'text',
            text: productName,
            size: 'xxl',
            color: '#ffffff',
            weight: 'bold',
          },
          {
            type: 'text',
            text: date ? `📅 ${date}　共 ${sorted.length} 個市場` : `共 ${sorted.length} 個市場`,
            size: 'xs',
            color: '#ffffffcc',
            margin: 'sm',
          },
        ],
        backgroundColor: '#2e7d32',
        paddingAll: '16px',
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          // 欄位標題列
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: '市場', size: 'xs', color: '#999999', flex: 4 },
              { type: 'text', text: '均價(元/kg)', size: 'xs', color: '#999999', flex: 3, align: 'end' },
              { type: 'text', text: '最低~最高', size: 'xs', color: '#999999', flex: 4, align: 'end' },
              { type: 'text', text: '交易量', size: 'xs', color: '#999999', flex: 3, align: 'end' },
            ],
            paddingStart: '4px',
            paddingEnd: '4px',
          },
          { type: 'separator', margin: 'sm' },
          ...marketRows,
        ],
        paddingAll: '16px',
        spacing: 'none',
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '資料來源：農業部農產品批發市場交易行情站',
            size: 'xs',
            color: '#aaaaaa',
            align: 'center',
            wrap: true,
          },
        ],
        paddingAll: '8px',
      },
    },
  };
}

// ──────────────────────────────────────────
// 說明訊息（含動態品項清單）
// ──────────────────────────────────────────
function buildHelpMessage(products) {
  const total = products ? products.length : 0;
  const preview = products
    ? products.slice(0, 20).join('、') + (total > 20 ? `⋯` : '')
    : '香蕉、番茄⋯';

  return {
    type: 'flex',
    altText: '農產品行情查詢說明',
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '🌾 農產品行情查詢',
            size: 'lg',
            weight: 'bold',
            color: '#2e7d32',
          },
          {
            type: 'text',
            text: '可查詢全台各市場今日批發行情',
            size: 'sm',
            color: '#666666',
            margin: 'xs',
          },
          { type: 'separator', margin: 'md' },
          buildCommandRow('直接輸入品名', '香蕉　→ 顯示全台市場行情', '#2e7d32'),
          buildCommandRow('查 [品名]', '查高麗菜', '#2e7d32'),
          buildCommandRow('[品名] 行情', '番茄行情', '#2e7d32'),
          buildCommandRow('漲幅排行', '今日均價最高前5名', '#e65100'),
          buildCommandRow('跌幅排行', '今日均價最低前5名', '#1565c0'),
          buildCommandRow('所有品項', `查詢今日${total > 0 ? total + '項' : '全部'}可用品項`, '#555555'),
          { type: 'separator', margin: 'md' },
          {
            type: 'text',
            text: `📋 今日部分品項：\n${preview}`,
            size: 'xs',
            color: '#888888',
            margin: 'sm',
            wrap: true,
          },
        ],
        paddingAll: '16px',
      },
    },
  };
}

// ──────────────────────────────────────────
// 漲跌幅排行
// ──────────────────────────────────────────
function buildTopMessage(title, items, isTop = true) {
  const color = isTop ? '#c62828' : '#1565c0';
  const bgColor = isTop ? '#c62828' : '#1565c0';
  const icon = isTop ? '📈' : '📉';

  const rows = items.map((item, idx) => ({
    type: 'box',
    layout: 'horizontal',
    contents: [
      {
        type: 'text',
        text: `${idx + 1}`,
        size: 'sm',
        color: '#aaaaaa',
        flex: 1,
        align: 'center',
      },
      {
        type: 'text',
        text: item.name,
        size: 'sm',
        color: '#222222',
        flex: 5,
        weight: 'bold',
      },
      {
        type: 'text',
        text: item.market || '',
        size: 'xs',
        color: '#888888',
        flex: 4,
      },
      {
        type: 'text',
        text: `$${item.avgPrice.toFixed(1)}`,
        size: 'sm',
        color,
        flex: 3,
        align: 'end',
        weight: 'bold',
      },
    ],
    margin: 'sm',
  }));

  return {
    type: 'flex',
    altText: `${icon} ${title}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: `${icon} ${title}`,
            size: 'lg',
            color: '#ffffff',
            weight: 'bold',
          },
          {
            type: 'text',
            text: '全台各市場最具代表性品項',
            size: 'xs',
            color: '#ffffffaa',
          },
        ],
        backgroundColor: bgColor,
        paddingAll: '16px',
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: '#', size: 'xs', color: '#aaaaaa', flex: 1, align: 'center' },
              { type: 'text', text: '品名', size: 'xs', color: '#aaaaaa', flex: 5 },
              { type: 'text', text: '市場', size: 'xs', color: '#aaaaaa', flex: 4 },
              { type: 'text', text: '均價', size: 'xs', color: '#aaaaaa', flex: 3, align: 'end' },
            ],
          },
          { type: 'separator', margin: 'sm' },
          ...rows,
        ],
        paddingAll: '16px',
      },
    },
  };
}

// 指令說明列
function buildCommandRow(cmd, desc, color) {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: cmd, size: 'sm', color, flex: 4, weight: 'bold' },
      { type: 'text', text: desc, size: 'sm', color: '#555555', flex: 8, wrap: true },
    ],
    margin: 'sm',
  };
}

module.exports = { buildFlexMessage, buildHelpMessage, buildTopMessage, buildCommandRow };
