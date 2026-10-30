// Runs before first paint (external file: the page allows no inline script).
try {
  const root = document.documentElement;
  const lang = localStorage.getItem("sf.locale");
  const l = lang === "fr" || lang === "en" ? lang : "ar";
  root.lang = l; root.dir = l === "ar" ? "rtl" : "ltr";
  const theme = localStorage.getItem("sf.theme");
  root.dataset.theme = theme === "light" || theme === "dark" ? theme : matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
} catch { /* private mode: keep the defaults */ }
