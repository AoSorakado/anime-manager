import type { BangumiCandidate, BangumiSubjectDetail, BangumiTag, BangumiTagAnimeResponse, BatchIdRefreshResult, BatchScrapeResult, MediaItem } from "../shared/types.js";
export declare function searchBangumi(mediaItemId: number, keyword?: string, enrichDetails?: boolean): Promise<BangumiCandidate[]>;
export declare function batchSearchBangumi(options?: {
    unmatchedOnly?: boolean;
    autoApplyThreshold?: number;
    delayMs?: number;
}): Promise<BatchScrapeResult>;
export declare function batchRefreshBangumiById(options?: {
    delayMs?: number;
}): Promise<BatchIdRefreshResult>;
export declare function applyBangumiCandidate(mediaItemId: number, externalId: string): Promise<MediaItem | undefined>;
export declare function refreshBangumiById(mediaItemId: number, externalId?: string): Promise<MediaItem | undefined>;
export declare function getBangumiSubjectDetail(subjectId: string): Promise<BangumiSubjectDetail | null>;
export declare function getBangumiPersonDetail(personId: string | number): Promise<Record<string, unknown> | null>;
export declare function repairCoverCache(): Promise<{
    total: number;
    repaired: number;
    failed: number;
}>;
export declare function clearCoverCache(): {
    deleted: number;
    cleared: number;
};
export declare function resolveMediaCover(mediaItemId: number): Promise<string | null>;
export declare function getBangumiCalendar(): Promise<any>;
export declare function getAnimeByTag(tagName: string, offset?: number, limit?: number, options?: {
    type?: number;
    sort?: string;
    airDate?: string[];
}): Promise<BangumiTagAnimeResponse>;
export declare function getPopularTags(): Promise<BangumiTag[]>;
