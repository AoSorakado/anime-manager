import type { BangumiAirtimeCollection, BangumiAirtimeSeason, BangumiAirtimeShow, BangumiTag, BangumiTagAnimeResponse, MikanWeeklyCollection, MikanWeeklyGroup, MikanWeeklyShow, MediaFile, MediaItem, MetadataCandidate, OnlineEpisode, OnlineSearchResult, RssItem, ScrapeIssue, SettingsMap, Source, WatchStats, WatchStatus } from "../electron/shared/types";

// ─── Constants ────────────────────────────────────────────────

export const WEEKDAY_LABELS = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"] as const;
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export const watchStatusOptions = [
  { value: "unwatched", label: "想看" },
  { value: "watching", label: "在看" },
  { value: "watched", label: "看过" },
  { value: "on_hold", label: "搁置" },
  { value: "dropped", label: "抛弃" }
];

export const TIME_MACHINE_YEARS = [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017];
export const TIME_MACHINE_SEASONS: Array<BangumiAirtimeSeason | "全部"> = ["全部", "春", "夏", "秋", "冬"];

export const SUBSCRIPTION_SEARCH_STATE_KEY = "localAnime.subscriptionSearchState";
export const ONLINE_STATE_KEY = "localAnime.onlinePageState";
export const MIKAN_HUB_STATE_KEY = "localAnime.mikanHubState";

// ─── Types ────────────────────────────────────────────────────

export type Page = "library" | "online" | "collection" | "detail" | "scrape" | "scrape-detail" | "settings" | "logs" | "stats" | "subscriptions" | "tags";

export interface CardTransitionPayload {
  rect: DOMRect;
  element?: HTMLElement;
  title: string;
  coverPath?: string;
  mediaItemId?: number;
}

export interface SubscriptionSearchState {
  keyword: string;
  group: string;
  results: RssItem[];
  message: string;
}

export interface OnlinePageState {
  ruleQuery: string;
  keyword: string;
  selectedRuleUrl: string;
}

export interface MikanHubState {
  keyword: string;
  selectedShowUrl: string;
  selectedShowTitle: string;
  selectedWeekdayIndex: number;
  home: MikanWeeklyCollection | null;
  searchResults: OnlineSearchResult[];
  selectedResultUrl: string;
  episodes: OnlineEpisode[];
  downloadResults: RssItem[];
  downloadGroup?: string;
}

export interface TimeMachineState {
  open: boolean;
  year: number;
  season: BangumiAirtimeSeason | "全部";
  archive: BangumiAirtimeCollection | null;
}

export type LibraryEntry =
  | { kind: "item"; item: MediaItem; title: string; coverItem: MediaItem; status: WatchStatus; order: number }
  | { kind: "series"; key: string; items: MediaItem[]; title: string; coverItem: MediaItem; status: WatchStatus; fileCount: number; order: number };

export interface MediaFileGroup {
  key: string;
  title: string;
  files: MediaFile[];
  totalSize: number;
}

export type AnimeSeason = BangumiAirtimeSeason;

// ─── JSON / Storage Utilities ─────────────────────────────────

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function parseInfobox(infobox: unknown) {
  if (!Array.isArray(infobox)) return [];
  return (infobox as Array<{ key?: unknown; value?: unknown }>).map((entry) => ({
    key: String(entry.key || ""),
    value: stringifyInfoValue(entry.value)
  })).filter((entry) => entry.key && entry.value);
}

export function stringifyInfoValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => stringifyInfoValue(item)).filter(Boolean).join("、");
  }
  if (typeof value === "object" && value !== null) {
    const objectValue = value as { v?: unknown; k?: unknown };
    return String(objectValue.v || objectValue.k || "");
  }
  return String(value || "");
}

export function readJsonState<T>(key: string, fallback: T): T {
  try {
    const raw = window.sessionStorage.getItem(key) || window.localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

export function writeJsonState<T>(key: string, value: T) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota or privacy mode failures
  }
}

// ─── Image Utilities ──────────────────────────────────────────

export function characterImage(character: Record<string, unknown>) {
  const images = character.images as Record<string, string> | undefined;
  return images?.large || images?.medium || images?.grid || images?.small || "";
}

export function personImage(person: Record<string, unknown>) {
  const images = person.images as Record<string, string> | undefined;
  return images?.large || images?.medium || images?.grid || images?.small || "";
}

export function localFileUrl(filePath: string) {
  return encodeURI(`file:///${filePath.replace(/\\/g, "/").replace(/^\/+/, "")}`);
}

// ─── Formatting Utilities ─────────────────────────────────────

export function formatSize(size: number) {
  const gb = size / 1024 / 1024 / 1024;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function formatStatDuration(seconds: number) {
  if (!seconds) return "0 分钟";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.max(1, Math.round((seconds % 3600) / 60));
  if (hours <= 0) return `${minutes} 分钟`;
  return `${hours} 小时 ${minutes} 分钟`;
}

export function shortDate(date: string) {
  const parts = date.split("-");
  return parts.length === 3 ? `${Number(parts[1])}/${Number(parts[2])}` : date;
}

export function statusColor(status: WatchStatus) {
  const colors: Record<WatchStatus, string> = {
    unwatched: "#f7a8ca",
    watching: "#f3c766",
    watched: "#73c69c",
    on_hold: "#9bb7e8",
    dropped: "#c7a0d8"
  };
  return colors[status] || "#f7a8ca";
}

export function statusLabel(status: WatchStatus) {
  if (status === "watched") return "看过";
  if (status === "watching") return "在看";
  if (status === "on_hold") return "搁置";
  if (status === "dropped") return "抛弃";
  return "想看";
}

export function buildPieGradient(items: Array<{ value: number; color: string }>) {
  const total = items.reduce((sum, item) => sum + item.value, 0) || 1;
  let cursor = 0;
  const stops = items.map((item) => {
    const start = cursor;
    cursor += (item.value / total) * 100;
    return `${item.color} ${start}% ${cursor}%`;
  });
  return `conic-gradient(${stops.join(", ")})`;
}

export function settingLabel(key: keyof SettingsMap) {
  const labels: Record<string, string> = {
    mpvPath: "mpv.exe 路径",
    mpvArgs: "mpv 启动参数",
    videoExtensions: "视频扩展名",
    subtitleExtensions: "字幕扩展名",
    logLevel: "日志等级",
    autoScrape: "自动刮削",
    maxScanDepth: "最大扫描深度",
    bangumiToken: "Bangumi Access Token",
    bangumiSyncUnwatched: "想看同步规则",
    bangumiPrivateCollection: "Bangumi 私密收藏",
    mikanBaseUrl: "蜜柑站点地址",
    mikanPersonalRssUrl: "蜜柑个人 RSS 地址",
    qbUrl: "qBittorrent WebUI 地址",
    qbUsername: "qBittorrent 用户名",
    qbPassword: "qBittorrent 密码",
    qbSavePath: "qBittorrent 默认保存路径",
    qbExecutablePath: "qBittorrent 程序路径",
    pan123ClientId: "123 云盘 clientID",
    pan123ClientSecret: "123 云盘 clientSecret",
    pan123AccessToken: "123 云盘 accessToken",
    pan123TokenExpiredAt: "123 云盘 token 过期时间",
    pan123OfflineDirId: "123 云盘离线目录 ID",
    pan123CallbackUrl: "123 云盘回调地址",
    pikpakRclonePath: "PikPak rclone 路径",
    pikpakRemote: "PikPak remote",
    pikpakSavePath: "PikPak 保存目录"
  };
  return labels[key] || key;
}

export function trimNumber(value: number, digits: number) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)).toString() : "";
}

// ─── Rating Utilities ─────────────────────────────────────────

export function ratingGrade(score: number) {
  if (score >= 8.5) return "神作";
  if (score >= 8) return "力荐";
  if (score >= 7) return "推荐";
  if (score >= 6) return "还行";
  if (score > 0) return "较差";
  return "";
}

export function ratingDeviation(buckets: Array<{ score: number; count: number }>, total: number, average: number) {
  if (!total || !average) return "暂无";
  const variance = buckets.reduce((sum, bucket) => sum + bucket.count * Math.pow(bucket.score - average, 2), 0) / total;
  return trimNumber(Math.sqrt(variance), 4);
}

export function ratingConsensus(buckets: Array<{ score: number; count: number }>, total: number) {
  if (!total) return "暂无";
  const topShare = Math.max(...buckets.map((bucket) => bucket.count)) / total;
  if (topShare >= 0.34) return "基本一致";
  if (topShare >= 0.24) return "略有分歧";
  return "分歧较大";
}

// ─── Relation Utilities ───────────────────────────────────────

export function groupRelatedSubjects(relations: Array<Record<string, unknown>>) {
  const groups = new Map<string, Array<{ id: string; title: string; image?: string; year?: string; score?: number; type?: string; eps?: number }>>();
  for (const relation of relations) {
    const subject = ((relation.subject && typeof relation.subject === "object") ? relation.subject : relation) as Record<string, unknown>;
    const title = String(subject.name_cn || subject.name || relation.name_cn || relation.name || "").trim();
    if (!title) continue;
    const label = relationLabel(String(relation.relation || relation.relation_cn || relation.type || "关联"));
    const images = subject.images as Record<string, string> | undefined;
    const rating = subject.rating as { score?: number } | undefined;
    const date = String(subject.date || "");
    const type = String(subject.type || relation.type || "");
    const typeName = type === "1" ? "书籍" : type === "2" ? "动画" : type === "3" ? "音乐" : type === "4" ? "游戏" : type === "6" ? "三次元" : "";

    const bucket = groups.get(label) || [];
    bucket.push({
      id: String(subject.id || relation.id || ""),
      title,
      image: images?.grid || images?.small || images?.medium || images?.large,
      year: date ? date.slice(0, 4) : undefined,
      score: rating?.score,
      type: typeName,
      eps: Number(subject.eps || subject.ep_count || 0) || undefined
    });
    groups.set(label, bucket);
  }
  return [...groups.entries()].map(([label, items]) => ({ label, items })).slice(0, 8);
}

export function relationLabel(value: string) {
  const map: Record<string, string> = {
    sequel: "续集",
    prequel: "前传",
    same_setting: "相同世界观",
    alternative_setting: "不同世界观",
    alternative_version: "不同版本",
    side_story: "番外篇",
    parent_story: "主线",
    character: "角色衍生",
    summary: "总集篇",
    full_story: "完整版",
    spinoff: "衍生",
    adaption: "改编",
    book: "书籍",
    music: "音乐",
    game: "游戏",
    other: "其他"
  };
  return map[value] || value || "关联";
}

// ─── Scrape Utilities ─────────────────────────────────────────

export function summaryFromRaw(rawJson: string) {
  try {
    const raw = JSON.parse(rawJson) as { summary?: string };
    return (raw.summary || "").slice(0, 120);
  } catch {
    return "";
  }
}

export function candidateMeta(candidate: MetadataCandidate) {
  const parts = [candidate.original_title, candidate.year, candidate.score ? `评分 ${candidate.score}` : null, candidate.match_score ? `匹配 ${candidate.match_score}` : null];
  try {
    const raw = JSON.parse(candidate.raw_json || "{}") as {
      rank?: number;
      eps?: number;
      total_episodes?: number;
      platform?: string;
      rating?: { total?: number };
      tags?: Array<{ name?: string }>;
      meta_tags?: string[];
    };
    parts.push(raw.rank ? `排名 ${raw.rank}` : null);
    parts.push((raw.eps || raw.total_episodes) ? `${raw.eps || raw.total_episodes} 话` : null);
    parts.push(raw.platform || null);
    parts.push(raw.rating?.total ? `${raw.rating.total} 人评分` : null);
    const tags = (raw.meta_tags || raw.tags?.slice(0, 4).map((tag) => tag.name).filter(Boolean) || []).slice(0, 4);
    if (tags.length) parts.push(tags.join(" / "));
  } catch {
    // Keep basic metadata when raw JSON is unavailable.
  }
  return parts.filter(Boolean).join(" · ");
}

// ─── Library Grouping Utilities ───────────────────────────────

export function categoryMatches(item: MediaItem, category: string) {
  if (category === "all") return true;
  return inferMediaCategory(item) === category;
}

export function inferMediaCategory(item: MediaItem): "tv" | "movie" | "ova" | "collection" | "unknown" {
  const metadata = parseJson<Record<string, unknown>>(item.metadata_json, {});
  const platform = String(metadata.platform || "").toLowerCase();
  const text = [item.title, item.original_title, item.clean_name, item.folder_name, item.folder_path, platform].filter(Boolean).join(" ").toLowerCase();
  if (/合集|系列|collection|京阿尼|fate/.test(text) && (item.file_count || 0) > 20 && !item.external_id) return "collection";
  if (/剧场版|映画|电影|movie|the\s+movie|anime\s+film/.test(text) || platform.includes("movie") || platform.includes("剧场版")) return "movie";
  if (/\b(ova|oad|ona|sp|special|specials)\b/i.test(text) || /特别篇|番外|特典|ova|oad|ona/.test(text)) return "ova";
  if (platform.includes("tv") || /(^|[\s/])tv($|[\s/])|第[一二三四五六七八九十0-9]+季|season|\bs\d+\b/i.test(text)) return "tv";
  if ((item.file_count || 0) >= 2) return "tv";
  return "unknown";
}

export function groupLibraryEntries(items: MediaItem[]): LibraryEntry[] {
  const buckets = new Map<string, Array<{ item: MediaItem; canGroup: boolean; title: string; order: number }>>();
  items.forEach((item, index) => {
    const group = seriesGroupingInfo(item);
    const bucket = buckets.get(group.key) || [];
    bucket.push({ item, canGroup: group.canGroup, title: group.title, order: index });
    buckets.set(group.key, bucket);
  });

  const entries: LibraryEntry[] = [];
  for (const [key, bucket] of buckets) {
    const shouldGroup = bucket.length > 1 && bucket.some((entry) => entry.canGroup);
    if (!shouldGroup) {
      entries.push(...bucket.map(({ item, order }) => ({
        kind: "item" as const,
        item,
        title: item.title || item.clean_name,
        coverItem: item,
        status: item.watch_status,
        order
      })));
      continue;
    }
    const sorted = [...bucket].sort((a, b) => (a.item.year || 9999) - (b.item.year || 9999) || a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" }));
    const coverItem = sorted.find((entry) => entry.item.cover_path)?.item || sorted[0].item;
    const title = shortestTitle(sorted.map((entry) => entry.title));
    entries.push({
      kind: "series",
      key,
      items: sorted.map((entry) => entry.item),
      title,
      coverItem,
      status: aggregateStatus(sorted.map((entry) => entry.item.watch_status)),
      fileCount: sorted.reduce((sum, entry) => sum + (entry.item.file_count || 0), 0),
      order: Math.min(...bucket.map((entry) => entry.order))
    });
  }

  return entries.sort((a, b) => a.order - b.order);
}

export function seriesGroupingInfo(item: MediaItem) {
  const raw = item.clean_name || item.title || item.folder_name;
  const special = specialSeriesGrouping(raw);
  if (special) return special;
  let title = raw
    .replace(/^\s*(更多|续|新)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const before = title;
  title = title
    .replace(/\b(?:season|s)\s*\d+\b/gi, "")
    .replace(/\b\d+(?:st|nd|rd|th)\s+season\b/gi, "")
    .replace(/\bpart\s*\d+\b/gi, "")
    .replace(/第\s*[一二三四五六七八九十0-9]+\s*[季期部章]/g, "")
    .replace(/[（(]\s*第?\s*[一二三四五六七八九十0-9]+\s*[季期部章]\s*[）)]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const key = title.toLowerCase().replace(/[\s._:：\-!！?？'"“”‘’【】\[\]()（）]+/g, "");
  return { key: key || raw, title: title || raw, canGroup: title !== before };
}

export function specialSeriesGrouping(raw: string) {
  const normalized = raw
    .replace(/^[A-Z]\s+(?:4k\s+)?/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (/^fate(?:\b|[\s/:：／-])/i.test(normalized)) {
    return { key: "special-series-fate", title: "Fate", canGroup: true };
  }
  return null;
}

export function shortestTitle(titles: string[]) {
  return [...titles].sort((a, b) => a.length - b.length || a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))[0] || "系列";
}

export function aggregateStatus(statuses: WatchStatus[]): WatchStatus {
  if (statuses.length === 0) return "unwatched";
  if (statuses.every((status) => status === statuses[0])) return statuses[0];
  if (statuses.includes("watching")) return "watching";
  if (statuses.includes("watched")) return "watching";
  if (statuses.includes("on_hold")) return "on_hold";
  if (statuses.includes("dropped")) return "dropped";
  return "unwatched";
}

// ─── File Grouping Utilities ──────────────────────────────────

export function groupMediaFiles(files: MediaFile[], rootPath: string): MediaFileGroup[] {
  const root = normalizePath(rootPath);
  const groups = new Map<string, MediaFileGroup>();
  for (const file of files) {
    const relative = normalizePath(file.file_path).startsWith(root)
      ? normalizePath(file.file_path).slice(root.length).replace(/^\/+/, "")
      : file.file_name;
    const segments = relative.split("/").filter(Boolean);
    const rawGroup = segments.length > 1 ? segments[0] : "主目录";
    const key = rawGroup || "主目录";
    const title = cleanGroupTitle(key);
    const group = groups.get(key) || { key, title, files: [], totalSize: 0 };
    group.files.push(file);
    group.totalSize += file.size;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" }));
}

export function normalizePath(value: string) {
  return value.replace(/\\/g, "/").replace(/\/+$/, "");
}

export function cleanGroupTitle(value: string) {
  return value
    .replace(/^\s*(\d+)[.．、_\-\s]*/, "$1. ")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Translation ──────────────────────────────────────────────

export async function translateToChinese(text: string): Promise<string> {
  if (!text || !text.trim()) return "";
  if (text.length < 3) return text;
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=${encodeURIComponent(text)}`;
    const resp = await fetch(url);
    const data = await resp.json();
    if (data && data[0]) {
      return data[0].map((x: any) => x[0]).join("");
    }
    return text;
  } catch (err) {
    console.warn("Translation failed:", err);
    return text;
  }
}

// ─── Scroll Utilities ─────────────────────────────────────────

export function mainScrollElement() {
  return document.querySelector(".main") as HTMLElement | null;
}

export function getMainScrollY() {
  return mainScrollElement()?.scrollTop || window.scrollY || 0;
}

export function scrollMainTo(top: number) {
  const target = mainScrollElement();
  if (target) {
    target.scrollTo({ top, left: 0 });
    return;
  }
  window.scrollTo(0, top);
}

// ─── Seasonal / Mikan Utilities ───────────────────────────────

export function weekdayLabel(index: number) {
  return WEEKDAY_LABELS[index] || `星期${index + 1}`;
}

export function inferWeekdayIndexFromAirText(airText?: string | null) {
  if (!airText) return null;
  const match = airText.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) return null;
  return date.getDay();
}

export function syntheticWeeklyShowFromAirtime(item: BangumiAirtimeShow, year: number, season: BangumiAirtimeSeason): MikanWeeklyShow {
  return {
    bangumi_id: item.bangumi_id,
    title: item.title,
    url: item.url,
    cover_url: item.cover_url || "",
    updated_at: item.air_text || `${year}年${season}`,
    weekday_index: 0,
    weekday_label: "时光机器",
    season_label: `${year}年${season}`
  };
}

export function synthesizeWeeklyHomeFromArchive(archive: BangumiAirtimeCollection, seasonFilter: BangumiAirtimeSeason | "全部") {
  const groups = new Map<number, MikanWeeklyGroup>();
  for (const seasonGroup of archive.groups) {
    if (seasonFilter !== "全部" && seasonGroup.season !== seasonFilter) continue;
    for (const item of seasonGroup.items) {
      const weekdayIndex = inferWeekdayIndexFromAirText(item.air_text) ?? 0;
      const group = groups.get(weekdayIndex) || {
        weekday_index: weekdayIndex,
        weekday_label: weekdayLabel(weekdayIndex),
        items: []
      };
      group.items.push({
        bangumi_id: item.bangumi_id,
        title: item.title,
        url: item.url,
        cover_url: item.cover_url || "",
        updated_at: item.air_text || `${archive.year}年${seasonGroup.season}`,
        weekday_index: weekdayIndex,
        weekday_label: weekdayLabel(weekdayIndex),
        season_label: `${archive.year}年${seasonGroup.season}`
      });
      groups.set(weekdayIndex, group);
    }
  }
  const orderedGroups = WEEKDAY_ORDER
    .map((weekday_index) => groups.get(weekday_index))
    .filter((group): group is MikanWeeklyGroup => Boolean(group));
  return {
    season_label: `${archive.year}年${seasonFilter === "全部" ? "全季度" : seasonFilter}`,
    groups: orderedGroups
  } satisfies MikanWeeklyCollection;
}

export function findWeeklyShow(home: MikanWeeklyCollection | null | undefined, url: string) {
  if (!home || !url) return null;
  for (const group of home.groups) {
    const match = group.items.find((item) => item.url === url);
    if (match) return match;
  }
  return null;
}

export function findOnlineResult(results: OnlineSearchResult[] | null | undefined, url: string) {
  if (!results || !url) return null;
  return results.find((item) => item.url === url) || null;
}
