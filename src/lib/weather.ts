/* ============================================================
 * 天气服务：Open-Meteo 免费 API（无需 key、支持跨域）
 * 城市名 → 地理编码 → 实时天气（温度 + WMO 天气代码）
 * 城市留空时尝试 IP 定位（ipapi.co，免费限流）
 * 请求失败静默降级：返回 null，UI 隐藏天气
 * ============================================================ */

export interface WeatherInfo {
  city: string;   // 城市显示名
  temp: number;   // 摄氏温度
  code: number;   // WMO weather code
  isDay: boolean;
  desc: string;   // 中文描述
  icon: string;   // emoji 图标
}

/* WMO 天气代码 → [中文描述, emoji] */
const WMO: Record<number, [string, string]> = {
  0: ['晴', '☀️'],
  1: ['基本晴朗', '🌤️'],
  2: ['局部多云', '⛅'],
  3: ['阴', '☁️'],
  45: ['雾', '🌫️'],
  48: ['冻雾', '🌫️'],
  51: ['毛毛雨', '🌦️'],
  53: ['毛毛雨', '🌦️'],
  55: ['毛毛雨', '🌦️'],
  56: ['冻毛毛雨', '🌧️'],
  57: ['冻毛毛雨', '🌧️'],
  61: ['小雨', '🌧️'],
  63: ['中雨', '🌧️'],
  65: ['大雨', '🌧️'],
  66: ['冻雨', '🌧️'],
  67: ['冻雨', '🌧️'],
  71: ['小雪', '🌨️'],
  73: ['中雪', '🌨️'],
  75: ['大雪', '❄️'],
  77: ['雪粒', '❄️'],
  80: ['阵雨', '🌦️'],
  81: ['阵雨', '🌧️'],
  82: ['强阵雨', '⛈️'],
  85: ['阵雪', '🌨️'],
  86: ['强阵雪', '❄️'],
  95: ['雷暴', '⛈️'],
  96: ['雷暴伴冰雹', '⛈️'],
  99: ['强雷暴', '⛈️'],
};

function wmoInfo(code: number): [string, string] {
  return WMO[code] || ['未知', '🌡️'];
}

/* 带超时的 fetch，支持外部取消 */
function fetchWithTimeout(url: string, timeoutMs: number, signal?: AbortSignal): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  if (signal) {
    if (signal.aborted) {
      clearTimeout(timer);
      return Promise.reject(new Error('aborted'));
    }
    signal.addEventListener('abort', () => ctrl.abort(), { once: true });
  }
  return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

/* 地理编码：城市名 → 经纬度（Open-Meteo Geocoding，支持中文） */
async function geocodeCity(city: string, signal?: AbortSignal): Promise<{ lat: number; lon: number; name: string } | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh&format=json`;
  const res = await fetchWithTimeout(url, 8000, signal);
  if (!res.ok) return null;
  const data = await res.json();
  const hit = data?.results?.[0];
  if (!hit || typeof hit.latitude !== 'number' || typeof hit.longitude !== 'number') return null;
  return { lat: hit.latitude, lon: hit.longitude, name: hit.name || city };
}

/* IP 定位（城市留空时使用；免费接口，可能限流/失效） */
// ipwho.is（https + CORS *）优先，ip-api.com（http）备选；两者字段结构相同
const IP_LOCATE_SERVERS = ['https://ipwho.is/', 'http://ip-api.com/json/'];
async function locateByIp(signal?: AbortSignal): Promise<{ lat: number; lon: number; name: string } | null> {
  for (const url of IP_LOCATE_SERVERS) {
    try {
      const res = await fetchWithTimeout(url, 6000, signal);
      if (!res.ok) continue;
      const data = await res.json();
      const lat = Number(data?.latitude);
      const lon = Number(data?.longitude);
      if (!isFinite(lat) || !isFinite(lon)) continue;
      return { lat, lon, name: String(data?.city || '') };
    } catch {
      continue; // 尝试下一个服务
    }
  }
  return null;
}

/* 实时天气：Open-Meteo Forecast */
async function fetchForecast(lat: number, lon: number, signal?: AbortSignal): Promise<{ temp: number; code: number; isDay: boolean } | null> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,is_day&timezone=auto`;
  const res = await fetchWithTimeout(url, 8000, signal);
  if (!res.ok) return null;
  const data = await res.json();
  const cur = data?.current;
  if (!cur || typeof cur.temperature_2m !== 'number' || typeof cur.weather_code !== 'number') return null;
  return { temp: cur.temperature_2m, code: cur.weather_code, isDay: cur.is_day === 1 };
}

/* 对外主入口：城市名（可为空）→ 天气信息 */
export async function fetchWeather(city: string, signal?: AbortSignal): Promise<WeatherInfo | null> {
  try {
    let loc: { lat: number; lon: number; name: string } | null = null;
    if (city.trim()) {
      loc = await geocodeCity(city.trim(), signal);
    } else {
      loc = await locateByIp(signal);
    }
    if (!loc || signal?.aborted) return null;
    const fc = await fetchForecast(loc.lat, loc.lon, signal);
    if (!fc || signal?.aborted) return null;
    const [desc, icon] = wmoInfo(fc.code);
    return {
      city: loc.name,
      temp: fc.temp,
      code: fc.code,
      isDay: fc.isDay,
      desc,
      icon,
    };
  } catch {
    return null;
  }
}