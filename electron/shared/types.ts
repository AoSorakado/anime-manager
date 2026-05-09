export type SourceType = "local" | "webdav";
export type WatchStatus = "unwatched" | "watching" | "watched" | "on_hold" | "dropped";
export type MediaType = "anime" | "movie" | "unknown";
export type LogLevel = "info" | "warning" | "error";
export type LogModule = "scanner" | "scraper" | "player" | "webdav" | "database" | "subscription" | "online";

export interface Source {
  id: number;
  name: string;
  type: SourceType;
  root_path: string;
  webdav_url?: string | null;
  username?: string | null;
  encrypted_password?: string | null;
  created_at: string;
  updated_at: string;
}

export interface MediaItem {
  id: number;
  source_id: number;
  folder_path: string;
  folder_name: string;
  clean_name: string;
  title?: string | null;
  original_title?: string | null;
  summary?: string | null;
  cover_path?: string | null;
  backdrop_path?: string | null;
  media_type: MediaType;
  year?: number | null;
  air_date?: string | null;
  rating?: number | null;
  rank?: number | null;
  metadata_json?: string | null;
  tags_json?: string | null;
  staff_json?: string | null;
  characters_json?: string | null;
  relations_json?: string | null;
  provider?: string | null;
  external_id?: string | null;
  watch_status: WatchStatus;
  file_count: number;
  unwatched_count: number;
  created_at: string;
  updated_at: string;
  last_scanned_at?: string | null;
  last_played_at?: string | null;
}

export interface MediaFile {
  id: number;
  media_item_id: number;
  file_path: string;
  file_name: string;
  extension: string;
  size: number;
  mtime: string;
  duration?: number | null;
  sort_index: number;
  watched: WatchStatus | 0 | 1;
  play_count: number;
  last_position?: number | null;
  last_played_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface MetadataCandidate {
  id: number;
  media_item_id: number;
  provider: string;
  external_id: string;
  title: string;
  original_title?: string | null;
  year?: number | null;
  score?: number | null;
  cover_url?: string | null;
  match_score?: number | null;
  raw_json?: string | null;
  created_at: string;
}

export interface AppLog {
  id: number;
  level: LogLevel;
  module: LogModule;
  message: string;
  detail?: string | null;
  media_item_id?: number | null;
  created_at: string;
}

export interface ScrapeIssue {
  id: number;
  title?: string | null;
  clean_name: string;
  folder_name: string;
  folder_path: string;
  candidate_count: number;
  last_error?: string | null;
}

export interface WatchStats {
  today_seconds: number;
  week_seconds: number;
  total_seconds: number;
  today_count: number;
  total_count: number;
  completed_count: number;
  recent: Array<{
    id: number;
    title: string;
    file_name: string;
    played_at: string;
    duration?: number | null;
  }>;
  daily: Array<{
    date: string;
    seconds: number;
    count: number;
  }>;
  top_titles: Array<{
    media_item_id: number;
    title: string;
    seconds: number;
    count: number;
  }>;
  status_counts: Array<{
    status: WatchStatus;
    count: number;
  }>;
}

export interface SettingsMap {
  mpvPath?: string;
  mpvArgs?: string;
  videoExtensions?: string;
  subtitleExtensions?: string;
  logLevel?: string;
  autoScrape?: string;
  maxScanDepth?: string;
  bangumiToken?: string;
  bangumiSyncUnwatched?: "skip" | "wish";
  bangumiPrivateCollection?: string;
  syncWebdavUrl?: string;
  syncWebdavUsername?: string;
  syncWebdavPassword?: string;
  syncWebdavPath?: string;
  mikanBaseUrl?: string;
  mikanPersonalRssUrl?: string;
  qbUrl?: string;
  qbUsername?: string;
  qbPassword?: string;
  qbSavePath?: string;
  qbExecutablePath?: string;
  pan123ClientId?: string;
  pan123ClientSecret?: string;
  pan123AccessToken?: string;
  pan123TokenExpiredAt?: string;
  pan123OfflineDirId?: string;
  pan123CallbackUrl?: string;
  pikpakRclonePath?: string;
  pikpakRemote?: string;
  pikpakSavePath?: string;
}

export interface RssSubscription {
  id: number;
  name: string;
  feed_url: string;
  keyword?: string | null;
  save_path?: string | null;
  enabled: number;
  last_checked_at?: string | null;
  created_at: string;
  updated_at: string;
  item_count?: number;
  pending_count?: number;
  downloaded_count?: number;
}

export interface RssItem {
  id: number;
  subscription_id: number;
  guid: string;
  title: string;
  subtitle_group?: string | null;
  size_text?: string | null;
  updated_at_text?: string | null;
  link?: string | null;
  torrent_url?: string | null;
  magnet_url?: string | null;
  pub_date?: string | null;
  downloaded: number;
  download_status: "pending" | "sent" | "failed";
  error_message?: string | null;
  raw_json?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RssSubscriptionInput {
  name: string;
  feedUrl?: string;
  keyword?: string;
  savePath?: string;
}

export interface RssRefreshResult {
  subscriptionId: number;
  fetched: number;
  inserted: number;
}

export interface QbittorrentTestResult {
  ok: boolean;
  version?: string;
}

export interface CloudOfflineTask {
  id: number;
  provider: "123pan" | "pikpak";
  source_title: string;
  source_url: string;
  task_id: string;
  target_dir_id?: string | null;
  progress?: number | null;
  status?: string | null;
  error_message?: string | null;
  raw_json?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CloudOfflineSubmitResult {
  task: CloudOfflineTask;
  message: string;
}

export interface BangumiSyncResult {
  total: number;
  synced: number;
  skipped: number;
  failed: number;
}

export interface ScanResult {
  sourceId: number;
  folders: number;
  files: number;
  changed?: boolean;
  removedItems?: number;
}

export interface WebDavSourceInput {
  name: string;
  webdavUrl: string;
  username?: string;
  password?: string;
  rootPath: string;
}

export interface WebDavSyncResult {
  uploaded?: boolean;
  downloaded?: boolean;
  items: number;
  files: number;
  histories: number;
  message: string;
}

export interface BatchScrapeResult {
  total: number;
  searched: number;
  autoApplied: number;
  needConfirm: number;
  failed: number;
}

export interface BatchIdRefreshResult {
  total: number;
  refreshed: number;
  failed: number;
}

export interface OnlineRuleInput {
  ruleUrl?: string;
  ruleJson?: string;
}

export interface MikanWeeklyShow {
  bangumi_id: string;
  title: string;
  url: string;
  cover_url: string;
  updated_at?: string | null;
  weekday_index: number;
  weekday_label: string;
  season_label?: string | null;
}

export interface MikanWeeklyGroup {
  weekday_index: number;
  weekday_label: string;
  items: MikanWeeklyShow[];
}

export interface MikanWeeklyCollection {
  season_label: string;
  groups: MikanWeeklyGroup[];
}

export type BangumiAirtimeSeason = "春" | "夏" | "秋" | "冬" | "未明";

export interface BangumiAirtimeShow {
  bangumi_id: string;
  title: string;
  url: string;
  air_text?: string | null;
  cover_url?: string | null;
  season: BangumiAirtimeSeason;
  weekday?: number;
}

export interface BangumiAirtimeGroup {
  season: BangumiAirtimeSeason;
  items: BangumiAirtimeShow[];
}

export interface BangumiAirtimeCollection {
  year: number;
  groups: BangumiAirtimeGroup[];
}

export interface BangumiSubjectDetail {
  external_id: string;
  title: string;
  original_title?: string | null;
  summary?: string | null;
  cover_url?: string | null;
  year?: number | null;
  air_date?: string | null;
  rating?: { total?: number; score?: number; rank?: number; count?: Record<string, number> } | null;
  tags: Array<{ name: string; count?: number | null }>;
  infobox: Array<{ key: string; value: string }>;
  persons: Array<Record<string, unknown>>;
  characters: Array<Record<string, unknown>>;
  relations: Array<Record<string, unknown>>;
  raw_json: string;
}

export interface OnlineRuleMeta {
  name: string;
  url: string;
  version?: string | number | null;
  lastModified?: string | null;
}

export interface OnlineSearchResult {
  title: string;
  url: string;
  cover?: string | null;
  referer?: string | null;
  raw?: string | null;
  rule_url?: string | null;
  rule_name?: string | null;
  bangumi_id?: string | number | null;
}

export interface OnlineEpisode {
  title: string;
  url: string;
  referer?: string | null;
  raw?: string | null;
  rule_url?: string | null;
  rule_name?: string | null;
  bangumi_id?: string | number | null;
}

export interface BangumiCandidate {
  external_id: string;
  title: string;
  original_title?: string | null;
  year?: number | null;
  score?: number | null;
  cover_url?: string | null;
  summary?: string | null;
  rank?: number | null;
  air_date?: string | null;
  match_score?: number | null;
  raw_json: string;
}
export interface BangumiCalendarItem {
  id: number;
  name: string;
  name_cn: string;
  air_date: string;
  air_weekday: number;
  images: { large: string; common: string; medium: string; small: string; grid: string };
  rating?: { score?: number; total?: number; rank?: number };
  collection?: { doing?: number };
}

export interface BangumiCalendarGroup {
  weekday: { en: string; cn: string; ja: string; id: number };
  items: BangumiCalendarItem[];
}

// ──── Season API types ────

export type AnimeSeason = "winter" | "spring" | "summer" | "autumn";

export interface NormalizedAnimeItem {
  bangumiId: number;
  name: string;
  nameCn: string;
  summary: string;
  airDate: string | null;
  eps: number | null;
  score: number | null;
  rank: number | null;
  ratingTotal: number | null;
  weekday: number; // 1=Mon … 7=Sun, 0=unknown
  images: {
    small: string | null;
    grid: string | null;
    large: string | null;
    common: string | null;
  };
  tags: Array<{ name: string; count: number }>;
  raw: any;
}

export interface SeasonAnimeResponse {
  source: "cache" | "bangumi";
  stale: boolean;
  updatedAt: string;
  year: number;
  season: AnimeSeason;
  data: NormalizedAnimeItem[];
}

export interface BangumiTagAnimeResponse {
  tag: string;
  total: number;
  data: NormalizedAnimeItem[];
}

export interface BangumiTag {
  name: string;
  count: number;
}

// ──── 用户 Bangumi 收藏状态 ────

export interface BangumiCollectionEntry {
  subject_id: number;
  subject_name: string;
  subject_name_cn: string;
  subject_images?: { large?: string; common?: string; medium?: string; small?: string; grid?: string };
  subject_type: number;
  subject_eps?: number;
  updated_at: string;
  /** 1=想看 2=看过 3=在看 4=搁置 5=抛弃 */
  collection_type: number;
  comment?: string;
  rate?: number;
  private: boolean;
}

// ──── Bangumi 服务状态（bgm-status.ry.mk RSS） ────

export interface BangumiStatusIncident {
  id: string;
  title: string;
  severity: "major" | "minor" | "resolved";
  summary: string;
  published: string;
  updated: string;
  link: string;
}

export interface BangumiStatusReport {
  overall: "operational" | "degraded" | "outage";
  updated: string;
  incidents: BangumiStatusIncident[];
}
