import { Activity, BarChart3, Check, History, PieChart, Play, RefreshCw, Sparkles } from "lucide-react";
import type { WatchStats } from "../../electron/shared/types";
import { formatStatDuration, statusColor, statusLabel, shortDate, buildPieGradient } from "../utils";
import StatTile from "../components/StatTile";

export function StatsPage({ stats, onRefresh }: { stats: WatchStats | null; onRefresh: () => Promise<void> }) {
  const daily = stats?.daily || [];
  const maxDaily = Math.max(1, ...daily.map((item) => item.seconds));
  const topTitles = stats?.top_titles || [];
  const maxTitle = Math.max(1, ...topTitles.map((item) => item.seconds));
  const statusCounts = stats?.status_counts || [];
  const totalStatus = Math.max(1, statusCounts.reduce((sum, item) => sum + item.count, 0));
  const pieGradient = statusCounts.length
    ? buildPieGradient(statusCounts.map((item) => ({ value: item.count, color: statusColor(item.status) })))
    : "conic-gradient(rgba(255,255,255,.7) 0 100%)";

  return (
    <div className="statsPage">
      <header className="statsHeader">
        <div>
          <h1>观看数据分析</h1>
          <p className="hintText">记录您的每一次心动瞬间，同步 Bangumi 实时动态</p>
        </div>
        <button className="iconButton" onClick={() => void onRefresh()} title="刷新统计">
          <RefreshCw size={20} />
        </button>
      </header>

      <section className="statsSummaryGrid">
        <StatTile
          className="today"
          icon={<Activity size={20} />}
          label="今日专注"
          value={formatStatDuration(stats?.today_seconds || 0)}
          detail={`今日共计播放 ${stats?.today_count || 0} 次`}
        />
        <StatTile
          className="week"
          icon={<Sparkles size={20} />}
          label="本周活跃"
          value={formatStatDuration(stats?.week_seconds || 0)}
          detail="近 7 天累计观看时长"
        />
        <StatTile
          className="total"
          icon={<History size={20} />}
          label="生涯记录"
          value={formatStatDuration(stats?.total_seconds || 0)}
          detail={`共计 ${stats?.total_count || 0} 条历史记录`}
        />
        <StatTile
          className="finished"
          icon={<Check size={20} />}
          label="已看番剧"
          value={`${stats?.completed_count || 0}`}
          detail="播放进度超过 90% 的剧集"
        />
      </section>

      <section className="statsGrid">
        <div className="panel statsPanel">
          <div className="panelTitleRow">
            <h2>近 14 天活跃趋势</h2>
            <BarChart3 size={18} />
          </div>
          <div className="dailyChart">
            {(() => {
              const last14Days = Array.from({ length: 14 }, (_, i) => {
                const d = new Date();
                d.setDate(d.getDate() - (13 - i));
                return d.toISOString().split("T")[0];
              });
              const dayMap = new Map(daily.map(d => [d.date, d]));

              return last14Days.map((dateString) => {
                const item = dayMap.get(dateString) || { date: dateString, seconds: 0, count: 0 };
                const isToday = dateString === new Date().toISOString().split("T")[0];
                return (
                  <div className={`dailyBarItem ${isToday ? "today" : ""}`} key={dateString}>
                    <div className="dailyBarTrack" title={`${dateString} · ${formatStatDuration(item.seconds)} · ${item.count} 次`}>
                      <span className="dailyBarFill" style={{ height: `${Math.max(2, (item.seconds / (maxDaily || 1)) * 100)}%` }} />
                    </div>
                    <small>{shortDate(dateString)}</small>
                  </div>
                );
              });
            })()}
          </div>
        </div>

        <div className="panel statsPanel">
          <div className="panelTitleRow">
            <h2>最常观看作品</h2>
            <PieChart size={18} />
          </div>
          <div className="topTitleBars">
            {topTitles.length ? topTitles.map((item, index) => (
              <div className="topTitleRow" key={String(item.media_item_id)}>
                <span>{index + 1}</span>
                <strong title={item.title}>{item.title}</strong>
                <em>{formatStatDuration(item.seconds)}</em>
                <div><span style={{ width: `${Math.max(4, (item.seconds / maxTitle) * 100)}%` }} /></div>
              </div>
            )) : <p className="emptyHint">播放后将根据时长排序。</p>}
          </div>
        </div>

        <div className="panel statsPanel">
          <div className="panelTitleRow">
            <h2>收藏状态分布</h2>
            <PieChart size={18} />
          </div>
          <div className="statusStats">
            <div className="statusPie" style={{ background: pieGradient }} />
            <div className="statusLegend">
              {statusCounts.map((item) => (
                <div key={item.status}>
                  <i style={{ background: statusColor(item.status) }} />
                  <span>{statusLabel(item.status)}</span>
                  <strong>{item.count}</strong>
                  <em>{Math.round((item.count / totalStatus) * 100)}%</em>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="panel statsPanel">
          <div className="panelTitleRow">
            <h2>最近活动记录</h2>
            <History size={18} />
          </div>
          <div className="statsRecentList">
            {stats?.recent?.length ? stats.recent.map((entry) => (
              <div className="statsRecentItem" key={entry.id}>
                <div className="statsRecentIcon">
                  <Play size={18} fill="white" />
                </div>
                <div className="statsRecentInfo">
                  <strong title={entry.title}>{entry.title}</strong>
                  <span title={entry.file_name}>{entry.file_name}</span>
                </div>
                <div className="statsRecentTime">
                  <strong>+{formatStatDuration(entry.duration || 0)}</strong>
                  <em>{new Date(entry.played_at).toLocaleDateString()}</em>
                </div>
              </div>
            )) : <p className="emptyHint">暂无最近播放记录。</p>}
          </div>
        </div>
      </section>
    </div>
  );
}
