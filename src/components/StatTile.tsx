export default function StatTile({ className, icon, label, value, detail }: { className?: string, icon?: React.ReactNode; label: string; value: string; detail: string }) {
  return (
    <div className={`statTile ${className || ""}`}>
      <div className="statTileHeader">
        {icon && <div className="statTileIcon">{icon}</div>}
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      <em>{detail}</em>
    </div>
  );
}

