const cloudbase = require('@cloudbase/node-sdk');
const crypto = require('crypto');

const app = cloudbase.init({
  env: cloudbase.SYMBOL_CURRENT_ENV,
});

const db = app.database();
const _ = db.command;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
  'Content-Type': 'application/json; charset=utf-8',
};

function jsonResponse(data, statusCode = 200) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(data),
  };
}

function handleOptions() {
  return {
    statusCode: 204,
    headers: CORS_HEADERS,
    body: '',
  };
}

async function hashPassword(password, salt) {
  return crypto
    .pbkdf2Sync(password, salt, 100000, 32, 'sha256')
    .toString('base64');
}

function generateSalt() {
  return crypto.randomBytes(16).toString('base64');
}

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

    if (sigB64 !== expectedSigB64) return null;

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
  const secret = process.env.JWT_SECRET || 'default-secret';
  return await verifyJWT(token, secret);
}

async function handleRegister(event) {
  let body;
  try {
    body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  } catch {
    return jsonResponse({ error: '请求体格式错误' }, 400);
  }

  const { email, password } = body;
  if (!email || !password) {
    return jsonResponse({ error: '邮箱和密码不能为空' }, 400);
  }

  const res = await db.collection('users').where({ email }).get();
  if (res.data && res.data.length > 0) {
    return jsonResponse({ error: '邮箱已注册' }, 409);
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

  return jsonResponse({ success: true });
}

async function handleLogin(event) {
  let body;
  try {
    body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  } catch {
    return jsonResponse({ error: '请求体格式错误' }, 400);
  }

  const { email, password } = body;
  if (!email || !password) {
    return jsonResponse({ error: '邮箱和密码不能为空' }, 400);
  }

  const res = await db.collection('users').where({ email }).get();
  if (!res.data || res.data.length === 0) {
    return jsonResponse({ error: '用户不存在或密码错误' }, 401);
  }

  const user = res.data[0];
  const hash = await hashPassword(password, user.salt);
  if (hash !== user.passwordHash) {
    return jsonResponse({ error: '用户不存在或密码错误' }, 401);
  }

  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
  const secret = process.env.JWT_SECRET || 'default-secret';
  const token = await signJWT({ userId: user.userId, email: user.email, exp }, secret);

  return jsonResponse({ token, userId: user.userId, email: user.email });
}

async function handleGetData(event) {
  const payload = await authenticate(event);
  if (!payload) {
    return jsonResponse({ error: '未授权' }, 401);
  }

  const res = await db.collection('user_data').where({ userId: payload.userId }).get();
  if (!res.data || res.data.length === 0) {
    return jsonResponse({ data: null });
  }

  const record = res.data[0];
  return jsonResponse({ data: record.data, updatedAt: record.updatedAt });
}

async function handlePutData(event) {
  const payload = await authenticate(event);
  if (!payload) {
    return jsonResponse({ error: '未授权' }, 401);
  }

  let body;
  try {
    body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  } catch {
    return jsonResponse({ error: '请求体格式错误' }, 400);
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

  return jsonResponse({ success: true, updatedAt });
}

async function handleGetVersions(event) {
  const payload = await authenticate(event);
  if (!payload) {
    return jsonResponse({ error: '未授权' }, 401);
  }

  const res = await db.collection('versions').where({ userId: payload.userId }).get();
  let versions = [];
  if (res.data && res.data.length > 0) {
    versions = res.data[0].versions || [];
  }

  return jsonResponse({ versions });
}

exports.main = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') {
    return handleOptions();
  }

  let path = event.path || '';
  const method = event.httpMethod || 'GET';

  if (!path.startsWith('/')) path = '/' + path;

  while (path.startsWith('/api')) {
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

    console.log('未找到路由:', method, path, '原始path:', event.path);
    return jsonResponse({ error: '未找到路由', path, method }, 404);
  } catch (e) {
    console.error('云函数执行错误:', e);
    return jsonResponse({ error: '服务器内部错误', message: e.message }, 500);
  }
};
