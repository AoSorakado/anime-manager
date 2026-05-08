import type { WatchStatus } from "../../electron/shared/types";
import { statusLabel } from "../utils";

export default function StatusBadge({ status }: { status: WatchStatus }) {
  const text = statusLabel(status);
  return <span className={`status ${status}`}>{text}</span>;
}
