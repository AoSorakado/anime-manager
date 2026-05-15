import { contextBridge, ipcRenderer } from "electron";
import type { AppLog, BangumiAirtimeCollection, BangumiSubjectDetail, CloudOfflineSubmitResult, CloudOfflineTask, MediaFile, MediaItem, MikanWeeklyCollection, MetadataCandidate, OnlineEpisode, OnlineRuleInput, OnlineRuleMeta, OnlineSearchResult, QbittorrentTestResult, RssItem, RssRefreshResult, RssSubscription, RssSubscriptionInput, ScanResult, SeasonAnimeResponse, SettingsMap, Source, WatchStatus, WebDavSourceInput, WebDavSyncResult } from "../shared/types.js";

const api = {
  sources: {
    list: () => ipcRenderer.invoke("sources:list") as Promise<Source[]>,
    addLocal: (name: string) => ipcRenderer.invoke("sources:addLocal", name) as Promise<Source | null>,
    addLocalPath: (rootPath: string, name?: string) => ipcRenderer.invoke("sources:addLocalPath", rootPath, name) as Promise<Source>,
    addWebDav: (input: WebDavSourceInput) => ipcRenderer.invoke("sources:addWebDav", input) as Promise<Source>,
    rename: (id: number, name: string) => ipcRenderer.invoke("sources:rename", id, name) as Promise<Source | undefined>,
    delete: (id: number) => ipcRenderer.invoke("sources:delete", id) as Promise<{ deleted: number }>,
    scan: (sourceId: number) => ipcRenderer.invoke("sources:scan", sourceId) as Promise<ScanResult>
  },
  media: {
    list: (args: { search?: string; sort?: string; filter?: string }) => ipcRenderer.invoke("media:list", args) as Promise<MediaItem[]>,
    get: (id: number) => ipcRenderer.invoke("media:get", id) as Promise<{ item: MediaItem; files: MediaFile[]; candidates: MetadataCandidate[] }>,
    issues: (limit?: number) => ipcRenderer.invoke("media:issues", limit) as Promise<import("../shared/types.js").ScrapeIssue[]>,
    watchStats: () => ipcRenderer.invoke("media:watchStats") as Promise<import("../shared/types.js").WatchStats>,
    setStatus: (id: number, status: WatchStatus) => ipcRenderer.invoke("media:setStatus", id, status) as Promise<void>,
    openFolder: (folderPath: string) => ipcRenderer.invoke("media:openFolder", folderPath) as Promise<string>,
    recleanNames: () => ipcRenderer.invoke("media:recleanNames") as Promise<{ total: number; changed: number }>
  },
  files: {
    play: (fileId: number) => ipcRenderer.invoke("files:play", fileId) as Promise<void>,
    setWatched: (fileId: number, watched: boolean) => ipcRenderer.invoke("files:setWatched", fileId, watched) as Promise<void>,
    setStatus: (fileId: number, status: string) => ipcRenderer.invoke("files:setStatus", fileId, status) as Promise<void>
  },
  scraper: {
    searchBangumi: (mediaItemId: number, keyword?: string) => ipcRenderer.invoke("scraper:searchBangumi", mediaItemId, keyword) as Promise<void>,
    bangumiSearch: (keyword: string) => ipcRenderer.invoke("scraper:bangumiSearch", keyword) as Promise<import("../shared/types.js").NormalizedAnimeItem[]>,
    applyBangumi: (mediaItemId: number, externalId: string) => ipcRenderer.invoke("scraper:applyBangumi", mediaItemId, externalId) as Promise<MediaItem>,
    getBangumiSubject: (subjectId: string) => ipcRenderer.invoke("scraper:getBangumiSubject", subjectId) as Promise<BangumiSubjectDetail | null>,
    getPerson: (personId: string | number) => ipcRenderer.invoke("scraper:getPerson", personId) as Promise<Record<string, unknown> | null>,
    refreshBangumiById: (mediaItemId: number) => ipcRenderer.invoke("scraper:refreshBangumiById", mediaItemId) as Promise<MediaItem>,
    batchRefreshBangumiById: (options?: { delayMs?: number }) => ipcRenderer.invoke("scraper:batchRefreshBangumiById", options) as Promise<import("../shared/types.js").BatchIdRefreshResult>,
    getBangumiCalendar: () => ipcRenderer.invoke("scraper:getBangumiCalendar") as Promise<import("../shared/types.js").BangumiCalendarGroup[]>
  },
  bangumi: {
    testToken: (token?: string) => ipcRenderer.invoke("bangumi:testToken", token) as Promise<import("../shared/types.js").BangumiSyncResult>,
    syncLocalStatus: () => ipcRenderer.invoke("bangumi:syncLocalStatus") as Promise<import("../shared/types.js").BangumiSyncResult>,
    listCollections: () => ipcRenderer.invoke("bangumi:listCollections") as Promise<import("../shared/types.js").BangumiCollectionEntry[]>,
    serviceStatus: () => ipcRenderer.invoke("bangumi:serviceStatus") as Promise<import("../shared/types.js").BangumiStatusReport>,
  },
  logs: {
    list: (limit?: number) => ipcRenderer.invoke("logs:list", limit) as Promise<AppLog[]>
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get") as Promise<SettingsMap>,
    set: (key: string, value: string) => ipcRenderer.invoke("settings:set", key, value) as Promise<void>,
    chooseMpv: () => ipcRenderer.invoke("settings:chooseMpv") as Promise<string | null>
  },
  sync: {
    uploadWebDav: () => ipcRenderer.invoke("sync:uploadWebDav") as Promise<WebDavSyncResult>,
    downloadWebDav: () => ipcRenderer.invoke("sync:downloadWebDav") as Promise<WebDavSyncResult>
  },
  subscriptions: {
    list: () => ipcRenderer.invoke("subscriptions:list") as Promise<RssSubscription[]>,
    items: (subscriptionId?: number | null) => ipcRenderer.invoke("subscriptions:items", subscriptionId) as Promise<RssItem[]>,
    add: (input: RssSubscriptionInput) => ipcRenderer.invoke("subscriptions:add", input) as Promise<RssSubscription>,
    delete: (id: number) => ipcRenderer.invoke("subscriptions:delete", id) as Promise<{ deleted: number }>,
    searchMikan: (keyword: string) => ipcRenderer.invoke("subscriptions:searchMikan", keyword) as Promise<RssItem[]>,
    getMikanBangumi: (bangumiId: string | number) => ipcRenderer.invoke("subscriptions:getMikanBangumi", bangumiId) as Promise<RssItem[]>,
    refresh: (id: number) => ipcRenderer.invoke("subscriptions:refresh", id) as Promise<RssRefreshResult>,
    refreshAll: () => ipcRenderer.invoke("subscriptions:refreshAll") as Promise<RssRefreshResult[]>,
    sendItem: (itemId: number) => ipcRenderer.invoke("subscriptions:sendItem", itemId) as Promise<{ sent: boolean }>,
    sendUrl: (url: string, savePath?: string, title?: string) => ipcRenderer.invoke("subscriptions:sendUrl", url, savePath, title) as Promise<{ sent: boolean }>,
    sendPending: (subscriptionId?: number | null) => ipcRenderer.invoke("subscriptions:sendPending", subscriptionId) as Promise<{ total: number; sent: number; failed: number }>,
    testQbittorrent: () => ipcRenderer.invoke("subscriptions:testQbittorrent") as Promise<QbittorrentTestResult>
  },
  cloudOffline: {
    list123: () => ipcRenderer.invoke("cloudOffline:list123") as Promise<CloudOfflineTask[]>,
    submit123: (input: { url: string; title?: string; dirId?: string }) => ipcRenderer.invoke("cloudOffline:submit123", input) as Promise<CloudOfflineSubmitResult>,
    refresh123: (taskId: string) => ipcRenderer.invoke("cloudOffline:refresh123", taskId) as Promise<CloudOfflineTask | undefined>,
    refreshAll123: () => ipcRenderer.invoke("cloudOffline:refreshAll123") as Promise<CloudOfflineTask[]>,
    listPikpak: () => ipcRenderer.invoke("cloudOffline:listPikpak") as Promise<CloudOfflineTask[]>,
    submitPikpak: (input: { url: string; title?: string; savePath?: string }) => ipcRenderer.invoke("cloudOffline:submitPikpak", input) as Promise<CloudOfflineSubmitResult>,
    refreshPikpak: () => ipcRenderer.invoke("cloudOffline:refreshPikpak") as Promise<CloudOfflineTask[]>
  },
  season: {
    getAnime: (year: number, season: string, options?: { refresh?: boolean }) =>
      ipcRenderer.invoke("season:getAnime", year, season, options) as Promise<SeasonAnimeResponse>,
    getDetail: (bangumiId: number) =>
      ipcRenderer.invoke("season:getDetail", bangumiId) as Promise<BangumiSubjectDetail | null>,
    getMikanResources: (keyword: string) =>
      ipcRenderer.invoke("season:getMikanResources", keyword) as Promise<RssItem[]>,
  },
  online: {
    listRules: () => ipcRenderer.invoke("online:listRules") as Promise<OnlineRuleMeta[]>,
    search: (input: OnlineRuleInput & { keyword: string }) => ipcRenderer.invoke("online:search", input) as Promise<OnlineSearchResult[]>,
    episodes: (input: OnlineRuleInput & { url: string }) => ipcRenderer.invoke("online:episodes", input) as Promise<OnlineEpisode[]>,
    playUrl: (url: string, title?: string, referer?: string | null, ruleInput?: OnlineRuleInput, bangumiId?: string | number) => ipcRenderer.invoke("online:playUrl", url, title, referer, ruleInput, bangumiId) as Promise<void>
  },
  window: {
    minimize: () => ipcRenderer.invoke("window:minimize") as Promise<void>,
    maximize: () => ipcRenderer.invoke("window:maximize") as Promise<void>,
    close: () => ipcRenderer.invoke("window:close") as Promise<void>
  },
  onPlaybackEnded: (callback: () => void) => {
    ipcRenderer.on("playback-ended", callback);
    return () => { ipcRenderer.removeListener("playback-ended", callback); };
  }
};

contextBridge.exposeInMainWorld("libraryApi", api);

export type LibraryApi = typeof api;
