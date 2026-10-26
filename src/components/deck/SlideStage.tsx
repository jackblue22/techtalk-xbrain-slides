import { useRef } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import type { SlideDefinition } from "../../types/deck";
import { SlideImageLayer } from "./SlideImageLayer";

gsap.registerPlugin(useGSAP);

type SlideStageProps = {
  slide: SlideDefinition;
  layoutEditing: boolean;
};

export function SlideStage({ slide, layoutEditing }: SlideStageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const Slide = slide.component;

  useGSAP(
    () => {
      const media = gsap.matchMedia();

      media.add("(prefers-reduced-motion: no-preference)", () => {
        const timeline = gsap.timeline({ defaults: { ease: "power3.out" } });
        const animateIfPresent = (
          selector: string,
          vars: gsap.TweenVars,
          position?: gsap.Position,
        ) => {
          const targets = gsap.utils.toArray(selector);
          if (targets.length > 0) timeline.from(targets, vars, position);
        };

        animateIfPresent("[data-animate='eyebrow']", { autoAlpha: 0, y: 18, duration: 0.36 });
        animateIfPresent("[data-animate='title']", { autoAlpha: 0, y: 42, duration: 0.68 }, "-=0.12");
        animateIfPresent(
          "[data-animate='content']",
          { autoAlpha: 0, y: 28, duration: 0.56, stagger: 0.07 },
          "-=0.32",
        );
        animateIfPresent("[data-animate='visual']", { autoAlpha: 0, scale: 0.96, duration: 0.72 }, "<");
        animateIfPresent(
          "[data-animate='flow']",
          { autoAlpha: 0, x: -16, duration: 0.42, stagger: 0.08 },
          "-=0.46",
        );
      });

      return () => media.revert();
    },
    { scope: stageRef },
  );

  return (
    <div className="slide-stage" ref={stageRef}>
      <Slide />
      <SlideImageLayer slideId={slide.id} editing={layoutEditing} />
    </div>
  );
}
