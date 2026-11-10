type ScrollSurface = Pick<HTMLElement, "scrollTop" | "scrollHeight" | "clientHeight" | "addEventListener" | "removeEventListener">;
export interface MotionClock {
  now: () => number;
  request: (callback: FrameRequestCallback) => number;
  cancel: (id: number) => void;
}

export function readerPrefersReducedMotion(): boolean {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

/** Cancelable navigation scrolling. User input always takes control immediately. */
export function animateReaderScroll(surface: ScrollSurface, destination: () => number, options: {
  reducedMotion?: boolean;
  onFinish?: () => void;
  clock?: MotionClock;
} = {}): () => void {
  const target = () => Math.max(0, Math.min(destination(), Math.max(0, surface.scrollHeight - surface.clientHeight)));
  const start = surface.scrollTop;
  const distance = Math.abs(target() - start);
  if (options.reducedMotion || distance < 2) {
    surface.scrollTop = target();
    options.onFinish?.();
    return () => {};
  }
  const clock = options.clock ?? { now: () => performance.now(), request: (callback: FrameRequestCallback) => requestAnimationFrame(callback), cancel: (id: number) => cancelAnimationFrame(id) };
  const duration = Math.min(420, Math.max(240, distance * 0.18));
  const startedAt = clock.now();
  let frame = 0;
  let stopped = false;
  const events = ["wheel", "touchstart", "pointerdown", "keydown"];
  const removeListeners = () => events.forEach(event => surface.removeEventListener(event, cancel));
  function cancel() {
    stopped = true;
    clock.cancel(frame);
    removeListeners();
  }
  const step: FrameRequestCallback = time => {
    if (stopped) return;
    const progress = Math.min(1, Math.max(0, (time - startedAt) / duration));
    const eased = 1 - (1 - progress) ** 3;
    surface.scrollTop = start + (target() - start) * eased;
    if (progress < 1) frame = clock.request(step);
    else { stopped = true; removeListeners(); options.onFinish?.(); }
  };
  events.forEach(event => surface.addEventListener(event, cancel, { passive: true }));
  frame = clock.request(step);
  return cancel;
}
