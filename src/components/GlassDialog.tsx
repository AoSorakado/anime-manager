import { Info, AlertTriangle, XCircle, HelpCircle } from "lucide-react";
import { createPortal } from "react-dom";

export type DialogType = "info" | "warning" | "error" | "confirm";

interface GlassDialogProps {
  type: DialogType;
  title: string;
  message: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
}

export default function GlassDialog({
  type,
  title,
  message,
  detail,
  confirmLabel = "确定",
  cancelLabel = "取消",
  onConfirm,
  onCancel
}: GlassDialogProps) {
  const Icon = {
    info: Info,
    warning: AlertTriangle,
    error: XCircle,
    confirm: HelpCircle
  }[type];

  const iconColor = {
    info: "#3498db",
    warning: "#f1c40f",
    error: "#e74c3c",
    confirm: "#9b59b6"
  }[type];

  const modal = (
    <div 
      className="modalOverlay" 
      style={{ 
        zIndex: 9999,
        position: "fixed",
        inset: 0,
        background: "rgba(30, 20, 25, 0.2)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        animation: "overlayFadeIn 0.3s ease"
      }} 
      onClick={onCancel || onConfirm}
    >
      <div
        className="glassDialog"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "min(500px, 90vw)",
          padding: "28px",
          borderRadius: "28px",
          background: "linear-gradient(135deg, rgba(255, 255, 255, 0.25), rgba(255, 255, 255, 0.1))",
          backdropFilter: "blur(32px) saturate(200%)",
          WebkitBackdropFilter: "blur(32px) saturate(200%)",
          border: "1px solid rgba(255, 255, 255, 0.4)",
          boxShadow: "0 24px 48px rgba(0, 0, 0, 0.2), inset 0 0 0 1px rgba(255, 255, 255, 0.3)",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
          animation: "dialogAppear 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)"
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: -1,
            borderRadius: "inherit",
            filter: "url(#liquid-glass-filter)",
            background: "rgba(255, 255, 255, 0.15)",
            opacity: 0.6
          }}
        />
        
        <div style={{ display: "flex", gap: "20px", alignItems: "flex-start" }}>
          <div style={{ 
            padding: "12px", 
            borderRadius: "16px", 
            background: "rgba(255, 255, 255, 0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 8px 16px rgba(0,0,0,0.08)",
            border: "1px solid rgba(255, 255, 255, 0.3)"
          }}>
            <Icon size={28} color={iconColor} />
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: "0 0 8px 0", fontSize: "20px", fontWeight: 800, color: "#1a0f16", letterSpacing: "-0.01em" }}>{title}</h3>
            <div style={{ fontSize: "16px", color: "#2d1d26", lineHeight: 1.6, fontWeight: 500, whiteSpace: "pre-wrap" }}>{message}</div>
            {detail && (
              <div style={{ 
                marginTop: "16px", 
                fontSize: "14px", 
                color: "rgba(45, 29, 38, 0.85)", 
                padding: "14px", 
                background: "rgba(255, 255, 255, 0.15)", 
                border: "1px solid rgba(255, 255, 255, 0.2)",
                borderRadius: "14px",
                maxHeight: "180px",
                overflowY: "auto",
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                lineHeight: 1.4,
                whiteSpace: "pre-wrap"
              }}>
                {detail}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "14px", marginTop: "12px" }}>
          {type === "confirm" && (
            <button 
              className="secondaryButton" 
              onClick={onCancel}
              style={{ padding: "10px 24px", borderRadius: "14px", fontWeight: 600 }}
            >
              {cancelLabel}
            </button>
          )}
          <button 
            className="primaryButton" 
            onClick={onConfirm}
            style={{ 
              padding: "10px 32px", 
              borderRadius: "14px",
              background: "linear-gradient(135deg, #ff7cad, #ff4d94)",
              color: "white",
              border: "none",
              fontWeight: 700,
              fontSize: "16px",
              boxShadow: "0 8px 20px rgba(255, 124, 173, 0.4)",
              transition: "transform 0.2s ease"
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
      <style>{`
        @keyframes overlayFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes dialogAppear {
          from { opacity: 0; transform: scale(0.9) translateY(20px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );

  return createPortal(modal, document.body);
}
