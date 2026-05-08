import { spawn } from "node:child_process";
import path from "node:path";
import {
  addRssSubscription,
  deleteRssSubscription,
  getRssItem,
  getRssSubscription,
  getSettings,
  listRssItems,
  listRssSubscriptions,
  log,
  markRssItemDownloadResult,
  upsertRssItems
} from "./db.js";
import type { QbittorrentTestResult, RssItem, RssRefreshResult, RssSubscriptionInput } from "../shared/types.js";

interface ParsedFeedItem {
  guid: string;
  title: string;
  subtitle_group?: string | null;
  size_text?: string | null;
  updated_at_text?: string | null;
  link?: string | null;
  torrent_url?: string | null;
  magnet_url?: string | null;
  pub_date?: string | null;
  raw_json?: string | null;
}

export function subscriptionsList() {
  return listRssSubscriptions();
}

export function subscriptionItems(subscriptionId?: number | null) {
  return listRssItems(subscriptionId);
}

export function subscriptionAdd(input: RssSubscriptionInput) {
  return addRssSubscription(input);
}

export function subscriptionDelete(id: number) {
  return deleteRssSubscription(id);
}

export async function refreshSubscription(id: number): Promise<RssRefreshResult> {
  const subscription = getRssSubscription(id);
  if (!subscription) throw new Error("订阅不存在");
  const items = await fetchFeed(subscription.feed_url);
  const inserted = upsertRssItems(subscription.id, items);
  log("info", "subscription", `刷新 RSS 订阅：${subscription.name}，发现 ${items.length} 条`, subscription.feed_url);
  return { subscriptionId: subscription.id, fetched: items.length, inserted };
}

export async function searchMikan(keyword: string) {
  const query = keyword.trim();
  if (!query) return [];
  const rssItems = await fetchFeed(buildMikanSearchFeed(query)).catch((error) => {
    log("warning", "subscription", `蜜柑 RSS 搜索失败：${query}`, error instanceof Error ? error.message : String(error));
    return [] as ParsedFeedItem[];
  });
  const pageItems = await fetchMikanSearchPage(query).catch((error) => {
    log("warning", "subscription", `蜜柑页面搜索解析失败：${query}`, error instanceof Error ? error.message : String(error));
    return [] as ParsedFeedItem[];
  });
  return mergeSearchItems(pageItems, rssItems);
}

export async function getMikanBangumi(bangumiId: string | number) {
  const id = String(bangumiId).trim();
  if (!id) return [];
  const url = absolutizeMikanUrl(`/Home/Bangumi/${id}`);
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Local Anime Library/0.1 Mikan Scraper",
      Accept: "text/html"
    }
  });
  if (!response.ok) throw new Error(`蜜柑详情页获取失败：${response.status}`);
  const html = await response.text();
  return parseMikanBangumiHtml(html);
}

export async function refreshAllSubscriptions(): Promise<RssRefreshResult[]> {
  const enabled = listRssSubscriptions().filter((item) => item.enabled);
  const results: RssRefreshResult[] = [];
  for (const subscription of enabled) {
    try {
      results.push(await refreshSubscription(subscription.id));
    } catch (error) {
      log("error", "subscription", `刷新 RSS 订阅失败：${subscription.name}`, error instanceof Error ? error.message : String(error));
      results.push({ subscriptionId: subscription.id, fetched: 0, inserted: 0 });
    }
  }
  return results;
}

export async function sendRssItemToQbittorrent(itemId: number) {
  const item = getRssItem(itemId);
  if (!item) throw new Error("RSS 条目不存在");
  const subscription = getRssSubscription(item.subscription_id);
  if (!subscription) throw new Error("订阅不存在");
  const url = item.magnet_url || item.torrent_url || item.link;
  if (!url) throw new Error("这个 RSS 条目没有可提交给 qBittorrent 的链接");
  try {
    await qbAddUrl(url, subscription.save_path || undefined, subscription.name || subscription.keyword || item.title);
    markRssItemDownloadResult(itemId, true);
    log("info", "subscription", `已提交到 qBittorrent：${item.title}`, url, item.id);
    return { sent: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    markRssItemDownloadResult(itemId, false, message);
    log("error", "subscription", `提交 qBittorrent 失败：${item.title}`, message, item.id);
    throw error;
  }
}

export async function sendUrlToQbittorrent(url: string, savePath?: string, title?: string, seriesTitle?: string) {
  const target = url.trim();
  if (!target) throw new Error("没有可提交给 qBittorrent 的链接");
  await qbAddUrl(target, savePath, title, seriesTitle);
  log("info", "subscription", `已提交临时任务到 qBittorrent：${title || target}`, target);
  return { sent: true };
}

export async function sendPendingItemsToQbittorrent(subscriptionId?: number | null) {
  const items = listRssItems(subscriptionId).filter((item) => item.download_status === "pending");
  let sent = 0;
  let failed = 0;
  for (const item of items) {
    try {
      await sendRssItemToQbittorrent(item.id);
      sent += 1;
    } catch {
      failed += 1;
    }
  }
  return { total: items.length, sent, failed };
}

export async function testQbittorrent(): Promise<QbittorrentTestResult> {
  await ensureQbittorrentAvailable();
  const cookie = await qbLogin();
  const response = await qbFetch("/api/v2/app/version", { headers: { Cookie: cookie } });
  if (!response.ok) throw new Error(`qBittorrent 连接失败：${response.status} ${response.statusText}`);
  return { ok: true, version: await response.text() };
}

async function fetchFeed(feedUrl: string): Promise<ParsedFeedItem[]> {
  const response = await fetch(feedUrl, {
    headers: {
      "User-Agent": "Local Anime Library/0.1 RSS Reader",
      Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8"
    }
  });
  if (!response.ok) throw new Error(`RSS 获取失败：${response.status} ${response.statusText}`);
  const xml = await response.text();
  return parseRss(xml);
}

function parseRss(xml: string): ParsedFeedItem[] {
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  return blocks.map((block) => {
    const title = decodeXml(textTag(block, "title"));
    const link = decodeXml(textTag(block, "link"));
    const enclosure = block.match(/<enclosure\b[^>]*>/i)?.[0] || "";
    const enclosureUrl = attr(enclosure, "url");
    const guid = decodeXml(textTag(block, "guid")) || enclosureUrl || link || title;
    const pubDate = parseDate(decodeXml(textTag(block, "pubDate")));
    const torrentUrl = firstTruthy(enclosureUrl, findTorrentUrl(block), link?.includes(".torrent") ? link : "");
    const magnetUrl = findMagnetUrl(block) || (link?.startsWith("magnet:") ? link : "");
    const sizeText = parseSizeText(title);
    const group = parseSubtitleGroup(title);
    return {
      guid,
      title: title || guid,
      subtitle_group: group,
      size_text: sizeText,
      updated_at_text: pubDate ? formatSearchDate(pubDate) : null,
      link: link || null,
      torrent_url: torrentUrl || null,
      magnet_url: magnetUrl || null,
      pub_date: pubDate,
      raw_json: JSON.stringify({ title, link, enclosureUrl, guid, pubDate, group, sizeText })
    };
  }).filter((item) => item.guid && item.title);
}

async function fetchMikanSearchPage(keyword: string): Promise<ParsedFeedItem[]> {
  const response = await fetch(buildMikanSearchPage(keyword), {
    headers: {
      "User-Agent": "Local Anime Library/0.1 Mikan Search",
      Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8"
    }
  });
  if (!response.ok) throw new Error(`蜜柑搜索页获取失败：${response.status} ${response.statusText}`);
  return parseMikanSearchHtml(await response.text());
}

function parseMikanBangumiHtml(html: string): ParsedFeedItem[] {
  const items: ParsedFeedItem[] = [];
  
  // Use a more robust way to find groups: find each subgroup-text and its corresponding episode-table
  const subgroupRegex = /<div[^>]*class="subgroup-text"[^>]*>([\s\S]*?)<\/div>/gi;
  const tableRegex = /<div[^>]*class="episode-table"[^>]*>([\s\S]*?)<\/div>/gi;
  
  let subgroupMatch;
  while ((subgroupMatch = subgroupRegex.exec(html)) !== null) {
    const groupHtml = subgroupMatch[1];
    
    // Look for the next episode-table after this subgroup-text
    tableRegex.lastIndex = subgroupRegex.lastIndex;
    const tableMatch = tableRegex.exec(html);
    if (!tableMatch) continue;
    
    const tableHtml = tableMatch[1];
    const groupNameMatch = groupHtml.match(/<a[^>]*>([^<]+)<\/a>/i);
    const groupName = groupNameMatch ? groupNameMatch[1].trim() : "未知字幕组";
    
    const rows = tableHtml.match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
    for (const row of rows) {
      if (!row.includes("magnet-link-wrap")) continue;
      
      const cells = row.match(/<td\b[\s\S]*?<\/td>/gi) || [];
      if (cells.length < 3) continue;
      
      const titleLinkMatch = row.match(/<a[^>]*class="magnet-link-wrap"[^>]*>([\s\S]*?)<\/a>/i);
      if (!titleLinkMatch) continue;
      
      const title = cleanHtml(titleLinkMatch[1]);
      const href = firstTruthy(findMagnetUrl(row), findHref(row, /magnet:\?|\.torrent|Download|RSS\/Download/i));
      const link = href ? absolutizeMikanUrl(href) : null;
      
      // Index 2 is Size, Index 3 is Date
      const sizeText = cleanHtml(cells[2] || "").trim();
      const updatedText = cleanHtml(cells[3] || "").trim();
      const pubDate = parseDate(updatedText);
      
      items.push({
        guid: link || title,
        title,
        subtitle_group: groupName,
        size_text: sizeText || null,
        updated_at_text: updatedText || formatSearchDate(pubDate),
        link,
        torrent_url: link && !link.startsWith("magnet:") ? link : null,
        magnet_url: link?.startsWith("magnet:") ? link : null,
        pub_date: pubDate,
        raw_json: JSON.stringify({ title, link, group: groupName, sizeText, updatedText })
      });
    }
  }
  
  if (items.length === 0) {
    return parseMikanSearchHtml(html);
  }
  return items;
}

function parseMikanSearchHtml(html: string): ParsedFeedItem[] {
  const rows = html.match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
  const items: ParsedFeedItem[] = [];
  for (const row of rows) {
    const cells = row.match(/<td\b[\s\S]*?<\/td>/gi) || [];
    if (cells.length < 3 || !/Download|download|torrent|磁链|glyphicon-download|fa-download/i.test(row)) continue;
    const titleCell = cells.find((cell) => /magnet|torrent|Home\/Bangumi|Download/i.test(cell) && cleanHtml(cell).length > 8) || cells[1] || cells[0];
    const title = cleanHtml(titleCell || "").replace(/^番组名\s*/i, "").replace(/\[\s*复制磁链\s*\]|\(\s*复制磁链\s*\)|【\s*复制磁链\s*】|复制磁链/gi, "").trim();
    if (!title || /番组名|大小|更新时间/.test(title)) continue;
    const href = firstTruthy(findMagnetUrl(row), findHref(row, /magnet:\?|\.torrent|Download|RSS\/Download/i), findTorrentUrl(row));
    const link = href ? absolutizeMikanUrl(href) : null;
    const sizeText = cleanHtml(cells.find((cell) => /\d+(?:\.\d+)?\s*(?:GB|GiB|MB|MiB|KB|KiB)/i.test(cleanHtml(cell))) || "") || parseSizeText(title);
    const updatedText = cleanHtml(cells.find((cell) => /\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(cleanHtml(cell))) || "");
    const group = parseSubtitleGroup(title);
    const pubDate = parseDate(updatedText);
    items.push({
      guid: link || title,
      title,
      subtitle_group: group,
      size_text: sizeText || null,
      updated_at_text: updatedText || formatSearchDate(pubDate),
      link,
      torrent_url: link && !link.startsWith("magnet:") ? link : null,
      magnet_url: link?.startsWith("magnet:") ? link : null,
      pub_date: pubDate,
      raw_json: JSON.stringify({ title, link, group, sizeText, updatedText })
    });
  }
  return dedupeItems(items);
}

function mergeSearchItems(primary: ParsedFeedItem[], fallback: ParsedFeedItem[]) {
  if (primary.length === 0) return fallback;
  const result = new Map<string, ParsedFeedItem>();
  for (const item of primary) result.set(normalizeTitleKey(item.title), item);
  for (const item of fallback) {
    const key = normalizeTitleKey(item.title);
    const existing = result.get(key);
    if (!existing) {
      result.set(key, item);
      continue;
    }
    result.set(key, {
      ...existing,
      link: existing.link || item.link,
      torrent_url: existing.torrent_url || item.torrent_url,
      magnet_url: existing.magnet_url || item.magnet_url,
      pub_date: existing.pub_date || item.pub_date,
      updated_at_text: existing.updated_at_text || item.updated_at_text,
      raw_json: existing.raw_json || item.raw_json
    });
  }
  return Array.from(result.values());
}

function textTag(xml: string, name: string) {
  const match = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
  return stripCdata(match?.[1]?.trim() || "");
}

function attr(tag: string, name: string) {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i"));
  return decodeXml(match?.[1] || "");
}

function stripCdata(value: string) {
  return value.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
}

function decodeXml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function decodeHtml(value: string) {
  return decodeXml(value)
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([a-f0-9]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function cleanHtml(value: string) {
  return decodeHtml(stripCdata(value)
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\[\s*复制磁链\s*\]|\(\s*复制磁链\s*\)|【\s*复制磁链\s*】|复制磁链/gi, "")
    .trim());
}

function parseDate(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function parseSubtitleGroup(title: string) {
  const match = title.match(/^[\[\【]([^\]\】]{1,40})[\]\】]/);
  return match?.[1]?.trim() || null;
}

function parseSizeText(title: string) {
  return title.match(/\b\d+(?:\.\d+)?\s*(?:GB|GiB|MB|MiB|KB|KiB)\b/i)?.[0] || null;
}

function formatSearchDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

function normalizeTitleKey(title: string) {
  return title.replace(/\s+/g, " ").trim().toLowerCase();
}

function dedupeItems(items: ParsedFeedItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.guid || normalizeTitleKey(item.title);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function findHref(html: string, pattern: RegExp) {
  const hrefs = Array.from(html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)).map((match) => decodeHtml(match[1]));
  return hrefs.find((href) => pattern.test(href)) || "";
}

function findTorrentUrl(block: string) {
  const candidates = block.match(/https?:\/\/[^\s<>"']+?\.torrent(?:\?[^\s<>"']*)?/gi) || [];
  return candidates[0] ? decodeXml(candidates[0]) : "";
}

function findMagnetUrl(block: string) {
  const decoded = decodeHtml(block);
  const candidates = decoded.match(/magnet:\?[^\s<>"']+/gi) || [];
  return candidates[0] ? decodeXml(candidates[0]) : "";
}

function firstTruthy(...values: Array<string | null | undefined>) {
  return values.find((value) => value && value.trim())?.trim() || "";
}

function buildMikanSearchFeed(keyword: string) {
  const base = (getSettings().mikanBaseUrl || "https://mikanani.me").replace(/\/+$/, "");
  return `${base}/RSS/Search?searchstr=${encodeURIComponent(keyword)}`;
}

function buildMikanSearchPage(keyword: string) {
  const base = (getSettings().mikanBaseUrl || "https://mikanani.me").replace(/\/+$/, "");
  return `${base}/Home/Search?searchstr=${encodeURIComponent(keyword)}`;
}

function absolutizeMikanUrl(url: string) {
  if (url.startsWith("magnet:")) return url;
  const base = (getSettings().mikanBaseUrl || "https://mikanani.me").replace(/\/+$/, "");
  try {
    return new URL(url, `${base}/`).toString();
  } catch {
    return url;
  }
}

async function qbAddUrl(url: string, savePath?: string, title?: string, seriesTitle?: string) {
  await ensureQbittorrentAvailable();
  const cookie = await qbLogin();
  const params = new URLSearchParams();
  params.set("urls", url);
  params.set("category", "LocalAnimeLibrary");
  params.set("paused", "false");
  
  // 核心逻辑：如果明确传了 seriesTitle（如番剧中文名），直接用它做文件夹名，解决多字幕组文件夹杂乱问题
  const cleanedSeriesTitle = seriesTitle ? cleanHtml(seriesTitle).replace(/\[\s*复制磁链\s*\]|复制磁链/gi, "").trim() : "";
  const cleanedTitle = title ? cleanHtml(title).replace(/\[\s*复制磁链\s*\]|复制磁链/gi, "").trim() : "";
  const folderName = cleanedSeriesTitle || (cleanedTitle ? guessSeriesFolderName(cleanedTitle) : "");
  const targetPath = buildGroupedSavePath(savePath || getSettings().qbSavePath || "", folderName);
  
  if (targetPath.trim()) params.set("savepath", targetPath.trim());
  const response = await qbFetch("/api/v2/torrents/add", {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params.toString()
  });
  if (!response.ok) throw new Error(`qBittorrent 添加任务失败：${response.status} ${response.statusText}`);
  const text = await response.text();
  if (/fails?|error/i.test(text)) throw new Error(`qBittorrent 添加任务失败：${text}`);
}

function buildGroupedSavePath(basePath: string, title?: string) {
  const base = basePath.trim();
  if (!base) return "";
  const folderName = sanitizeFolderName(guessSeriesFolderName(title || ""));
  if (!folderName) return base;
  if (/^[a-z]+:\/\//i.test(base)) return `${base.replace(/[\\/]+$/, "")}/${encodeURIComponent(folderName)}`;
  if (/^[a-zA-Z]:[\\/]/.test(base) || base.includes("\\")) return path.win32.join(base, folderName);
  return `${base.replace(/\/+$/, "")}/${folderName}`;
}

function guessSeriesFolderName(title: string) {
  let value = title
    .replace(/^[\[\【][^\]\】]{1,60}[\]\】]\s*/g, "")
    .replace(/\[\s*复制磁链\s*\]|\(\s*复制磁链\s*\)|【\s*复制磁链\s*】|复制磁链/gi, "")
    .replace(/\[[^\]]*(?:1080|2160|720|HEVC|AVC|x26[45]|AAC|FLAC|GB|BIG5|繁|简|内嵌|外挂|WebRip|BDRip|CHS|CHT)[^\]]*\]/gi, " ")
    .replace(/【[^】]*(?:1080|2160|720|HEVC|AVC|x26[45]|AAC|FLAC|GB|BIG5|繁|简|内嵌|外挂|WebRip|BDRip|CHS|CHT)[^】]*】/gi, " ")
    .replace(/\b(?:S\d{1,2}|Season\s*\d{1,2}|第[一二三四五六七八九十0-9]+季)\b/gi, (match) => ` ${match} `)
    .replace(/\s+-\s*(?:\d{1,3}|第?\d{1,3}[话話集]?|[Ee][Pp]?\d{1,3})(?:\s|$).*/i, " ")
    .replace(/\s+(?:\d{1,3}|第?\d{1,3}[话話集]?|[Ee][Pp]?\d{1,3})(?:v\d+)?(?:\s|$).*/i, " ")
    .replace(/\[[0-9]{1,3}(?:[-~][0-9]{1,3})?[^\]]*\]/g, " ")
    .replace(/【[0-9]{1,3}(?:[-~][0-9]{1,3})?[^】]*】/g, " ")
    .replace(/\b(?:END|Fin|BIG5|GB|CHS|CHT)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  value = value.replace(/[\s._-]+$/g, "").trim();
  return value || title.trim();
}

function sanitizeFolderName(value: string) {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 120);
}

async function qbLogin() {
  const settings = getSettings();
  const username = settings.qbUsername || "";
  const password = settings.qbPassword || "";
  const params = new URLSearchParams();
  params.set("username", username);
  params.set("password", password);
  const response = await qbFetch("/api/v2/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString()
  });
  const cookie = response.headers.get("set-cookie")?.split(";")[0] || "";
  const text = await response.text();
  if (!response.ok || !/Ok\./i.test(text) || !cookie) {
    throw new Error("qBittorrent 登录失败，请检查 WebUI 地址、用户名和密码");
  }
  return cookie;
}

function qbFetch(route: string, init?: RequestInit) {
  const base = (getSettings().qbUrl || "http://127.0.0.1:8080").replace(/\/+$/, "");
  return fetch(`${base}${route}`, init);
}

async function ensureQbittorrentAvailable() {
  if (await isQbittorrentReachable(1200)) return;
  const settings = getSettings();
  const executable = settings.qbExecutablePath?.trim();
  if (!executable) return;

  try {
    const child = spawn(executable, [], {
      detached: true,
      stdio: "ignore",
      windowsHide: true
    });
    child.unref();
    log("info", "subscription", "已自动启动 qBittorrent", executable);
  } catch (error) {
    log("warning", "subscription", "自动启动 qBittorrent 失败", error instanceof Error ? error.message : String(error));
    return;
  }

  const ready = await waitForQbittorrent(15000);
  if (!ready) {
    log("warning", "subscription", "qBittorrent 已启动，但 WebUI 暂未响应", getSettings().qbUrl || "http://127.0.0.1:8080");
  }
}

async function waitForQbittorrent(timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isQbittorrentReachable(1200)) return true;
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
  return false;
}

async function isQbittorrentReachable(timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await qbFetch("/api/v2/app/version", { signal: controller.signal });
    return response.ok || response.status === 403;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
