/// <reference types="vite/client" />

import type { AnimeSeason, AppLog, BangumiAirtimeCollection, BangumiCalendarGroup, BangumiCalendarItem, BangumiSubjectDetail, BangumiSyncResult, BatchIdRefreshResult, BatchScrapeResult, CloudOfflineSubmitResult, CloudOfflineTask, MediaFile, MediaItem, MikanWeeklyCollection, MetadataCandidate, NormalizedAnimeItem, OnlineEpisode, OnlineRuleInput, OnlineRuleMeta, OnlineSearchResult, QbittorrentTestResult, RssItem, RssRefreshResult, RssSubscription, RssSubscriptionInput, ScanResult, ScrapeIssue, SeasonAnimeResponse, SettingsMap, Source, WatchStats, WatchStatus, WebDavSourceInput, WebDavSyncResult } from "../electron/shared/types";

interface LibraryApi {
  sources: {
    list: () => Promise<Source[]>;
    addLocal: (name: string) => Promise<Source | null>;
    addLocalPath: (rootPath: string, name?: string) => Promise<Source>;
    addWebDav: (input: WebDavSourceInput) => Promise<Source>;
    rename: (id: number, name: string) => Promise<Source | undefined>;
    delete: (id: number) => Promise<{ deleted: number }>;
    scan: (sourceId: number) => Promise<ScanResult>;
  };
  media: {
    list: (args: { search?: string; sort?: string; filter?: string; sourceId?: number | null }) => Promise<MediaItem[]>;
    get: (id: number) => Promise<{ item: MediaItem; files: MediaFile[]; candidates: MetadataCandidate[] }>;
    issues: (limit?: number) => Promise<ScrapeIssue[]>;
    watchStats: () => Promise<WatchStats>;
    setStatus: (id: number, status: WatchStatus) => Promise<void>;
    openFolder: (folderPath: string) => Promise<string>;
    recleanNames: () => Promise<{ total: number; changed: number }>;
  };
  files: {
    play: (fileId: number) => Promise<void>;
    setWatched: (fileId: number, watched: boolean) => Promise<void>;
    setStatus: (fileId: number, status: string) => Promise<void>;
  };
  scraper: {
    searchBangumi: (mediaItemId: number, keyword?: string) => Promise<void>;
    applyBangumi: (mediaItemId: number, externalId: string) => Promise<MediaItem>;
    getBangumiSubject: (subjectId: string) => Promise<BangumiSubjectDetail | null>;
    getPerson: (personId: string | number) => Promise<Record<string, unknown> | null>;
    refreshBangumiById: (mediaItemId: number) => Promise<MediaItem>;
    batchRefreshBangumiById: (options?: { delayMs?: number }) => Promise<BatchIdRefreshResult>;
    batchSearchBangumi: (options?: { unmatchedOnly?: boolean; autoApplyThreshold?: number; delayMs?: number }) => Promise<BatchScrapeResult>;
    getBangumiCalendar: () => Promise<BangumiCalendarGroup[]>;
    repairCoverCache: () => Promise<{ total: number; repaired: number; failed: number }>;
    clearCoverCache: () => Promise<{ deleted: number; cleared: number }>;
  };
  bangumi: {
    testToken: (token?: string) => Promise<{ user_id: number; expires?: number; client_id?: string }>;
    syncLocalStatus: () => Promise<BangumiSyncResult>;
  };
  season: {
    getAnime: (year: number, season: string, options?: { refresh?: boolean }) => Promise<SeasonAnimeResponse>;
    getDetail: (bangumiId: number) => Promise<BangumiSubjectDetail | null>;
    getMikanResources: (keyword: string) => Promise<RssItem[]>;
  };
  logs: {
    list: (limit?: number) => Promise<AppLog[]>;
  };
  settings: {
    get: () => Promise<SettingsMap>;
    set: (key: string, value: string) => Promise<void>;
    chooseMpv: () => Promise<string | null>;
  };
  sync: {
    uploadWebDav: () => Promise<WebDavSyncResult>;
    downloadWebDav: () => Promise<WebDavSyncResult>;
  };
  subscriptions: {
    list: () => Promise<RssSubscription[]>;
    items: (subscriptionId?: number | null) => Promise<RssItem[]>;
    add: (input: RssSubscriptionInput) => Promise<RssSubscription>;
    delete: (id: number) => Promise<{ deleted: number }>;
    searchMikan: (keyword: string) => Promise<RssItem[]>;
    getMikanBangumi: (bangumiId: string | number) => Promise<RssItem[]>;
    refresh: (id: number) => Promise<RssRefreshResult>;
    refreshAll: () => Promise<RssRefreshResult[]>;
    sendItem: (itemId: number) => Promise<{ sent: boolean }>;
    sendUrl: (url: string, savePath?: string, title?: string, seriesTitle?: string) => Promise<{ sent: boolean }>;
    sendPending: (subscriptionId?: number | null) => Promise<{ total: number; sent: number; failed: number }>;
    testQbittorrent: () => Promise<QbittorrentTestResult>;
  };
  cloudOffline: {
    list123: () => Promise<CloudOfflineTask[]>;
    submit123: (input: { url: string; title?: string; dirId?: string }) => Promise<CloudOfflineSubmitResult>;
    refresh123: (taskId: string) => Promise<CloudOfflineTask | undefined>;
    refreshAll123: () => Promise<CloudOfflineTask[]>;
    listPikpak: () => Promise<CloudOfflineTask[]>;
    submitPikpak: (input: { url: string; title?: string; savePath?: string }) => Promise<CloudOfflineSubmitResult>;
    refreshPikpak: () => Promise<CloudOfflineTask[]>;
  };
  online: {
    listRules: () => Promise<OnlineRuleMeta[]>;
    search: (input: OnlineRuleInput & { keyword: string }) => Promise<OnlineSearchResult[]>;
    episodes: (input: OnlineRuleInput & { url: string }) => Promise<OnlineEpisode[]>;
    playUrl: (url: string, title?: string, referer?: string | null, ruleInput?: OnlineRuleInput, bangumiId?: string | number) => Promise<void>;
  };
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
  };
}

declare global {
  interface Window {
    libraryApi: LibraryApi;
  }
}
