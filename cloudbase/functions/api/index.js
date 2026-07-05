const cloudbase = require('@cloudbase/node-sdk');
const crypto = require('crypto');

const app = cloudbase.init({
  env: cloudbase.SYMBOL_CURRENT_ENV,
});

const db = app.database();
const _ = db.command;

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

// Cloudflare Pages 预览域名模式（每次部署生成不同的预览URL）
const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/[a-f0-9]+\.(garden-tools-b10\.pages\.dev)$/,
];

function isOriginAllowed(origin) {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return ALLOWED_ORIGIN_PATTERNS.some((p) => p.test(origin));
}

function getCorsHeaders(event) {
  const origin = (event.headers?.origin || event.headers?.Origin || '').toLowerCase();
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

function jsonResponse(data, statusCode = 200, event) {
  return {
    statusCode,
    headers: getCorsHeaders(event),
    body: JSON.stringify(data),
  };
}

function handleOptions(event) {
  return {
    statusCode: 204,
    headers: getCorsHeaders(event),
    body: '',
  };
}

// ── JWT 密钥管理 ──────────────────────────────────────

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === 'default-secret' || secret.length < 32) {
    throw new Error('JWT_SECRET 未配置或过于简短，请在云函数环境变量中设置一个至少 32 位的随机密钥。');
  }
  return secret;
}

// ── 密码哈希 & 校验 ──────────────────────────────────

const PBKDF2_ITERATIONS = 100000;

async function hashPassword(password, salt) {
  return crypto
    .pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 32, 'sha256')
    .toString('base64');
}

function generateSalt() {
  return crypto.randomBytes(16).toString('base64');
}

/**
 * 常量时间比较，防止时序攻击
 */
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'base64'), Buffer.from(b, 'base64'));
}

// ── JWT 签发 / 验证 ──────────────────────────────────

function base64UrlEncode(str) {
  return Buffer.from(str).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64').toString('utf-8');
}

async function signJWT(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const data = `${headerB64}.${payloadB64}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64');
  const sigB64 = sig.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${data}.${sigB64}`;
}

async function verifyJWT(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;

    const data = `${headerB64}.${payloadB64}`;
    const expectedSig = crypto.createHmac('sha256', secret).update(data).digest('base64');
    const expectedSigB64 = expectedSig.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

    // 常量时间比较签名
    if (!timingSafeEqual(sigB64, expectedSigB64)) return null;

    const payload = JSON.parse(base64UrlDecode(payloadB64));
    if (payload.exp && Date.now() >= payload.exp * 1000) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

async function authenticate(event) {
  const authHeader = event.headers?.Authorization || event.headers?.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const secret = getJwtSecret();
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

async function handleRegister(event) {
  let body;
  try {
    body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  } catch {
    return jsonResponse({ error: '请求体格式错误' }, 400, event);
  }

  const { email, password } = body;
  const v = validateEmailPassword(email, password);
  if (!v.ok) return jsonResponse({ error: v.error }, 400, event);

  const res = await db.collection('users').where({ email }).get();
  if (res.data && res.data.length > 0) {
    return jsonResponse({ error: '邮箱已注册' }, 409, event);
  }

  const salt = generateSalt();
  const passwordHash = await hashPassword(password, salt);
  const userId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  await db.collection('users').add({
    userId,
    email,
    passwordHash,
    salt,
    createdAt,
  });

  return jsonResponse({ success: true }, 200, event);
}

async function handleLogin(event) {
  let body;
  try {
    body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  } catch {
    return jsonResponse({ error: '请求体格式错误' }, 400, event);
  }

  const { email, password } = body;
  const v = validateEmailPassword(email, password);
  if (!v.ok) return jsonResponse({ error: v.error }, 400, event);

  const res = await db.collection('users').where({ email }).get();
  if (!res.data || res.data.length === 0) {
    return jsonResponse({ error: '邮箱或密码错误' }, 401, event);
  }

  const user = res.data[0];
  const hash = await hashPassword(password, user.salt);

  // 常量时间比较，防止时序攻击
  if (!timingSafeEqual(hash, user.passwordHash)) {
    return jsonResponse({ error: '邮箱或密码错误' }, 401, event);
  }

  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
  const secret = getJwtSecret();
  const token = await signJWT({ userId: user.userId, email: user.email, exp }, secret);

  return jsonResponse({ token, userId: user.userId, email: user.email }, 200, event);
}

async function handleGetData(event) {
  const payload = await authenticate(event);
  if (!payload) {
    return jsonResponse({ error: '未授权' }, 401, event);
  }

  const res = await db.collection('user_data').where({ userId: payload.userId }).get();
  if (!res.data || res.data.length === 0) {
    return jsonResponse({ data: null }, 200, event);
  }

  const record = res.data[0];
  return jsonResponse({ data: record.data, updatedAt: record.updatedAt }, 200, event);
}

async function handlePutData(event) {
  const payload = await authenticate(event);
  if (!payload) {
    return jsonResponse({ error: '未授权' }, 401, event);
  }

  let body;
  try {
    body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  } catch {
    return jsonResponse({ error: '请求体格式错误' }, 400, event);
  }

  const { data } = body;
  const updatedAt = Date.now();
  const record = { data, updatedAt };

  const existing = await db.collection('user_data').where({ userId: payload.userId }).get();
  if (existing.data && existing.data.length > 0) {
    await db.collection('user_data').doc(existing.data[0]._id).update(record);
  } else {
    await db.collection('user_data').add({ userId: payload.userId, ...record });
  }

  const versionsRes = await db.collection('versions').where({ userId: payload.userId }).get();
  let versions = [];
  if (versionsRes.data && versionsRes.data.length > 0) {
    versions = versionsRes.data[0].versions || [];
  }

  versions.push({ data, updatedAt, timestamp: updatedAt });
  if (versions.length > 20) {
    versions = versions.slice(versions.length - 20);
  }

  if (versionsRes.data && versionsRes.data.length > 0) {
    await db.collection('versions').doc(versionsRes.data[0]._id).update({ versions });
  } else {
    await db.collection('versions').add({ userId: payload.userId, versions });
  }

  return jsonResponse({ success: true, updatedAt }, 200, event);
}

async function handleGetVersions(event) {
  const payload = await authenticate(event);
  if (!payload) {
    return jsonResponse({ error: '未授权' }, 401, event);
  }

  const res = await db.collection('versions').where({ userId: payload.userId }).get();
  let versions = [];
  if (res.data && res.data.length > 0) {
    versions = res.data[0].versions || [];
  }

  return jsonResponse({ versions }, 200, event);
}

// ── 入口 ──────────────────────────────────────────────

exports.main = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') {
    return handleOptions(event);
  }

  // 检查 JWT_SECRET 是否已配置（启动时失败优于运行时泄露）
  try {
    getJwtSecret();
  } catch (e) {
    console.error('JWT_SECRET 配置错误:', e.message);
    return jsonResponse({ error: '服务暂不可用，请联系管理员' }, 503, event);
  }

  let path = event.path || '';
  const method = event.httpMethod || 'GET';

  if (!path.startsWith('/')) path = '/' + path;

  // 精确剥离 /api 前缀（只匹配 /api/...，不匹配 /apiv2/...）
  if (path.startsWith('/api/')) {
    path = path.substring(4);
  }
  if (!path.startsWith('/')) path = '/' + path;

  try {
    if (path === '/auth/register' && method === 'POST') {
      return await handleRegister(event);
    }
    if (path === '/auth/login' && method === 'POST') {
      return await handleLogin(event);
    }
    if (path === '/data' && method === 'GET') {
      return await handleGetData(event);
    }
    if (path === '/data' && method === 'PUT') {
      return await handlePutData(event);
    }
    if (path === '/versions' && method === 'GET') {
      return await handleGetVersions(event);
    }

    return jsonResponse({ error: '未找到路由' }, 404, event);
  } catch (e) {
    console.error('云函数执行错误:', e);
    // 生产环境不泄露内部错误信息
    return jsonResponse({ error: '服务器内部错误' }, 500, event);
  }
};
