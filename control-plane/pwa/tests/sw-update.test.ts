import { describe, expect, it } from "vitest";
import { createUpdateController, type ContainerLike, type RegistrationLike, type WorkerLike } from "../src/sw/update";

class FakeWorker implements WorkerLike {
  state = "installing";
  posted: unknown[] = [];
  private ls: Array<() => void> = [];
  postMessage(m: unknown): void { this.posted.push(m); }
  addEventListener(_t: "statechange", l: () => void): void { this.ls.push(l); }
  go(state: string): void { this.state = state; for (const l of this.ls) l(); }
}
class FakeReg implements RegistrationLike {
  waiting: WorkerLike | null = null;
  installing: WorkerLike | null = null;
  active: WorkerLike | null = null;
  private ls: Array<() => void> = [];
  addEventListener(_t: "updatefound", l: () => void): void { this.ls.push(l); }
  found(w: FakeWorker): void { this.installing = w; for (const l of this.ls) l(); }
}
class FakeContainer implements ContainerLike {
  controller: unknown = {};
  private ls: Array<() => void> = [];
  addEventListener(_t: "controllerchange", l: () => void): void { this.ls.push(l); }
  change(): void { for (const l of this.ls) l(); }
}
const setup = () => {
  const reg = new FakeReg(); const c = new FakeContainer(); let reloads = 0;
  const ctl = createUpdateController(reg, c, () => { reloads += 1; });
  const seen: string[] = []; ctl.subscribe((s) => seen.push(s));
  return { reg, c, ctl, seen, reloads: () => reloads };
};

describe("update flow", () => {
  it("starts idle and never skips waiting on its own", () => {
    const { reg, ctl } = setup(); const w = new FakeWorker();
    reg.found(w); w.go("installed");
    expect(ctl.state()).toBe("waiting");
    expect(w.posted).toEqual([]);
  });
  it("a first install (no controller) is not an update", () => {
    const { reg, c, ctl } = setup(); c.controller = null; const w = new FakeWorker();
    reg.found(w); w.go("installed");
    expect(ctl.state()).toBe("idle");
  });
  it("an already waiting worker is seen at start", () => {
    const reg = new FakeReg(); reg.waiting = new FakeWorker();
    const ctl = createUpdateController(reg, new FakeContainer(), () => undefined);
    expect(ctl.state()).toBe("waiting");
  });
  it("apply posts SKIP_WAITING once and reloads once after controllerchange", () => {
    const { reg, c, ctl, seen, reloads } = setup(); const w = new FakeWorker();
    reg.found(w); w.go("installed"); reg.waiting = w;
    ctl.apply(); ctl.apply();
    expect(w.posted).toEqual([{ type: "SKIP_WAITING" }]);
    expect(ctl.state()).toBe("applying");
    c.change(); c.change();
    expect(reloads()).toBe(1);
    expect(seen).toEqual(["waiting", "applying"]);
  });
  it("apply with nothing waiting does nothing", () => {
    const { ctl } = setup(); ctl.apply();
    expect(ctl.state()).toBe("idle");
  });
  it("controllerchange without a tap on Update never reloads", () => {
    const { c, reloads } = setup(); c.change();
    expect(reloads()).toBe(0);
  });
});
