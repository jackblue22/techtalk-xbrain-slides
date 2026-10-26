import { ChevronLeft, ChevronRight } from "lucide-react";
import type { SlideDefinition } from "../../types/deck";

type DeckControlsProps = {
  currentIndex: number;
  slides: SlideDefinition[];
  onPrevious: () => void;
  onNext: () => void;
  onSelect: (index: number) => void;
};

export function DeckControls({
  currentIndex,
  slides,
  onPrevious,
  onNext,
  onSelect,
}: DeckControlsProps) {
  const progress = ((currentIndex + 1) / slides.length) * 100;

  return (
    <nav className="deck-controls" aria-label="Slide controls">
      <button
        className="icon-button"
        type="button"
        onClick={onPrevious}
        disabled={currentIndex === 0}
        aria-label="Previous slide"
      >
        <ChevronLeft aria-hidden="true" />
      </button>

      <div className="deck-progress">
        <div className="deck-progress__meta">
          <span>{slides[currentIndex].section} · {slides[currentIndex].duration}</span>
          <span className="tabular-nums">
            {String(currentIndex + 1).padStart(2, "0")} / {String(slides.length).padStart(2, "0")}
          </span>
        </div>
        <div className="deck-progress__track" aria-hidden="true">
          <span style={{ transform: `scaleX(${progress / 100})` }} />
        </div>
        <div className="deck-dots" aria-label="Choose a slide">
          {slides.map((slide, index) => (
            <button
              className={index === currentIndex ? "deck-dot is-active" : "deck-dot"}
              key={slide.id}
              type="button"
              onClick={() => onSelect(index)}
              aria-label={`Go to slide ${index + 1}: ${slide.title}`}
              aria-current={index === currentIndex ? "page" : undefined}
            />
          ))}
        </div>
      </div>

      <button
        className="icon-button"
        type="button"
        onClick={onNext}
        disabled={currentIndex === slides.length - 1}
        aria-label="Next slide"
      >
        <ChevronRight aria-hidden="true" />
      </button>
    </nav>
  );
}
