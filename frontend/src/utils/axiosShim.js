// Drop-in fetch-based replacement for the subset of axios used in this repo.
// Aliased via vite.config.js so `import axios from 'axios'` resolves here and
// the axios npm dependency can be removed. Supports: get/post/put/delete/patch/head,
// axios.create() with baseURL/headers/timeout/withCredentials, request+response
// interceptors, params object, FormData bodies, AbortController via signal,
// and axios-style { data, status, headers } response / error.response shape.

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

const mergeHeaders = (...sources) => {
  const out = {};
  for (const src of sources) {
    if (!src) continue;
    for (const [k, v] of Object.entries(src)) {
      if (v !== undefined && v !== null) out[k] = v;
    }
  }
  return out;
};

const joinUrl = (baseURL, url) => {
  if (!url) return baseURL || '';
  if (/^https?:\/\//i.test(url)) return url;
  if (!baseURL) return url;
  return `${baseURL.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}`;
};

const appendParams = (url, params) => {
  if (!params || !isPlainObject(params)) return url;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) v.forEach((item) => qs.append(k, item));
    else qs.append(k, v);
  }
  const query = qs.toString();
  if (!query) return url;
  return url + (url.includes('?') ? '&' : '?') + query;
};

const buildAxiosError = (message, config, response) => {
  const err = new Error(message);
  err.isAxiosError = true;
  err.config = config;
  if (response) {
    err.response = response;
    err.status = response.status;
  }
  return err;
};

const runRequestInterceptors = async (interceptors, config) => {
  let cfg = config;
  for (const i of interceptors) {
    if (!i) continue;
    try {
      if (i.fulfilled) cfg = (await i.fulfilled(cfg)) || cfg;
    } catch (err) {
      if (i.rejected) return i.rejected(err);
      throw err;
    }
  }
  return cfg;
};

const runResponseInterceptorsSuccess = async (interceptors, response) => {
  let resp = response;
  for (const i of interceptors) {
    if (!i || !i.fulfilled) continue;
    resp = (await i.fulfilled(resp)) || resp;
  }
  return resp;
};

const runResponseInterceptorsError = async (interceptors, error) => {
  let err = error;
  for (const i of interceptors) {
    if (!i || !i.rejected) continue;
    try {
      // If the rejection handler resolves with a response-like value, return it.
      return await i.rejected(err);
    } catch (next) {
      err = next;
    }
  }
  throw err;
};

const dispatch = async (instance, method, url, data, userConfig = {}) => {
  let config = {
    url,
    method: (method || 'get').toLowerCase(),
    baseURL: userConfig.baseURL ?? instance.defaults.baseURL ?? '',
    headers: mergeHeaders(instance.defaults.headers, userConfig.headers),
    params: userConfig.params,
    data,
    timeout: userConfig.timeout ?? instance.defaults.timeout,
    withCredentials: userConfig.withCredentials ?? instance.defaults.withCredentials,
    signal: userConfig.signal,
    responseType: userConfig.responseType,
  };

  config = await runRequestInterceptors(instance._requestInterceptors, config);

  const fullUrl = appendParams(joinUrl(config.baseURL, config.url), config.params);
  const upperMethod = config.method.toUpperCase();

  const fetchInit = {
    method: upperMethod,
    headers: { ...config.headers },
  };

  if (config.withCredentials) fetchInit.credentials = 'include';

  if (config.data !== undefined && config.data !== null && upperMethod !== 'GET' && upperMethod !== 'HEAD') {
    if (config.data instanceof FormData || config.data instanceof Blob || config.data instanceof ArrayBuffer || typeof config.data === 'string') {
      fetchInit.body = config.data;
      // Let the browser set Content-Type for FormData (boundary).
      if (config.data instanceof FormData) delete fetchInit.headers['Content-Type'];
    } else {
      fetchInit.body = JSON.stringify(config.data);
      if (!fetchInit.headers['Content-Type'] && !fetchInit.headers['content-type']) {
        fetchInit.headers['Content-Type'] = 'application/json';
      }
    }
  }

  let timeoutId;
  let timedOut = false;
  if (config.signal) {
    fetchInit.signal = config.signal;
  } else if (config.timeout && config.timeout > 0) {
    const controller = new AbortController();
    fetchInit.signal = controller.signal;
    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, config.timeout);
  }

  let raw;
  try {
    raw = await fetch(fullUrl, fetchInit);
  } catch (err) {
    if (timeoutId) clearTimeout(timeoutId);
    const message = timedOut ? `timeout of ${config.timeout}ms exceeded` : (err?.message || 'Network Error');
    const error = buildAxiosError(message, config, null);
    error.code = timedOut ? 'ECONNABORTED' : (err?.name === 'AbortError' ? 'ERR_CANCELED' : 'ERR_NETWORK');
    return runResponseInterceptorsError(instance._responseInterceptors, error);
  }
  if (timeoutId) clearTimeout(timeoutId);

  const contentType = raw.headers.get('content-type') || '';
  let body;
  if (config.responseType === 'blob') body = await raw.blob();
  else if (config.responseType === 'arraybuffer') body = await raw.arrayBuffer();
  else if (config.responseType === 'text') body = await raw.text();
  else if (contentType.includes('application/json')) {
    const text = await raw.text();
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  } else {
    body = await raw.text();
    if (body && contentType.includes('application/') === false) {
      // Best-effort JSON parse for endpoints that forget content-type
      try { body = JSON.parse(body); } catch { /* keep as string */ }
    }
  }

  const headersObj = {};
  raw.headers.forEach((v, k) => { headersObj[k] = v; });

  const response = {
    data: body,
    status: raw.status,
    statusText: raw.statusText,
    headers: headersObj,
    config,
    request: fetchInit,
  };

  if (!raw.ok) {
    const error = buildAxiosError(`Request failed with status code ${raw.status}`, config, response);
    return runResponseInterceptorsError(instance._responseInterceptors, error);
  }

  return runResponseInterceptorsSuccess(instance._responseInterceptors, response);
};

const createInstance = (defaults = {}) => {
  const instance = function (config) {
    return dispatch(instance, config?.method || 'get', config?.url, config?.data, config);
  };

  instance.defaults = {
    baseURL: defaults.baseURL || '',
    headers: mergeHeaders({ Accept: 'application/json, text/plain, */*' }, defaults.headers),
    timeout: defaults.timeout,
    withCredentials: defaults.withCredentials,
  };

  instance._requestInterceptors = [];
  instance._responseInterceptors = [];

  instance.interceptors = {
    request: {
      use: (fulfilled, rejected) => {
        instance._requestInterceptors.push({ fulfilled, rejected });
        return instance._requestInterceptors.length - 1;
      },
      eject: (id) => { instance._requestInterceptors[id] = null; },
    },
    response: {
      use: (fulfilled, rejected) => {
        instance._responseInterceptors.push({ fulfilled, rejected });
        return instance._responseInterceptors.length - 1;
      },
      eject: (id) => { instance._responseInterceptors[id] = null; },
    },
  };

  const noBody = (method) => (url, config = {}) =>
    dispatch(instance, method, url, undefined, config);
  const withBody = (method) => (url, data, config = {}) =>
    dispatch(instance, method, url, data, config);

  instance.get = noBody('get');
  instance.delete = noBody('delete');
  instance.head = noBody('head');
  instance.options = noBody('options');
  instance.post = withBody('post');
  instance.put = withBody('put');
  instance.patch = withBody('patch');
  instance.request = (cfg) => dispatch(instance, cfg.method || 'get', cfg.url, cfg.data, cfg);

  instance.create = (overrides) => createInstance({ ...defaults, ...overrides });

  return instance;
};

const axiosShim = createInstance();
axiosShim.isCancel = (value) => value?.name === 'AbortError' || value?.code === 'ERR_CANCELED';
axiosShim.CancelToken = {
  source: () => {
    const controller = new AbortController();
    return { token: controller.signal, cancel: () => controller.abort() };
  },
};

export default axiosShim;
export const create = axiosShim.create;
