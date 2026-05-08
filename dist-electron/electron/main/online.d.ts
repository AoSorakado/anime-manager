import type { BangumiAirtimeCollection, MikanWeeklyCollection, OnlineEpisode, OnlineRuleInput, OnlineRuleMeta, OnlineSearchResult } from "../shared/types.js";
interface KazumiLikeRule {
    name?: string;
    userAgent?: string;
    header?: Record<string, string>;
    baseURL?: string;
    useWebview?: boolean;
    antiCrawlerEnabled?: boolean;
    adBlocker?: boolean;
    searchURL?: string;
    searchUrl?: string;
    searchList?: string;
    searchName?: string;
    searchResult?: string;
    searchCover?: string;
    chapterRoads?: string;
    chapterResult?: string;
    chapterName?: string;
    chapterUrl?: string;
}
export declare function listMikanWeeklyShows(): Promise<MikanWeeklyCollection>;
export declare function listMikanHistory(year: number, season: string): Promise<MikanWeeklyCollection>;
export declare function fetchMikanDetails(mikanId: string | number): Promise<any>;
export declare function listBangumiAirtime(year: number): Promise<BangumiAirtimeCollection>;
/**
 * Advanced Video URL Sniffer.
 * Mimics original Kazumi logic: network interception, header injection, and content-type detection.
 */
export declare class VideoSniffer {
    private static snifferWindow;
    static sniff(pageUrl: string, rule: KazumiLikeRule): Promise<{
        url: string;
        referer: string;
    }>;
}
export declare function listOnlineRules(): Promise<OnlineRuleMeta[]>;
export declare function onlineSearch(input: OnlineRuleInput & {
    keyword: string;
}): Promise<OnlineSearchResult[]>;
export declare function onlineEpisodes(input: OnlineRuleInput & {
    url: string;
}): Promise<OnlineEpisode[]>;
export declare function sniffAndPlay(input: OnlineRuleInput & {
    url: string;
    title?: string;
    bangumiId?: string | number;
}): Promise<void>;
export {};
