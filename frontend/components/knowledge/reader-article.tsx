import { useRef, useState, type ReactNode } from "react";
import { ImageViewer, ImageViewerContent, type LightboxImage } from "../motion/morphing-lightbox";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";

/**
 * The reader's article body plus the beUI image viewer.
 *
 * The article itself is sanitized HTML (`renderSafeMarkdown`), so an image cannot be a React
 * component; instead the renderer marks every admitted image `reader-image` with
 * `role="button"`, `tabindex="0"` and `aria-haspopup="dialog"`, and this wrapper turns a
 * click, Enter or Space on one into an open viewer. The viewer is built from the images the
 * article actually rendered (`naturalWidth`/`naturalHeight` preserve each aspect ratio), so
 * paging, zoom, swipe and the focus-trapped portal are the payload's, and the shared-layout
 * frame morphs within itself because the article has no React thumbnail to morph from.
 */
export function ReaderArticle({ locale, markdown, renderMarkdown }: {
  locale?: LocaleRuntime;
  markdown: string;
  renderMarkdown: (markdown: string) => ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [gallery, setGallery] = useState<LightboxImage[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const labels = {
    gallery: frontendText(locale, "KNOWLEDGE_IMAGE_VIEWER"),
    openImage: frontendText(locale, "KNOWLEDGE_IMAGE_OPEN"),
    close: frontendText(locale, "KNOWLEDGE_IMAGE_CLOSE"),
    previous: frontendText(locale, "KNOWLEDGE_IMAGE_PREVIOUS"),
    next: frontendText(locale, "KNOWLEDGE_IMAGE_NEXT"),
    zoomIn: frontendText(locale, "KNOWLEDGE_IMAGE_ZOOM_IN"),
    zoomOut: frontendText(locale, "KNOWLEDGE_IMAGE_ZOOM_OUT"),
    panHelp: frontendText(locale, "KNOWLEDGE_IMAGE_PAN_HELP"),
    loadFailed: frontendText(locale, "KNOWLEDGE_IMAGE_LOAD_FAILED"),
  };
  const open = (image: HTMLImageElement) => {
    const nodes = Array.from(host.current?.querySelectorAll<HTMLImageElement>(".markdown-content img.reader-image") ?? []);
    const images = nodes.map((node, index) => {
      const src = node.currentSrc || node.getAttribute("src") || "";
      return {
        id: `${index}:${src}`,
        src,
        alt: node.getAttribute("alt") ?? "",
        width: node.naturalWidth > 0 ? node.naturalWidth : 1200,
        height: node.naturalHeight > 0 ? node.naturalHeight : 800,
      };
    }).filter((entry) => entry.src.length > 0);
    setGallery(images);
    setActive(images[nodes.indexOf(image)]?.id ?? null);
  };
  const imageFrom = (target: EventTarget | null) => target instanceof Element ? target.closest("img.reader-image") : null;
  return <ImageViewer images={gallery} labels={labels} value={active} onValueChange={setActive}>
    <div
      ref={host}
      className="prose prose-slate max-w-none text-sm leading-7"
      onClick={(event) => {
        const image = imageFrom(event.target);
        if (image instanceof HTMLImageElement) open(image);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        const image = imageFrom(event.target);
        if (!(image instanceof HTMLImageElement)) return;
        event.preventDefault();
        open(image);
      }}
    >
      {renderMarkdown(markdown)}
    </div>
    <ImageViewerContent />
  </ImageViewer>;
}
