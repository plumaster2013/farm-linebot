// ============================================================
// 快取模組 - 支援 Redis 與記憶體快取雙模式
// ============================================================
let redis = null;
const memCache = new Map();

if (process.env.REDIS_URL) {
  try {
    const Redis = require('ioredis');
    redis = new Redis(process.env.REDIS_URL);
    redis.on('error', (err) => {
      console.warn('[Cache] Redis 連線失敗，切換為記憶體快取:', err.message);
      redis = null;
    });
    console.log('[Cache] Redis 快取已啟用');
  } catch {
    console.log('[Cache] 使用記憶體快取模式');
  }
}

async function get(key) {
  if (redis) {
    const val = await redis.get(key);
    return val ? JSON.parse(val) : null;
  }
  const entry = memCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expire) {
    memCache.delete(key);
    return null;
  }
  return entry.value;
}

async function set(key, value, ttlSeconds = 3600) {
  if (redis) {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } else {
    memCache.set(key, { value, expire: Date.now() + ttlSeconds * 1000 });
  }
}

async function del(key) {
  if (redis) await redis.del(key);
  else memCache.delete(key);
}

module.exports = { get, set, del };
