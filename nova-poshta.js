exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  const apiKey = process.env.NP_API_KEY;
  if (!apiKey) return { statusCode: 503, headers, body: JSON.stringify({ error: 'Nova Poshta API is not configured' }) };
  const q = String(event.queryStringParameters?.q || '').trim().slice(0, 100);
  const type = event.queryStringParameters?.type;
  const cityRef = String(event.queryStringParameters?.cityRef || '').trim();
  if (q.length < (type === 'cities' ? 2 : 1)) return { statusCode: 200, headers, body: JSON.stringify({ items: [] }) };
  let modelName, calledMethod, methodProperties;
  if (type === 'cities') {
    modelName = 'Address'; calledMethod = 'getCities';
    methodProperties = { FindByString: q, Limit: 20, Page: 1 };
  } else if (type === 'warehouses' && /^[0-9a-f-]{20,}$/i.test(cityRef)) {
    modelName = 'AddressGeneral'; calledMethod = 'getWarehouses';
    methodProperties = { CityRef: cityRef, FindByString: q, Limit: 50, Page: 1 };
  } else {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid search parameters' }) };
  }
  try {
    const response = await fetch('https://api.novaposhta.ua/v2.0/json/', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, modelName, calledMethod, methodProperties })
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error('Nova Poshta HTTP error:', response.status, body.slice(0, 1000));
      throw new Error(`Nova Poshta HTTP ${response.status}`);
    }
    const result = await response.json();
    if (!result.success) {
      console.error('Nova Poshta API rejected request:', JSON.stringify({ errors: result.errors || [], warnings: result.warnings || [], info: result.info || [] }).slice(0, 3000));
      throw new Error('Nova Poshta API rejected request');
    }
    const items = (result.data || []).slice(0, 50).map(x => {
      if (type === 'cities') return { ref: x.Ref, title: x.Description, subtitle: x.AreaDescription || x.Region || '' };
      const title = x.Description || x.DescriptionRu || `Отделение №${x.Number || ''}`;
      const address = x.ShortAddress || x.ShortAddressRu || x.CityDescription || '';
      return { ref: x.Ref, title, subtitle: [x.Number ? `№${x.Number}` : '', address].filter(Boolean).join(' · ') };
    }).filter(x => x.ref && x.title);
    return { statusCode: 200, headers, body: JSON.stringify({ items }) };
  } catch (error) {
    console.error('nova-poshta function failed:', error && error.message ? error.message : 'Unknown error');
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Не удалось получить данные Новой почты. Проверьте журналы функции nova-poshta в Netlify.' }) };
  }
};
