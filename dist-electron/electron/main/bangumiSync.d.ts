export interface BangumiSyncResult {
    total: number;
    synced: number;
    skipped: number;
    failed: number;
}
export declare function testBangumiToken(token?: string): Promise<{
    user_id: number;
    expires?: number;
    client_id?: string;
}>;
export declare function syncLocalWatchStatusToBangumi(): Promise<BangumiSyncResult>;
export declare function updateBangumiSubjectStatus(token: string, subjectId: string | number, status: number, isPrivate?: boolean): Promise<void>;
