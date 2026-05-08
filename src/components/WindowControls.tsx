import { Minus, Square, X } from "lucide-react";

export default function WindowControls() {
  return (
    <div className="windowControls">
      <button type="button" onClick={() => void window.libraryApi.window.minimize()} aria-label="最小化">
        <Minus size={15} />
      </button>
      <button type="button" onClick={() => void window.libraryApi.window.maximize()} aria-label="最大化">
        <Square size={13} />
      </button>
      <button type="button" onClick={() => void window.libraryApi.window.close()} aria-label="关闭">
        <X size={15} />
      </button>
    </div>
  );
}
