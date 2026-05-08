import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { addCloudOfflineTask, getSettings, listCloudOfflineTasks, log } from "./db.js";
import type { CloudOfflineSubmitResult, CloudOfflineTask } from "../shared/types.js";

export function listPikpakOfflineTasks(): CloudOfflineTask[] {
  return listCloudOfflineTasks(100).filter((task) => task.provider === "pikpak");
}

export async function submitPikpakOfflineDownload(input: { url: string; title?: string; savePath?: string }): Promise<CloudOfflineSubmitResult> {
  const url = input.url.trim();
  if (!url) throw new Error("没有可提交给 PikPak 的链接");

  const settings = getSettings();
  const rclonePath = settings.pikpakRclonePath?.trim() || "rclone";
  const remote = settings.pikpakRemote?.trim() || "pikpak:";
  const target = joinRcloneRemote(remote, input.savePath?.trim() || settings.pikpakSavePath?.trim() || "");

  await runRclone(rclonePath, ["backend", "addurl", target, url]);
  const taskId = `pikpak-${Date.now()}-${createHash("sha1").update(`${target}\n${url}`).digest("hex").slice(0, 10)}`;
  const task = addCloudOfflineTask({
    provider: "pikpak",
    sourceTitle: input.title || url,
    sourceUrl: url,
    taskId,
    targetDirId: target,
    progress: null,
    status: "已提交",
    rawJson: JSON.stringify({ target, rclonePath })
  });
  log("info", "subscription", `已提交到 PikPak 离线下载：${input.title || url}`, target);
  return {
    task,
    message: `已提交 PikPak 离线下载：${target}`
  };
}

export function refreshPikpakOfflineTasks(): CloudOfflineTask[] {
  return listPikpakOfflineTasks();
}

function joinRcloneRemote(remoteInput: string, folderInput: string) {
  let remote = remoteInput.trim() || "pikpak:";
  if (!remote.includes(":")) remote = `${remote}:`;
  const folder = folderInput.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!folder) return remote;
  if (remote.endsWith(":")) return `${remote}${folder}`;
  return `${remote.replace(/\/+$/, "")}/${folder}`;
}

function runRclone(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      reject(new Error(`启动 rclone 失败：${error.message}。请在设置里填写 rclone.exe 路径，并先用 rclone config 配好 PikPak remote。`));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`PikPak 提交失败：${stderr.trim() || stdout.trim() || `rclone 退出码 ${code}`}`));
    });
  });
}
