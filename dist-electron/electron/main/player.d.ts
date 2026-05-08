import type { WatchStatus } from "../shared/types.js";
export declare function playFile(mediaFileId: number): void;
export declare function playUrl(url: string, title?: string, referer?: string, bangumiId?: string | number): void;
export declare function setFileWatched(mediaFileId: number, watched: boolean): void;
export declare function setItemWatchStatus(mediaItemId: number, status: WatchStatus): void;
export declare function setFileStatus(mediaFileId: number, status: WatchStatus): void;
