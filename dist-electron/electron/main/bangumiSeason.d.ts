import type { AnimeSeason, NormalizedAnimeItem, SeasonAnimeResponse } from "../shared/types.js";
export declare function getSeasonAnime(year: number, season: AnimeSeason, options?: {
    refresh?: boolean;
}): Promise<SeasonAnimeResponse>;
export declare function fetchSeasonFromBangumi(year: number, season: AnimeSeason): Promise<NormalizedAnimeItem[]>;
export declare function normalizeBangumiSubject(raw: Record<string, any>): NormalizedAnimeItem;
