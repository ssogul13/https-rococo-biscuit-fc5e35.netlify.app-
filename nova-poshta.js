
exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };

  const reply = (statusCode, data) => ({
    statusCode,
    headers,
    body: JSON.stringify(data)
  });

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return reply(405, { error: 'Method not allowed' });
  }

  const apiKey = process.env.NP_API_KEY;

  if (!apiKey || !apiKey.trim()) {
    console.error('NP_DIAG: API key is missing');
    return reply(503, {
      error: 'Ключ Новой почты не найден в настройках Netlify',
      code: 'MISSING_API_KEY'
    });
  }

  const q = String(event.queryStringParameters?.q || '')
    .trim().slice(0, 100);

  const type = event.queryStringParameters?.type;
  const cityRef = String(
    event.queryStringParameters?.cityRef || ''
  ).trim();

  if (q.length < (type === 'cities' ? 2 : 1)) {
    return reply(200, { items: [] });
  }

  let modelName;
  let calledMethod;
  let methodProperties;

  if (type === 'cities') {
    modelName = 'Address';
    calledMethod = 'getCities';
    methodProperties = {
      FindByString: q,
      Limit: 20,
      Page: 1
    };
  } else if (
    type === 'warehouses' &&
    /^[0-9a-f-]{20,}$/i.test(cityRef)
  ) {
    modelName = 'AddressGeneral';
    calledMethod = 'getWarehouses';
    methodProperties = {
      CityRef: cityRef,
      FindByString: q,
      Limit: 50,
      Page: 1
    };
  } else {
    return reply(400, {
      error: 'Неверные параметры поиска',
      code: 'INVALID_PARAMETERS'
    });
  }

  try {
    const response = await fetch(
      'https://api.novaposhta.ua/v2.0/json/',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          apiKey,
          modelName,
          calledMethod,
          methodProperties
        })
      }
    );

    const raw = await response.text();

    let result;
    try {
      result = JSON.parse(raw);
    } catch {
      console.error('NP_DIAG: Invalid JSON, HTTP', response.status);
      return reply(502, {
        error: 'Новая почта вернула некорректный ответ',
        code: 'INVALID_UPSTREAM_JSON',
        httpStatus: response.status
      });
    }

    if (!response.ok) {
      console.error(
        'NP_DIAG: HTTP error',
        response.status,
        result.errors || result.message
      );

      return reply(502, {
        error: 'Ошибка ответа сервера Новой почты',
        code: 'UPSTREAM_HTTP_ERROR',
        httpStatus: response.status,
        details: result.errors || result.message || []
      });
    }

    if (!result.success) {
      console.error(
        'NP_DIAG: API rejected request',
        result.errors,
        result.warnings,
        result.message
      );

      return reply(502, {
        error: 'Новая почта отклонила запрос',
        code: 'NP_API_REJECTED',
        details: result.errors || [],
        warnings: result.warnings || [],
        message: result.message || []
      });
    }

    const items = (result.data || []).slice(0, 50)
      .map(x => {
        if (type === 'cities') {
          return {
            ref: x.Ref,
            title: x.Description,
            subtitle: x.AreaDescription || x.Region || ''
          };
        }

        const title = x.Description ||
          x.DescriptionRu ||
          `Отделение №${x.Number || ''}`;

        const address = x.ShortAddress ||
          x.ShortAddressRu ||
          x.CityDescription || '';

        return {
          ref: x.Ref,
          title,
          subtitle: [
            x.Number ? `№${x.Number}` : '',
            address
          ].filter(Boolean).join(' · ')
        };
      })
      .filter(x => x.ref && x.title);

    return reply(200, { items });

  } catch (error) {
    console.error(
      'NP_DIAG: Network or function error',
      error.message
    );

    return reply(502, {
      error: 'Не удалось связаться с Новой почтой',
      code: 'NETWORK_ERROR'
    });
  }
};
