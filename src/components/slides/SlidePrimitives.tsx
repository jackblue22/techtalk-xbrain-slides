import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { awsIcons, type AwsIconName } from "../../assets/awsIcons";

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="slide-eyebrow" data-animate="eyebrow">{children}</p>;
}

export function SlideTitle({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
  return <h2 className={compact ? "slide-title slide-title--compact" : "slide-title"} data-animate="title">{children}</h2>;
}

export function AwsService({
  icon,
  label,
  detail,
  muted = false,
}: {
  icon: AwsIconName;
  label: string;
  detail?: string;
  muted?: boolean;
}) {
  return (
    <div className={muted ? "aws-service aws-service--muted" : "aws-service"} data-animate="content">
      <img src={awsIcons[icon]} alt="" aria-hidden="true" />
      <span>
        <strong>{label}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
    </div>
  );
}

export function FlowArrow({ label, danger = false }: { label?: string; danger?: boolean }) {
  return (
    <div className={danger ? "flow-arrow flow-arrow--danger" : "flow-arrow"} data-animate="flow">
      {label ? <span>{label}</span> : null}
      <i />
      <ArrowRight aria-hidden="true" />
    </div>
  );
}

export function ZoneBoundary({
  label,
  meta,
  tone = "region",
  children,
  className = "",
}: {
  label: string;
  meta?: string;
  tone?: "region" | "local" | "neutral" | "danger";
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`zone-boundary zone-boundary--${tone} ${className}`} data-animate="visual">
      <header>
        <span>{label}</span>
        {meta ? <small>{meta}</small> : null}
      </header>
      <div className="zone-boundary__body">{children}</div>
    </section>
  );
}

export function AssetSlot({
  filename,
  children,
}: {
  filename: string;
  children: ReactNode;
}) {
  return (
    <div className="asset-slot" data-animate="visual">
      <span>ASSET SLOT</span>
      <strong>{filename}</strong>
      <p>{children}</p>
    </div>
  );
}

export function StatusPill({
  children,
  status = "verified",
}: {
  children: ReactNode;
  status?: "verified" | "verify" | "pending" | "regional";
}) {
  return <span className={`status-pill status-pill--${status}`}>{children}</span>;
}

export function Terminal({ children, title = "aws-cli / ap-southeast-1" }: { children: ReactNode; title?: string }) {
  return (
    <div className="terminal" data-animate="visual">
      <div className="terminal__bar">
        <span /><span /><span />
        <strong>{title}</strong>
      </div>
      <pre><code>{children}</code></pre>
    </div>
  );
}
