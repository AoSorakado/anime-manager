import type { CloudOfflineSubmitResult, CloudOfflineTask } from "../shared/types.js";
export declare function listPikpakOfflineTasks(): CloudOfflineTask[];
export declare function submitPikpakOfflineDownload(input: {
    url: string;
    title?: string;
    savePath?: string;
}): Promise<CloudOfflineSubmitResult>;
export declare function refreshPikpakOfflineTasks(): CloudOfflineTask[];
