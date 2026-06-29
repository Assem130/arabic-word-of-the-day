document.addEventListener("DOMContentLoaded", () => {
    if (!window.gsap || !window.ScrollTrigger || matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    gsap.registerPlugin(ScrollTrigger);

    gsap.from(".hero-copy > *", {
        opacity: 0,
        y: 36,
        duration: 1,
        stagger: 0.12,
        ease: "power3.out"
    });

    gsap.fromTo(".hero-art", { scale: 0.82, opacity: 0.25 }, {
        scale: 1,
        opacity: 1,
        ease: "none",
        scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true }
    });

    const manifesto = document.querySelector(".manifesto-text");
    const words = manifesto.textContent.trim().split(/\s+/);
    manifesto.textContent = "";
    words.forEach((word) => {
        const span = document.createElement("span");
        span.textContent = `${word} `;
        span.style.opacity = "0.1";
        manifesto.appendChild(span);
    });

    gsap.to(".manifesto-text span", {
        opacity: 1,
        stagger: 0.08,
        ease: "none",
        scrollTrigger: { trigger: ".manifesto", start: "top 70%", end: "bottom 65%", scrub: true }
    });

    gsap.utils.toArray(".learning-card").forEach((card, index) => {
        gsap.from(card, {
            y: 90 + index * 20,
            scale: 0.92,
            opacity: 0,
            ease: "none",
            scrollTrigger: { trigger: card, start: "top 92%", end: "top 58%", scrub: true }
        });
    });
});
