// ============================================================
// LINE 訊息格式建構器 - Flex Message 設計
// ============================================================

function buildFlexMessage(data) {
  const changeNum = parseFloat(data.change);
  const isUp = changeNum > 0;
  const isDown = changeNum < 0;
  const changeColor = isUp ? '#E53E3E' : isDown ? '#38A169' : '#718096';
  const changeIcon = isUp ? '▲' : isDown ? '▼' : '─';
  const changeText = data.change ? `${changeIcon} ${Math.abs(changeNum)}%` : '─ 無變動資料';
  const categoryEmoji = data.category === '水果' ? '🍎' : '🥦';
  const pricePerUnit = data.unit || 'kg';

  return {
    type: 'flex',
    altText: `${data.name} 今日行情：$${data.avgPrice}/${pricePerUnit}`,
    contents: {
      type: 'bubble', size: 'kilo',
      header: {
        type: 'box', layout: 'vertical',
        contents: [{
          type: 'box', layout: 'horizontal',
          contents: [
            { type: 'text', text: categoryEmoji, size: 'xl', flex: 0 },
            { type: 'box', layout: 'vertical', contents: [
              { type: 'text', text: data.name, weight: 'bold', size: 'xl', color: '#FFFFFF' },
              { type: 'text', text: `${data.market}批發市場`, size: 'sm', color: '#C6F6D5' },
            ]},
          ], spacing: 'sm',
        }],
        paddingAll: '20px', backgroundColor: '#276749', cornerRadius: 'lg',
      },
      body: {
        type: 'box', layout: 'vertical', spacing: 'md',
        contents: [
          { type: 'text', text: `📅 ${data.date} 今日行情`, size: 'sm', color: '#718096' },
          { type: 'box', layout: 'horizontal', paddingAll: '12px', backgroundColor: '#F0FFF4', cornerRadius: 'md',
            contents: [
              { type: 'text', text: '均　價', size: 'sm', color: '#718096', flex: 2 },
              { type: 'text', text: `$${data.avgPrice.toFixed(1)} / ${pricePerUnit}`, weight: 'bold', size: 'xl', color: '#276749', flex: 3, align: 'end' },
            ],
          },
          { type: 'box', layout: 'horizontal',
            contents: [
              { type: 'text', text: '較昨日', size: 'sm', color: '#718096', flex: 2 },
              { type: 'text', text: changeText, size: 'md', color: changeColor, weight: 'bold', flex: 3, align: 'end' },
            ],
          },
          { type: 'separator', color: '#E2E8F0' },
          { type: 'box', layout: 'horizontal', spacing: 'sm',
            contents: [
              { type: 'box', layout: 'vertical', flex: 1, paddingAll: '8px', backgroundColor: '#FFF5F5', cornerRadius: 'md',
                contents: [
                  { type: 'text', text: '最高價', size: 'xs', color: '#718096', align: 'center' },
                  { type: 'text', text: `$${data.highPrice.toFixed(1)}`, size: 'sm', weight: 'bold', color: '#E53E3E', align: 'center' },
                ],
              },
              { type: 'box', layout: 'vertical', flex: 1, paddingAll: '8px', backgroundColor: '#F0FFF4', cornerRadius: 'md',
                contents: [
                  { type: 'text', text: '最低價', size: 'xs', color: '#718096', align: 'center' },
                  { type: 'text', text: `$${data.lowPrice.toFixed(1)}`, size: 'sm', weight: 'bold', color: '#38A169', align: 'center' },
                ],
              },
              { type: 'box', layout: 'vertical', flex: 1, paddingAll: '8px', backgroundColor: '#EBF8FF', cornerRadius: 'md',
                contents: [
                  { type: 'text', text: '交易量', size: 'xs', color: '#718096', align: 'center' },
                  { type: 'text', text: `${(data.volume / 1000).toFixed(1)}噸`, size: 'sm', weight: 'bold', color: '#2B6CB0', align: 'center' },
                ],
              },
            ],
          },
        ], paddingAll: '16px',
      },
      footer: {
        type: 'box', layout: 'horizontal', spacing: 'sm', paddingAll: '12px',
        contents: [
          { type: 'button', action: { type: 'message', label: '漲幅排行', text: '漲幅排行' }, style: 'secondary', height: 'sm', flex: 1 },
          { type: 'button', action: { type: 'message', label: '查其他品項', text: '所有品項' }, style: 'primary', color: '#276749', height: 'sm', flex: 1 },
        ],
      },
    },
  };
}

function buildHelpMessage() {
  return {
    type: 'flex', altText: '農產品行情查詢幫助',
    contents: {
      type: 'bubble', size: 'kilo',
      body: {
        type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '16px',
        contents: [
          { type: 'text', text: '🌱 農產品行情查詢', weight: 'bold', size: 'lg' },
          { type: 'text', text: '您可以用以下方式查詢今日批發行情：', size: 'sm', color: '#718096', wrap: true },
          { type: 'box', layout: 'vertical', spacing: 'sm', contents: [
            buildCommandRow('香蕉', '直接輸入品名'),
            buildCommandRow('查 高麗菜', '加「查」字'),
            buildCommandRow('番茄行情', '加「行情」'),
            buildCommandRow('漲幅排行', '今日漲幅前5名'),
            buildCommandRow('跌幅排行', '今日跌幅前5名'),
            buildCommandRow('所有品項', '查詢可用品項列表'),
          ]},
        ],
      },
    },
  };
}

function buildCommandRow(cmd, desc) {
  return {
    type: 'box', layout: 'horizontal',
    contents: [
      { type: 'text', text: cmd, size: 'sm', weight: 'bold', color: '#276749', flex: 2 },
      { type: 'text', text: desc, size: 'sm', color: '#718096', flex: 3 },
    ],
  };
}

function buildTopMessage(data, type) {
  if (!data || data.length === 0) return { type: 'text', text: '目前無漲跌幅資料，請稍後再試' };
  const title = type === 'up' ? '🔴 今日漲幅排行' : '🟢 今日跌幅排行';
  const items = data.map((item, i) => {
    const changeNum = parseFloat(item.change);
    const color = type === 'up' ? '#E53E3E' : '#38A169';
    return {
      type: 'box', layout: 'horizontal', paddingBottom: '8px',
      contents: [
        { type: 'text', text: `${i + 1}`, size: 'sm', color: '#718096', flex: 1, weight: 'bold' },
        { type: 'text', text: item.name, size: 'sm', flex: 3 },
        { type: 'text', text: `$${item.avgPrice}`, size: 'sm', flex: 2, align: 'center' },
        { type: 'text', text: `${changeNum > 0 ? '+' : ''}${changeNum}%`, size: 'sm', color, weight: 'bold', flex: 2, align: 'end' },
      ],
    };
  });
  return {
    type: 'flex', altText: title,
    contents: {
      type: 'bubble', size: 'kilo',
      body: {
        type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '16px',
        contents: [
          { type: 'text', text: title, weight: 'bold', size: 'lg' },
          { type: 'box', layout: 'horizontal', paddingBottom: '8px',
            contents: [
              { type: 'text', text: '#', size: 'xs', color: '#A0AEC0', flex: 1 },
              { type: 'text', text: '品名', size: 'xs', color: '#A0AEC0', flex: 3 },
              { type: 'text', text: '均價', size: 'xs', color: '#A0AEC0', flex: 2, align: 'center' },
              { type: 'text', text: '漲跌%', size: 'xs', color: '#A0AEC0', flex: 2, align: 'end' },
            ],
          },
          ...items,
        ],
      },
    },
  };
}

module.exports = { buildFlexMessage, buildHelpMessage, buildTopMessage };
