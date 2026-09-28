/* Accessibility patches for markup the widget renders itself.
 *
 * 1. The layer switcher puts `aria-expanded` on a plain <div>, and selecting a
 *    place puts it on the list header, where the attribute is not allowed
 *    (axe: "aria-allowed-attr", critical). Neither element is a control: the
 *    layer switcher's state is on the header button's `aria-pressed`, and the
 *    list header is only collapsible when `showheaderCollapsible` is set,
 *    which it is not here. Both are removed. Reported to Septima.
 * 2. The selected place is rendered into `.detalje-host` and laid over the
 *    panel. An overlay has to take focus when it opens, close on Escape and
 *    hand focus back when it closes; the widget does none of that, since it
 *    does not know it is an overlay. */

(function () {
  "use strict";

  const host = document.querySelector(".detalje-host");

  let wasOpen = false;
  let returnTo = null;

  function isOpen() {
    const box = host && host.querySelector(".widget-info");

    return Boolean(box) && box.style.display !== "none";
  }

  function stripAriaExpanded() {
    document
      .querySelectorAll(".sw-layerswitch-body[aria-expanded], .widget-table-header[aria-expanded]")
      .forEach(function (element) {
        // A collapsible header is a real control and keeps its state.
        if (element.classList.contains("widget-table-collapsible")) {
          return;
        }

        element.removeAttribute("aria-expanded");
      });
  }

  function syncOverlayFocus() {
    const open = isOpen();

    if (open === wasOpen) {
      return;
    }
    wasOpen = open;

    if (open) {
      returnTo = document.activeElement;

      const heading = host.querySelector(".detalje__title");

      if (heading) {
        heading.setAttribute("tabindex", "-1");
        heading.focus();
      }

      return;
    }

    if (returnTo && document.contains(returnTo)) {
      returnTo.focus();
    }
    returnTo = null;
  }

  new MutationObserver(function () {
    stripAriaExpanded();
    syncOverlayFocus();
  }).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["aria-expanded", "style"],
  });

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape" || !isOpen()) {
      return;
    }

    const close = host.querySelector(".widget-hoverbox-closebutton");

    if (close) {
      close.click();
    }
  });

  stripAriaExpanded();
})();
