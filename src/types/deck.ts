import type { ComponentType } from "react";

export type SlideDefinition = {
  id: string;
  title: string;
  section: string;
  duration: string;
  transition: string;
  notes: string[];
  sources: Array<{
    label: string;
    url: string;
    status: "VERIFIED" | "VERIFY" | "ASSUMPTION";
  }>;
  component: ComponentType;
};
