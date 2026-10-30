import { generateDeviceKeys, type GenerateDeviceKeysResult } from "../../../../src/lib/connected-platform/web";
import type { KeygenRunner, PairStep } from "./flow";

// RSA-3072 can take seconds on a cheap phone: run it in a Worker when there is one.
declare const __KEYGEN_WORKER_URL__: string;
type WorkerMessage = Readonly<{ type: "step"; step: PairStep } | { type: "done"; result: GenerateDeviceKeysResult }>;

export function createInlineKeygen(): KeygenRunner {
  return { async run(onStep) { onStep("signing"); onStep("encryption"); return generateDeviceKeys(); } };
}
export function createKeygen(): KeygenRunner {
  if (typeof Worker === "undefined") return createInlineKeygen();
  return {
    run(onStep) {
      return new Promise((resolve) => {
        let worker: Worker;
        try { worker = new Worker(__KEYGEN_WORKER_URL__); } catch { resolve(createInlineKeygen().run(onStep)); return; }
        worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
          if (event.data.type === "step") onStep(event.data.step);
          else { worker.terminate(); resolve(event.data.result); }
        };
        worker.onerror = () => { worker.terminate(); resolve({ ok: false, reason: "keygen_failed" }); };
        worker.postMessage({ type: "start" });
      });
    },
  };
}
