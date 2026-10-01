// Progressive enhancement only: every page is complete without this script.
(function () {
  var header = document.querySelector("[data-header]");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Header glass once the page scrolls.
  function onScroll() {
    if (header) header.classList.toggle("scrolled", window.scrollY > 8);
    var tilt = document.querySelector(".hero-shot");
    if (tilt && !reduce && window.innerWidth > 720) {
      var progress = Math.min(1, window.scrollY / 520);
      tilt.style.transform = "rotateX(" + (14 - 14 * progress).toFixed(2) + "deg) scale(" + (0.96 + 0.04 * progress).toFixed(3) + ")";
    }
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Mobile menu.
  var toggle = document.querySelector("[data-nav-toggle]");
  if (toggle && header) {
    toggle.addEventListener("click", function () {
      var open = header.classList.toggle("menu-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    header.querySelectorAll("[data-nav] a").forEach(function (a) {
      a.addEventListener("click", function () {
        header.classList.remove("menu-open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  // Close the language menu on outside click / Escape.
  var lang = document.querySelector(".lang-menu");
  if (lang) {
    document.addEventListener("click", function (e) { if (!lang.contains(e.target)) lang.removeAttribute("open"); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") lang.removeAttribute("open"); });
  }

  // Remember an explicit language choice for the root redirect.
  document.querySelectorAll("[data-set-lang]").forEach(function (a) {
    a.addEventListener("click", function () {
      try { localStorage.setItem("sf-lang", a.getAttribute("data-set-lang")); } catch (e) { /* private mode */ }
    });
  });

  // Reveal sections as they enter the viewport.
  var items = document.querySelectorAll(".reveal");
  if (reduce || !("IntersectionObserver" in window)) {
    items.forEach(function (el) { el.classList.add("in"); });
    return;
  }
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add("in");
        observer.unobserve(entry.target);
      }
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
  items.forEach(function (el) { observer.observe(el); });
})();
