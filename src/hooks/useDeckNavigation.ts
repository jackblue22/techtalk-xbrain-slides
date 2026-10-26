import { useCallback, useEffect, useRef, useState } from "react";

function readSlideFromHash(total: number) {
  const match = window.location.hash.match(/^#slide-(\d+)$/);
  const requested = match ? Number(match[1]) - 1 : 0;
  return Math.min(Math.max(requested, 0), total - 1);
}

export function useDeckNavigation(total: number) {
  const [currentIndex, setCurrentIndex] = useState(() => readSlideFromHash(total));
  const touchStartX = useRef<number | null>(null);

  const goTo = useCallback(
    (index: number) => {
      setCurrentIndex(Math.min(Math.max(index, 0), total - 1));
    },
    [total],
  );

  const next = useCallback(() => goTo(currentIndex + 1), [currentIndex, goTo]);
  const previous = useCallback(() => goTo(currentIndex - 1), [currentIndex, goTo]);

  useEffect(() => {
    window.history.replaceState(null, "", `#slide-${currentIndex + 1}`);
  }, [currentIndex]);

  useEffect(() => {
    const syncFromLocation = () => setCurrentIndex(readSlideFromHash(total));
    window.addEventListener("hashchange", syncFromLocation);
    window.addEventListener("popstate", syncFromLocation);
    return () => {
      window.removeEventListener("hashchange", syncFromLocation);
      window.removeEventListener("popstate", syncFromLocation);
    };
  }, [total]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.target instanceof HTMLElement && event.target.matches("input, select, textarea, [contenteditable='true']")) return;

      if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(event.key)) {
        event.preventDefault();
        next();
      } else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(event.key)) {
        event.preventDefault();
        previous();
      } else if (event.key === "Home") {
        event.preventDefault();
        goTo(0);
      } else if (event.key === "End") {
        event.preventDefault();
        goTo(total - 1);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goTo, next, previous, total]);

  const touchHandlers = {
    onTouchStart: (event: React.TouchEvent) => {
      touchStartX.current = event.touches[0]?.clientX ?? null;
    },
    onTouchEnd: (event: React.TouchEvent) => {
      if (touchStartX.current === null) return;
      const distance = event.changedTouches[0].clientX - touchStartX.current;
      touchStartX.current = null;
      if (Math.abs(distance) < 48) return;
      if (distance < 0) next();
      else previous();
    },
  };

  return { currentIndex, goTo, next, previous, touchHandlers };
}
