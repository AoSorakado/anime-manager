import { useEffect, useState } from "react";
import { RefreshCw, Tag } from "lucide-react";
import type { AppLog } from "../../electron/shared/types";

export function LogsPage() {
  const [logs, setLogs] = useState<AppLog[]>([]);
  const load = async () => setLogs(await window.libraryApi.logs.list(500));

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="logsPage">
      <header className="toolbar">
        <h1>日志</h1>
        <button className="iconButton" onClick={load}><RefreshCw size={18} /></button>
      </header>
      <section className="logList">
        {logs.length === 0 && <div className="emptyLog">暂无日志。保存设置、添加媒体库、扫描或播放后会写入这里。</div>}
        {logs.map((log) => (
          <div className={`logRow ${log.level}`} key={log.id}>
            <span>{new Date(log.created_at).toLocaleString()}</span>
            <strong>{log.module}</strong>
            <Tag size={14} />
            <span>{log.level}</span>
            <p>{log.message}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
