import { RefreshCw } from "lucide-react";
import type { ScrapeIssue, WatchStats } from "../../electron/shared/types";
import { formatStatDuration } from "../utils";

export default function SidebarInsights({ issues, stats, onOpenIssue }: { issues: ScrapeIssue[]; stats: WatchStats | null; onOpenIssue: (id: number) => void }) {
  return (
    <div className="sidebarInsights">
      {issues.length > 0 && (
        <>
          <div className="sideTitle">待处理事项</div>
          <div className="sideCard issueCard">
            {issues.slice(0, 3).map((issue) => (
              <button className="issueButton" key={issue.id} onClick={() => onOpenIssue(issue.id)}>
                <div className="issueIcon">!</div>
                <div className="issueInfo">
                  <strong>{issue.title || issue.clean_name || issue.folder_name}</strong>
                  <span>需手动匹配元数据</span>
                </div>
              </button>
            ))}
            {issues.length > 3 && <div className="moreIssues">还有 {issues.length - 3} 个待处理...</div>}
          </div>
        </>
      )}

      <div className="sideTitleArea">
        <div className="sideTitle">观看概览</div>
        <button className="sideRefreshBtn" onClick={() => {
          const btn = document.querySelector(".sideRefreshBtn");
          btn?.classList.add("spin");
          window.dispatchEvent(new CustomEvent("refresh-side-info"));
          setTimeout(() => btn?.classList.remove("spin"), 1000);
        }} title="刷新状态">
          <RefreshCw size={14} />
        </button>
      </div>
      <div className="sideCard glassStatsCard">
        <div className="mainStatRow">
          <div className="statItem">
            <div className="statValue">{formatStatDuration(stats?.today_seconds || 0)}</div>
            <div className="statLabel">今日播放</div>
          </div>
          <div className="statItem">
            <div className="statValue">{stats?.today_count || 0}</div>
            <div className="statLabel">播放次数</div>
          </div>
        </div>

        <div className="recentWatchMini">
          {stats?.recent?.length ? (
            stats.recent.slice(0, 2).map((entry) => (
              <div className="recentMiniItem" key={entry.id}>
                <div className="recentMiniDot" />
                <div className="recentMiniTitle" title={entry.title}>{entry.title}</div>
                <div className="recentMiniTime">{formatStatDuration(entry.duration || 0)}</div>
              </div>
            ))
          ) : (
            <p className="sideEmpty">暂无观看记录</p>
          )}
        </div>
      </div>

      {/* Bangumi 状态概览 */}
      <div className="sideTitle">Bangumi</div>
      <div className="sideCard glassStatsCard">
        <div className="bangumiMiniStatus">
          <div className="bgmStatItem">
            <div
              className="bgmStatusDot"
              style={{
                background:
                  stats?.bangumi_status === "operational"
                    ? "#27ae60"
                    : stats?.bangumi_status === "degraded"
                    ? "#f39c12"
                    : stats?.bangumi_status === "outage"
                    ? "#e74c3c"
                    : "#bdc3c7",
              }}
              title={
                stats?.bangumi_status === "operational"
                  ? "Bangumi 服务正常"
                  : stats?.bangumi_status === "degraded"
                  ? "Bangumi 服务降级"
                  : stats?.bangumi_status === "outage"
                  ? "Bangumi 服务中断"
                  : "Bangumi 状态未知"
              }
            />
            <span className="bgmStatLabel">服务状态</span>
          </div>
          <div className="bgmStatItem">
            <span className="bgmStatValue">{stats?.bangumi_collection_total ?? "--"}</span>
            <span className="bgmStatLabel">我的收藏</span>
          </div>
        </div>
      </div>
    </div>
  );
}
