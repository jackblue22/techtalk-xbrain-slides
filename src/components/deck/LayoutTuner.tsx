import { useCallback, useEffect, useMemo, useState } from "react";
import { Clipboard, ImagePlus, RotateCcw, X } from "lucide-react";
import { getViewportProfile, type ViewportProfile } from "../../utils/responsive";
import {
  deleteSlideImage,
  getSlideImages,
  saveSlideImage,
  SLIDE_IMAGES_CHANGED,
  type SlideImage,
} from "../../utils/slideImages";

type LayoutTunerProps = {
  open: boolean;
  slideId: string;
  onClose: () => void;
};

type Adjustment = { x: number; y: number; scale: number };
type LayoutStore = { version: 1; adjustments: Record<string, Adjustment> };

const STORAGE_KEY = "xbrain-slide-layout:v1";
const DEFAULT_ADJUSTMENT: Adjustment = { x: 0, y: 0, scale: 1 };
const LOCKED_CLASSES = new Set([
  "slide-chrome",
  "slide-footer",
  "cover-slide__image",
  "takeaway-slide__glow",
]);

function readStore(): LayoutStore {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "") as LayoutStore;
    if (parsed.version === 1 && parsed.adjustments) return parsed;
  } catch {
    // Invalid or absent local data falls back to a clean, versioned store.
  }
  return { version: 1, adjustments: {} };
}

function getTunableElements() {
  const slide = document.querySelector<HTMLElement>(".slide-stage > .slide");
  if (!slide) return [];
  return Array.from(slide.children).filter((element): element is HTMLElement => {
    if (!(element instanceof HTMLElement)) return false;
    return !Array.from(element.classList).some((className) => LOCKED_CLASSES.has(className));
  });
}

function storeKey(profile: ViewportProfile, slideId: string, elementIndex: number) {
  return `${profile}/${slideId}/block-${elementIndex + 1}`;
}

function blockLabel(element: HTMLElement | undefined, index: number) {
  if (!element) return `Block ${index + 1}`;
  const meaningfulClass = Array.from(element.classList).find(
    (className) => !className.startsWith("slide--") && className !== "slide",
  );
  return meaningfulClass?.replaceAll("__", " / ").replaceAll("-", " ") ?? `Block ${index + 1}`;
}

export function LayoutTuner({ open, slideId, onClose }: LayoutTunerProps) {
  const [profile, setProfile] = useState<ViewportProfile>(() => getViewportProfile());
  const [store, setStore] = useState<LayoutStore>(() => readStore());
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [copyLabel, setCopyLabel] = useState("Copy JSON");
  const [imageMessage, setImageMessage] = useState("");
  const [slideImages, setSlideImages] = useState<SlideImage[]>([]);

  const elements = getTunableElements();
  const selectedKey = selectedIndex === null ? null : storeKey(profile, slideId, selectedIndex);
  const adjustment = selectedKey ? store.adjustments[selectedKey] ?? DEFAULT_ADJUSTMENT : DEFAULT_ADJUSTMENT;

  const persist = useCallback((next: LayoutStore) => {
    setStore(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const updateAdjustment = useCallback(
    (key: string, nextAdjustment: Adjustment) => {
      persist({
        version: 1,
        adjustments: { ...store.adjustments, [key]: nextAdjustment },
      });
    },
    [persist, store.adjustments],
  );

  useEffect(() => {
    const onResize = () => setProfile(getViewportProfile());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    setSelectedIndex(null);
  }, [profile, slideId]);

  useEffect(() => {
    const refreshImages = () => void getSlideImages(slideId).then(setSlideImages);
    const onImagesChanged = (event: Event) => {
      if ((event as CustomEvent<string>).detail === slideId) refreshImages();
    };
    refreshImages();
    window.addEventListener(SLIDE_IMAGES_CHANGED, onImagesChanged);
    return () => window.removeEventListener(SLIDE_IMAGES_CHANGED, onImagesChanged);
  }, [slideId]);

  useEffect(() => {
    const currentElements = getTunableElements();
    currentElements.forEach((element, index) => {
      const saved = store.adjustments[storeKey(profile, slideId, index)] ?? DEFAULT_ADJUSTMENT;
      element.style.translate = `${saved.x}cqw ${saved.y}cqw`;
      element.style.scale = String(saved.scale);
      element.style.transformOrigin = "center";
      element.classList.toggle("is-layout-selected", open && index === selectedIndex);
      element.dataset.layoutBlock = String(index + 1);
    });

    return () => currentElements.forEach((element) => element.classList.remove("is-layout-selected"));
  }, [open, profile, selectedIndex, slideId, store]);

  useEffect(() => {
    if (!open) return;
    const stage = document.querySelector<HTMLElement>(".slide-stage");
    const slide = document.querySelector<HTMLElement>(".slide-stage > .slide");
    if (!stage || !slide) return;

    const onPointerDown = (event: PointerEvent) => {
      const directChild = event.composedPath().find(
        (node) => node instanceof HTMLElement && node.parentElement === slide,
      ) as HTMLElement | undefined;
      const index = directChild ? getTunableElements().indexOf(directChild) : -1;
      if (!directChild || index < 0) return;

      event.preventDefault();
      event.stopPropagation();
      setSelectedIndex(index);
      directChild.setPointerCapture(event.pointerId);

      const key = storeKey(profile, slideId, index);
      const initial = store.adjustments[key] ?? DEFAULT_ADJUSTMENT;
      const origin = { x: event.clientX, y: event.clientY };
      let latest = initial;

      const onMove = (moveEvent: PointerEvent) => {
        const width = stage.getBoundingClientRect().width;
        latest = {
          ...initial,
          x: Math.round((initial.x + ((moveEvent.clientX - origin.x) / width) * 100) * 10) / 10,
          y: Math.round((initial.y + ((moveEvent.clientY - origin.y) / width) * 100) * 10) / 10,
        };
        directChild.style.translate = `${latest.x}cqw ${latest.y}cqw`;
      };

      const onUp = () => {
        directChild.removeEventListener("pointermove", onMove);
        directChild.removeEventListener("pointerup", onUp);
        directChild.removeEventListener("pointercancel", onUp);
        updateAdjustment(key, latest);
      };

      directChild.addEventListener("pointermove", onMove);
      directChild.addEventListener("pointerup", onUp);
      directChild.addEventListener("pointercancel", onUp);
    };

    stage.addEventListener("pointerdown", onPointerDown, true);
    return () => stage.removeEventListener("pointerdown", onPointerDown, true);
  }, [open, profile, slideId, store.adjustments, updateAdjustment]);

  const slideAdjustments = useMemo(
    () => Object.keys(store.adjustments).filter((key) => key.startsWith(`${profile}/${slideId}/`)),
    [profile, slideId, store.adjustments],
  );

  if (!open) return null;

  const setValue = (change: Partial<Adjustment>) => {
    if (!selectedKey) return;
    updateAdjustment(selectedKey, { ...adjustment, ...change });
  };

  const resetSelected = () => {
    if (!selectedKey) return;
    const next = { ...store.adjustments };
    delete next[selectedKey];
    persist({ version: 1, adjustments: next });
  };

  const resetSlide = () => {
    const next = { ...store.adjustments };
    slideAdjustments.forEach((key) => delete next[key]);
    persist({ version: 1, adjustments: next });
    setSelectedIndex(null);
  };

  const copyConfig = async () => {
    await navigator.clipboard.writeText(JSON.stringify(store, null, 2));
    setCopyLabel("Copied");
    window.setTimeout(() => setCopyLabel("Copy JSON"), 1400);
  };

  const insertImage = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setImageMessage("Please choose an image file.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setImageMessage("Image must be smaller than 20 MB.");
      return;
    }
    await saveSlideImage({
      id: crypto.randomUUID(),
      slideId,
      name: file.name,
      alt: file.name.replace(/\.[^.]+$/, "").replaceAll(/[-_]/g, " "),
      blob: file,
      placements: { [profile]: { x: 58, y: 24, width: 30 } },
      createdAt: Date.now(),
    });
    setImageMessage(`${file.name} inserted. Drag it on the slide.`);
  };

  return (
    <>
      <div className="layout-safe-guides" aria-hidden="true"><span>SAFE AREA</span></div>
      <aside className="layout-tuner" aria-label="Local layout tuner">
        <header>
          <div><span>LOCAL LAYOUT</span><strong>{profile} · {slideId}</strong></div>
          <button type="button" onClick={onClose} aria-label="Close layout tuner"><X aria-hidden="true" /></button>
        </header>

        <p className="layout-tuner__help">Click or drag a major content block. Changes save only in this browser and responsive profile.</p>

        <label className="layout-tuner__upload">
          <span><ImagePlus aria-hidden="true" />Insert image on this slide</span>
          <input type="file" accept="image/*" onChange={(event) => { void insertImage(event.target.files?.[0]); event.currentTarget.value = ""; }} />
        </label>
        {imageMessage ? <p className="layout-tuner__message" role="status">{imageMessage}</p> : null}
        {slideImages.length > 0 ? (
          <div className="layout-tuner__images" aria-label="Images on this slide">
            {slideImages.map((image) => (
              <div key={image.id}>
                <strong title={image.name}>{image.name}</strong>
                <label>Alt text<input type="text" value={image.alt} onChange={(event) => {
                  const next = { ...image, alt: event.target.value };
                  setSlideImages((current) => current.map((item) => item.id === image.id ? next : item));
                }} onBlur={(event) => void saveSlideImage({ ...image, alt: event.target.value.trim() || image.name })} /></label>
                <button type="button" onClick={() => void deleteSlideImage(image.id, slideId)}>Delete</button>
              </div>
            ))}
          </div>
        ) : null}

        <label>
          Selected block
          <select value={selectedIndex ?? ""} onChange={(event) => setSelectedIndex(event.target.value === "" ? null : Number(event.target.value))}>
            <option value="">Choose a block…</option>
            {elements.map((element, index) => <option value={index} key={`${slideId}-${index}`}>{index + 1}. {blockLabel(element, index)}</option>)}
          </select>
        </label>

        <div className="layout-tuner__controls" aria-disabled={!selectedKey}>
          <label>X offset <output>{adjustment.x.toFixed(1)} cqw</output><input disabled={!selectedKey} type="range" min="-12" max="12" step="0.1" value={adjustment.x} onChange={(event) => setValue({ x: Number(event.target.value) })} /></label>
          <label>Y offset <output>{adjustment.y.toFixed(1)} cqw</output><input disabled={!selectedKey} type="range" min="-8" max="8" step="0.1" value={adjustment.y} onChange={(event) => setValue({ y: Number(event.target.value) })} /></label>
          <label>Scale <output>{Math.round(adjustment.scale * 100)}%</output><input disabled={!selectedKey} type="range" min="0.72" max="1.28" step="0.01" value={adjustment.scale} onChange={(event) => setValue({ scale: Number(event.target.value) })} /></label>
        </div>

        <div className="layout-tuner__actions">
          <button type="button" disabled={!selectedKey} onClick={resetSelected}><RotateCcw aria-hidden="true" />Reset block</button>
          <button type="button" disabled={slideAdjustments.length === 0} onClick={resetSlide}><RotateCcw aria-hidden="true" />Reset slide</button>
          <button type="button" onClick={() => void copyConfig()}><Clipboard aria-hidden="true" />{copyLabel}</button>
        </div>

        <small><kbd>E</kbd> close · resize browser to switch profile automatically</small>
      </aside>
    </>
  );
}
