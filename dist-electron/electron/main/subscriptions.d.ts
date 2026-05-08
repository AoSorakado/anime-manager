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
export declare function subscriptionsList(): import("../shared/types.js").RssSubscription[];
export declare function subscriptionItems(subscriptionId?: number | null): RssItem[];
export declare function subscriptionAdd(input: RssSubscriptionInput): import("../shared/types.js").RssSubscription;
export declare function subscriptionDelete(id: number): {
    deleted: number;
};
export declare function refreshSubscription(id: number): Promise<RssRefreshResult>;
export declare function searchMikan(keyword: string): Promise<ParsedFeedItem[]>;
export declare function getMikanBangumi(bangumiId: string | number): Promise<ParsedFeedItem[]>;
export declare function refreshAllSubscriptions(): Promise<RssRefreshResult[]>;
export declare function sendRssItemToQbittorrent(itemId: number): Promise<{
    sent: boolean;
}>;
export declare function sendUrlToQbittorrent(url: string, savePath?: string, title?: string, seriesTitle?: string): Promise<{
    sent: boolean;
}>;
export declare function sendPendingItemsToQbittorrent(subscriptionId?: number | null): Promise<{
    total: number;
    sent: number;
    failed: number;
}>;
export declare function testQbittorrent(): Promise<QbittorrentTestResult>;
export {};
