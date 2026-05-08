import Database from "better-sqlite3";
import type { AppLog, CloudOfflineTask, LogLevel, LogModule, MediaFile, MediaItem, MetadataCandidate, RssItem, RssSubscription, RssSubscriptionInput, ScrapeIssue, SettingsMap, Source, WatchStats, WebDavSourceInput, WatchStatus } from "../shared/types.js";
export declare const now: () => string;
export declare function getUserDataPath(): string;
export declare function getDb(): Database.Database;
export declare function listCloudOfflineTasks(limit?: number): CloudOfflineTask[];
export declare function addCloudOfflineTask(input: {
    provider: CloudOfflineTask["provider"];
    sourceTitle: string;
    sourceUrl: string;
    taskId: string;
    targetDirId?: string | null;
    progress?: number | null;
    status?: string | null;
    errorMessage?: string | null;
    rawJson?: string | null;
}): CloudOfflineTask;
export declare function updateCloudOfflineTask(provider: CloudOfflineTask["provider"], taskId: string, patch: {
    progress?: number | null;
    status?: string | null;
    errorMessage?: string | null;
    rawJson?: string | null;
}): CloudOfflineTask | undefined;
export declare function getCloudOfflineTask(provider: CloudOfflineTask["provider"], taskId: string): CloudOfflineTask | undefined;
export declare function listRssSubscriptions(): RssSubscription[];
export declare function getRssSubscription(id: number): RssSubscription | undefined;
export declare function addRssSubscription(input: RssSubscriptionInput): RssSubscription;
export declare function updateRssSubscription(id: number, patch: Partial<RssSubscriptionInput> & {
    enabled?: number;
}): RssSubscription | undefined;
export declare function deleteRssSubscription(id: number): {
    deleted: number;
};
export declare function listRssItems(subscriptionId?: number | null, limit?: number): RssItem[];
export declare function upsertRssItems(subscriptionId: number, items: Array<Omit<RssItem, "id" | "subscription_id" | "downloaded" | "download_status" | "created_at" | "updated_at">>): number;
export declare function markRssItemDownloadResult(itemId: number, success: boolean, error?: string): void;
export declare function getRssItem(itemId: number): RssItem | undefined;
export declare function log(level: LogLevel, module: LogModule, message: string, detail?: unknown, mediaItemId?: number): void;
export declare function addLocalSource(name: string, rootPath: string): Source;
export declare function addLocalSourceByPath(rootPath: string, name?: string): Source;
export declare function addWebDavSource(input: WebDavSourceInput): Source;
export declare function listSources(): Source[];
export declare function getSource(id: number): Source | undefined;
export declare function renameSource(id: number, name: string): Source | undefined;
export declare function deleteSource(id: number): {
    deleted: number;
};
export declare function listMediaItems(search?: string, sort?: string, filter?: string, sourceId?: number | null): MediaItem[];
export declare function getMediaItem(id: number): MediaItem | undefined;
export declare function getCoverRecord(mediaItemId: number): {
    id: number;
    cover_path?: string | null;
    external_id?: string | null;
    provider?: string | null;
    cover_url?: string | null;
} | undefined;
export declare function updateCoverPath(mediaItemId: number, coverPath: string): void;
export declare function clearCoverPaths(): number;
export declare function repairMissingCovers(): {
    id: number;
    cover_path?: string | null;
    external_id: string;
    cover_url?: string | null;
}[];
export declare function listMediaFiles(mediaItemId: number): MediaFile[];
export interface LibrarySyncState {
    version: 1;
    exported_at: string;
    items: Array<{
        provider?: string | null;
        external_id?: string | null;
        folder_name: string;
        clean_name: string;
        watch_status: WatchStatus;
        updated_at: string;
        files: Array<{
            file_name: string;
            watched: WatchStatus | 0 | 1;
            play_count: number;
            last_position?: number | null;
            duration?: number | null;
            last_played_at?: string | null;
            updated_at: string;
        }>;
    }>;
    history: Array<{
        provider?: string | null;
        external_id?: string | null;
        folder_name: string;
        file_name: string;
        played_at: string;
        duration?: number | null;
        position?: number | null;
        completed: number;
        player: string;
    }>;
}
export declare function exportLibrarySyncState(): LibrarySyncState;
export declare function importLibrarySyncState(state: LibrarySyncState): {
    items: number;
    files: number;
    histories: number;
};
export declare function listCandidates(mediaItemId: number): MetadataCandidate[];
export declare function listLogs(limit?: number): AppLog[];
export declare function listScrapeIssues(limit?: number): ScrapeIssue[];
export declare function getWatchStats(): WatchStats;
export declare function recleanMediaItemNames(): {
    total: number;
    changed: number;
};
export declare function getSettings(): SettingsMap;
export declare function setSetting(key: string, value: string): void;
