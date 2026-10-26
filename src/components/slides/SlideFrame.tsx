import type { ReactNode } from "react";

type SlideFrameProps = {
  children: ReactNode;
  className?: string;
  tone?: "dark" | "orange" | "paper";
  index: number;
  section: string;
  source?: string;
  status?: "VERIFIED" | "VERIFY" | "BENCHMARK_PENDING" | "ASSET_NEEDED";
};

export function SlideFrame({
  children,
  className = "",
  tone = "dark",
  index,
  section,
  source,
  status,
}: SlideFrameProps) {
  return (
    <section className={`slide slide--${tone} ${className}`}>
      <div className="slide-chrome" aria-hidden="true">
        <span>XBRAIN / SERVICE DELIVERY</span>
        <span>{section}</span>
      </div>
      {children}
      <footer className="slide-footer">
        <span>{source}</span>
        {status ? <span className={`evidence evidence--${status.toLowerCase()}`}>{status}</span> : null}
        <span className="slide-footer__number">{String(index).padStart(2, "0")}</span>
      </footer>
    </section>
  );
}
