import type { BangumiCollectionEntry, BangumiStatusReport } from "../shared/types.js";
export interface BangumiSyncResult {
    total: number;
    synced: number;
    skipped: number;
    failed: number;
}
export declare function testBangumiToken(token?: string): Promise<{
    user_id: number;
    username: string;
    nickname: string;
} | {
    user_id: number;
    username: string;
    nickname?: undefined;
}>;
export declare function syncLocalWatchStatusToBangumi(): Promise<BangumiSyncResult>;
export declare function updateBangumiSubjectStatus(token: string, subjectId: string | number, status: number, isPrivate?: boolean): Promise<void>;
/** 获取用户 Bangumi 全部收藏条目（想看/看过/在看/搁置/抛弃） */
export declare function listBangumiCollections(token?: string): Promise<BangumiCollectionEntry[]>;
/** 获取 Bangumi 服务状态
 *  优先从 bgm-status.ry.mk Atom feed 获取详细事件；
 *  若该站点不可达（如国内网络限制），回退到多端点连通性探测 */
export declare function fetchBangumiServiceStatus(): Promise<BangumiStatusReport>;
