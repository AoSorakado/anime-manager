import { useEffect, useState } from "react";
import { FolderOpen, FolderPlus, RefreshCw } from "lucide-react";
import type { SettingsMap, Source } from "../../electron/shared/types";
import { settingLabel } from "../utils";
import GlassSelect from "../components/GlassSelect";

export function SettingsPage({
  sources,
  scanningSourceId,
  onAddSource,
  onSourceAdded,
  onSourcesChanged,
  onScan,
  onNamesChanged,
  showDialog
}: {
  sources: Source[];
  scanningSourceId: number | null;
  onAddSource: () => void;
  onSourceAdded: () => Promise<void>;
  onSourcesChanged: () => Promise<void>;
  onScan: (id: number) => Promise<void>;
  onNamesChanged?: () => Promise<void>;
  showDialog: (options: any) => void;
}) {
  const [settings, setSettings] = useState<SettingsMap>({});
  const [libraryPath, setLibraryPath] = useState("");
  const [libraryName, setLibraryName] = useState("");
  const [webdavName, setWebdavName] = useState("");
  const [webdavUrl, setWebdavUrl] = useState("");
  const [webdavUser, setWebdavUser] = useState("");
  const [webdavPassword, setWebdavPassword] = useState("");
  const [webdavRoot, setWebdavRoot] = useState("/");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [testingToken, setTestingToken] = useState(false);

  useEffect(() => {
    void window.libraryApi.settings.get().then(setSettings);
  }, []);

  async function save(key: keyof SettingsMap, value: string) {
    setSettings((current) => ({ ...current, [key]: value }));
    try {
      await window.libraryApi.settings.set(key, value);
      setMessage(`已保存：${settingLabel(key)}`);
      setError("");
    } catch (err) {
      setError(`保存失败：${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function addPathFromInput() {
    if (!libraryPath.trim()) {
      setError("先填写媒体库根目录，比如 A:\\Fan\\4k");
      return;
    }
    try {
      const source = await window.libraryApi.sources.addLocalPath(libraryPath, libraryName);
      await onSourceAdded();
      setLibraryPath("");
      setLibraryName("");
      setMessage(`已添加媒体库：${source.name}`);
      setError("");
      await onScan(source.id);
      setMessage(`已添加并扫描：${source.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function addWebDavFromInput() {
    if (!webdavName.trim() || !webdavUrl.trim()) {
      setError("先填写 WebDAV 名称和服务器地址");
      return;
    }
    try {
      const source = await window.libraryApi.sources.addWebDav({
        name: webdavName,
        webdavUrl,
        username: webdavUser,
        password: webdavPassword,
        rootPath: webdavRoot || "/"
      });
      await onSourceAdded();
      setMessage(`已添加 WebDAV：${source.name}`);
      setError("");
      await onScan(source.id);
      setMessage(`已添加并扫描 WebDAV：${source.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function uploadSync() {
    try {
      const result = await window.libraryApi.sync.uploadWebDav();
      setMessage(`同步上传完成：${result.items} 个条目、${result.files} 个文件、${result.histories} 条历史`);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function downloadSync() {
    showDialog({
      type: "confirm",
      title: "拉取同步状态",
      message: "从 WebDAV 拉取同步状态？\n会把匹配到的条目、单集进度和播放历史合并到本机。",
      onConfirm: async () => {
        try {
          const result = await window.libraryApi.sync.downloadWebDav();
          await onNamesChanged?.();
          setMessage(`同步拉取完成：合并 ${result.items} 个条目、${result.files} 个文件、${result.histories} 条历史`);
          setError("");
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    });
  }

  async function chooseMpv() {
    const selected = await window.libraryApi.settings.chooseMpv();
    if (selected) {
      setSettings((current) => ({ ...current, mpvPath: selected }));
      setMessage("已保存 mpv.exe 路径");
      setError("");
    }
  }

  async function testBangumiToken() {
    setTestingToken(true);
    try {
      const status = await window.libraryApi.bangumi.testToken(settings.bangumiToken || "");
      setMessage(`Bangumi Token 可用，用户 ID：${status.user_id}`);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTestingToken(false);
    }
  }

  async function repairCovers() {
    try {
      const result = await window.libraryApi.scraper.repairCoverCache();
      setMessage(`封面缓存修复完成：成功 ${result.repaired}，失败 ${result.failed}`);
      setError("");
      await onNamesChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function clearCovers() {
    try {
      const result = await window.libraryApi.scraper.clearCoverCache();
      setMessage(`已清空封面缓存：删除 ${result.deleted} 个文件，清理 ${result.cleared} 个条目封面路径`);
      setError("");
      await onNamesChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function recleanNames() {
    try {
      const result = await window.libraryApi.media.recleanNames();
      await onNamesChanged?.();
      setMessage(`已重算清洗标题：更新 ${result.changed}/${result.total} 个条目`);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function renameLibrary(source: Source, name: string) {
    if (!name.trim() || name.trim() === source.name) return;
    try {
      await window.libraryApi.sources.rename(source.id, name);
      await onSourcesChanged();
      setMessage(`已重命名媒体库：${name.trim()}`);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function deleteLibrary(source: Source) {
    showDialog({
      type: "confirm",
      title: "删除媒体库",
      message: `删除媒体库「${source.name}」？\n\n只会删除 App 里的来源、条目和历史记录，不会删除磁盘文件。`,
      onConfirm: async () => {
        try {
          await window.libraryApi.sources.delete(source.id);
          await onSourcesChanged();
          setMessage(`已删除媒体库：${source.name}`);
          setError("");
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    });
  }

  return (
    <div className="settingsPage">
      <h1>设置</h1>
      {(message || error) && <div className={`notice ${error ? "error" : ""}`}>{error || message}</div>}
      <section className="panel">
        <h2>媒体库路径</h2>
        <div className="pathAddGrid">
          <label>显示名称<input value={libraryName} onChange={(event) => setLibraryName(event.target.value)} placeholder="比如：4K 动漫" /></label>
          <label>根目录路径<input value={libraryPath} onChange={(event) => setLibraryPath(event.target.value)} placeholder="A:\\Fan\\4k 或 D:\\Anime" /></label>
          <button className="primaryButton" disabled={scanningSourceId !== null} onClick={() => void addPathFromInput()}><FolderPlus size={18} />{scanningSourceId !== null ? "扫描中" : "添加并扫描"}</button>
          <button className="secondaryButton" onClick={onAddSource}><FolderOpen size={18} />浏览选择</button>
        </div>
        <div className="sourceRows">
          {sources.map((source) => (
            <div className="sourceRow" key={source.id}>
              <div>
                <input
                  className="sourceNameInput"
                  defaultValue={source.name}
                  onBlur={(event) => void renameLibrary(source, event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                />
                <span>{source.root_path}</span>
              </div>
              <div className="sourceActions">
                <button className="secondaryButton" disabled={scanningSourceId !== null} onClick={() => onScan(source.id)}>
                  <RefreshCw size={16} className={scanningSourceId === source.id ? "spin" : ""} />
                  {scanningSourceId === source.id ? "扫描中" : "扫描"}
                </button>
                <button className="secondaryButton dangerButton" disabled={scanningSourceId !== null} onClick={() => void deleteLibrary(source)}>删除</button>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="panel formGrid">
        <h2>WebDAV 媒体库</h2>
        <div className="webdavGrid">
          <label>显示名称<input value={webdavName} onChange={(event) => setWebdavName(event.target.value)} placeholder="比如：网盘 4K 动漫" /></label>
          <label>服务器地址<input value={webdavUrl} onChange={(event) => setWebdavUrl(event.target.value)} placeholder="https://example.com/dav" /></label>
          <label>用户名<input value={webdavUser} onChange={(event) => setWebdavUser(event.target.value)} placeholder="可选" /></label>
          <label>密码 / Token<input type="password" value={webdavPassword} onChange={(event) => setWebdavPassword(event.target.value)} placeholder="可选" /></label>
          <label>根目录<input value={webdavRoot} onChange={(event) => setWebdavRoot(event.target.value)} placeholder="/Anime/4k" /></label>
          <button className="primaryButton" disabled={scanningSourceId !== null} onClick={() => void addWebDavFromInput()}><FolderPlus size={18} />{scanningSourceId !== null ? "扫描中" : "添加并扫描 WebDAV"}</button>
        </div>
      </section>
      <section className="panel formGrid">
        <h2>WebDAV 状态同步</h2>
        <label>同步 WebDAV 地址<input value={settings.syncWebdavUrl || ""} onChange={(event) => void save("syncWebdavUrl", event.target.value)} placeholder="https://example.com/dav" /></label>
        <label>同步用户名<input value={settings.syncWebdavUsername || ""} onChange={(event) => void save("syncWebdavUsername", event.target.value)} placeholder="可选" /></label>
        <label>同步密码 / Token<input type="password" value={settings.syncWebdavPassword || ""} onChange={(event) => void save("syncWebdavPassword", event.target.value)} placeholder="可选" /></label>
        <label>同步文件路径<input value={settings.syncWebdavPath || "/LocalAnimeLibrary/sync.json"} onChange={(event) => void save("syncWebdavPath", event.target.value)} placeholder="/LocalAnimeLibrary/sync.json" /></label>
        <div className="buttonRow">
          <button className="primaryButton" onClick={() => void uploadSync()}><RefreshCw size={18} />上传本机进度</button>
          <button className="secondaryButton" onClick={() => void downloadSync()}><RefreshCw size={18} />拉取云端进度</button>
        </div>
        <p className="hintText">同步内容包括每集观看状态、播放次数、上次播放位置、观看历史和统计数据。另一台设备拉取后，点击播放会从记录的位置继续。</p>
      </section>
      <section className="panel formGrid">
        <h2>qBittorrent 下载</h2>
        <label>蜜柑站点地址<input value={settings.mikanBaseUrl || "https://mikanani.me"} onChange={(event) => void save("mikanBaseUrl", event.target.value)} placeholder="https://mikanani.me" /></label>
        <label>蜜柑个人 RSS 地址<input value={settings.mikanPersonalRssUrl || ""} onChange={(event) => void save("mikanPersonalRssUrl", event.target.value)} placeholder="在蜜柑账号页面复制 MyBangumi / 个人订阅 RSS 链接" /></label>
        <label>WebUI 地址<input value={settings.qbUrl || "http://127.0.0.1:8080"} onChange={(event) => void save("qbUrl", event.target.value)} placeholder="http://127.0.0.1:8080" /></label>
        <label>用户名<input value={settings.qbUsername || ""} onChange={(event) => void save("qbUsername", event.target.value)} placeholder="qBittorrent WebUI 用户名" /></label>
        <label>密码<input type="password" value={settings.qbPassword || ""} onChange={(event) => void save("qbPassword", event.target.value)} placeholder="qBittorrent WebUI 密码" /></label>
        <label>qbittorrent.exe 路径<input value={settings.qbExecutablePath || ""} onChange={(event) => void save("qbExecutablePath", event.target.value)} placeholder="比如 C:\\Program Files\\qBittorrent\\qbittorrent.exe" /></label>
        <label>默认保存路径<input value={settings.qbSavePath || ""} onChange={(event) => void save("qbSavePath", event.target.value)} placeholder="比如 A:\\Fan\\4k 或 WebDAV 挂载盘路径" /></label>
        <div className="buttonRow">
          <button className="secondaryButton" onClick={async () => {
            try {
              const result = await window.libraryApi.subscriptions.testQbittorrent();
              setMessage(`qBittorrent 连接成功${result.version ? `：${result.version}` : ""}`);
              setError("");
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            }
          }}>测试连接</button>
        </div>
        <p className="hintText">需要在 qBittorrent 开启 WebUI。填了 qbittorrent.exe 路径后，如果提交下载时 WebUI 没响应，App 会自动启动 qBittorrent 再提交任务。</p>
      </section>
      <section className="panel formGrid">
        <h2>123 云盘离线下载</h2>
        <label>clientID<input value={settings.pan123ClientId || ""} onChange={(event) => void save("pan123ClientId", event.target.value)} placeholder="123 云盘开放平台 clientID" /></label>
        <label>clientSecret<input type="password" value={settings.pan123ClientSecret || ""} onChange={(event) => void save("pan123ClientSecret", event.target.value)} placeholder="123 云盘开放平台 clientSecret" /></label>
        <label>离线保存目录 ID<input value={settings.pan123OfflineDirId || "0"} onChange={(event) => void save("pan123OfflineDirId", event.target.value)} placeholder="根目录通常填 0；指定目录请填 dirID" /></label>
        <label>回调地址<input value={settings.pan123CallbackUrl || ""} onChange={(event) => void save("pan123CallbackUrl", event.target.value)} placeholder="可选，留空即可" /></label>
        <p className="hintText">123 云盘离线下载接口使用目录 ID，不是 Windows 路径。保存到指定文件夹时，需要从 123 云盘接口或文件夹信息里拿到 dirID；不确定就先填 0 保存到根目录。</p>
      </section>
      <section className="panel formGrid">
        <h2>PikPak 离线下载</h2>
        <label>rclone.exe 路径<input value={settings.pikpakRclonePath || "rclone"} onChange={(event) => void save("pikpakRclonePath", event.target.value)} placeholder="比如 C:\\Tools\\rclone\\rclone.exe，或填 rclone" /></label>
        <label>PikPak remote<input value={settings.pikpakRemote || "pikpak:"} onChange={(event) => void save("pikpakRemote", event.target.value)} placeholder="比如 pikpak:" /></label>
        <label>默认保存目录<input value={settings.pikpakSavePath || ""} onChange={(event) => void save("pikpakSavePath", event.target.value)} placeholder="比如 Anime/新番，留空则保存到 remote 根目录" /></label>
        <p className="hintText">先在命令行执行 rclone config 配好 PikPak remote，例如命名为 pikpak，然后这里填 pikpak:。App 会通过 rclone backend addurl 把 magnet 或下载链接提交给 PikPak。</p>
      </section>
      <section className="panel formGrid">
        <h2>播放与扫描</h2>
        <label>mpv.exe 路径
          <div className="inlineInput">
            <input value={settings.mpvPath || ""} onChange={(event) => void save("mpvPath", event.target.value)} placeholder="D:\\mpv\\mpv.exe" />
            <button className="secondaryButton" onClick={() => void chooseMpv()}>选择</button>
          </div>
        </label>
        <label>mpv 启动参数<input value={settings.mpvArgs || "--force-window=yes --save-position-on-quit"} onChange={(event) => void save("mpvArgs", event.target.value)} /></label>
        <label>视频扩展名<input value={settings.videoExtensions || ".mkv,.mp4,.m4v,.avi,.mov,.webm,.ts,.m2ts,.flv,.wmv"} onChange={(event) => void save("videoExtensions", event.target.value)} /></label>
        <label>最大扫描深度<input value={settings.maxScanDepth || "3"} onChange={(event) => void save("maxScanDepth", event.target.value)} /></label>
        <label>日志等级<input value={settings.logLevel || "info"} onChange={(event) => void save("logLevel", event.target.value)} /></label>
        <div>
          <button className="secondaryButton" onClick={() => void recleanNames()}>重算清洗标题</button>
        </div>
      </section>
      <section className="panel formGrid">
        <h2>Bangumi 同步</h2>
        <label>Access Token
          <div className="inlineInput">
            <input value={settings.bangumiToken || ""} onChange={(event) => void save("bangumiToken", event.target.value)} placeholder="从 next.bgm.tv/demo/access-token 获取" />
            <button className="secondaryButton" disabled={testingToken} onClick={() => void testBangumiToken()}>{testingToken ? "验证中" : "验证"}</button>
          </div>
        </label>
        <label>想看条目同步规则
          <GlassSelect
            value={settings.bangumiSyncUnwatched || "skip"}
            onChange={(value) => void save("bangumiSyncUnwatched", value)}
            options={[
              { value: "skip", label: "跳过想看" },
              { value: "wish", label: "同步为想看" }
            ]}
          />
        </label>
        <label className="checkboxLabel">
          <input type="checkbox" checked={settings.bangumiPrivateCollection === "true"} onChange={(event) => void save("bangumiPrivateCollection", String(event.target.checked))} />
          <span>同步为私密收藏</span>
        </label>
        <div>
          <button className="secondaryButton" onClick={() => void repairCovers()}>修复封面缓存</button>
          <button className="secondaryButton dangerButton" onClick={() => void clearCovers()}>清空封面缓存</button>
        </div>
      </section>
    </div>
  );
}
