import type { ScanResult, Source, WebDavSourceInput, WebDavSyncResult } from "../shared/types.js";
export declare function addWebDavSourceAndTest(input: WebDavSourceInput): Promise<Source>;
export declare function scanWebDavSource(sourceId: number, videoExtensions?: string[]): Promise<ScanResult>;
export declare function uploadWebDavSyncState(): Promise<WebDavSyncResult>;
export declare function downloadWebDavSyncState(): Promise<WebDavSyncResult>;
