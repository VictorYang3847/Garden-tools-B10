// Cloudflare Worker 后端 - 用户认证和数据同步 API
// 提供注册、登录、数据同步和版本管理功能

// CORS 响应头（允许所有来源）
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

// 统一返回 JSON 响应
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

// 处理 OPTIONS 预检请求
function handleOptions() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

// 使用 PBKDF2 哈希密码（Web Crypto API）
async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: encoder.encode(salt), iterations: 100000, hash: "SHA-256" },
    keyMaterial, 256
  );
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

// 生成随机盐值（16 字节）
function generateSalt() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr));
}

// 签发 JWT（HMAC-SHA256）
async function signJWT(payload, secret) {
  const encoder = new TextEncoder();
  const header = { alg: "HS256", typ: "JWT" };
  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, "");
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, "");
  const data = `${headerB64}.${payloadB64}`;
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, "");
  return `${data}.${sigB64}`;
}

// 验证 JWT（验证签名和过期时间），返回 payload 或 null
async function verifyJWT(token, secret) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;
    const data = `${headerB64}.${payloadB64}`;
    const encoder = new TextEncoder();

    // 导入 HMAC 密钥用于验签
    const key = await crypto.subtle.importKey(
      "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
    );

    // 将 base64 签名还原为 ArrayBuffer
    const sigStr = atob(sigB64);
    const sigBytes = new Uint8Array(sigStr.length);
    for (let i = 0; i < sigStr.length; i++) {
      sigBytes[i] = sigStr.charCodeAt(i);
    }

    // 验证签名
    const valid = await crypto.subtle.verify("HMAC", key, sigBytes, encoder.encode(data));
    if (!valid) return null;

    // 解析 payload 并检查过期时间
    const payload = JSON.parse(atob(payloadB64));
    if (payload.exp && Date.now() >= payload.exp * 1000) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

// 从请求头中提取并验证 JWT，返回 payload 或 null
async function authenticate(request, env) {
  const auth = request.headers.get("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  const secret = env.JWT_SECRET || "default-secret";
  return await verifyJWT(token, secret);
}

// 主入口
export default {
  async fetch(request, env, ctx) {
    // 处理 CORS 预检请求
    if (request.method === "OPTIONS") {
      return handleOptions();
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // 注册用户
      if (path === "/api/auth/register" && request.method === "POST") {
        return await handleRegister(request, env);
      }
      // 用户登录
      if (path === "/api/auth/login" && request.method === "POST") {
        return await handleLogin(request, env);
      }
      // 获取用户数据
      if (path === "/api/data" && request.method === "GET") {
        return await handleGetData(request, env);
      }
      // 保存用户数据
      if (path === "/api/data" && request.method === "PUT") {
        return await handlePutData(request, env);
      }
      // 获取版本列表
      if (path === "/api/versions" && request.method === "GET") {
        return await handleGetVersions(request, env);
      }
      // 未匹配到任何路由
      return jsonResponse({ error: "未找到路由" }, 404);
    } catch (e) {
      // 统一错误处理
      return jsonResponse({ error: "服务器内部错误", message: e.message }, 500);
    }
  },
};

// 注册用户
async function handleRegister(request, env) {
  const { email, password } = await request.json();
  if (!email || !password) {
    return jsonResponse({ error: "邮箱和密码不能为空" }, 400);
  }
  // 检查邮箱是否已注册
  const kvKey = `user:${email}`;
  const existing = await env.RELIABILITY_KV.get(kvKey);
  if (existing) {
    return jsonResponse({ error: "邮箱已注册" }, 409);
  }
  // 生成盐值和密码哈希
  const salt = generateSalt();
  const passwordHash = await hashPassword(password, salt);
  const userId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const userRecord = { userId, email, passwordHash, salt, createdAt };
  await env.RELIABILITY_KV.put(kvKey, JSON.stringify(userRecord));
  return jsonResponse({ success: true });
}

// 用户登录
async function handleLogin(request, env) {
  const { email, password } = await request.json();
  if (!email || !password) {
    return jsonResponse({ error: "邮箱和密码不能为空" }, 400);
  }
  // 读取用户记录
  const kvKey = `user:${email}`;
  const raw = await env.RELIABILITY_KV.get(kvKey);
  if (!raw) {
    return jsonResponse({ error: "用户不存在或密码错误" }, 401);
  }
  const user = JSON.parse(raw);
  // 对比密码哈希
  const hash = await hashPassword(password, user.salt);
  if (hash !== user.passwordHash) {
    return jsonResponse({ error: "用户不存在或密码错误" }, 401);
  }
  // 生成 JWT，有效期 30 天
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
  const secret = env.JWT_SECRET || "default-secret";
  const token = await signJWT({ userId: user.userId, email: user.email, exp }, secret);
  return jsonResponse({ token, userId: user.userId, email: user.email });
}

// 获取用户数据
async function handleGetData(request, env) {
  const payload = await authenticate(request, env);
  if (!payload) {
    return jsonResponse({ error: "未授权" }, 401);
  }
  const raw = await env.RELIABILITY_KV.get(`data:${payload.userId}`);
  if (!raw) {
    return jsonResponse({ data: null });
  }
  const record = JSON.parse(raw);
  return jsonResponse({ data: record.data, updatedAt: record.updatedAt });
}

// 保存用户数据
async function handlePutData(request, env) {
  const payload = await authenticate(request, env);
  if (!payload) {
    return jsonResponse({ error: "未授权" }, 401);
  }
  const { data } = await request.json();
  const updatedAt = Date.now();
  const record = { data, updatedAt };
  // 写入当前数据
  await env.RELIABILITY_KV.put(`data:${payload.userId}`, JSON.stringify(record));

  // 追加版本快照，最多保留 20 个版本
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

  return jsonResponse({ success: true, updatedAt });
}

// 获取版本列表
async function handleGetVersions(request, env) {
  const payload = await authenticate(request, env);
  if (!payload) {
    return jsonResponse({ error: "未授权" }, 401);
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
  return jsonResponse({ versions });
}
