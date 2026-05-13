import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function GlassSelect({
  value,
  options,
  onChange,
  className = ""
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 180 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const selected = options.find((option) => option.value === value) || options[0];

  const handleToggle = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const up = spaceBelow < 280;
      setDropUp(up);
      setMenuPos({
        top: up ? rect.top : rect.bottom + 8,
        left: rect.left,
        width: Math.max(rect.width, 180)
      });
    }
    setOpen(!open);
  };

  return (
    <div className={`glassSelect ${open ? "open" : ""} ${dropUp ? "drop-up" : ""} ${className}`}>
      <button type="button" ref={btnRef} className="glassSelectButton" onClick={handleToggle}>
        <span>{selected?.label || value}</span>
        <span className="glassSelectChevron">{dropUp ? "⌃" : "⌄"}</span>
      </button>
      {open && createPortal(
        <>
          {/* 透明遮罩层：点击任意位置关闭 */}
          <div
            style={{ position: "fixed", inset: 0, zIndex: 999998 }}
            onClick={() => setOpen(false)}
          />
          <div
            className={`glassSelectMenu glassSelectMenuPortal ${dropUp ? "drop-up" : ""}`}
            style={{
              position: "fixed",
              zIndex: 999999,
              left: menuPos.left,
              width: menuPos.width,
              ...(dropUp
                ? { bottom: window.innerHeight - menuPos.top + 8 }
                : { top: menuPos.top }),
            }}
          >
            <div className="glassSelectMenuBg" />
            <div className="glassSelectMenuContent">
              {options.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  className={option.value === value ? "active" : ""}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

