export type ViewportProfile = "compact" | "laptop" | "wide";

export function getViewportProfile(width = window.innerWidth): ViewportProfile {
  if (width < 900) return "compact";
  if (width < 1600) return "laptop";
  return "wide";
}
