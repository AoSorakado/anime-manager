import path from "node:path";
import { addWebDavSource, exportLibrarySyncState, getDb, getSettings, getSource, importLibrarySyncState, log, now } from "./db.js";
import { cleanFolderName } from "./nameCleaner.js";
import { isAuxiliaryFolder, isAuxiliaryVideoFile, isCollectionFolder } from "./scanner.js";
import type { ScanResult, Source, WebDavSourceInput, WebDavSyncResult } from "../shared/types.js";

const defaultVideoExtensions = [".mkv", ".mp4", ".m4v", ".avi", ".mov", ".webm", ".ts", ".m2ts", ".flv", ".wmv"];

interface DavEntry {
  href: string;
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  mtime: string;
}

export async function addWebDavSourceAndTest(input: WebDavSourceInput) {
  const source = addWebDavSource(input);
  await listWebDavDirectory(source, source.root_path);
  return source;
}

export async function scanWebDavSource(sourceId: number, videoExtensions = defaultVideoExtensions): Promise<ScanResult> {
  const source = getSource(sourceId);
  if (!source) throw new Error(`Source ${sourceId} not found`);
  if (source.type !== "webdav") throw new Error("不是 WebDAV 媒体库");
  const sourceRecord = source;

  const db = getDb();
  const exts = new Set(videoExtensions.map((ext) => ext.toLowerCase().startsWith(".") ? ext.toLowerCase() : `.${ext.toLowerCase()}`));
  const parsedDepth = Number(getSettings().maxScanDepth || 3);
  const maxDepth = Number.isFinite(parsedDepth) ? Math.max(1, Math.min(8, parsedDepth)) : 3;
  const beforeSnapshot = createSourceSnapshot(sourceId);
  const beforeItemCount = countSourceMediaItems(sourceId);

  type FoundMediaItem = {
    folderPath: string;
    folderName: string;
    files: Array<{ filePath: string; fileName: string; extension: string; size: number; mtime: string }>;
  };

  const foundMediaItems: FoundMediaItem[] = [];
  let fileCount = 0;
  let foldersScanned = 0;
  log("info", "webdav", `开始扫描 WebDAV：${sourceRecord.name}`, `${sourceRecord.webdav_url}${sourceRecord.root_path}`);

  async function collectVideos(currentPath: string, depth: number, files: FoundMediaItem["files"]) {
    if (depth > maxDepth) return;
    const entries = await safeListWebDavDirectory(sourceRecord, currentPath);
    foldersScanned += 1;
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (entry.isDirectory) {
        if (isAuxiliaryFolder(entry.name)) {
          log("info", "webdav", `跳过 WebDAV 附属目录：${entry.path}`);
          continue;
        }
        await collectVideos(entry.path, depth + 1, files);
      } else if (exts.has(path.posix.extname(entry.name).toLowerCase())) {
        if (isAuxiliaryVideoFile(entry.name)) {
          log("info", "webdav", `跳过 WebDAV 附属视频：${entry.path}`);
          continue;
        }
        files.push({
          filePath: buildPlaybackUrl(sourceRecord, entry.path),
          fileName: entry.name,
          extension: path.posix.extname(entry.name).toLowerCase(),
          size: entry.size,
          mtime: entry.mtime
        });
      }
    }
    if (foldersScanned % 25 === 0) await new Promise<void>((resolve) => setImmediate(resolve));
  }

  const rootEntries = await safeListWebDavDirectory(sourceRecord, sourceRecord.root_path);
  log("info", "webdav", `WebDAV 根目录读取完成：${sourceRecord.name}，${rootEntries.length} 个直接子项`, sourceRecord.root_path);
  for (const entry of rootEntries) {
    if (!entry.isDirectory || entry.name.startsWith(".") || isAuxiliaryFolder(entry.name)) continue;
    if (isCollectionFolder(entry.name)) {
      const children = await safeListWebDavDirectory(sourceRecord, entry.path);
      for (const child of children) {
        if (!child.isDirectory || child.name.startsWith(".") || isAuxiliaryFolder(child.name)) continue;
        await addMediaFolder(child.path, child.name);
      }
    } else {
      await addMediaFolder(entry.path, entry.name);
    }
  }
  if (foundMediaItems.length === 0 && !isCollectionFolder(lastPathName(sourceRecord.root_path)) && !isAuxiliaryFolder(lastPathName(sourceRecord.root_path))) {
    await addMediaFolder(sourceRecord.root_path, lastPathName(sourceRecord.root_path) || sourceRecord.name);
  }

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

  db.transaction(() => {
    for (const itemData of foundMediaItems) {
      const timestamp = now();
      const item = upsertItem.get(sourceId, itemData.folderPath, itemData.folderName, cleanFolderName(itemData.folderName), timestamp, timestamp, timestamp) as { id: number };
      const currentFiles = new Set(itemData.files.map((file) => file.filePath));
      itemData.files.forEach((file, index) => {
        upsertFile.run(item.id, file.filePath, file.fileName, file.extension, file.size, file.mtime, index, timestamp, timestamp);
        fileCount += 1;
      });
      const existingFiles = listExistingFiles.all(item.id) as Array<{ file_path: string }>;
      for (const existingFile of existingFiles) {
        if (!currentFiles.has(existingFile.file_path)) deleteFile.run(item.id, existingFile.file_path);
      }
    }
  })();

  const cleanupAllowed = shouldCleanupStaleItems(beforeItemCount, foundMediaItems.length);
  let staleResult = 0;
  let emptyDeleted = 0;
  if (cleanupAllowed) {
    staleResult = deleteStaleMediaItems(sourceId, foundMediaItems.map((item) => item.folderPath));
    emptyDeleted = Number(deleteEmptyItems.run(sourceId).changes || 0);
  } else {
    log(
      "warning",
      "webdav",
      "跳过 WebDAV 旧条目清理：本次扫描结果异常偏少",
      `扫描前 ${beforeItemCount} 个条目，本次发现 ${foundMediaItems.length} 个。可能是 WebDAV 服务端目录列表未完整返回，旧条目已保留。`
    );
  }
  const afterSnapshot = createSourceSnapshot(sourceId);
  const changed = beforeSnapshot !== afterSnapshot;
  log("info", "webdav", `WebDAV 扫描完成：${sourceRecord.name}，${foundMediaItems.length} 个条目、${fileCount} 个视频`);
  return { sourceId, folders: foundMediaItems.length, files: fileCount, changed, removedItems: staleResult + emptyDeleted };

  async function addMediaFolder(folderPath: string, folderName: string) {
    const files: FoundMediaItem["files"] = [];
    await collectVideos(folderPath, 1, files);
    if (files.length === 0) {
      log("warning", "webdav", `WebDAV 媒体目录没有识别到视频：${folderName}`, folderPath);
      return;
    }
    files.sort((a, b) => a.fileName.localeCompare(b.fileName, undefined, { numeric: true, sensitivity: "base" }));
    foundMediaItems.push({ folderPath, folderName, files });
    log("info", "webdav", `识别 WebDAV 媒体条目：${folderName}，${files.length} 个视频`, folderPath);
  }
}

async function safeListWebDavDirectory(source: Source, directoryPath: string): Promise<DavEntry[]> {
  try {
    const entries = await listWebDavDirectory(source, directoryPath);
    if (entries.length === 0) log("warning", "webdav", `WebDAV 目录为空或未返回子项：${directoryPath}`);
    return entries;
  } catch (error) {
    log("warning", "webdav", `无法读取 WebDAV 目录：${directoryPath}`, error instanceof Error ? error.message : String(error));
    return [];
  }
}

export async function uploadWebDavSyncState(): Promise<WebDavSyncResult> {
  const settings = getSettings();
  const syncTarget = syncSettingsToSource(settings);
  const state = exportLibrarySyncState();
  const body = JSON.stringify(state, null, 2);
  await putWebDavFile(syncTarget, syncFilePath(settings.syncWebdavPath), body);
  log("info", "webdav", "WebDAV 同步上传完成", syncFilePath(settings.syncWebdavPath));
  return { uploaded: true, items: state.items.length, files: state.items.reduce((sum, item) => sum + item.files.length, 0), histories: state.history.length, message: "上传完成" };
}

export async function downloadWebDavSyncState(): Promise<WebDavSyncResult> {
  const settings = getSettings();
  const syncTarget = syncSettingsToSource(settings);
  const text = await getWebDavFile(syncTarget, syncFilePath(settings.syncWebdavPath));
  const state = JSON.parse(text) as ReturnType<typeof exportLibrarySyncState>;
  const imported = importLibrarySyncState(state);
  log("info", "webdav", "WebDAV 同步拉取完成", syncFilePath(settings.syncWebdavPath));
  return { downloaded: true, ...imported, message: "拉取完成" };
}

async function listWebDavDirectory(source: Source, directoryPath: string): Promise<DavEntry[]> {
  const response = await fetch(buildRequestUrl(source, directoryPath), {
    method: "PROPFIND",
    headers: {
      Depth: "1",
      Authorization: authHeader(source),
      "Content-Type": "application/xml; charset=utf-8"
    },
    body: `<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getcontentlength/><d:getlastmodified/></d:prop></d:propfind>`
  });
  if (!response.ok) {
    throw new Error(`WebDAV 读取目录失败：${response.status} ${response.statusText}`);
  }
  const xml = await response.text();
  const current = normalizeDavPath(directoryPath);
  return parseMultiStatus(xml, new URL(source.webdav_url || "").pathname, directoryPath)
    .filter((entry) => normalizeDavPath(entry.path) !== current)
    .filter((entry) => entry.name);
}

async function putWebDavFile(source: Source, targetPath: string, body: string) {
  await ensureWebDavDirectory(source, parentPath(targetPath));
  const response = await fetch(buildRequestUrl(source, targetPath), {
    method: "PUT",
    headers: {
      Authorization: authHeader(source),
      "Content-Type": "application/json; charset=utf-8"
    },
    body
  });
  if (!response.ok && response.status !== 201 && response.status !== 204) {
    throw new Error(`WebDAV 上传同步文件失败：${response.status} ${response.statusText}`);
  }
}

async function getWebDavFile(source: Source, targetPath: string) {
  const response = await fetch(buildRequestUrl(source, targetPath), {
    method: "GET",
    headers: { Authorization: authHeader(source) }
  });
  if (!response.ok) throw new Error(`WebDAV 拉取同步文件失败：${response.status} ${response.statusText}`);
  return response.text();
}

async function ensureWebDavDirectory(source: Source, directoryPath: string) {
  const parts = normalizeDavPath(directoryPath).split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current += `/${part}`;
    await fetch(buildRequestUrl(source, current), { method: "MKCOL", headers: { Authorization: authHeader(source) } });
  }
}

function parseMultiStatus(xml: string, basePath: string, requestedPath: string): DavEntry[] {
  const responses = xml.match(/<(?:\w+:)?response[\s\S]*?<\/(?:\w+:)?response>/gi) || [];
  const normalizedBase = normalizeDavPath(basePath);
  const normalizedRequested = normalizeDavPath(requestedPath);
  return responses.map((item) => {
    const href = textTag(item, "href");
    const decodedPath = decodeDavHrefPath(href);
    const isDirectory = /<(?:\w+:)?collection\s*\/?>/i.test(item);
    const size = Number(textTag(item, "getcontentlength") || 0);
    const modified = textTag(item, "getlastmodified");
    const normalizedPath = normalizeResponsePath(decodedPath, normalizedBase, normalizedRequested);
    return {
      href,
      name: lastPathName(normalizedPath),
      path: normalizedPath,
      isDirectory,
      size,
      mtime: modified ? new Date(modified).toISOString() : now()
    };
  });
}

function normalizeResponsePath(decodedPath: string, normalizedBase: string, normalizedRequested: string) {
  let normalizedPath = normalizeDavPath(decodedPath);
  if (normalizedBase !== "/" && normalizedPath.toLowerCase().startsWith(normalizedBase.toLowerCase())) {
    normalizedPath = normalizeDavPath(normalizedPath.slice(normalizedBase.length) || "/");
  }
  if (normalizedRequested !== "/" && !isPathWithin(normalizedPath, normalizedRequested)) {
    const lowerPath = normalizedPath.toLowerCase();
    const lowerRequested = normalizedRequested.toLowerCase();
    const index = lowerPath.indexOf(lowerRequested);
    if (index >= 0) normalizedPath = normalizeDavPath(normalizedPath.slice(index));
  }
  return normalizedPath;
}

function isPathWithin(candidate: string, parent: string) {
  const normalizedCandidate = normalizeDavPath(candidate).toLowerCase();
  const normalizedParent = normalizeDavPath(parent).toLowerCase();
  return normalizedCandidate === normalizedParent || normalizedCandidate.startsWith(`${normalizedParent}/`);
}

function decodeDavHrefPath(href: string) {
  const rawPath = extractHrefPath(href);
  try {
    return decodeURIComponent(rawPath);
  } catch {
    return rawPath;
  }
}

function extractHrefPath(href: string) {
  const value = decodeXml(href).trim();
  if (!value) return "/";
  try {
    return new URL(value, "http://webdav.local").pathname;
  } catch {
    return value.split("?")[0].split("#")[0] || "/";
  }
}

function decodeXml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function textTag(xml: string, name: string) {
  const match = xml.match(new RegExp(`<(?:\\w+:)?${name}[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${name}>`, "i"));
  return match?.[1]?.trim() || "";
}

function buildPlaybackUrl(source: Source, filePath: string) {
  const url = new URL(buildRequestUrl(source, filePath));
  if (source.username) url.username = source.username;
  if (source.encrypted_password) url.password = source.encrypted_password;
  return url.toString();
}

function buildRequestUrl(source: Source, davPath: string) {
  const base = new URL(source.webdav_url || "");
  const basePath = base.pathname.replace(/\/+$/, "");
  base.pathname = `${basePath}${encodePath(normalizeDavPath(davPath))}`;
  return base.toString();
}

function encodePath(value: string) {
  return value.split("/").map((part) => encodeURIComponent(part)).join("/");
}

function authHeader(source: Source) {
  if (!source.username && !source.encrypted_password) return "";
  return `Basic ${Buffer.from(`${source.username || ""}:${source.encrypted_password || ""}`).toString("base64")}`;
}

function normalizeDavPath(value: string) {
  const normalized = (value || "/").replace(/\\/g, "/").replace(/\/+/g, "/");
  return normalized.startsWith("/") ? normalized.replace(/\/$/, "") || "/" : `/${normalized.replace(/\/$/, "")}`;
}

function lastPathName(value: string) {
  return normalizeDavPath(value).split("/").filter(Boolean).pop() || "";
}

function parentPath(value: string) {
  const parts = normalizeDavPath(value).split("/").filter(Boolean);
  parts.pop();
  return `/${parts.join("/")}`;
}

function syncFilePath(value?: string) {
  const target = value?.trim() || "/LocalAnimeLibrary/sync.json";
  return target.endsWith(".json") ? normalizeDavPath(target) : `${normalizeDavPath(target)}/sync.json`;
}

function syncSettingsToSource(settings: ReturnType<typeof getSettings>): Source {
  if (!settings.syncWebdavUrl?.trim()) throw new Error("先填写同步 WebDAV 地址");
  return {
    id: 0,
    name: "同步 WebDAV",
    type: "webdav",
    root_path: "/",
    webdav_url: settings.syncWebdavUrl.trim().replace(/[\\\/]+$/, ""),
    username: settings.syncWebdavUsername || null,
    encrypted_password: settings.syncWebdavPassword || null,
    created_at: now(),
    updated_at: now()
  } as Source;
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
      SELECT mi.folder_path, mf.file_path, mf.size, mf.mtime, mf.watched, mf.last_position
      FROM media_items mi
      LEFT JOIN media_files mf ON mf.media_item_id = mi.id
      WHERE mi.source_id = ?
      ORDER BY mi.folder_path, mf.file_path
    `)
    .all(sourceId) as Array<{ folder_path: string; file_path: string | null; size: number | null; mtime: string | null; watched: string | null; last_position: number | null }>;
  return rows.map((row) => `${row.folder_path}\u001f${row.file_path || ""}\u001f${row.size ?? ""}\u001f${row.mtime || ""}\u001f${row.watched || ""}\u001f${row.last_position ?? ""}`).join("\u001e");
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
  db.transaction(() => {
    for (const row of staleRows) {
      db.prepare("DELETE FROM media_files WHERE media_item_id = ?").run(row.id);
      db.prepare("DELETE FROM metadata_candidates WHERE media_item_id = ?").run(row.id);
      db.prepare("DELETE FROM watch_history WHERE media_item_id = ?").run(row.id);
      db.prepare("DELETE FROM media_items WHERE id = ?").run(row.id);
    }
  })();
  return staleRows.length;
}
