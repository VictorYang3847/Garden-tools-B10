// Cloudflare Worker 后端 - 用户认证和数据同步 API
// 提供注册、登录、数据同步和版本管理功能

// ── 安全配置 ──────────────────────────────────────────

const ALLOWED_ORIGINS = [
  'https://b10.gardeningtools.com',
  'https://garden-tools-b10.pages.dev',
  'https://reliability-tool-d8erocv8e9979b2-1327689319.ap-shanghai.app.tcloudbase.com',
  'https://gardeningtools-4g37ygvdbeb3d854-1254128272.tcloudbaseapp.com',
  'http://localhost:3000',
  'http://localhost:8080',
  'http://localhost:8140',
  'http://127.0.0.1:3000',
];

// Cloudflare Pages 预览域名模式
const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/[a-f0-9]+\.(garden-tools-b10\.pages\.dev)$/,
];

function isOriginAllowed(origin) {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return ALLOWED_ORIGIN_PATTERNS.some((p) => p.test(origin));
}

function getCorsHeaders(request) {
  const origin = (request.headers.get('Origin') || '').toLowerCase();
  const allowOrigin = isOriginAllowed(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  };
}

function jsonResponse(data, status = 200, request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...getCorsHeaders(request),
    },
  });
}

function handleOptions(request) {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}

// ── JWT 密钥管理 ──────────────────────────────────────

function getJwtSecret(env) {
  const secret = env.JWT_SECRET;
  if (!secret || secret === 'default-secret' || secret.length < 32) {
    throw new Error('JWT_SECRET_NOT_SET');
  }
  return secret;
}

// ── 常量时间比较（防止时序攻击）──────────────────────

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// ── 密码哈希 & 校验 ──────────────────────────────────

const PBKDF2_ITERATIONS = 100000;

async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: encoder.encode(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial, 256
  );
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

function generateSalt() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr));
}

// ── JWT 签发 / 验证 ──────────────────────────────────

async function signJWT(payload, secret) {
  const encoder = new TextEncoder();
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, '');
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, '');
  const data = `${headerB64}.${payloadB64}`;
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, '');
  return `${data}.${sigB64}`;
}

async function verifyJWT(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;
    const data = `${headerB64}.${payloadB64}`;
    const encoder = new TextEncoder();

    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );

    const sigStr = atob(sigB64);
    const sigBytes = new Uint8Array(sigStr.length);
    for (let i = 0; i < sigStr.length; i++) {
      sigBytes[i] = sigStr.charCodeAt(i);
    }

    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(data));
    if (!valid) return null;

    const payload = JSON.parse(atob(payloadB64));
    if (payload.exp && Date.now() >= payload.exp * 1000) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

async function authenticate(request, env) {
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const secret = getJwtSecret(env);
  return await verifyJWT(token, secret);
}

// ── 输入校验 ──────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LEN = 8;

function validateEmailPassword(email, password) {
  if (!email || !password) {
    return { ok: false, error: '邮箱和密码不能为空' };
  }
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: '邮箱格式不正确' };
  }
  if (password.length < MIN_PASSWORD_LEN) {
    return { ok: false, error: `密码长度不能少于 ${MIN_PASSWORD_LEN} 位` };
  }
  return { ok: true };
}

// ── 路由处理 ──────────────────────────────────────────

async function handleRegister(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: '请求体格式错误' }, 400, request);
  }

  const { email, password } = body;
  const v = validateEmailPassword(email, password);
  if (!v.ok) return jsonResponse({ error: v.error }, 400, request);

  const kvKey = `user:${email}`;
  const existing = await env.RELIABILITY_KV.get(kvKey);
  if (existing) {
    return jsonResponse({ error: '邮箱已注册' }, 409, request);
  }

  const salt = generateSalt();
  const passwordHash = await hashPassword(password, salt);
  const userId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const userRecord = { userId, email, passwordHash, salt, createdAt };
  await env.RELIABILITY_KV.put(kvKey, JSON.stringify(userRecord));
  return jsonResponse({ success: true }, 200, request);
}

async function handleLogin(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: '请求体格式错误' }, 400, request);
  }

  const { email, password } = body;
  const v = validateEmailPassword(email, password);
  if (!v.ok) return jsonResponse({ error: v.error }, 400, request);

  const kvKey = `user:${email}`;
  const raw = await env.RELIABILITY_KV.get(kvKey);
  if (!raw) {
    return jsonResponse({ error: '邮箱或密码错误' }, 401, request);
  }
  const user = JSON.parse(raw);

  const hash = await hashPassword(password, user.salt);
  if (!timingSafeEqual(hash, user.passwordHash)) {
    return jsonResponse({ error: '邮箱或密码错误' }, 401, request);
  }

  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
  const secret = getJwtSecret(env);
  const token = await signJWT({ userId: user.userId, email: user.email, exp }, secret);
  return jsonResponse({ token, userId: user.userId, email: user.email }, 200, request);
}

async function handleGetData(request, env) {
  const payload = await authenticate(request, env);
  if (!payload) {
    return jsonResponse({ error: '未授权' }, 401, request);
  }
  const raw = await env.RELIABILITY_KV.get(`data:${payload.userId}`);
  if (!raw) {
    return jsonResponse({ data: null }, 200, request);
  }
  const record = JSON.parse(raw);
  return jsonResponse({ data: record.data, updatedAt: record.updatedAt }, 200, request);
}

async function handlePutData(request, env) {
  const payload = await authenticate(request, env);
  if (!payload) {
    return jsonResponse({ error: '未授权' }, 401, request);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: '请求体格式错误' }, 400, request);
  }
  const { data } = body;
  const updatedAt = Date.now();
  const record = { data, updatedAt };

  await env.RELIABILITY_KV.put(`data:${payload.userId}`, JSON.stringify(record));

  const versionsKey = `versions:${payload.userId}`;
  const versionsRaw = await env.RELIABILITY_KV.get(versionsKey);
  let versions = [];
  if (versionsRaw) {
    try {
      versions = JSON.parse(versionsRaw);
    } catch (e) {
      versions = [];
    }
  }
  versions.push({ data, updatedAt, timestamp: updatedAt });
  if (versions.length > 20) {
    versions = versions.slice(versions.length - 20);
  }
  await env.RELIABILITY_KV.put(versionsKey, JSON.stringify(versions));

  return jsonResponse({ success: true, updatedAt }, 200, request);
}

async function handleGetVersions(request, env) {
  const payload = await authenticate(request, env);
  if (!payload) {
    return jsonResponse({ error: '未授权' }, 401, request);
  }
  const versionsRaw = await env.RELIABILITY_KV.get(`versions:${payload.userId}`);
  let versions = [];
  if (versionsRaw) {
    try {
      versions = JSON.parse(versionsRaw);
    } catch (e) {
      versions = [];
    }
  }
  return jsonResponse({ versions }, 200, request);
}

// ── 主入口 ─────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    // 启动时检查 JWT_SECRET 配置
    try {
      getJwtSecret(env);
    } catch (e) {
      return jsonResponse({ error: '服务暂不可用，请联系管理员' }, 503, request);
    }

    if (request.method === 'OPTIONS') {
      return handleOptions(request);
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/api/auth/register' && request.method === 'POST') {
        return await handleRegister(request, env);
      }
      if (path === '/api/auth/login' && request.method === 'POST') {
        return await handleLogin(request, env);
      }
      if (path === '/api/data' && request.method === 'GET') {
        return await handleGetData(request, env);
      }
      if (path === '/api/data' && request.method === 'PUT') {
        return await handlePutData(request, env);
      }
      if (path === '/api/versions' && request.method === 'GET') {
        return await handleGetVersions(request, env);
      }
      return jsonResponse({ error: '未找到路由' }, 404, request);
    } catch (e) {
      console.error('Worker 执行错误:', e);
      // 生产环境不泄露内部错误信息
      return jsonResponse({ error: '服务器内部错误' }, 500, request);
    }
  },
};
