import { generateDeviceKeys } from "../../../../src/lib/connected-platform/web";

const scope = self as unknown as { postMessage(message: unknown): void; onmessage: ((event: unknown) => void) | null };
scope.onmessage = () => {
  scope.postMessage({ type: "step", step: "signing" });
  scope.postMessage({ type: "step", step: "encryption" });
  void generateDeviceKeys().then((result) => scope.postMessage({ type: "done", result }));
};
