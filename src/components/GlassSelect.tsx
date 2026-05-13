import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function GlassSelect({
  value,
  options,
  onChange,
  className = "",
  columns = 1
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  className?: string;
  columns?: number;
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
            className={`glassSelectMenu glassSelectMenuPortal ${dropUp ? "drop-up" : ""} ${document.querySelector('.app')?.classList.contains('theme-liquid') ? 'theme-liquid' : ''}`}
            style={{
              position: "fixed",
              zIndex: 999999,
              left: columns > 1 ? Math.min(menuPos.left, window.innerWidth - (columns * 110) - 20) : menuPos.left,
              width: columns > 1 ? columns * 110 : menuPos.width,
              ...(dropUp
                ? { bottom: window.innerHeight - menuPos.top + 8 }
                : { top: menuPos.top }),
            }}
          >
            <div 
              className="glassSelectMenuContent"
              style={{
                display: columns > 1 ? 'grid' : 'block',
                gridTemplateColumns: columns > 1 ? `repeat(${columns}, 1fr)` : 'none',
                gap: '6px',
                padding: columns > 1 ? '8px' : '0',
                overflow: 'hidden'
              }}
            >
              {options.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={value === opt.value ? "active" : ""}
                  style={{
                    padding: columns > 1 ? '10px 4px' : '10px 16px',
                    textAlign: 'center',
                    whiteSpace: 'nowrap'
                  }}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                >
                  {opt.label}
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

