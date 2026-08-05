(() => {
  const confirmationPath = "/api/internal/runtime-bootstrap/confirm";
  const deadline = Date.now() + 10_000;

  const pause = (milliseconds) =>
    new Promise((resolve) => window.setTimeout(resolve, milliseconds));

  const confirmCookieCommit = async () => {
    while (Date.now() < deadline) {
      try {
        const response = await window.fetch(confirmationPath, {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
          redirect: "error",
        });
        if (response.status === 204) {
          window.location.replace("/");
          return;
        }
      } catch {
        // WebView2 may still be committing Set-Cookie from the bootstrap page.
      }
      await pause(50);
    }

    document.title = "SahelFlow secure startup blocked";
    document.body.textContent =
      "SahelFlow could not confirm the secure desktop session.";
    document.documentElement.dataset.runtimeBootstrap = "confirmation-timeout";
  };

  void confirmCookieCommit();
})();
