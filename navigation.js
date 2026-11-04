document.querySelectorAll(".nav").forEach((nav) => {
  const toggle = nav.querySelector(".nav-toggle");
  const links = nav.querySelector(".nav-links");

  if (!toggle || !links) return;

  links.id = toggle.getAttribute("aria-controls");

  const closeMenu = () => {
    nav.classList.remove("is-menu-open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open navigation menu");
  };

  toggle.addEventListener("click", () => {
    const isOpen = toggle.getAttribute("aria-expanded") === "true";
    nav.classList.toggle("is-menu-open", !isOpen);
    toggle.setAttribute("aria-expanded", String(!isOpen));
    toggle.setAttribute(
      "aria-label",
      isOpen ? "Open navigation menu" : "Close navigation menu"
    );
  });

  links.addEventListener("click", (event) => {
    if (event.target.closest("a")) closeMenu();
  });

  document.addEventListener("click", (event) => {
    if (!nav.contains(event.target)) closeMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenu();
      toggle.focus();
    }
  });
});