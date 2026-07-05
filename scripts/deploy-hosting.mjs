/**
 * CloudBase 静态托管部署脚本
 * 使用 @cloudbase/manager-node SDK 直接上传文件，绕过 CLI 可能的问题
 */
import { glob } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { join, relative, normalize } from "node:path";
import { readdirSync, statSync } from "node:fs";

const ENV_ID = process.env.TCB_ENV_ID;
const SECRET_ID = process.env.TCB_API_KEY_ID;
const SECRET_KEY = process.env.TCB_API_KEY;
const DEPLOY_DIR = process.env.DEPLOY_DIR || "./deploy";

if (!ENV_ID || !SECRET_ID || !SECRET_KEY) {
  console.error("Missing required env vars: TCB_ENV_ID, TCB_API_KEY_ID, TCB_API_KEY");
  process.exit(1);
}

console.log(`[deploy-hosting] ENV_ID: ${ENV_ID}`);
console.log(`[deploy-hosting] DEPLOY_DIR: ${DEPLOY_DIR}`);

// 递归获取目录下所有文件
function getAllFiles(dir, base = dir) {
  const results = [];
  const items = readdirSync(dir);
  for (const item of items) {
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...getAllFiles(fullPath, base));
    } else {
      const cloudPath = relative(base, fullPath).replace(/\\/g, "/");
      results.push({ localPath: fullPath, cloudPath, size: stat.size });
    }
  }
  return results;
}

async function main() {
  // 动态导入 manager-node
  const { CloudBase } = await import("@cloudbase/manager-node");

  const app = new CloudBase({
    envId: ENV_ID,
    secretId: SECRET_ID,
    secretKey: SECRET_KEY,
  });

  console.log("[deploy-hosting] CloudBase manager initialized");

  // 获取所有待上传文件
  const files = getAllFiles(DEPLOY_DIR);
  console.log(`[deploy-hosting] Found ${files.length} files to upload`);

  if (files.length === 0) {
    console.error("[deploy-hosting] No files found in deploy directory!");
    process.exit(1);
  }

  // 打印文件列表
  for (const f of files) {
    console.log(`  ${f.cloudPath} (${f.size} bytes)`);
  }

  // 使用 hosting API 上传文件
  try {
    const hosting = app.hosting();

    // 上传文件
    console.log("[deploy-hosting] Uploading files...");
    const result = await hosting.uploadFiles({
      localPath: DEPLOY_DIR,
      cloudPath: "",
      files: files.map((f) => ({
        localPath: f.localPath,
        cloudPath: f.cloudPath,
      })),
    });

    console.log("[deploy-hosting] Upload complete!");
    console.log("[deploy-hosting] Result:", JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("[deploy-hosting] Upload failed:", err.message);
    if (err.stack) {
      console.error(err.stack);
    }
    process.exit(1);
  }

  // 验证：列出托管文件
  try {
    console.log("[deploy-hosting] Listing hosting files...");
    const hosting = app.hosting();
    const fileList = await hosting.listFiles();
    console.log("[deploy-hosting] Hosting files:", JSON.stringify(fileList, null, 2));
  } catch (err) {
    console.warn("[deploy-hosting] List files failed (non-fatal):", err.message);
  }

  console.log("[deploy-hosting] Done!");
}

main().catch((err) => {
  console.error("[deploy-hosting] Fatal error:", err);
  process.exit(1);
});
