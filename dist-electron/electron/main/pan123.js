import { addCloudOfflineTask, getSettings, listCloudOfflineTasks, log, setSetting, updateCloudOfflineTask } from "./db.js";
const API_BASE = "https://open-api.123pan.com";
export function listPan123OfflineTasks() {
    return listCloudOfflineTasks(100).filter((task) => task.provider === "123pan");
}
export async function submitPan123OfflineDownload(input) {
    const url = input.url.trim();
    if (!url)
        throw new Error("没有可提交到 123 云盘离线下载的链接");
    const settings = getSettings();
    const dirId = input.dirId?.trim() || settings.pan123OfflineDirId?.trim() || "0";
    const token = await getPan123AccessToken();
    const body = {
        url,
        dirID: Number.isFinite(Number(dirId)) ? Number(dirId) : dirId
    };
    if (input.title?.trim())
        body.fileName = sanitizeFileName(input.title.trim());
    if (settings.pan123CallbackUrl?.trim())
        body.callBackUrl = settings.pan123CallbackUrl.trim();
    const data = await pan123Fetch("/api/v1/offline/download", {
        method: "POST",
        token,
        body
    });
    const taskId = String(data.taskID ?? data.taskId ?? data.task_id ?? "");
    if (!taskId)
        throw new Error("123 云盘没有返回离线下载 taskID");
    const task = addCloudOfflineTask({
        provider: "123pan",
        sourceTitle: input.title?.trim() || url,
        sourceUrl: url,
        taskId,
        targetDirId: dirId,
        progress: 0,
        status: "已提交",
        rawJson: JSON.stringify(data)
    });
    log("info", "subscription", `已提交到 123 云盘离线下载：${input.title || url}`, `taskID=${taskId}`);
    return { task, message: `已提交 123 云盘离线下载：${taskId}` };
}
export async function refreshPan123OfflineTask(taskId) {
    const token = await getPan123AccessToken();
    const data = await pan123Fetch(`/api/v1/offline/download/process?taskID=${encodeURIComponent(taskId)}`, {
        method: "GET",
        token
    });
    const progress = normalizeProgress(data);
    const status = normalizeStatus(data);
    const task = updateCloudOfflineTask("123pan", taskId, {
        progress,
        status,
        errorMessage: normalizeError(data),
        rawJson: JSON.stringify(data)
    });
    log("info", "subscription", `刷新 123 离线任务进度：${taskId}`, JSON.stringify({ progress, status }));
    return task;
}
export async function refreshAllPan123OfflineTasks() {
    const tasks = listPan123OfflineTasks();
    const results = [];
    for (const task of tasks) {
        try {
            const next = await refreshPan123OfflineTask(task.task_id);
            if (next)
                results.push(next);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            updateCloudOfflineTask("123pan", task.task_id, { errorMessage: message, status: "刷新失败" });
            log("error", "subscription", `刷新 123 离线任务失败：${task.task_id}`, message);
        }
    }
    return results;
}
async function getPan123AccessToken() {
    const settings = getSettings();
    const cachedToken = settings.pan123AccessToken?.trim();
    const expires = settings.pan123TokenExpiredAt ? new Date(settings.pan123TokenExpiredAt).getTime() : 0;
    if (cachedToken && expires > Date.now() + 10 * 60 * 1000)
        return cachedToken;
    const clientID = settings.pan123ClientId?.trim();
    const clientSecret = settings.pan123ClientSecret?.trim();
    if (!clientID || !clientSecret)
        throw new Error("先到设置页填写 123 云盘 clientID 和 clientSecret");
    const data = await pan123Fetch("/api/v1/access_token", {
        method: "POST",
        body: { clientID, clientSecret }
    });
    if (!data.accessToken)
        throw new Error("123 云盘没有返回 accessToken");
    setSetting("pan123AccessToken", data.accessToken);
    if (data.expiredAt)
        setSetting("pan123TokenExpiredAt", data.expiredAt);
    return data.accessToken;
}
async function pan123Fetch(route, options) {
    const headers = {
        "Content-Type": "application/json",
        Platform: "open_platform"
    };
    if (options.token)
        headers.Authorization = `Bearer ${options.token}`;
    const response = await fetch(`${API_BASE}${route}`, {
        method: options.method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined
    });
    const text = await response.text();
    if (!response.ok)
        throw new Error(`123 云盘请求失败：${response.status} ${response.statusText} ${text}`);
    const json = JSON.parse(text || "{}");
    if (json.code !== undefined && json.code !== 0)
        throw new Error(`123 云盘接口失败：${json.message || json.code}`);
    return (json.data ?? json);
}
function normalizeProgress(data) {
    const value = data.progress ?? data.percent ?? data.process ?? data.rate;
    if (typeof value === "number")
        return value > 1 ? value : value * 100;
    if (typeof value === "string") {
        const parsed = Number(value.replace("%", ""));
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}
function normalizeStatus(data) {
    const value = data.status ?? data.statusText ?? data.state ?? data.message;
    return value === undefined || value === null ? null : String(value);
}
function normalizeError(data) {
    const value = data.errorMessage ?? data.error ?? data.failReason;
    return value === undefined || value === null ? null : String(value);
}
function sanitizeFileName(value) {
    return value.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
}
