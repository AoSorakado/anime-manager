import type { CloudOfflineSubmitResult, CloudOfflineTask } from "../shared/types.js";
export declare function listPan123OfflineTasks(): CloudOfflineTask[];
export declare function submitPan123OfflineDownload(input: {
    url: string;
    title?: string;
    dirId?: string;
}): Promise<CloudOfflineSubmitResult>;
export declare function refreshPan123OfflineTask(taskId: string): Promise<CloudOfflineTask | undefined>;
export declare function refreshAllPan123OfflineTasks(): Promise<CloudOfflineTask[]>;
