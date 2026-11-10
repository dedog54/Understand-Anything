import { describe, expect, it } from "vitest";
import { animateReaderScroll, type MotionClock } from "../readerMotion";

class Surface extends EventTarget {
  scrollTop = 0;
  scrollHeight = 3000;
  clientHeight = 500;
}
function clock() {
  let now = 0, id = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const scheduler: MotionClock = { now: () => now, request: callback => { frames.set(++id, callback); return id; }, cancel: frame => { frames.delete(frame); } };
  return { scheduler, tick(ms: number) { now += ms; const work = [...frames.values()]; frames.clear(); work.forEach(callback => callback(now)); }, pending: () => frames.size };
}

describe("reader navigation motion", () => {
  it("eases toward the destination and lands precisely", () => {
    const surface = new Surface(), time = clock(); let finished = false;
    animateReaderScroll(surface, () => 1000, { clock: time.scheduler, onFinish: () => { finished = true; } });
    expect(surface.scrollTop).toBe(0);
    time.tick(90);
    expect(surface.scrollTop).toBeGreaterThan(0); expect(surface.scrollTop).toBeLessThan(1000);
    time.tick(300);
    expect(surface.scrollTop).toBe(1000); expect(finished).toBe(true); expect(time.pending()).toBe(0);
  });
  it.each(["wheel", "pointerdown", "touchstart", "keydown"])("stops immediately on user %s", event => {
    const surface = new Surface(), time = clock(); let finished = false;
    animateReaderScroll(surface, () => 1500, { clock: time.scheduler, onFinish: () => { finished = true; } });
    time.tick(80); const stoppedAt = surface.scrollTop;
    surface.dispatchEvent(new Event(event)); time.tick(500);
    expect(surface.scrollTop).toBe(stoppedAt); expect(finished).toBe(false); expect(time.pending()).toBe(0);
  });
  it("cancels an obsolete jump before the next jump starts", () => {
    const surface = new Surface(), time = clock();
    const stop = animateReaderScroll(surface, () => 1200, { clock: time.scheduler });
    time.tick(70); stop();
    animateReaderScroll(surface, () => 400, { clock: time.scheduler }); time.tick(400);
    expect(surface.scrollTop).toBe(400); expect(time.pending()).toBe(0);
  });
  it("respects reduced motion and clamps to document bounds", () => {
    const surface = new Surface(), time = clock();
    animateReaderScroll(surface, () => 5000, { reducedMotion: true, clock: time.scheduler });
    expect(surface.scrollTop).toBe(2500); expect(time.pending()).toBe(0);
  });
  it("tracks updated line geometry while scrolling", () => {
    const surface = new Surface(), time = clock(); let destination = 900;
    animateReaderScroll(surface, () => destination, { clock: time.scheduler }); time.tick(80);
    destination = 1100; time.tick(400);
    expect(surface.scrollTop).toBe(1100);
  });
});
