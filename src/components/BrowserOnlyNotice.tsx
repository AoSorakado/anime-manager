import { BookOpen } from "lucide-react";

export default function BrowserOnlyNotice() {
  return (
    <div className="browserNotice">
      <div>
        <BookOpen size={42} />
        <h1>请在 Electron 桌面窗口中使用</h1>
        <p>这个应用需要访问本地文件、SQLite 数据库和 mpv，因此不能只作为普通网页运行。开发服务仍在运行，但媒体库功能只会在 Electron 窗口里可用。</p>
        <code>npm run dev</code>
      </div>
    </div>
  );
}
