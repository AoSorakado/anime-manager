import type { AppLog, BangumiSubjectDetail, CloudOfflineSubmitResult, CloudOfflineTask, MediaFile, MediaItem, MetadataCandidate, OnlineEpisode, OnlineRuleInput, OnlineRuleMeta, OnlineSearchResult, QbittorrentTestResult, RssItem, RssRefreshResult, RssSubscription, RssSubscriptionInput, ScanResult, SeasonAnimeResponse, SettingsMap, Source, WatchStatus, WebDavSourceInput, WebDavSyncResult } from "../shared/types.js";
declare const api: {
    sources: {
        list: () => Promise<Source[]>;
        addLocal: (name: string) => Promise<Source | null>;
        addLocalPath: (rootPath: string, name?: string) => Promise<Source>;
        addWebDav: (input: WebDavSourceInput) => Promise<Source>;
        rename: (id: number, name: string) => Promise<Source | undefined>;
        delete: (id: number) => Promise<{
            deleted: number;
        }>;
        scan: (sourceId: number) => Promise<ScanResult>;
    };
    media: {
        list: (args: {
            search?: string;
            sort?: string;
            filter?: string;
        }) => Promise<MediaItem[]>;
        get: (id: number) => Promise<{
            item: MediaItem;
            files: MediaFile[];
            candidates: MetadataCandidate[];
        }>;
        issues: (limit?: number) => Promise<import("../shared/types.js").ScrapeIssue[]>;
        watchStats: () => Promise<import("../shared/types.js").WatchStats>;
        setStatus: (id: number, status: WatchStatus) => Promise<void>;
        openFolder: (folderPath: string) => Promise<string>;
        recleanNames: () => Promise<{
            total: number;
            changed: number;
        }>;
    };
    files: {
        play: (fileId: number) => Promise<void>;
        setWatched: (fileId: number, watched: boolean) => Promise<void>;
        setStatus: (fileId: number, status: string) => Promise<void>;
    };
    scraper: {
        searchBangumi: (mediaItemId: number, keyword?: string) => Promise<void>;
        bangumiSearch: (keyword: string) => Promise<import("../shared/types.js").NormalizedAnimeItem[]>;
        applyBangumi: (mediaItemId: number, externalId: string) => Promise<MediaItem>;
        getBangumiSubject: (subjectId: string) => Promise<BangumiSubjectDetail | null>;
        getPerson: (personId: string | number) => Promise<Record<string, unknown> | null>;
        refreshBangumiById: (mediaItemId: number) => Promise<MediaItem>;
        batchRefreshBangumiById: (options?: {
            delayMs?: number;
        }) => Promise<import("../shared/types.js").BatchIdRefreshResult>;
        getBangumiCalendar: () => Promise<import("../shared/types.js").BangumiCalendarGroup[]>;
    };
    bangumi: {
        testToken: (token?: string) => Promise<import("../shared/types.js").BangumiSyncResult>;
        syncLocalStatus: () => Promise<import("../shared/types.js").BangumiSyncResult>;
        listCollections: () => Promise<import("../shared/types.js").BangumiCollectionEntry[]>;
        serviceStatus: () => Promise<import("../shared/types.js").BangumiStatusReport>;
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
        delete: (id: number) => Promise<{
            deleted: number;
        }>;
        searchMikan: (keyword: string) => Promise<RssItem[]>;
        getMikanBangumi: (bangumiId: string | number) => Promise<RssItem[]>;
        refresh: (id: number) => Promise<RssRefreshResult>;
        refreshAll: () => Promise<RssRefreshResult[]>;
        sendItem: (itemId: number) => Promise<{
            sent: boolean;
        }>;
        sendUrl: (url: string, savePath?: string, title?: string) => Promise<{
            sent: boolean;
        }>;
        sendPending: (subscriptionId?: number | null) => Promise<{
            total: number;
            sent: number;
            failed: number;
        }>;
        testQbittorrent: () => Promise<QbittorrentTestResult>;
    };
    cloudOffline: {
        list123: () => Promise<CloudOfflineTask[]>;
        submit123: (input: {
            url: string;
            title?: string;
            dirId?: string;
        }) => Promise<CloudOfflineSubmitResult>;
        refresh123: (taskId: string) => Promise<CloudOfflineTask | undefined>;
        refreshAll123: () => Promise<CloudOfflineTask[]>;
        listPikpak: () => Promise<CloudOfflineTask[]>;
        submitPikpak: (input: {
            url: string;
            title?: string;
            savePath?: string;
        }) => Promise<CloudOfflineSubmitResult>;
        refreshPikpak: () => Promise<CloudOfflineTask[]>;
    };
    season: {
        getAnime: (year: number, season: string, options?: {
            refresh?: boolean;
        }) => Promise<SeasonAnimeResponse>;
        getDetail: (bangumiId: number) => Promise<BangumiSubjectDetail | null>;
        getMikanResources: (keyword: string) => Promise<RssItem[]>;
    };
    online: {
        listRules: () => Promise<OnlineRuleMeta[]>;
        search: (input: OnlineRuleInput & {
            keyword: string;
        }) => Promise<OnlineSearchResult[]>;
        episodes: (input: OnlineRuleInput & {
            url: string;
        }) => Promise<OnlineEpisode[]>;
        playUrl: (url: string, title?: string, referer?: string | null, ruleInput?: OnlineRuleInput, bangumiId?: string | number) => Promise<void>;
    };
    window: {
        minimize: () => Promise<void>;
        maximize: () => Promise<void>;
        close: () => Promise<void>;
    };
};
export type LibraryApi = typeof api;
export {};
