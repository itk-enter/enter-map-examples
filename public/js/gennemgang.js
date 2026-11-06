/* Review page: a case worker approves or rejects each part of a citizen
 * contribution. Stands in for the municipality's case-handling system, so it
 * reads and writes the same browser store as the map page (contributions.js).
 *
 * The queue is re-rendered on every store change, also from other tabs. The
 * open contribution is only re-rendered when it changed itself, so a new
 * contribution arriving does not take focus or typed text away from the
 * reviewer. Undecided choices are also kept in `drafts`, so they survive the
 * times the open contribution does have to be re-rendered. */

(function () {
  "use strict";

  const C = window.CONTRIBUTIONS;
  const esc = C.escapeHtml;
  const REVIEWER = "Sagsbehandler (demo)";

  const queue = document.getElementById("koe");
  const detail = document.getElementById("detalje");
  const statusLine = document.getElementById("status");
  const resetButton = document.getElementById("nulstil");
  const resetDialog = document.getElementById("nulstil-dialog");
  const stacked = window.matchMedia("(max-width: 820px)");

  let records = [];
  let view = "pending";
  let selectedId = null;
  /* Signature of what the open contribution was rendered from; undefined
   * until the first render, so that one always happens. */
  let renderedSignature;
  /* Object URLs of the photos on screen, revoked when they are replaced. */
  let photoUrls = [];
  /* recordId -> itemKey -> { status, reason }: the reviewer's choices before
   * they are saved. */
  const drafts = {};
  /* Whether the reviewer has tried to save the open contribution; from then on
   * each item's error follows its input instead of waiting for the next save. */
  let attempted = false;

  const ICONS = {
    map: '<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15"/><path d="M9 3.236v15"/>',
    alert: '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  };

  function icon(name) {
    return (
      '<svg class="icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      ICONS[name] +
      "</svg>"
    );
  }

  /* Keeps the parts of a queue entry apart when a screen reader reads the
   * button as one name. */
  const SEP = '<span class="visually-hidden">. </span>';

  function plural(count, one, many) {
    return count + " " + (count === 1 ? one : many);
  }

  function statusBadge(status) {
    return '<span class="status status--' + status + '">' + esc(C.STATUSES[status]) + "</span>";
  }

  function decisionBadge(review) {
    return review.status === "approved"
      ? '<span class="status status--approved">Godkendt</span>'
      : '<span class="status status--rejected">Afvist</span>';
  }

  function loginBadge(contributor) {
    return (
      '<span class="login-badge login-badge--' + esc(contributor.assurance) + '">' +
      esc(C.AUTH_METHODS[contributor.authMethod] || contributor.authMethod) +
      ' <span aria-hidden="true">·</span> ' +
      esc(C.ASSURANCES[contributor.assurance] || contributor.assurance) +
      "</span>"
    );
  }

  function personLine(contributor) {
    const shown = contributor.showName ? "„" + C.publicName(contributor) + "”" : C.publicName(contributor);

    return esc(contributor.name) + ' <span class="muted">(vises som ' + esc(shown) + ")</span>";
  }

  /* A field the model does not know is still shown, as plain text under its
   * attribute name, rather than dropped from the review. */
  function fieldOf(record, attribute) {
    return C.field(record.entityType, attribute) || { attribute: attribute, label: attribute, type: "text" };
  }

  /* The record's reviewable items, each with a stable key for drafts and form
   * names and a title the reviewer can refer to. Same order as C.items(). */
  function entries(record) {
    const list = [];

    record.changes.forEach(function (change, index) {
      list.push({ key: "change-" + index, type: "change", item: change, title: fieldOf(record, change.attribute).label });
    });
    if (record.closure) {
      list.push({ key: "closure", type: "closure", item: record.closure, title: "Lukning" });
    }
    if (record.message) {
      list.push({ key: "message", type: "message", item: record.message, title: "Besked" });
    }
    record.photos.forEach(function (photo, index) {
      list.push({
        key: "photo-" + photo.id,
        type: "photo",
        item: photo,
        title: record.photos.length > 1 ? "Foto " + (index + 1) + " af " + record.photos.length : "Foto",
      });
    });
    if (record.rating) {
      list.push({ key: "rating", type: "rating", item: record.rating, title: "Vurdering" });
    }
    if (record.comment) {
      list.push({ key: "comment", type: "comment", item: record.comment, title: "Kommentar til vurderingen" });
    }

    return list;
  }

  function isDone(record) {
    return C.status(record) !== "pending";
  }

  function selected() {
    return (
      records.find(function (record) {
        return record.id === selectedId;
      }) || null
    );
  }

  /* What the open contribution looks like, without the photo bytes. */
  function signature(record) {
    return record
      ? JSON.stringify(record, function (key, value) {
          return value instanceof Blob ? value.size : value;
        })
      : null;
  }

  /* Queue ------------------------------------------------------------------ */

  function renderCounts() {
    const done = records.filter(isDone).length;

    document.querySelector('[data-count="pending"]').textContent = String(records.length - done);
    document.querySelector('[data-count="done"]').textContent = String(done);
  }

  function renderQueue() {
    const shown = records.filter(function (record) {
      return view === "done" ? isDone(record) : !isDone(record);
    });
    const focusedId = queue.contains(document.activeElement) ? document.activeElement.dataset.id : null;

    renderCounts();

    if (!shown.length) {
      queue.innerHTML =
        '<p class="review-empty">' +
        (view === "done"
          ? "Der er ingen behandlede bidrag endnu. Når du gemmer en afgørelse, flytter bidraget hertil."
          : records.length
            ? "Der er ikke flere bidrag, der venter på en afgørelse. Nye bidrag fra kortet kommer frem her af sig selv."
            : 'Der er ingen bidrag endnu. Indsend et på <a href="./bidrag.html">kortet med bidrag</a>, så kommer det frem her af sig selv.') +
        "</p>";
      return;
    }

    queue.innerHTML =
      '<ul class="review-queue__entries">' +
      shown
        .map(function (record) {
          return (
            "<li>" +
            '<button type="button" class="queue-entry" data-id="' + esc(record.id) + '" aria-pressed="' +
            (record.id === selectedId) + '">' +
            '<span class="queue-entry__top">' +
            '<span class="queue-entry__title">' + esc(record.place.title) + "</span>" + SEP +
            statusBadge(C.status(record)) +
            "</span>" + SEP +
            '<span class="queue-entry__kind">' + esc(C.summary(record)) + "</span>" + SEP +
            '<span class="queue-entry__person">' + personLine(record.contributor) + "</span>" + SEP +
            '<span class="queue-entry__meta">' + loginBadge(record.contributor) + SEP +
            '<time datetime="' + esc(record.createdAt) + '">' + esc(C.formatDateTime(record.createdAt)) + "</time>" +
            "</span>" +
            "</button>" +
            "</li>"
          );
        })
        .join("") +
      "</ul>";

    /* The list is rebuilt from scratch; put keyboard focus back where it was. */
    if (focusedId) {
      const button = queue.querySelector('[data-id="' + CSS.escape(focusedId) + '"]');

      if (button) {
        button.focus();
      }
    }
  }

  /* Detail ----------------------------------------------------------------- */

  function releasePhotos() {
    photoUrls.forEach(function (url) {
      URL.revokeObjectURL(url);
    });
    photoUrls = [];
  }

  function contributorBox(record) {
    const person = record.contributor;
    const own = records.filter(function (candidate) {
      return candidate.contributor.subject === person.subject;
    });
    const approved = own.filter(function (candidate) {
      return C.status(candidate) === "approved";
    }).length;
    const partial = own.filter(function (candidate) {
      return C.status(candidate) === "partial";
    }).length;
    const rejected = own.filter(function (candidate) {
      return C.status(candidate) === "rejected";
    }).length;

    return (
      '<section class="review-box" aria-labelledby="indsender-titel">' +
      '<h3 id="indsender-titel" class="review-box__title">Indsender</h3>' +
      '<dl class="facts">' +
      "<dt>Navn fra login</dt><dd>" + esc(person.name) + "</dd>" +
      "<dt>Vises offentligt som</dt><dd>" + esc(C.publicName(person)) +
      ' <span class="muted">' +
      (person.showName ? "(har sagt ja til at vise navnet)" : "(har ikke sagt ja til at vise navnet)") +
      "</span></dd>" +
      "<dt>Login</dt><dd>" + loginBadge(person) +
      '<span class="facts__hint">Betydeligt sikringsniveau (NSIS): identiteten er bekræftet med MitID.</span>' +
      "</dd>" +
      '<dt>Pseudonym</dt><dd><code class="subject">' + esc(person.subject) + "</code></dd>" +
      "<dt>Bidrag fra samme person</dt><dd>" + plural(own.length, "bidrag", "bidrag") + " i alt: " +
      approved + " godkendt, " + partial + " delvist godkendt, " + rejected + " ikke godkendt, " +
      (own.length - approved - partial - rejected) + " afventer</dd>" +
      "</dl>" +
      "</section>"
    );
  }

  function itemContent(record, entry) {
    const item = entry.item;

    switch (entry.type) {
      case "change": {
        const field = fieldOf(record, item.attribute);
        const current = C.format(field, item.previous);

        return (
          '<dl class="change">' +
          "<dt>Nu</dt><dd>" + (current ? esc(current) : '<span class="muted">Ikke registreret</span>') + "</dd>" +
          "<dt>Foreslået</dt><dd>" +
          (item.incorrect
            ? '<span class="change__incorrect">Markeret som forkert, uden ny værdi</span>'
            : '<strong class="change__value">' + esc(C.format(field, item.value)) + "</strong>") +
          "</dd>" +
          "</dl>"
        );
      }
      case "closure":
        return '<p class="item__text"><strong>' + esc(C.CLOSURES[item.value] || item.value) + "</strong></p>";
      case "message":
        return '<p class="item__text item__text--message">' + esc(item.text) + "</p>";
      case "rating":
        return (
          '<p class="item__text"><strong>' + esc(C.stars(item.stars)) + "</strong> af 5. " +
          '<span class="muted">Afvis kun en vurdering, der er misbrug, fx gentaget fra mange konti.</span></p>'
        );
      case "comment":
        return (
          '<p class="item__text item__text--message">' + esc(item.text) + "</p>" +
          '<p class="photo__rules">Retningslinjerne: om stedet og dets tilgængelighed, ingen navne på eller oplysninger om andre, ' +
          "intet krænkende, ingen reklame eller links, og ingen personlige sager. Afvis kommentaren, hvis den ikke overholder dem; " +
          "stjernerne kan godt godkendes alligevel.</p>"
        );
      case "photo": {
        const url = URL.createObjectURL(item.blob);

        photoUrls.push(url);
        return (
          '<figure class="photo">' +
          '<a class="photo__frame" href="' + url + '" target="_blank" rel="noopener">' +
          '<img src="' + url + '" alt="' + esc(entry.title + " af " + record.place.title + ", indsendt af borger") +
          '"' + (item.width ? ' width="' + Number(item.width) + '" height="' + Number(item.height) + '"' : "") + " />" +
          "</a>" +
          '<figcaption class="photo__rules">' +
          "Fotoreglerne: kun stedet selv, ingen ansigter eller personer, ingen nummerplader og intet privat. " +
          "Afvis fotoet, hvis det ikke overholder dem. " +
          '<a href="' + url + '" target="_blank" rel="noopener">Åbn i fuld størrelse' + icon("external") +
          '<span class="visually-hidden"> (åbner i en ny fane)</span></a>' +
          "</figcaption>" +
          "</figure>"
        );
      }
      default:
        return "";
    }
  }

  function decisionForm(entry, draft) {
    const id = "punkt-" + entry.key;
    const rejected = draft.status === "rejected";

    return (
      '<fieldset class="decision" id="' + id + '-valg" aria-describedby="' + id + '-fejl">' +
      '<legend class="decision__legend">Afgørelse for ' + esc(entry.title) + "</legend>" +
      '<div class="decision__options">' +
      ["approved", "rejected"]
        .map(function (value) {
          return (
            '<label class="decision__option decision__option--' + value + '">' +
            '<input type="radio" name="' + id + '" value="' + value + '" data-key="' + esc(entry.key) + '"' +
            (draft.status === value ? " checked" : "") + " />" +
            (value === "approved" ? "Godkend" : "Afvis") +
            "</label>"
          );
        })
        .join("") +
      "</div>" +
      '<div class="decision__reason"' + (rejected ? "" : " hidden") + ">" +
      '<label class="decision__label" for="' + id + '-begrundelse">Begrundelse til borgeren</label>' +
      '<p class="decision__hint" id="' + id + '-hjaelp">Skal udfyldes. Borgeren ser den, når bidraget er behandlet.</p>' +
      '<textarea id="' + id + '-begrundelse" rows="3" data-key="' + esc(entry.key) + '" aria-required="true" ' +
      'aria-describedby="' + id + '-hjaelp ' + id + '-fejl">' + esc(draft.reason || "") + "</textarea>" +
      "</div>" +
      '<p class="field-error" id="' + id + '-fejl" hidden></p>' +
      "</fieldset>"
    );
  }

  function decisionRecord(review) {
    return (
      '<dl class="decision-record">' +
      "<dt>Afgørelse</dt><dd>" + decisionBadge(review) + "</dd>" +
      (review.status === "rejected"
        ? "<dt>Begrundelse til borgeren</dt><dd>" + (review.reason ? esc(review.reason) : '<span class="muted">Ingen</span>') + "</dd>"
        : "") +
      "<dt>Afgjort af</dt><dd>" + esc(review.by || "Ukendt") + "</dd>" +
      '<dt>Tidspunkt</dt><dd><time datetime="' + esc(review.at) + '">' + esc(C.formatDateTime(review.at)) + "</time></dd>" +
      "</dl>"
    );
  }

  function renderDetail() {
    const record = selected();

    releasePhotos();
    attempted = false;
    renderedSignature = signature(record);

    if (!record) {
      detail.innerHTML =
        '<div class="review-empty review-empty--detail"><p>' +
        (records.length
          ? "Vælg et bidrag i listen for at se det og træffe en afgørelse."
          : 'Der er ingen bidrag at gennemgå. Indsend et på <a href="./bidrag.html">kortet med bidrag</a>.') +
        "</p></div>";
      return;
    }

    const status = C.status(record);
    const draft = drafts[record.id] || {};
    const list = entries(record);
    const open = list.filter(function (entry) {
      return !entry.item.review;
    });

    detail.innerHTML =
      '<article class="contribution">' +
      '<header class="contribution__header">' +
      '<h2 class="contribution__title" id="bidrag-titel" tabindex="-1">' + esc(record.place.title) + "</h2>" +
      (record.place.address ? '<p class="contribution__address">' + esc(record.place.address) + "</p>" : "") +
      '<p class="contribution__meta">' +
      statusBadge(status) +
      '<span class="contribution__kind">' + esc(C.summary(record)) + "</span>" +
      '<span class="muted">Indsendt <time datetime="' + esc(record.createdAt) + '">' +
      esc(C.formatDateTime(record.createdAt)) + "</time></span>" +
      "</p>" +
      '<p class="contribution__map"><a href="./bidrag.html#sted=' + encodeURIComponent(record.entityId) + '">' +
      icon("map") + "Vis på kortet</a></p>" +
      "</header>" +
      contributorBox(record) +
      (record.note
        ? '<section class="review-box" aria-labelledby="note-titel">' +
          '<h3 id="note-titel" class="review-box__title">Hvordan ved du det?</h3>' +
          '<p class="item__text item__text--message">' + esc(record.note) + "</p>" +
          "</section>"
        : "") +
      '<form class="decisions" novalidate>' +
      '<h3 class="decisions__title">' + (open.length ? "Det skal afgøres" : "Afgørelser") + "</h3>" +
      (open.length
        ? '<p class="decisions__intro">Godkend eller afvis hvert punkt for sig. Kun det godkendte kommer på kortet.</p>'
        : "") +
      '<ol class="items">' +
      list
        .map(function (entry) {
          return (
            '<li class="item' + (entry.item.review ? " item--decided" : "") + '">' +
            '<h4 class="item__title">' + esc(entry.title) +
            (entry.type === "change" ? ' <span class="item__type">Oplysning</span>' : "") +
            "</h4>" +
            itemContent(record, entry) +
            (entry.item.review ? decisionRecord(entry.item.review) : decisionForm(entry, draft[entry.key] || {})) +
            "</li>"
          );
        })
        .join("") +
      "</ol>" +
      (open.length
        ? '<div class="decisions__actions">' +
          '<button type="submit" class="button button--primary">Gem afgørelse</button>' +
          '<p class="decisions__summary" id="opsummering" hidden>' + icon("alert") + "<span></span></p>" +
          "</div>"
        : "") +
      "</form>" +
      "</article>";
  }

  /* Drafts and validation ---------------------------------------------------- */

  function draftFor(key) {
    drafts[selectedId] = drafts[selectedId] || {};
    drafts[selectedId][key] = drafts[selectedId][key] || { status: null, reason: "" };

    return drafts[selectedId][key];
  }

  /* The problem with one item, or "" when it is ready to save. */
  function problem(draft) {
    if (!draft || !draft.status) {
      return "Vælg Godkend eller Afvis.";
    }
    if (draft.status === "rejected" && !draft.reason.trim()) {
      return "Skriv en begrundelse til borgeren.";
    }

    return "";
  }

  /* Shows the item's problem next to it, or clears it; the reason field is
   * marked invalid only when it is the reason that is missing. */
  function showProblem(key, draft) {
    const id = "punkt-" + key;
    const error = document.getElementById(id + "-fejl");
    const textarea = document.getElementById(id + "-begrundelse");
    const message = problem(draft);

    if (!error) {
      return;
    }
    error.hidden = !message;
    error.innerHTML = message ? icon("alert") + "<span>" + esc(message) + "</span>" : "";
    error.closest(".item").classList.toggle("item--invalid", Boolean(message));
    textarea.setAttribute("aria-invalid", String(Boolean(message) && Boolean(draft) && draft.status === "rejected"));
  }

  function openEntries(record) {
    return entries(record).filter(function (entry) {
      return !entry.item.review;
    });
  }

  /* After the first save attempt the summary follows what is left. */
  function updateSummary(record) {
    const summary = document.getElementById("opsummering");
    const left = openEntries(record).filter(function (entry) {
      return problem((drafts[record.id] || {})[entry.key]);
    }).length;

    if (!summary) {
      return left;
    }
    summary.hidden = !left;
    summary.querySelector("span").textContent = left
      ? (left === 1 ? "1 punkt mangler" : left + " punkter mangler") + " en afgørelse eller en begrundelse."
      : "";

    return left;
  }

  function onDecisionInput(event) {
    const target = event.target;
    const key = target.dataset.key;
    const record = selected();

    if (!key || !record) {
      return;
    }

    const draft = draftFor(key);

    if (target.type === "radio") {
      draft.status = target.value;

      const reason = target.closest(".decision").querySelector(".decision__reason");

      reason.hidden = draft.status !== "rejected";
    } else {
      draft.reason = target.value;
    }

    if (attempted) {
      showProblem(key, draft);
      updateSummary(record);
    }
  }

  function onSubmit(event) {
    event.preventDefault();

    const record = selected();

    if (!record) {
      return;
    }

    const open = openEntries(record);
    let first = null;

    attempted = true;
    statusLine.textContent = "";
    open.forEach(function (entry) {
      const message = problem((drafts[record.id] || {})[entry.key]);

      showProblem(entry.key, (drafts[record.id] || {})[entry.key]);
      if (message && !first) {
        first = { entry: entry, message: message };
      }
    });
    updateSummary(record);

    if (first) {
      const id = "punkt-" + first.entry.key;
      const draft = (drafts[record.id] || {})[first.entry.key];

      (draft && draft.status === "rejected"
        ? document.getElementById(id + "-begrundelse")
        : document.querySelector('input[name="' + id + '"]')
      ).focus();
      return;
    }

    const at = new Date().toISOString();
    const button = event.target.querySelector('button[type="submit"]');

    open.forEach(function (entry) {
      const draft = drafts[record.id][entry.key];

      entry.item.review = {
        status: draft.status,
        reason: draft.status === "rejected" ? draft.reason.trim() : "",
        by: REVIEWER,
        at: at,
      };
    });

    button.disabled = true;
    C.save(record)
      .then(function () {
        delete drafts[record.id];
        view = "done";
        document.querySelector('input[name="visning"][value="done"]').checked = true;
        /* The store's change event re-renders; the success text goes in after,
         * so it is not cleared by it. */
        return refresh().then(function () {
          statusLine.innerHTML =
            icon("check") +
            "<span>Afgørelsen er gemt: " + esc(C.STATUSES[C.status(record)].toLowerCase()) +
            ". Bidraget ligger nu under Behandlede.</span>";
          statusLine.dataset.tone = "success";
          document.getElementById("bidrag-titel").focus();
        });
      })
      .catch(function (error) {
        /* Nothing was stored; take the decisions back off the record so a new
         * attempt starts from the reviewer's choices, which are still on screen. */
        open.forEach(function (entry) {
          entry.item.review = null;
        });
        button.disabled = false;

        const summary = document.getElementById("opsummering");

        summary.hidden = false;
        summary.querySelector("span").textContent =
          "Afgørelsen kunne ikke gemmes (" + (error && error.message ? error.message : "ukendt fejl") + "). Prøv igen.";
      });
  }

  /* Loading ---------------------------------------------------------------- */

  function refresh() {
    return C.list()
      .then(function (list) {
        records = list;
        if (selectedId && !selected()) {
          selectedId = null;
        }
        renderQueue();
        if (signature(selected()) !== renderedSignature) {
          renderDetail();
        }
      })
      .catch(function (error) {
        queue.innerHTML =
          '<p class="review-empty review-empty--error">Bidragene kunne ikke hentes fra browserens lager (' +
          esc(error && error.message ? error.message : "ukendt fejl") +
          "). Prøv at genindlæse siden.</p>";
      });
  }

  function select(id) {
    if (id === selectedId) {
      return;
    }
    selectedId = id;
    statusLine.textContent = "";
    delete statusLine.dataset.tone;
    queue.querySelectorAll(".queue-entry").forEach(function (button) {
      button.setAttribute("aria-pressed", String(button.dataset.id === id));
    });
    renderDetail();

    /* Stacked, the contribution opens below the list, out of sight. */
    if (stacked.matches) {
      document.getElementById("bidrag-titel").focus();
    }
  }

  queue.addEventListener("click", function (event) {
    const button = event.target.closest(".queue-entry");

    if (button) {
      select(button.dataset.id);
    }
  });

  document.querySelectorAll('input[name="visning"]').forEach(function (radio) {
    radio.addEventListener("change", function () {
      view = radio.value;
      renderQueue();
    });
  });

  detail.addEventListener("change", onDecisionInput);
  detail.addEventListener("input", onDecisionInput);
  detail.addEventListener("submit", onSubmit);

  /* Reset ------------------------------------------------------------------ */

  resetButton.addEventListener("click", function () {
    resetDialog.returnValue = "";
    resetDialog.showModal();
  });

  /* A click on the backdrop lands on the dialog element itself. */
  resetDialog.addEventListener("click", function (event) {
    if (event.target === resetDialog) {
      resetDialog.close("cancel");
    }
  });

  resetDialog.addEventListener("close", function () {
    resetButton.focus();

    if (resetDialog.returnValue !== "confirm") {
      return;
    }

    C.clear()
      .then(function () {
        Object.keys(drafts).forEach(function (id) {
          delete drafts[id];
        });
        selectedId = null;
        return refresh();
      })
      .then(function () {
        statusLine.textContent = "Demoen er nulstillet. Alle bidrag i denne browser er slettet.";
        statusLine.dataset.tone = "success";
      })
      .catch(function (error) {
        statusLine.textContent =
          "Bidragene kunne ikke slettes (" + (error && error.message ? error.message : "ukendt fejl") + ").";
        statusLine.dataset.tone = "error";
      });
  });

  C.onChange(refresh);
  window.addEventListener("pagehide", releasePhotos);
  refresh();
})();
