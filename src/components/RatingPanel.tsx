import { ratingConsensus, ratingDeviation, ratingGrade, trimNumber } from "../utils";

export default function RatingPanel({ rating, fallbackRank }: { rating: { total?: number; score?: number; rank?: number; count?: Record<string, number> }; fallbackRank?: number }) {
  const counts = rating.count || {};
  const buckets = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((score) => ({
    score,
    count: Number(counts[String(score)] || 0)
  }));
  const total = Number(rating.total || buckets.reduce((sum, bucket) => sum + bucket.count, 0));
  const max = Math.max(1, ...buckets.map((bucket) => bucket.count));
  const score = typeof rating.score === "number" ? rating.score.toFixed(1) : "";
  const preciseScore = typeof rating.score === "number" ? trimNumber(rating.score, 4) : "";
  const rank = rating.rank || fallbackRank;

  return (
    <div className="panel metadataPanel ratingPanel">
      <div className="ratingHeader">
        <div className="ratingLogo" aria-hidden="true" style={{ background: "white", padding: "4px", borderRadius: "10px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
          <img src="https://bgm.tv/img/ico/ico_ios.png" alt="BGM" style={{ width: "100%", height: "100%", borderRadius: "6px" }} />
        </div>
        <div>
          <div className="ratingScoreLine">
            <strong>{preciseScore || score || "暂无"}</strong>
            {score && <span>{ratingGrade(rating.score || 0)}</span>}
          </div>
          <p>{rank ? `Bangumi Anime Ranked:#${rank}` : "Bangumi Anime Ranking"}</p>
        </div>
        <span className="ratingVotes">{total ? `${total} votes` : "暂无投票"}</span>
      </div>
      {total ? (
        <>
          <div className="ratingBars" aria-label="Bangumi 评分分布">
            {buckets.map((bucket) => {
              const percent = total ? (bucket.count / total) * 100 : 0;
              return (
                <div className="ratingBucket" key={bucket.score}>
                  <div
                    className="ratingBarTip"
                    data-tip={`${trimNumber(percent, 2)}% (${bucket.count}人)`}
                    style={{ height: `${Math.max(2, (bucket.count / max) * 100)}%` }}
                  />
                  <span>{bucket.score}</span>
                </div>
              );
            })}
          </div>
          <div className="ratingFoot">
            <span>标准差：{ratingDeviation(buckets, total, rating.score || 0)}</span>
            <span>争议度：<b>{ratingConsensus(buckets, total)}</b></span>
          </div>
        </>
      ) : (
        <p className="ratingEmpty">暂无评分分布。重新刮削后如果 Bangumi 返回投票数据，这里会自动显示。</p>
      )}
    </div>
  );
}
