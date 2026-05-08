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

      <div className="sideTitle">观看概览</div>
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
    </div>
  );
}
