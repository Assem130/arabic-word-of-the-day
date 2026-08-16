(function () {
  "use strict";
  try {
    const saved = localStorage.getItem("kalimat.theme") || localStorage.getItem("kalimat_theme");
    if (["paper", "emerald", "midnight"].includes(saved)) {
      document.documentElement.setAttribute("data-theme", saved);
    }
  } catch {}
})();
