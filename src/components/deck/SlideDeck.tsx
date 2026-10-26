import { useEffect, useState } from "react";
import { Grid2X2, Maximize2, Minimize2, NotebookTabs, Printer, SlidersHorizontal, X } from "lucide-react";
import type { SlideDefinition } from "../../types/deck";
import { useDeckNavigation } from "../../hooks/useDeckNavigation";
import { DeckControls } from "./DeckControls";
import { SlideStage } from "./SlideStage";
import { LayoutTuner } from "./LayoutTuner";

type SlideDeckProps = {
  slides: SlideDefinition[];
};

export function SlideDeck({ slides }: SlideDeckProps) {
  const { currentIndex, goTo, next, previous, touchHandlers } = useDeckNavigation(slides.length);
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));
  const [showNotes, setShowNotes] = useState(false);
  const [showOverview, setShowOverview] = useState(false);
  const [showLayoutTuner, setShowLayoutTuner] = useState(false);
  const activeSlide = slides[currentIndex];

  useEffect(() => {
    const syncFullscreenState = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, []);

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    await document.documentElement.requestFullscreen();
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.target instanceof HTMLElement && event.target.matches("input, select, textarea, [contenteditable='true']")) return;
      if (event.key.toLowerCase() === "n") setShowNotes((value) => !value);
      if (event.key.toLowerCase() === "o") setShowOverview((value) => !value);
      if (event.key.toLowerCase() === "f") void toggleFullscreen();
      if (event.key.toLowerCase() === "e") setShowLayoutTuner((value) => !value);
      if (event.key === "Escape") {
        setShowNotes(false);
        setShowOverview(false);
        setShowLayoutTuner(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <main className="deck-shell" aria-label="XBrain TechTalk slide deck" {...touchHandlers}>
      <SlideStage key={activeSlide.id} slide={activeSlide} layoutEditing={showLayoutTuner} />

      <div className="deck-topbar">
        <div className="deck-tools">
          <button className="icon-button" type="button" onClick={() => setShowOverview(true)} aria-label="Open slide overview" title="Overview (O)"><Grid2X2 aria-hidden="true" /></button>
          <button className="icon-button" type="button" onClick={() => setShowNotes((value) => !value)} aria-label="Toggle speaker notes" aria-pressed={showNotes} title="Speaker notes (N)"><NotebookTabs aria-hidden="true" /></button>
          <button className="icon-button" type="button" onClick={() => window.print()} aria-label="Print slides" title="Print slides"><Printer aria-hidden="true" /></button>
          <button className="icon-button" type="button" onClick={() => setShowLayoutTuner((value) => !value)} aria-label="Toggle local layout tuner" aria-pressed={showLayoutTuner} title="Layout tuner (E)"><SlidersHorizontal aria-hidden="true" /></button>
          <button className="icon-button" type="button" onClick={toggleFullscreen} aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"} title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen (F)"}>
            {isFullscreen ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
          </button>
        </div>
      </div>

      <DeckControls
        currentIndex={currentIndex}
        slides={slides}
        onPrevious={previous}
        onNext={next}
        onSelect={goTo}
      />

      <LayoutTuner open={showLayoutTuner} slideId={activeSlide.id} onClose={() => setShowLayoutTuner(false)} />

      {showNotes ? (
        <aside className="speaker-notes" aria-label="Speaker notes">
          <header><span>SLIDE {String(currentIndex + 1).padStart(2, "0")} · {activeSlide.duration}</span><button type="button" onClick={() => setShowNotes(false)} aria-label="Close speaker notes"><X aria-hidden="true" /></button></header>
          <h2>{activeSlide.title}</h2>
          <p className="speaker-notes__transition"><strong>Transition:</strong> {activeSlide.transition}</p>
          <ol>{activeSlide.notes.map((note) => <li key={note}>{note}</li>)}</ol>
          <div className="speaker-notes__sources">
            {activeSlide.sources.map((source) => <a href={source.url} key={source.url} target="_blank" rel="noreferrer"><span>{source.status}</span>{source.label}</a>)}
          </div>
        </aside>
      ) : null}

      {showOverview ? (
        <div className="overview" role="dialog" aria-modal="true" aria-label="Slide overview">
          <header><div><span>DECK OVERVIEW</span><strong>14 slides · 25 minutes</strong></div><button className="icon-button" type="button" onClick={() => setShowOverview(false)} aria-label="Close overview"><X aria-hidden="true" /></button></header>
          <div className="overview__grid">
            {slides.map((slide, index) => (
              <button className={index === currentIndex ? "overview-card is-active" : "overview-card"} type="button" key={slide.id} onClick={() => { goTo(index); setShowOverview(false); }}>
                <span>{String(index + 1).padStart(2, "0")} · {slide.duration}</span><strong>{slide.title}</strong><small>{slide.section}</small>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="print-deck" aria-hidden="true">
        {slides.map((slide) => { const PrintableSlide = slide.component; return <div className="print-slide" key={`print-${slide.id}`}><PrintableSlide /></div>; })}
      </div>
    </main>
  );
}
