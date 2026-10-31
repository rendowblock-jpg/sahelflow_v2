import { startApp } from "./app/app";
import { createUpdateController } from "./sw/update";

const root = document.getElementById("app");
if (root) {
  const app = startApp(root);
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then((reg) => {
        app.attachUpdates(createUpdateController(reg, navigator.serviceWorker, () => location.reload()));
      }).catch(() => undefined);
    });
  }
}
