exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { statusCode: 503, headers, body: JSON.stringify({ error: 'Настройте Telegram для приёма заказов' }) };
  try {
    const data = JSON.parse(event.body || '{}');
    const c = data.customer || {};
    if (!c.name || !c.phone || !c.city || !c.delivery || !c.branch || !Array.isArray(data.items) || !data.items.length || data.consent !== true) throw new Error('Invalid order');
    const safe = (v) => String(v ?? '').replace(/[<>]/g, '').slice(0, 300);
    const lines = data.items.slice(0, 40).map(i => `• ${safe(i.name)} [${safe(i.sku)}] × ${Math.max(1, Math.min(99, Number(i.quantity) || 1))} — ${Number(i.price).toFixed(2)} грн`);
    const total = data.items.slice(0,40).reduce((s,i)=>s + Math.max(0,Number(i.price)||0) * Math.max(1,Math.min(99,Number(i.quantity)||1)),0);
    const message = [ '<b>Новый заказ — ТехноМаркет</b>', '', ...lines, '', `<b>Итого по каталогу: ${total.toFixed(2)} грн</b>`, '', `<b>Имя:</b> ${safe(c.name)}`, `<b>Телефон:</b> ${safe(c.phone)}`, `<b>Город:</b> ${safe(c.city)}`, `<b>Доставка:</b> ${safe(c.delivery)}`, `<b>Отделение/адрес:</b> ${safe(c.branch)}`, `<b>Оплата:</b> ${safe(c.payment)}` ].join('\n');
    const tg = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }) });
    if (!tg.ok) throw new Error('Telegram send failed');
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Не удалось обработать заказ' }) };
  }
};
