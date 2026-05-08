import type { AnimeSeason } from "../shared/types.js";
export interface SeasonCacheRow {
    id: number;
    year: number;
    season: AnimeSeason;
    data_json: string;
    updated_at: string;
}
export declare function getSeasonCache(year: number, season: AnimeSeason): SeasonCacheRow | undefined;
export declare function setSeasonCache(year: number, season: AnimeSeason, dataJson: string): void;
export declare function clearSeasonCache(year?: number, season?: AnimeSeason): number;
export declare function getCurrentAnimeSeason(): {
    year: number;
    season: AnimeSeason;
};
export declare function isFutureSeason(year: number, season: AnimeSeason): boolean;
export declare function isCacheExpired(updatedAt: string, year: number, season: AnimeSeason): boolean;
