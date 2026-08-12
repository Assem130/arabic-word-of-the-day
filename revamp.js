document.addEventListener("DOMContentLoaded", () => {
    if (matchMedia("(hover: none)").matches) {
        document.querySelectorAll(".horizontal-accordion details").forEach(panel => { panel.open = true; });
    }
    if (!window.gsap || !window.ScrollTrigger || matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    gsap.registerPlugin(ScrollTrigger);
    gsap.from(".hero-copy > *", { opacity: 0, y: 28, duration: .8, stagger: .1, ease: "power3.out" });
    gsap.fromTo(".hero-glyph", { scale: .9 }, {
        scale: 1.04,
        ease: "none",
        scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true }
    });
});
