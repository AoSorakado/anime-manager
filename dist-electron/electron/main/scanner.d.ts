import type { ScanResult } from "../shared/types.js";
export declare function scanLocalSource(sourceId: number, videoExtensions?: string[]): Promise<ScanResult>;
export declare function isAuxiliaryFolder(folderName: string): boolean;
export declare function isAuxiliaryVideoFile(fileName: string): boolean;
export declare function isCollectionFolder(folderName: string): boolean;
