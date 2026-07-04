/**
 * IndexedDB 封装模块
 * 作为本地主存储替代 localStorage
 */

// 数据库配置常量
const DB_NAME = 'reliability-db';
const DB_VERSION = 1;
const STORE_NAME = 'app-state';

// 数据库实例缓存
let dbInstance = null;

/**
 * 打开数据库连接
 * 内部缓存 db 实例，避免重复打开
 * @returns {Promise<IDBDatabase>}
 */
export async function openDB() {
  try {
    // 如果已经存在缓存的实例且未关闭，直接返回
    if (dbInstance) {
      return dbInstance;
    }

    return await new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      // 数据库升级时创建 ObjectStore
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        // 仅在不存在时创建，避免重复创建报错
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };

      request.onsuccess = (event) => {
        dbInstance = event.target.result;
        // 数据库意外关闭时清空缓存，便于下次重连
        dbInstance.onclose = () => {
          dbInstance = null;
        };
        dbInstance.onversionchange = () => {
          dbInstance.close();
          dbInstance = null;
        };
        resolve(dbInstance);
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error('打开数据库失败:', error);
    return null;
  }
}

/**
 * 通用：根据 key 读取一条记录
 * @param {string} key
 * @returns {Promise<any|null>}
 */
async function getByKey(key) {
  try {
    const db = await openDB();
    if (!db) return null;

    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = (event) => {
        const result = event.target.result;
        // result 不存在时返回 null
        if (!result) {
          resolve(null);
          return;
        }
        // 记录结构为 { key, value, updatedAt }
        resolve(result.value !== undefined ? result.value : null);
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error(`读取数据失败 (key=${key}):`, error);
    return null;
  }
}

/**
 * 通用：写入一条记录
 * @param {string} key
 * @param {any} value
 * @param {number} [updatedAt]
 * @returns {Promise<boolean>}
 */
async function setByKey(key, value, updatedAt = Date.now()) {
  try {
    const db = await openDB();
    if (!db) return false;

    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const record = { key, value, updatedAt };
      const request = store.put(record);

      request.onsuccess = () => resolve(true);
      request.onerror = (event) => reject(event.target.error);
    });
  } catch (error) {
    console.error(`保存数据失败 (key=${key}):`, error);
    return false;
  }
}

/**
 * 通用：删除一条记录
 * @param {string} key
 * @returns {Promise<boolean>}
 */
async function deleteByKey(key) {
  try {
    const db = await openDB();
    if (!db) return false;

    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(key);

      request.onsuccess = () => resolve(true);
      request.onerror = (event) => reject(event.target.error);
    });
  } catch (error) {
    console.error(`删除数据失败 (key=${key}):`, error);
    return false;
  }
}

/**
 * 获取主状态数据（key="state"）
 * 返回 JSON 对象（不是字符串），不存在时返回 null
 * @returns {Promise<object|null>}
 */
export async function getState() {
  try {
    const data = await getByKey('state');
    // getState 期望返回对象
    if (data === null || data === undefined) return null;
    // 若存储的是字符串则解析，对象则直接返回
    if (typeof data === 'string') {
      try {
        return JSON.parse(data);
      } catch (parseError) {
        console.error('解析 state 数据失败:', parseError);
        return null;
      }
    }
    return data;
  } catch (error) {
    console.error('获取主状态数据失败:', error);
    return null;
  }
}

/**
 * 保存主状态数据
 * 存储 JSON 对象，同时记录 updatedAt: Date.now()
 * @param {object} data
 * @returns {Promise<boolean>}
 */
export async function setState(data) {
  try {
    return await setByKey('state', data, Date.now());
  } catch (error) {
    console.error('保存主状态数据失败:', error);
    return false;
  }
}

/**
 * 获取认证信息（key="auth"）
 * @returns {Promise<any|null>}
 */
export async function getAuth() {
  try {
    return await getByKey('auth');
  } catch (error) {
    console.error('获取认证信息失败:', error);
    return null;
  }
}

/**
 * 保存认证信息
 * @param {any} authData
 * @returns {Promise<boolean>}
 */
export async function setAuth(authData) {
  try {
    return await setByKey('auth', authData, Date.now());
  } catch (error) {
    console.error('保存认证信息失败:', error);
    return false;
  }
}

/**
 * 清除认证信息
 * @returns {Promise<boolean>}
 */
export async function clearAuth() {
  try {
    return await deleteByKey('auth');
  } catch (error) {
    console.error('清除认证信息失败:', error);
    return false;
  }
}

/**
 * 获取同步元信息（key="sync-meta"）
 * @returns {Promise<any|null>}
 */
export async function getSyncMeta() {
  try {
    return await getByKey('sync-meta');
  } catch (error) {
    console.error('获取同步元信息失败:', error);
    return null;
  }
}

/**
 * 保存同步元信息
 * @param {any} meta
 * @returns {Promise<boolean>}
 */
export async function setSyncMeta(meta) {
  try {
    return await setByKey('sync-meta', meta, Date.now());
  } catch (error) {
    console.error('保存同步元信息失败:', error);
    return false;
  }
}

/**
 * 从 localStorage 迁移旧数据到 IndexedDB
 * 读取 localStorage 的 reliability-tool-data key，存在则写入 IndexedDB，
 * 然后仅删除 reliability-tool-data，保留 v1/v2 的旧 key 让 store.js 处理迁移
 * @returns {Promise<boolean>}
 */
export async function migrateFromLocalStorage() {
  try {
    const LEGACY_KEY = 'reliability-tool-data';
    const raw = localStorage.getItem(LEGACY_KEY);

    // 没有旧数据则直接返回
    if (raw === null || raw === undefined) {
      return false;
    }

    // 解析旧数据（localStorage 存的是字符串）
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (parseError) {
      console.error('解析 localStorage 旧数据失败:', parseError);
      return false;
    }

    // 写入 IndexedDB
    const ok = await setByKey('state', parsed, Date.now());
    if (!ok) {
      return false;
    }

    // 仅删除 reliability-tool-data，保留 v1/v2 旧 key
    localStorage.removeItem(LEGACY_KEY);
    return true;
  } catch (error) {
    console.error('从 localStorage 迁移数据失败:', error);
    return false;
  }
}
