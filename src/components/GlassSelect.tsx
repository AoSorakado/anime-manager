import { useState } from "react";

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
  const selected = options.find((option) => option.value === value) || options[0];

  const handleToggle = (e: React.MouseEvent) => {
    if (!open) {
      const rect = e.currentTarget.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setDropUp(spaceBelow < 280);
    }
    setOpen(!open);
  };

  return (
    <div className={`glassSelect ${open ? "open" : ""} ${dropUp ? "drop-up" : ""} ${className}`} tabIndex={-1} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
    }}>
      <button type="button" className="glassSelectButton" onClick={handleToggle}>
        <span>{selected?.label || value}</span>
        <span className="glassSelectChevron">{dropUp ? "⌃" : "⌄"}</span>
      </button>
      {open && (
        <div className="glassSelectMenu">
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
      )}
    </div>
  );
}
