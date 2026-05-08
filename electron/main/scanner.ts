import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { getDb, getSettings, getSource, log, now } from "./db.js";
import { cleanFolderName } from "./nameCleaner.js";
import type { ScanResult } from "../shared/types.js";

const defaultVideoExtensions = [".mkv", ".mp4", ".m4v", ".avi", ".mov", ".webm", ".ts", ".m2ts", ".flv", ".wmv"];

export async function scanLocalSource(sourceId: number, videoExtensions = defaultVideoExtensions): Promise<ScanResult> {
  const source = getSource(sourceId);
  if (!source) throw new Error(`Source ${sourceId} not found`);
  if (source.type !== "local") throw new Error("MVP only supports local sources");

  const root = source.root_path;
  if (!await exists(root)) {
    log("error", "scanner", `媒体库路径不存在：${root}`);
    throw new Error(`Root path does not exist: ${root}`);
  }

  const db = getDb();
  const beforeSnapshot = createSourceSnapshot(sourceId);
  const beforeItemCount = countSourceMediaItems(sourceId);

  const upsertItem = db.prepare(`
    INSERT INTO media_items (source_id, folder_path, folder_name, clean_name, media_type, created_at, updated_at, last_scanned_at)
    VALUES (?, ?, ?, ?, 'anime', ?, ?, ?)
    ON CONFLICT(source_id, folder_path) DO UPDATE SET
      folder_name = excluded.folder_name,
      clean_name = excluded.clean_name,
      updated_at = excluded.updated_at,
      last_scanned_at = excluded.last_scanned_at
    RETURNING id
  `);
  const upsertFile = db.prepare(`
    INSERT INTO media_files (media_item_id, file_path, file_name, extension, size, mtime, sort_index, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(media_item_id, file_path) DO UPDATE SET
      file_name = excluded.file_name,
      extension = excluded.extension,
      size = excluded.size,
      mtime = excluded.mtime,
      sort_index = excluded.sort_index,
      updated_at = excluded.updated_at
  `);
  const listExistingFiles = db.prepare("SELECT file_path FROM media_files WHERE media_item_id = ?");
  const deleteFile = db.prepare("DELETE FROM media_files WHERE media_item_id = ? AND file_path = ?");
  const deleteEmptyItems = db.prepare("DELETE FROM media_items WHERE source_id = ? AND id NOT IN (SELECT media_item_id FROM media_files)");

  const exts = new Set(videoExtensions.map((ext) => ext.toLowerCase().startsWith(".") ? ext.toLowerCase() : `.${ext.toLowerCase()}`));
  const parsedDepth = Number(getSettings().maxScanDepth || 3);
  const maxDepth = Number.isFinite(parsedDepth) ? Math.max(1, Math.min(8, parsedDepth)) : 3;

  type FoundMediaItem = {
    folderPath: string;
    folderName: string;
    files: Array<{ filePath: string; size: number; mtime: string }>;
  };

  const foundMediaItems: FoundMediaItem[] = [];
  let fileCount = 0;
  let foldersScanned = 0;

  log("info", "scanner", `开始扫描 ${root}，最大深度 ${maxDepth}`);

  async function collectVideos(currentPath: string, depth: number, files: Array<{ filePath: string; size: number; mtime: string }>) {
    if (depth > maxDepth) return;
    const entries = await safeReadDir(currentPath);
    foldersScanned++;

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;

      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        if (isAuxiliaryFolder(entry.name)) {
          log("info", "scanner", `跳过附属目录：${fullPath}`);
          continue;
        }
        await collectVideos(fullPath, depth + 1, files);
      } else if (entry.isFile() && exts.has(path.extname(entry.name).toLowerCase())) {
        if (isAuxiliaryVideoFile(entry.name)) {
          log("info", "scanner", `跳过附属视频：${fullPath}`);
          continue;
        }
        try {
          const stat = await fsp.stat(fullPath);
          files.push({ filePath: fullPath, size: stat.size, mtime: stat.mtime.toISOString() });
        } catch (error) {
          log("warning", "scanner", `无法读取文件信息：${fullPath}`, error instanceof Error ? error.message : String(error));
        }
      }
    }

    if (foldersScanned % 50 === 0) await yieldToEventLoop();
  }

  // Phase 1: one first-level folder is one media item. Nested folders are kept
  // as detail-page groups instead of becoming separate library cards.
  const rootEntries = await safeReadDir(root);
  for (const entry of rootEntries) {
    if (!entry.isDirectory() || entry.name.startsWith(".") || isAuxiliaryFolder(entry.name)) continue;
    const folderPath = path.join(root, entry.name);
    if (isCollectionFolder(entry.name)) {
      await collectCollectionChildren(folderPath);
    } else {
      await addMediaFolder(folderPath, entry.name);
    }
  }

  // If the selected library root is already a single title folder, there may be
  // no first-level media folders to create. In that case keep the root itself as
  // one item so accidental roots such as "...\\夏日幽灵" do not disappear.
  if (foundMediaItems.length === 0 && !isCollectionFolder(path.basename(root)) && !isAuxiliaryFolder(path.basename(root))) {
    await addMediaFolder(root, path.basename(root));
  }

  log("info", "scanner", `遍历完毕，共发现 ${foundMediaItems.length} 个剧集文件夹`);

  // Phase 2: Upsert MediaItems and their Files into Database
  const writeScanResults = db.transaction(() => {
    for (const itemData of foundMediaItems) {
      const timestamp = now();
      const item = upsertItem.get(sourceId, itemData.folderPath, itemData.folderName, cleanFolderName(itemData.folderName), timestamp, timestamp, timestamp) as { id: number };
      const currentFiles = new Set(itemData.files.map((file) => file.filePath));
      itemData.files.forEach((file, index) => {
        upsertFile.run(item.id, file.filePath, path.basename(file.filePath), path.extname(file.filePath).toLowerCase(), file.size, file.mtime, index, timestamp, timestamp);
        fileCount++;
      });

      const existingFiles = listExistingFiles.all(item.id) as Array<{ file_path: string }>;
      for (const existingFile of existingFiles) {
        if (!currentFiles.has(existingFile.file_path)) {
          deleteFile.run(item.id, existingFile.file_path);
        }
      }
    }
  });
  writeScanResults();
  await yieldToEventLoop();

  // Phase 3: Cleanup abandoned or previously over-split items.
  // Old builds created nested season/SP folders as top-level cards; remove those
  // rows so a rescan leaves only current first-level media items.
  const cleanupAllowed = shouldCleanupStaleItems(beforeItemCount, foundMediaItems.length);
  let staleResult = 0;
  let emptyDeleted = 0;
  if (cleanupAllowed) {
    staleResult = deleteStaleMediaItems(sourceId, foundMediaItems.map((item) => item.folderPath));
    emptyDeleted = Number(deleteEmptyItems.run(sourceId).changes || 0);
  } else {
    log(
      "warning",
      "scanner",
      `跳过旧条目清理：本次扫描结果异常偏少`,
      `扫描前 ${beforeItemCount} 个条目，本次发现 ${foundMediaItems.length} 个。可能是挂载盘、CloudDrive 或网络盘尚未完全加载。旧条目已保留。`
    );
  }
  const afterSnapshot = createSourceSnapshot(sourceId);
  const changed = beforeSnapshot !== afterSnapshot;

  log("info", "scanner", `扫描 ${root} 完成，共新增/更新 ${foundMediaItems.length} 个剧集条目、${fileCount} 个视频文件。清理了 ${staleResult + emptyDeleted} 个旧条目。`);
  return { sourceId, folders: foundMediaItems.length, files: fileCount, changed, removedItems: staleResult + emptyDeleted };

  async function collectCollectionChildren(collectionPath: string) {
    const childEntries = await safeReadDir(collectionPath);
    for (const child of childEntries) {
      if (!child.isDirectory() || child.name.startsWith(".") || isAuxiliaryFolder(child.name)) continue;
      await addMediaFolder(path.join(collectionPath, child.name), child.name);
    }
  }

  async function addMediaFolder(folderPath: string, folderName: string) {
    const files: Array<{ filePath: string; size: number; mtime: string }> = [];
    await collectVideos(folderPath, 1, files);
    if (files.length === 0) return;
    files.sort((a, b) => a.filePath.localeCompare(b.filePath, undefined, { numeric: true, sensitivity: "base" }));
    foundMediaItems.push({ folderPath, folderName, files });
    log("info", "scanner", `识别媒体条目：${folderName}，${files.length} 个视频`, folderPath);
  }
}

function countSourceMediaItems(sourceId: number) {
  const row = getDb().prepare("SELECT COUNT(*) AS count FROM media_items WHERE source_id = ?").get(sourceId) as { count: number };
  return Number(row.count || 0);
}

function shouldCleanupStaleItems(beforeItemCount: number, foundItemCount: number) {
  if (foundItemCount === 0) return beforeItemCount === 0;
  if (beforeItemCount < 20) return true;
  return foundItemCount >= Math.max(10, Math.floor(beforeItemCount * 0.65));
}

function createSourceSnapshot(sourceId: number) {
  const rows = getDb()
    .prepare(`
      SELECT mi.folder_path, mf.file_path, mf.size, mf.mtime
      FROM media_items mi
      LEFT JOIN media_files mf ON mf.media_item_id = mi.id
      WHERE mi.source_id = ?
      ORDER BY mi.folder_path, mf.file_path
    `)
    .all(sourceId) as Array<{ folder_path: string; file_path: string | null; size: number | null; mtime: string | null }>;
  return rows.map((row) => `${row.folder_path}\u001f${row.file_path || ""}\u001f${row.size ?? ""}\u001f${row.mtime || ""}`).join("\u001e");
}

function deleteStaleMediaItems(sourceId: number, currentFolderPaths: string[]) {
  const db = getDb();
  const params: unknown[] = [sourceId];
  const where = currentFolderPaths.length
    ? `source_id = ? AND folder_path NOT IN (${currentFolderPaths.map(() => "?").join(",")})`
    : "source_id = ?";
  params.push(...currentFolderPaths);
  const staleRows = db.prepare(`SELECT id FROM media_items WHERE ${where}`).all(...params) as Array<{ id: number }>;
  if (staleRows.length === 0) return 0;
  const deleteFiles = db.prepare("DELETE FROM media_files WHERE media_item_id = ?");
  const deleteCandidates = db.prepare("DELETE FROM metadata_candidates WHERE media_item_id = ?");
  const deleteHistory = db.prepare("DELETE FROM watch_history WHERE media_item_id = ?");
  const deleteItem = db.prepare("DELETE FROM media_items WHERE id = ?");
  db.transaction(() => {
    for (const row of staleRows) {
      deleteFiles.run(row.id);
      deleteCandidates.run(row.id);
      deleteHistory.run(row.id);
      deleteItem.run(row.id);
    }
  })();
  return staleRows.length;
}

export function isAuxiliaryFolder(folderName: string) {
  const normalized = folderName
    .toLowerCase()
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));
  const compact = normalized.replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
  const tokens = normalized.split(/[^a-z0-9\u4e00-\u9fff]+/).filter(Boolean);
  const specialTokens = new Set([
    "sp",
    "sps",
    "special",
    "specials",
    "op",
    "ed",
    "oped",
    "ncop",
    "nced",
    "pv",
    "cm",
    "menu",
    "menus",
    "font",
    "fonts",
    "scan",
    "scans",
    "extra",
    "extras"
  ]);
  if (tokens.some((token) => specialTokens.has(token))) return true;
  if (/(^|[^a-z])(ncop|nced|op|ed|sp|sps)([^a-z]|$)/i.test(normalized)) return true;
  if (/(oped|opand-ed|opended|ncoped)/i.test(compact)) return true;
  return /(特典|映像特典|菜单|字体|扫图|扫描|字幕|无字幕|特报|预告|预告片|片头|片尾)/.test(compact);
}

export function isAuxiliaryVideoFile(fileName: string) {
  const baseName = path.basename(fileName, path.extname(fileName))
    .toLowerCase()
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));
  const compact = baseName.replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
  if (/(menu|menus|ncop|nced|oped|opand?ed|pv|cm|preview|trailer)/i.test(compact)) return true;
  if (/(菜单|特典|映像特典|片头|片尾|预告|预告片|特报|无字幕)/.test(compact)) return true;
  const tokens = baseName.split(/[^a-z0-9\u4e00-\u9fff]+/).filter(Boolean);
  return tokens.some((token) => ["op", "ed", "sp", "sps", "special", "specials"].includes(token));
}

export function isCollectionFolder(folderName: string) {
  const normalized = folderName
    .toLowerCase()
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));
  const compact = normalized.replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
  return compact === "fate"
    || compact === "fate合集"
    || compact.includes("动画电影合集")
    || compact.includes("动画电影")
    || compact.includes("京阿尼合集")
    || compact.includes("京阿尼");
}

async function safeReadDir(folderPath: string) {
  try {
    return await fsp.readdir(folderPath, { withFileTypes: true });
  } catch (error) {
    log("warning", "scanner", `无法读取目录：${folderPath}`, error instanceof Error ? error.message : String(error));
    return [];
  }
}

async function exists(targetPath: string) {
  try {
    await fsp.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function yieldToEventLoop() {
  return new Promise<void>((resolve) => setImmediate(resolve));
}
