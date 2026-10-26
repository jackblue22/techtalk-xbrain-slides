import { useCallback, useEffect, useMemo, useState } from "react";
import { Grip, Trash2 } from "lucide-react";
import { getViewportProfile, type ViewportProfile } from "../../utils/responsive";
import {
  deleteSlideImage,
  getSlideImages,
  saveSlideImage,
  SLIDE_IMAGES_CHANGED,
  type ImagePlacement,
  type SlideImage,
} from "../../utils/slideImages";

const DEFAULT_PLACEMENT: ImagePlacement = { x: 58, y: 24, width: 30 };

type SlideImageLayerProps = { slideId: string; editing: boolean };

export function SlideImageLayer({ slideId, editing }: SlideImageLayerProps) {
  const [images, setImages] = useState<SlideImage[]>([]);
  const [profile, setProfile] = useState<ViewportProfile>(() => getViewportProfile());
  const urls = useMemo(() => images.map((image) => ({ id: image.id, url: URL.createObjectURL(image.blob) })), [images]);

  const refresh = useCallback(() => void getSlideImages(slideId).then(setImages), [slideId]);

  useEffect(() => {
    refresh();
    const onChanged = (event: Event) => {
      if ((event as CustomEvent<string>).detail === slideId) refresh();
    };
    window.addEventListener(SLIDE_IMAGES_CHANGED, onChanged);
    return () => window.removeEventListener(SLIDE_IMAGES_CHANGED, onChanged);
  }, [refresh, slideId]);

  useEffect(() => {
    const onResize = () => setProfile(getViewportProfile());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => () => urls.forEach(({ url }) => URL.revokeObjectURL(url)), [urls]);

  const updatePlacement = async (image: SlideImage, placement: ImagePlacement) => {
    const next = { ...image, placements: { ...image.placements, [profile]: placement } };
    setImages((current) => current.map((item) => item.id === image.id ? next : item));
    await saveSlideImage(next);
  };

  const startDrag = (event: React.PointerEvent<HTMLElement>, image: SlideImage) => {
    if (!editing || profile === "compact") return;
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget;
    const stage = target.closest<HTMLElement>(".slide-stage");
    if (!stage) return;
    target.setPointerCapture(event.pointerId);
    const initial = image.placements[profile] ?? image.placements.laptop ?? DEFAULT_PLACEMENT;
    const origin = { x: event.clientX, y: event.clientY };
    let latest = initial;
    const onMove = (moveEvent: PointerEvent) => {
      const rect = stage.getBoundingClientRect();
      latest = {
        ...initial,
        x: Math.max(0, Math.min(100 - initial.width, initial.x + ((moveEvent.clientX - origin.x) / rect.width) * 100)),
        y: Math.max(0, Math.min(90, initial.y + ((moveEvent.clientY - origin.y) / rect.height) * 100)),
      };
      target.style.left = `${latest.x}%`;
      target.style.top = `${latest.y}%`;
    };
    const onUp = () => {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      target.removeEventListener("pointercancel", onUp);
      void updatePlacement(image, latest);
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
    target.addEventListener("pointercancel", onUp);
  };

  if (images.length === 0) return null;

  return (
    <div className={`slide-image-layer${editing ? " is-editing" : ""}`} aria-label="User inserted slide images">
      {images.map((item) => {
        const placement = item.placements[profile] ?? item.placements.laptop ?? DEFAULT_PLACEMENT;
        const src = urls.find(({ id }) => id === item.id)?.url;
        return (
          <figure
            className="slide-user-image"
            key={item.id}
            style={{ left: `${placement.x}%`, top: `${placement.y}%`, width: `${placement.width}%` }}
            onPointerDown={(event) => startDrag(event, item)}
          >
            <img src={src} alt={item.alt} draggable={false} />
            {editing ? (
              <div className="slide-user-image__tools" onPointerDown={(event) => event.stopPropagation()}>
                <Grip aria-hidden="true" />
                <span title={item.name}>{item.name}</span>
                <label>Size <input aria-label={`Resize ${item.name}`} type="range" min="12" max="80" value={placement.width} onChange={(event) => void updatePlacement(item, { ...placement, width: Number(event.target.value) })} /></label>
                <button type="button" onClick={() => void deleteSlideImage(item.id, slideId)} aria-label={`Delete ${item.name}`}><Trash2 aria-hidden="true" /></button>
              </div>
            ) : null}
          </figure>
        );
      })}
    </div>
  );
}
