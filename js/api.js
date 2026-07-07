/**
 * 统一 API 地址构建
 * __API_BASE_URL__ 可为网关根地址或已含 /api 前缀的地址，均会规范化处理
 */
export function getApiRoot() {
  if (typeof window !== "undefined" && window.__API_BASE_URL__) {
    return window.__API_BASE_URL__.replace(/\/+$/, "").replace(/\/api$/, "");
  }
  return "http://localhost:8787";
}

/**
 * @param {string} path 以 /api/ 开头的路径，如 /api/auth/login
 */
export function apiUrl(path) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const apiPath = normalized.startsWith("/api/") ? normalized : `/api${normalized}`;
  return `${getApiRoot()}${apiPath}`;
}

export function hasCloudApi() {
  return typeof window !== "undefined" && !!window.__API_BASE_URL__;
}
