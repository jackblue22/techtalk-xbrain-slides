import type { ViewportProfile } from "./responsive";

export type ImagePlacement = { x: number; y: number; width: number };
export type SlideImage = {
  id: string;
  slideId: string;
  name: string;
  alt: string;
  blob: Blob;
  placements: Partial<Record<ViewportProfile, ImagePlacement>>;
  createdAt: number;
};

const DB_NAME = "xbrain-slide-assets";
const STORE_NAME = "images";
export const SLIDE_IMAGES_CHANGED = "xbrain-slide-images-changed";

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function runRequest<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const request = operation(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

export async function getSlideImages(slideId: string) {
  const images = await runRequest<SlideImage[]>("readonly", (store) => store.getAll());
  return images.filter((image) => image.slideId === slideId).sort((a, b) => a.createdAt - b.createdAt);
}

export async function saveSlideImage(image: SlideImage) {
  await runRequest<IDBValidKey>("readwrite", (store) => store.put(image));
  window.dispatchEvent(new CustomEvent(SLIDE_IMAGES_CHANGED, { detail: image.slideId }));
}

export async function deleteSlideImage(id: string, slideId: string) {
  await runRequest<undefined>("readwrite", (store) => store.delete(id));
  window.dispatchEvent(new CustomEvent(SLIDE_IMAGES_CHANGED, { detail: slideId }));
}
