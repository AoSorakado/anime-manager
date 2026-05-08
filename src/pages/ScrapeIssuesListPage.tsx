import { Check, RefreshCw } from "lucide-react";
import type { ScrapeIssue } from "../../electron/shared/types";

export function ScrapeIssuesListPage({ issues, onOpen, onRefresh }: { issues: ScrapeIssue[]; onOpen: (id: number) => void; onRefresh: () => Promise<void> }) {
  return (
    <div className="scrapeListPage">
      <header className="toolbar">
        <div className="toolbarTitle">
          <h1>待处理事项</h1>
          <button className="iconButton" onClick={() => void onRefresh()} title="刷新列表"><RefreshCw size={20} /></button>
        </div>
        <p className="hintText">这些条目在自动匹配元数据时遇到了困难，请手动指定 Bangumi 条目。</p>
      </header>
      <section className="issueGrid">
        {issues.map((issue) => (
          <button className="panel issueBigCard" key={issue.id} onClick={() => onOpen(issue.id)}>
            <div className="issueBigIcon">!</div>
            <div className="issueBigContent">
              <strong>{issue.title || issue.clean_name || issue.folder_name}</strong>
              <span className="issuePath">{issue.folder_path}</span>
              <div className="issueBadge">等待手动确认</div>
            </div>
          </button>
        ))}
        {issues.length === 0 && (
          <div className="emptyState">
            <Check size={42} />
            <h2>暂无待处理事项</h2>
            <p>所有的媒体条目都已经成功匹配或手动确认过。干得漂亮！</p>
          </div>
        )}
      </section>
    </div>
  );
}
