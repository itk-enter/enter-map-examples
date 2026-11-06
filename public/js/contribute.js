/* Citizen contributions on the Leaflet build: "Tilføj oplysninger" on a
 * place, a mock login, a form for missing or wrong data, photos and closure
 * reports, a preview, and a receipt. Approved contributions are laid over the
 * data and credited to the person who gave them.
 *
 * A plugin for js/leaflet-app.js (`plugins: [window.CONTRIBUTE.plugin]`). The
 * steps render into the same overlay as the detail view, so the map and the
 * list stay where they were. Load after js/contributions.js.
 *
 * DEMO: the login is not real and contributions stay in this browser. See
 * docs/bidrag.md for what production needs instead. */

window.CONTRIBUTE = (function () {
  "use strict";

  const C = window.CONTRIBUTIONS;
  const esc = C.escapeHtml;

  const SESSION_KEY = "enter-contribute-session";
  const MAX_PHOTOS = 3;
  const PHOTO_EDGE = 1600;

  /* Two made-up people to log in as. A real MitID login goes through
   * NemLog-in and returns a pseudonym and a name, never a CPR number. */
  const DEMO_PEOPLE = [
    { subject: "demo-mitid-7f3a9c", name: "Anne Sørensen" },
    { subject: "demo-mitid-2b81e4", name: "Mads Nielsen" },
  ];

  const DAYS = [
    { key: "Mo", label: "Mandag" },
    { key: "Tu", label: "Tirsdag" },
    { key: "We", label: "Onsdag" },
    { key: "Th", label: "Torsdag" },
    { key: "Fr", label: "Fredag" },
    { key: "Sa", label: "Lørdag" },
    { key: "Su", label: "Søndag" },
  ];

  const DAY_STATES = [
    { value: "open", label: "Åben" },
    { value: "closed", label: "Lukket" },
    { value: "allDay", label: "Døgnåbent" },
  ];

  /* Lucide icons (ISC licence), stroked in the text colour. */
  const ICONS = {
    pencil:
      '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    star:
      '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
    camera:
      '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
    check: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  };

  function icon(name) {
    return (
      '<svg class="ikon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      ICONS[name] +
      "</svg>"
    );
  }

  let app = null;
  let byEntity = new Map();
  let records = [];
  let storeFailed = false;
  let detailUrls = [];

  /* Unsent input per place, kept while the user looks elsewhere: closing the
   * form, logging in or opening another place never loses it. */
  const drafts = new Map();

  /* Unsent ratings per place: { stars, comment, showName }. Kept like the
   * drafts above, and discarded with them on logout. */
  const ratingDrafts = new Map();

  /* Set by a pointer on the place's stars, so choosing one with the mouse
   * goes straight on, while the arrow keys only move the choice. */
  let starPointer = false;

  /* The step on show, or null while the overlay shows the place itself. */
  let view = null;

  /* Plugin ----------------------------------------------------------------- */

  function plugin(instance) {
    app = instance;
    app.transform = transform;

    document.addEventListener("enter-map:detail", function (event) {
      view = null;
      decorateDetail(event.detail.place);
    });

    const host = app.detailHost;

    // Escape steps back through the flow rather than closing it; the host
    // hears it before the map's own handler on the document.
    host.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && view) {
        event.stopPropagation();
        back();
      } else if (event.key === "Enter" && event.target.name === "stjerner-sted" && event.target.checked) {
        // The arrow keys move the choice; Enter takes it on.
        event.preventDefault();
        startRating(app.selected(), Number(event.target.value));
      }
    });
    host.addEventListener("pointerdown", function (event) {
      starPointer = Boolean(event.target.closest(".vurdering__giv .stjerne"));
    });
    host.addEventListener("click", onClick);
    host.addEventListener("input", onInput);
    host.addEventListener("change", onChange);

    C.onChange(refresh);
    window.addEventListener("hashchange", openFromHash);
    app.loaded.then(openFromHash);

    return load();
  }

  function load() {
    return C.list()
      .then(function (list) {
        records = list;
        byEntity = new Map();
        // Oldest first, so a later approval of the same attribute wins.
        list
          .slice()
          .reverse()
          .forEach(function (record) {
            if (!byEntity.has(record.entityId)) {
              byEntity.set(record.entityId, []);
            }
            byEntity.get(record.entityId).push(record);
          });
        storeFailed = false;
      })
      .catch(function () {
        // Without IndexedDB nothing can be saved; the detail says so instead
        // of offering a form that cannot be sent.
        records = [];
        byEntity = new Map();
        storeFailed = true;
      });
  }

  /* Another tab approved something, or this one saved: the data, the list and
   * an open detail follow. A step in progress is left alone. */
  function refresh() {
    load().then(function () {
      app.rebuild();

      if (!view) {
        const place = app.selected();

        if (place) {
          const hadFocus = app.detailHost.contains(document.activeElement);

          app.openDetail(place, { focus: hadFocus });
        }
      } else if (view.step === "mine") {
        showMine();
      }
    });
  }

  /* `#sted=<entity id>` opens the place, for links from the review page. */
  function openFromHash() {
    const match = window.location.hash.match(/^#sted=(.+)$/);

    if (match && app.place(decodeURIComponent(match[1]))) {
      app.select(decodeURIComponent(match[1]));
    }
  }

  /* Approved contributions over the data ----------------------------------- */

  function transform(properties, feature) {
    const list = byEntity.get(feature.id);

    if (!list) {
      return properties;
    }

    return list.reduce(function (props, record) {
      return record.changes.reduce(function (current, change) {
        return C.approved(change)
          ? C.write(current, change.attribute, change.incorrect ? undefined : change.value)
          : current;
      }, props);
    }, properties);
  }

  /* The newest approved change per attribute, with its record. */
  function approvedChanges(entityId) {
    const result = new Map();

    (byEntity.get(entityId) || []).forEach(function (record) {
      record.changes.forEach(function (change) {
        if (C.approved(change)) {
          result.set(change.attribute, { change: change, record: record });
        }
      });
    });

    return result;
  }

  function approvedPhotos(entityId) {
    const result = [];

    (byEntity.get(entityId) || []).forEach(function (record) {
      record.photos.forEach(function (photo) {
        if (C.approved(photo)) {
          result.unshift({ photo: photo, record: record });
        }
      });
    });

    return result;
  }

  function approvedClosure(entityId) {
    let result = null;

    (byEntity.get(entityId) || []).forEach(function (record) {
      if (record.closure && C.approved(record.closure)) {
        result = record;
      }
    });

    return result;
  }

  /* The signed-in person's contributions to a place that are still waiting. */
  function ownPending(entityId) {
    const person = session();

    if (!person) {
      return [];
    }

    return (byEntity.get(entityId) || []).filter(function (record) {
      return record.contributor.subject === person.subject && C.status(record) === "pending";
    });
  }

  /* The detail ------------------------------------------------------------- */

  function decorateDetail(place) {
    const host = app.detailHost;
    const body = host.querySelector(".detalje__body");
    const address = body.querySelector(".detalje__address");

    detailUrls.forEach(URL.revokeObjectURL);
    detailUrls = [];

    if (storeFailed) {
      address.insertAdjacentHTML(
        "afterend",
        '<p class="bidrag-besked bidrag-besked--fejl">' +
          icon("alert") +
          "<span>Du kan ikke tilføje oplysninger i denne browser, fordi den ikke giver adgang til at gemme data lokalt.</span></p>",
      );

      return;
    }

    decoratePhoto(host, place);
    decorateClosure(body, place);

    approvedChanges(place.id).forEach(function (entry, attribute) {
      const field = C.field(entityType(place), attribute);
      const verb = entry.change.incorrect
        ? "Fjernet efter besked fra"
        : C.isEmpty(entry.change.previous)
          ? "Tilføjet af"
          : "Rettet af";

      placeNote(
        body,
        attribute,
        '<p class="bidrag-kredit">' +
          icon("user") +
          "<span>" +
          (field && (entry.change.incorrect || !elementFor(body, attribute)) ? esc(field.label) + ": " : "") +
          verb +
          " " +
          esc(C.publicName(entry.record.contributor)) +
          " · " +
          esc(C.formatDate(entry.change.review.at)) +
          "</span></p>",
      );
    });

    // Citizens are a source like the registers, so the source line says so
    // once anything they gave is on the place.
    const source = body.querySelector('.detalje__section[data-attribute="seeAlso"]');

    if (source && (approvedChanges(place.id).size || approvedPhotos(place.id).length || approvedClosure(place.id))) {
      source.insertAdjacentHTML(
        "beforeend",
        '<p class="bidrag-kredit">' + icon("user") + "<span>Og borgerbidrag, gennemgået af Aarhus Kommune</span></p>",
      );
    }

    decorateRating(body, place);

    // One way in, and one line about what is waiting; the chooser has the
    // rest, so the place itself reads as it does on the other maps. A rating
    // says its own status in the rating section.
    const count = ownPending(place.id).filter(function (record) {
      return !record.rating;
    }).length;

    address.insertAdjacentHTML(
      "afterend",
      '<div class="bidrag-handling">' +
        '<button type="button" class="knap knap--kontur knap--lille" data-action="choose">' +
        icon("pencil") +
        "Tilføj eller ret oplysninger</button>" +
        '<p class="bidrag-handling__tekst">Kender du stedet? Hjælp andre ved at tilføje eller opdatere informationen, så de ved, hvad de kan forvente.</p>' +
        (count
          ? '<p class="bidrag-afventer">' +
            icon("clock") +
            "<span>Du har " +
            count +
            " forslag til stedet, der afventer godkendelse. " +
            '<button type="button" class="link-knap" data-action="mine">Se dine bidrag</button></span></p>'
          : "") +
        "</div>",
    );
  }

  /* Ratings ---------------------------------------------------------------- */

  const COMMENTS_SHOWN = 3;

  /* Five stars for reading, filled to the nearest half: 4,3 shows four and a
   * half, so an average never reads as more than it is by a whole star. */
  function starsDisplay(value, label) {
    const halves = Math.round(value * 2);
    let html = '<span class="stjerner-vis" role="img" aria-label="' + esc(label) + '">';

    for (let i = 1; i <= 5; i++) {
      const state = halves >= i * 2 ? " is-fuld" : halves === i * 2 - 1 ? " is-halv" : "";

      html +=
        '<span class="stjerner-vis__stjerne' + state + '">' + icon("star") +
        (state === " is-halv" ? '<span class="stjerner-vis__halv">' + icon("star") + "</span>" : "") +
        "</span>";
    }

    return html + "</span>";
  }

  /* Five stars to choose from: a radio group, each star a label. */
  function starsInput(name, legend, chosen, options) {
    const opts = options || {};
    let html =
      '<fieldset class="stjerner-felt" id="' + name + '" tabindex="-1"' +
      (opts.describedBy ? ' aria-describedby="' + opts.describedBy + '"' : "") +
      "><legend>" + esc(legend) + '</legend><div class="stjerner">';

    for (let i = 1; i <= 5; i++) {
      html +=
        '<label class="stjerne">' +
        '<input type="radio" class="visually-hidden" name="' + name + '" id="' + name + "-" + i + '" value="' + i + '"' +
        (chosen === i ? " checked" : "") + " />" +
        icon("star") +
        '<span class="visually-hidden">' + C.stars(i) + "</span>" +
        "</label>";
    }

    return html + "</div></fieldset>";
  }

  /* The signed-in person's newest rating of a place, whatever its status. */
  function ownRating(entityId) {
    const person = session();
    let result = null;

    if (!person) {
      return null;
    }

    (byEntity.get(entityId) || []).forEach(function (record) {
      if (record.rating && record.contributor.subject === person.subject) {
        result = record;
      }
    });

    return result;
  }

  /* The place's rating: the average and the newest approved comments, and
   * stars to give one's own. Parking has a "Vurdering" fact to stand in for;
   * the others get the section before their source. */
  function decorateRating(body, place) {
    const summary = C.ratingsFor(byEntity.get(place.id) || []);
    const own = ownRating(place.id);
    const draft = ratingDrafts.get(place.id);
    const chosen = draft ? draft.stars : own ? own.rating.stars : 0;
    const ownState = own ? (own.rating.review ? own.rating.review.status : "pending") : null;

    const html =
      '<section class="vurdering detalje__section" aria-labelledby="vurdering-titel">' +
      '<h4 id="vurdering-titel">Vurdering</h4>' +
      (summary.count
        ? '<p class="vurdering__snit">' +
          starsDisplay(summary.average, C.formatAverage(summary.average) + " af 5 stjerner") +
          "<strong>" + C.formatAverage(summary.average) + "</strong>" +
          '<span class="vurdering__antal">' + summary.count + (summary.count === 1 ? " vurdering" : " vurderinger") + "</span></p>"
        : '<p class="vurdering__ingen">Ingen vurderinger endnu.</p>') +
      (summary.comments.length
        ? '<ul class="vurdering__kommentarer">' +
          summary.comments
            .slice(0, COMMENTS_SHOWN)
            .map(function (record) {
              return (
                "<li>" +
                starsDisplay(record.rating.stars, C.stars(record.rating.stars) + " af 5") +
                '<p class="vurdering__tekst">' + esc(record.comment.text) + "</p>" +
                '<p class="bidrag-kredit">' + icon("user") + "<span>" +
                esc(C.publicName(record.contributor)) + " · " + esc(C.formatDate(record.rating.review.at)) +
                "</span></p></li>"
              );
            })
            .join("") +
          "</ul>" +
          (summary.comments.length > COMMENTS_SHOWN
            ? '<p class="vurdering__flere">Viser de ' + COMMENTS_SHOWN + " nyeste af " + summary.comments.length + " kommentarer.</p>"
            : "")
        : "") +
      '<div class="vurdering__giv">' +
      starsInput("stjerner-sted", "Giv din vurdering", chosen, { describedBy: "stjerner-sted-hjaelp" }) +
      '<p class="felt__hjaelp" id="stjerner-sted-hjaelp">Vælg antal stjerner. Du logger ind med MitID for at gemme vurderingen, og den bliver gennemgået, før den vises.</p>' +
      '<button type="button" class="knap knap--kontur knap--lille" data-action="rate"' + (draft ? "" : " hidden") + ">Fortsæt</button>" +
      (ownState === "pending"
        ? '<p class="bidrag-afventer">' + icon("clock") + "<span>Din vurdering: " + esc(C.stars(own.rating.stars)) + " · afventer godkendelse</span></p>"
        : ownState === "approved"
          ? '<p class="bidrag-kredit">' + icon("check") + "<span>Du har givet " + esc(C.stars(own.rating.stars)) + ". Vælg igen for at ændre den.</span></p>"
          : ownState === "rejected"
            ? '<p class="bidrag-kredit">' + icon("alert") + '<span>Din vurdering blev ikke godkendt. <button type="button" class="link-knap" data-action="mine">Se hvorfor</button></span></p>'
            : "") +
      "</div></section>";

    const standIn = body.querySelector('.detalje__section[data-attribute="rating"]');
    const source = body.querySelector('.detalje__section[data-attribute="seeAlso"]');

    if (standIn) {
      standIn.outerHTML = html;
    } else if (source) {
      source.insertAdjacentHTML("beforebegin", html);
    } else {
      body.insertAdjacentHTML("beforeend", html);
    }
  }

  /* Into the rating: stars chosen on the place, then the login if needed. */
  function startRating(place, stars) {
    const draft = ratingDrafts.get(place.id) || { stars: 0, comment: "", showName: false };

    draft.stars = stars;
    ratingDrafts.set(place.id, draft);
    view = { step: null, place: place, focus: null, flow: "rating" };

    if (session()) {
      showRating();
    } else {
      showLogin();
    }
  }

  function showRating() {
    const place = view.place;
    const draft = ratingDrafts.get(place.id);
    const person = session();
    const own = ownRating(place.id);

    renderStep(
      "rating",
      '<h3 class="bidrag__titel" tabindex="-1">Giv din vurdering</h3>' +
        placeHeader(place) +
        '<p class="bidrag-bruger">' + icon("user") + "<span>Logget ind som " + esc(person.name) + " (" +
        esc(C.AUTH_METHODS[person.authMethod]) + ') · <button type="button" class="link-knap" data-action="logout">Log ud</button></span></p>' +
        starsInput("stjerner-form", "Antal stjerner", draft.stars) +
        '<p class="felt__hjaelp">' + esc(C.stars(draft.stars)) + " af 5.</p>" +
        '<div class="fotos__regler retningslinjer">' +
        "<p><strong>Retningslinjer for vurderinger</strong></p>" +
        "<ul>" +
        "<li>Skriv om stedet og dets tilgængelighed, ikke om personer.</li>" +
        "<li>Skriv ikke navne på eller oplysninger om andre, heller ikke medarbejdere.</li>" +
        "<li>Intet krænkende eller diskriminerende sprog.</li>" +
        "<li>Ingen reklame eller links.</li>" +
        "<li>Skriv ikke om en sag, du har hos kommunen. Kontakt os i stedet.</li>" +
        "</ul>" +
        "<p>Vurderinger bliver gennemgået, før de vises. En kommentar, der ikke følger retningslinjerne, bliver ikke vist; stjernerne kan godt tælle med alligevel.</p>" +
        "</div>" +
        textareaField("vurdering-kommentar", "Kommentar (valgfrit)", draft.comment, null, {
          hint: "Fx om adgangen, belægningen eller skiltningen.",
          data: "data-rating-comment",
        }) +
        '<div class="felt">' +
        '<label class="afkryds"><input type="checkbox" id="vurdering-vis-navn" data-rating-show-name' +
        (draft.showName ? " checked" : "") +
        " />Vis mit navn ved kommentaren</label>" +
        '<p class="felt__hjaelp" id="vurdering-vis-navn-tekst">' + showNameText(draft, person) + "</p></div>" +
        '<p class="bidrag-privat">Stjernerne tælles med i gennemsnittet uden navn. Aarhus Kommune gemmer, hvem du er, og hvornår du har vurderet, så vi kan se, hvor en vurdering kommer fra, og så hver person kun tæller én gang pr. sted.</p>' +
        (own
          ? '<p class="bidrag-privat">Du vurderede stedet ' + esc(C.formatDate(own.createdAt)) +
            ". Når den nye vurdering er godkendt, erstatter den den gamle.</p>"
          : "") +
        '<div class="bidrag-send bidrag-send--raekke">' +
        '<button type="button" class="knap knap--primaer" data-action="submit-rating">Send til godkendelse</button>' +
        "</div>" +
        (draft.saveError ? '<p class="felt__fejl" role="alert">' + icon("alert") + "<span>" + esc(draft.saveError) + "</span></p>" : ""),
    );
  }

  async function submitRating() {
    const place = view.place;
    const draft = ratingDrafts.get(place.id);
    const person = session();
    const comment = draft.comment.trim();
    const record = {
      id: "bidrag-" + crypto.randomUUID(),
      entityId: place.id,
      entityType: entityType(place),
      place: { title: place.title, address: [place.address, place.city].filter(Boolean).join(", ") },
      createdAt: new Date().toISOString(),
      contributor: Object.assign({}, person, { showName: draft.showName }),
      changes: [],
      closure: null,
      message: null,
      photos: [],
      rating: { stars: draft.stars, review: null },
      comment: comment ? { text: comment, review: null } : null,
      note: "",
    };

    try {
      await C.save(record);
    } catch (error) {
      draft.saveError = "Vurderingen kunne ikke gemmes. Prøv igen.";
      showRating();

      return;
    }

    ratingDrafts.delete(place.id);
    showRatingReceipt(record);
  }

  function showRatingReceipt(record) {
    const person = session();

    renderStep(
      "receipt",
      '<div class="kvittering">' +
        '<span class="kvittering__ikon">' + icon("check") + "</span>" +
        '<h3 class="bidrag__titel" tabindex="-1">Tak, ' + esc(firstName(person.name)) + "</h3>" +
        '<p role="status">Din vurdering, ' + esc(C.stars(record.rating.stars)) +
        ", er sendt til gennemgang hos Aarhus Kommune. Når den er godkendt, tæller den med i stedets vurdering" +
        (record.comment
          ? ", og din kommentar vises " + (record.contributor.showName ? "med dit navn (" + esc(person.displayName) + ")." : "som fra en borger.")
          : ".") +
        "</p>" +
        '<p><span class="status status--pending">' + icon("clock") + esc(C.STATUSES.pending) + "</span></p>" +
        "</div>" +
        '<div class="bidrag-send bidrag-send--raekke">' +
        '<button type="button" class="knap knap--primaer" data-action="to-place">Tilbage til stedet</button>' +
        '<button type="button" class="knap knap--sekundaer" data-action="mine">Se mine bidrag</button>' +
        "</div>" +
        demoNote(
          'Godkend eller afvis vurderingen på <a href="./bidrag-gennemgang.html" target="_blank" rel="noopener">gennemgangssiden (åbner i en ny fane)</a>. Kortet her følger med.',
        ),
    );
  }

  function decoratePhoto(host, place) {
    const photos = approvedPhotos(place.id);

    if (!photos.length) {
      return;
    }

    const newest = photos[0];
    const url = URL.createObjectURL(newest.photo.blob);
    const name = C.publicName(newest.record.contributor);

    detailUrls.push(url);
    host.querySelector(".detalje__photo").innerHTML =
      '<img class="detalje__foto" src="' +
      url +
      '" alt="Foto af ' +
      esc(place.title.toLowerCase()) +
      '" />' +
      '<span class="detalje__photo-note">Foto: ' +
      esc(name) +
      " · " +
      esc(C.formatDate(newest.photo.review.at)) +
      (photos.length > 1 ? " · 1 af " + photos.length : "") +
      "</span>";
  }

  function decorateClosure(body, place) {
    const record = approvedClosure(place.id);

    if (!record) {
      return;
    }

    body.querySelector(".detalje__title").insertAdjacentHTML(
      "afterend",
      '<p class="bidrag-besked bidrag-besked--advarsel">' +
        icon("alert") +
        "<span>" +
        esc(C.CLOSURES[record.closure.value]) +
        ". Meldt af " +
        esc(C.publicName(record.contributor)) +
        ", godkendt " +
        esc(C.formatDate(record.closure.review.at)) +
        ".</span></p>",
    );
  }

  /* The element of the detail that shows an attribute: a fact section, the
   * title, the address or the headline fact. The section comes first where
   * the headline repeats it, as a bench's "Med ryglæn" does. */
  function elementFor(root, attribute) {
    const selector = '[data-attribute="' + CSS.escape(attribute) + '"]';

    return root.querySelector(".detalje__section" + selector) || root.querySelector(selector);
  }

  /* A credit or a pending note goes under the value it is about; an
   * attribute the detail does not show gets it at the end. */
  function placeNote(body, attribute, html) {
    const element = elementFor(body, attribute);

    if (!element) {
      body.insertAdjacentHTML("beforeend", html);
    } else if (element.classList.contains("detalje__section")) {
      element.insertAdjacentHTML("beforeend", html);
    } else {
      element.insertAdjacentHTML("afterend", html);
    }
  }

  /* Fields ----------------------------------------------------------------- */

  function entityType(place) {
    return place.properties.type;
  }

  function current(place, attribute) {
    return C.read(place.properties, attribute);
  }

  /* A field that only applies when another has a value (the amount, when a
   * toilet is not free) follows what the draft says, or else the data. */
  function applies(place, draft, field) {
    if (!field.when) {
      return true;
    }

    const parsed = parse(place, draft, C.field(entityType(place), field.when.attribute));
    const value = C.isEmpty(parsed.value) ? current(place, field.when.attribute) : parsed.value;

    return value === field.when.value;
  }

  function missingFields(place, draft) {
    return C.fields(entityType(place)).filter(function (field) {
      return applies(place, draft || emptyDraft(), field) && C.isEmpty(current(place, field.attribute));
    });
  }

  function registeredFields(place, draft) {
    return C.fields(entityType(place)).filter(function (field) {
      return applies(place, draft || emptyDraft(), field) && !C.isEmpty(current(place, field.attribute));
    });
  }

  /* The fields the user picked in the chooser, in the order picked, each
   * followed by the fields that depend on it and now apply: the amount under
   * "paid". */
  function pickedFields(place, draft) {
    const all = C.fields(entityType(place));
    const result = [];

    draft.items.forEach(function (key) {
      if (key.indexOf("field:") !== 0) {
        return;
      }

      const field = C.field(entityType(place), key.slice(6));

      result.push(field);
      all.forEach(function (candidate) {
        if (
          candidate.when &&
          candidate.when.attribute === field.attribute &&
          draft.items.indexOf("field:" + candidate.attribute) === -1 &&
          applies(place, draft, candidate)
        ) {
          result.push(candidate);
        }
      });
    });

    return result;
  }

  function picked(draft, key) {
    return draft.items.indexOf(key) !== -1;
  }

  /* Adds something from the chooser to the draft. A registered value starts
   * from what the place has now, and so do the fields that depend on it. */
  function pick(place, draft, key) {
    if (picked(draft, key)) {
      return;
    }

    draft.items.push(key);

    if (key.indexOf("field:") === 0) {
      const attribute = key.slice(6);

      C.fields(entityType(place)).forEach(function (field) {
        if (field.attribute === attribute || (field.when && field.when.attribute === attribute)) {
          prefill(place, draft, field);
        }
      });
    }
  }

  /* Takes something out of the draft again, with what was typed for it. */
  function unpick(place, draft, key) {
    draft.items = draft.items.filter(function (candidate) {
      return candidate !== key;
    });

    if (key === "photo") {
      draft.photos.forEach(function (photo) {
        URL.revokeObjectURL(photo.url);
        delete draft.errors["foto-" + photo.id];
      });
      draft.photos = [];
      draft.photoError = "";
    } else if (key === "closure") {
      draft.closure = "";
      delete draft.errors["bidrag-lukket"];
    } else if (key === "message") {
      draft.message = "";
      delete draft.errors["bidrag-besked"];
    } else {
      const attribute = key.slice(6);

      C.fields(entityType(place)).forEach(function (field) {
        if (field.attribute === attribute || (field.when && field.when.attribute === attribute)) {
          delete draft.values[field.attribute];
          delete draft.addressText[field.attribute];
          delete draft.incorrect[field.attribute];
          delete draft.errors[fieldId(field.attribute)];
          if (field.type === "openingHours") {
            draft.hours = null;
          }
        }
      });
    }
  }

  function fieldId(attribute) {
    return "felt-" + attribute.replace(/\./g, "-");
  }

  /* Drafts ----------------------------------------------------------------- */

  function emptyDraft() {
    return {
      items: [],
      values: {},
      addressText: {},
      hours: null,
      incorrect: {},
      closure: "",
      message: "",
      note: "",
      showName: false,
      photos: [],
      errors: {},
      photoError: "",
      saveError: "",
      attempted: false,
    };
  }

  function draftFor(place) {
    if (!drafts.has(place.id)) {
      drafts.set(place.id, emptyDraft());
    }

    return drafts.get(place.id);
  }

  function discardDraft(place) {
    const draft = drafts.get(place.id);

    if (draft) {
      draft.photos.forEach(function (photo) {
        URL.revokeObjectURL(photo.url);
      });
      drafts.delete(place.id);
    }
  }

  /* The value a field holds in the draft, typed as the model has it, or an
   * error to show next to it. Empty means "don't know". */
  function parse(place, draft, field) {
    const raw = draft.values[field.attribute];

    switch (field.type) {
      case "choice":
        return { value: raw || undefined };
      case "boolean":
        return { value: raw === "true" ? true : raw === "false" ? false : undefined };
      case "number": {
        const text = (raw || "").trim();

        if (!text) {
          return { value: undefined };
        }

        const number = Number(text.replace(",", "."));

        if (!Number.isFinite(number)) {
          return { error: "Skriv et tal, fx " + (field.step < 1 ? "3,5" : "2") + "." };
        }
        if (field.step >= 1 && !Number.isInteger(number)) {
          return { error: "Skriv et helt tal." };
        }
        if (number < field.min || number > field.max) {
          return { error: "Skriv et tal mellem " + field.min + " og " + field.max + "." };
        }

        return { value: number };
      }
      case "text": {
        const text = (raw || "").trim();

        return { value: text || undefined };
      }
      case "address":
        if (raw) {
          return { value: raw };
        }

        return (draft.addressText[field.attribute] || "").trim()
          ? { error: "Vælg adressen på listen, så vi ved, at den findes." }
          : { value: undefined };
      case "openingHours":
        return hoursValue(draft.hours);
      default:
        return { value: undefined };
    }
  }

  /* What the draft proposes, and what is wrong with it. */
  function collect(place, draft) {
    const changes = [];
    const errors = {};

    pickedFields(place, draft).forEach(function (field) {
      const previous = current(place, field.attribute);

      if (draft.incorrect[field.attribute]) {
        changes.push(change(field.attribute, previous, null, true));

        return;
      }

      const parsed = parse(place, draft, field);

      if (parsed.error) {
        errors[fieldId(field.attribute)] = parsed.error;

        return;
      }
      if (C.isEmpty(parsed.value) || JSON.stringify(parsed.value) === JSON.stringify(previous)) {
        return;
      }

      changes.push(change(field.attribute, previous, parsed.value, false));
    });

    draft.photos.forEach(function (photo) {
      if (!photo.consent) {
        errors["foto-" + photo.id] = "Bekræft at billedet følger reglerne, eller fjern det.";
      }
    });

    if (picked(draft, "closure") && !draft.closure) {
      errors["bidrag-lukket"] = "Vælg hvad der er sket med stedet.";
    }
    if (picked(draft, "message") && !draft.message.trim()) {
      errors["bidrag-besked"] = "Skriv hvad du vil fortælle os.";
    }

    return { changes: changes, errors: errors };
  }

  function change(attribute, previous, value, incorrect) {
    return {
      attribute: attribute,
      previous: C.isEmpty(previous) ? null : previous,
      value: value,
      incorrect: incorrect,
      review: null,
    };
  }

  /* Something to send: a value, a closure, a message or a photo. A field
   * filled in wrongly counts too, so the button can say what is wrong with
   * it rather than stay disabled for a reason the user cannot see. */
  function hasContent(place, draft) {
    const result = collect(place, draft);
    const fieldErrors = Object.keys(result.errors).filter(function (id) {
      return id.indexOf("felt-") === 0;
    });

    return (
      result.changes.length > 0 ||
      fieldErrors.length > 0 ||
      draft.photos.length > 0 ||
      Boolean(draft.closure) ||
      Boolean(draft.message.trim())
    );
  }

  /* Opening hours ---------------------------------------------------------- */

  function emptyHours() {
    return DAYS.map(function () {
      return { state: "", from: "", to: "" };
    });
  }

  /* The simple forms of OpenStreetMap's opening_hours, which is what the
   * toilet sources record: "24/7", "08:00-20:00", "Mo-Fr 08:00-15:45; Sa
   * off". Anything else returns null, and the form starts empty. */
  function parseHours(value) {
    const text = [].concat(value).join("; ").trim();
    const days = DAYS.map(function () {
      return null;
    });

    if (text === "24/7") {
      return DAYS.map(function () {
        return { state: "allDay", from: "", to: "" };
      });
    }

    const rules = text.split(/;\s*|,\s+/);

    for (let i = 0; i < rules.length; i++) {
      const match = rules[i].match(/^(?:([A-Za-z,-]+)\s+)?(off|(\d\d:\d\d)-(\d\d:\d\d))$/);

      if (!match) {
        return null;
      }

      const selected = match[1] ? dayIndexes(match[1]) : DAYS.map(function (day, index) {
        return index;
      });

      if (!selected) {
        return null;
      }

      selected.forEach(function (index) {
        days[index] =
          match[2] === "off"
            ? { state: "closed", from: "", to: "" }
            : match[3] === "00:00" && match[4] === "24:00"
              ? { state: "allDay", from: "", to: "" }
              : { state: "open", from: match[3], to: match[4] };
      });
    }

    return days.map(function (day) {
      return day || { state: "", from: "", to: "" };
    });
  }

  function dayIndexes(spec) {
    const keys = DAYS.map(function (day) {
      return day.key;
    });
    const result = [];

    for (const part of spec.split(",")) {
      const range = part.split("-");
      const start = keys.indexOf(range[0]);
      const end = keys.indexOf(range[range.length - 1]);

      if (start === -1 || end === -1 || end < start) {
        return null;
      }
      for (let i = start; i <= end; i++) {
        result.push(i);
      }
    }

    return result;
  }

  /* The days as an opening_hours string: consecutive days with the same
   * hours share a rule, "Mo-Fr 08:00-18:00; Sa 10:00-14:00; Su off". */
  function hoursValue(days) {
    if (!days) {
      return { value: undefined };
    }

    const set = days.filter(function (day) {
      return day.state;
    }).length;

    if (!set) {
      return { value: undefined };
    }
    if (set < days.length) {
      return { error: "Vælg for alle ugens dage, eller lad dem alle stå tomme." };
    }

    for (let i = 0; i < days.length; i++) {
      const day = days[i];

      if (day.state === "open" && (!day.from || !day.to)) {
        return { error: "Skriv hvornår der åbner og lukker om " + DAYS[i].label.toLowerCase() + "en." };
      }
      if (day.state === "open" && day.to <= day.from) {
        return { error: "Lukketid skal være efter åbningstid om " + DAYS[i].label.toLowerCase() + "en." };
      }
    }

    const specs = days.map(function (day) {
      return day.state === "closed" ? "off" : day.state === "allDay" ? "00:00-24:00" : day.from + "-" + day.to;
    });

    if (
      specs.every(function (spec) {
        return spec === "00:00-24:00";
      })
    ) {
      return { value: "24/7" };
    }

    const rules = [];
    let start = 0;

    for (let i = 1; i <= specs.length; i++) {
      if (i === specs.length || specs[i] !== specs[start]) {
        const span = i - 1 === start ? DAYS[start].key : DAYS[start].key + "-" + DAYS[i - 1].key;

        rules.push(span + " " + specs[start]);
        start = i;
      }
    }

    return { value: rules.join("; ") };
  }

  /* Session ---------------------------------------------------------------- */

  function session() {
    try {
      return JSON.parse(window.sessionStorage.getItem(SESSION_KEY));
    } catch (error) {
      return null;
    }
  }

  function signIn(person) {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(person));
  }

  function signOut() {
    window.sessionStorage.removeItem(SESSION_KEY);
  }

  /* "Anne Sørensen" is shown as "Anne S." if she agrees to be shown. */
  function shortName(name) {
    const parts = name.trim().split(/\s+/);

    return parts.length > 1 ? parts[0] + " " + parts[parts.length - 1][0] + "." : parts[0];
  }

  function firstName(name) {
    return name.trim().split(/\s+/)[0];
  }

  /* Steps ------------------------------------------------------------------ */

  /* Into the flow: the chooser first, where nothing needs a login. */
  function start(place) {
    view = { step: null, place: place, focus: null };
    showChooser();
  }

  /* Where to land in the form for one thing from the chooser. */
  function focusFor(place, key) {
    if (key === "photo") {
      return "foto-tilfoej";
    }
    if (key === "closure") {
      return "bidrag-lukket";
    }
    if (key === "message") {
      return "bidrag-besked";
    }

    return firstControlId(C.field(entityType(place), key.slice(6)));
  }

  /* A pick from the chooser goes to the form, through the login if needed. */
  function choose(key) {
    const place = view.place;

    pick(place, draftFor(place), key);
    view.focus = focusFor(place, key);

    if (session()) {
      showForm({ focus: view.focus });
    } else {
      showLogin();
    }
  }

  /* One step in the overlay: a bar with the way back and the close button,
   * then the step. Focus goes to the step's heading, or to `focus`. */
  function renderStep(step, html, options) {
    const backLabels = {
      choose: "Tilbage til stedet",
      login: view.flow === "rating" ? "Tilbage til stedet" : "Tilbage til listen",
      mitid: "Tilbage",
      form: "Tilbage til listen",
      preview: "Tilbage til forslaget",
      mine: "Tilbage til stedet",
      rating: "Tilbage til stedet",
    };

    view.step = step;
    app.detailHost.innerHTML =
      '<div class="bidrag">' +
      '<div class="bidrag__top">' +
      (backLabels[step]
        ? '<button type="button" class="link-knap bidrag__tilbage" data-action="back">' + icon("back") + backLabels[step] + "</button>"
        : "<span></span>") +
      '<button type="button" class="bidrag__luk" data-action="close" aria-label="Luk">&times;</button>' +
      "</div>" +
      '<div class="bidrag__body">' +
      html +
      "</div></div>";

    const target = options && options.focus ? document.getElementById(options.focus) : null;

    (target || app.detailHost.querySelector(".bidrag__titel")).focus();
    if (target && target.scrollIntoView) {
      target.scrollIntoView({ block: "center" });
    } else {
      app.detailHost.scrollTop = 0;
    }
  }

  function back() {
    if (view.step === "mitid") {
      showLogin();
    } else if (view.step === "preview") {
      showForm();
    } else if (view.step === "login" || view.step === "form") {
      if (view.flow === "rating") {
        backToPlace();
      } else {
        showChooser();
      }
    } else {
      backToPlace();
    }
  }

  function backToPlace() {
    const place = view.place;

    view = null;
    app.openDetail(place);
  }

  function placeHeader(place) {
    return (
      '<p class="bidrag__sted"><strong>' +
      esc(place.title) +
      "</strong>" +
      [place.address, place.city]
        .filter(Boolean)
        .map(function (line) {
          return "<br />" + esc(line);
        })
        .join("") +
      "</p>"
    );
  }

  /* Login (mock) ----------------------------------------------------------- */

  /* One way in, MitID, as citizens log in to the municipality elsewhere. */
  function showLogin() {
    renderStep(
      "login",
      '<h3 class="bidrag__titel" tabindex="-1">Log ind for at tilføje oplysninger</h3>' +
        "<p>Vi beder dig logge ind med MitID, så vi kan takke dig for dit bidrag og altid vide, hvor en oplysning kommer fra.</p>" +
        demoNote("Der logges ikke rigtigt ind, og intet sendes nogen steder.") +
        '<div class="bidrag-login">' +
        '<button type="button" class="knap knap--primaer knap--bred" data-action="mitid">Log ind med MitID</button>' +
        "</div>",
    );
  }

  function showMitid() {
    renderStep(
      "mitid",
      '<h3 class="bidrag__titel" tabindex="-1">MitID (demo)</h3>' +
        "<p>I den rigtige løsning sendes du videre til MitID og tilbage hertil, når du har godkendt i MitID-appen. Her vælger du en testperson.</p>" +
        '<fieldset class="felt valg">' +
        "<legend>Testperson</legend>" +
        '<div class="valg__muligheder">' +
        DEMO_PEOPLE.map(function (person, index) {
          return radio("mitid-person", "mitid-person-" + index, String(index), person.name, index === 0);
        }).join("") +
        "</div></fieldset>" +
        '<button type="button" class="knap knap--primaer" data-action="approve-mitid">Godkend</button>',
    );
  }

  function demoNote(text) {
    return '<p class="bidrag-besked">' + icon("info") + "<span><strong>Demo.</strong> " + text + "</span></p>";
  }

  /* Chooser ---------------------------------------------------------------- */

  /* Everything the user can add or correct on the place, as a list of links
   * into the form: what is missing first, then what is registered, then a
   * photo, a closure or a message. What the user already has waiting shows
   * on its row. */
  function showChooser() {
    const place = view.place;
    const draft = draftFor(place);
    const waiting = ownPending(place.id).flatMap(function (record) {
      return record.changes;
    });

    function fieldRow(field) {
      const value = C.format(field, current(place, field.attribute));
      const pending = waiting.filter(function (change) {
        return change.attribute === field.attribute;
      });
      const pendingText = pending
        .map(function (change) {
          return change.incorrect ? "Forkert" : C.format(field, change.value);
        })
        .join(", ");

      return row({
        key: "field:" + field.attribute,
        name: field.label,
        value: value,
        pending: pendingText,
        verb: value ? "Ret" : "Tilføj",
      });
    }

    function row(item) {
      const inDraft = picked(draft, item.key);
      const label =
        (item.verb ? item.verb + " " + item.name.toLowerCase() : item.name) +
        (item.value ? ", nu: " + item.value : "") +
        (item.pending ? ", dit forslag afventer: " + item.pending : "") +
        (inDraft ? ", er i dit forslag" : "");

      return (
        '<li><button type="button" class="valgliste__raekke" data-action="pick" data-item="' + esc(item.key) + '"' +
        ' aria-label="' + esc(label) + '">' +
        '<span class="valgliste__tekst">' +
        '<span class="valgliste__navn">' + esc(item.name) + "</span>" +
        (item.value ? '<span class="valgliste__vaerdi">' + esc(item.value) + "</span>" : "") +
        (item.pending ? '<span class="bidrag-afventer">' + icon("clock") + "<span>Afventer: " + esc(item.pending) + "</span></span>" : "") +
        (inDraft ? '<span class="valgliste__valgt">I dit forslag</span>' : "") +
        "</span>" +
        '<span class="valgliste__handling">' + (item.verb || "") + icon("chevron") + "</span>" +
        "</button></li>"
      );
    }

    function group(id, title, rows) {
      return rows.length
        ? '<section class="valgliste" aria-labelledby="' + id + '"><h4 id="' + id + '">' + title + "</h4><ul>" + rows.join("") + "</ul></section>"
        : "";
    }

    renderStep(
      "choose",
      '<h3 class="bidrag__titel" tabindex="-1">Tilføj eller ret oplysninger</h3>' +
        placeHeader(place) +
        "<p>Vælg det, du ved noget om. Du kan vælge flere ting og sende dem samlet.</p>" +
        (draft.items.length
          ? '<div class="valgliste__forslag"><p>Du har ' + draft.items.length + ' ting i dit forslag.</p>' +
            '<button type="button" class="knap knap--sekundaer knap--lille" data-action="to-form">Fortsæt med forslaget</button></div>'
          : "") +
        group("valg-mangler", "Mangler", missingFields(place, draft).map(fieldRow)) +
        group("valg-registreret", "Registreret", registeredFields(place, draft).map(fieldRow)) +
        group("valg-andet", "Foto og andet", [
          row({ key: "photo", name: "Tilføj et foto" }),
          row({ key: "closure", name: "Meld stedet lukket eller fjernet" }),
          row({ key: "message", name: "Skriv om noget andet" }),
        ]),
    );
  }

  /* Form ------------------------------------------------------------------- */

  /* What the user picked, each with its control and a way to take it out
   * again, and a way back to the chooser for more. */
  function showForm(options) {
    const place = view.place;
    const draft = draftFor(place);
    const person = session();

    if (!draft.items.length) {
      showChooser();

      return;
    }

    renderStep(
      "form",
      '<h3 class="bidrag__titel" tabindex="-1">Tilføj eller ret oplysninger</h3>' +
        placeHeader(place) +
        '<p class="bidrag-bruger">' +
        icon("user") +
        "<span>Logget ind som " +
        esc(person.name) +
        " (" +
        esc(C.AUTH_METHODS[person.authMethod]) +
        ') · <button type="button" class="link-knap" data-action="mine">Mine bidrag</button>' +
        ' · <button type="button" class="link-knap" data-action="logout">Log ud</button></span></p>' +
        '<div class="punkter">' +
        draft.items
          .map(function (key) {
            return itemControl(place, draft, key);
          })
          .join("") +
        "</div>" +
        '<button type="button" class="link-knap bidrag-mere" data-action="choose">' + icon("plus") + "Tilføj eller ret mere</button>" +
        textareaField("bidrag-note", "Hvordan ved du det? (valgfrit)", draft.note, null, {
          hint: "Fx: Jeg bruger pladsen hver uge. Det hjælper os, når vi gennemgår dit forslag.",
          data: "data-note",
        }) +
        '<div class="felt">' +
        '<label class="afkryds"><input type="checkbox" id="bidrag-vis-navn" data-show-name' +
        (draft.showName ? " checked" : "") +
        " />Vis mit navn ved bidraget</label>" +
        '<p class="felt__hjaelp" id="bidrag-vis-navn-tekst">' +
        showNameText(draft, person) +
        "</p></div>" +
        '<p class="bidrag-privat">Aarhus Kommune gemmer, hvem du er, og hvornår du har bidraget, så vi altid kan se, hvor en oplysning kommer fra. Det gælder også, hvis du ikke viser dit navn. Dit navn vises aldrig uden dit samtykke.</p>' +
        '<div class="bidrag-send">' +
        '<button type="button" class="knap knap--primaer" data-action="preview" id="bidrag-videre">Se forslaget</button>' +
        '<p class="felt__hjaelp" id="bidrag-videre-hjaelp">Udfyld mindst én af tingene ovenfor.</p>' +
        '<div id="bidrag-opsummering">' +
        summary(draft) +
        "</div>" +
        "</div>",
      options && options.focus ? { focus: options.focus } : null,
    );

    bindAddressFields(place, draft);
    updateSendState();
  }

  function showNameText(draft, person) {
    return draft.showName
      ? "Vises som <strong>" + esc(person.displayName) + "</strong> ved det, du har bidraget med."
      : "Vises som <strong>en borger</strong>.";
  }

  /* One picked thing in the form. A registered value shows what it is now,
   * and can be marked wrong without giving the right one. */
  function itemControl(place, draft, key) {
    const errors = draft.errors;
    let body;
    let name;

    if (key === "photo") {
      name = "foto";
      body = photoSection(draft);
    } else if (key === "closure") {
      name = "meldingen om lukning";
      body =
        '<fieldset class="felt valg" id="bidrag-lukket" tabindex="-1"' +
        describedBy("bidrag-lukket", errors) +
        "><legend>Hvad er der sket med stedet?</legend>" +
        '<div class="valg__muligheder valg__muligheder--stablet">' +
        Object.keys(C.CLOSURES)
          .map(function (value) {
            return radio("bidrag-lukket", "bidrag-lukket-" + value, value, C.CLOSURES[value], draft.closure === value, "data-closure");
          })
          .join("") +
        "</div>" +
        errorText("bidrag-lukket", errors) +
        "</fieldset>";
    } else if (key === "message") {
      name = "beskeden";
      body = textareaField("bidrag-besked", "Hvad vil du fortælle os?", draft.message, errors["bidrag-besked"], {
        hint: "Fx at indgangen er flyttet, eller at skiltet mangler.",
        data: "data-message",
      });
    } else {
      const field = C.field(entityType(place), key.slice(6));

      name = field.label.toLowerCase();
      body = pickedFields(place, Object.assign({}, draft, { items: [key] }))
        .map(function (candidate) {
          return fieldControl(place, draft, candidate);
        })
        .join("");
    }

    return (
      '<div class="punkt">' +
      body +
      '<button type="button" class="link-knap punkt__fjern" data-action="unpick" data-item="' + esc(key) + '"' +
      ' aria-label="Fjern ' + esc(name) + ' fra forslaget">Fjern fra forslaget</button>' +
      "</div>"
    );
  }

  function fieldControl(place, draft, field) {
    const id = fieldId(field.attribute);
    const value = C.format(field, current(place, field.attribute));

    if (draft.incorrect[field.attribute]) {
      return (
        '<p class="ret__vaerdi"><span class="ret__label">' + esc(field.label) + "</span>" + esc(value) + "</p>" +
        incorrectBox(field, id, true)
      );
    }

    return (
      control(place, draft, field) +
      (value ? '<p class="felt__hjaelp">Registreret nu: ' + esc(value) + "</p>" + incorrectBox(field, id, false) : "")
    );
  }

  function incorrectBox(field, id, checked) {
    return (
      '<label class="afkryds punkt__forkert"><input type="checkbox" id="' + id + '-forkert" data-incorrect="' + esc(field.attribute) + '"' +
      (checked ? " checked" : "") +
      " />Jeg ved ikke, hvad der er rigtigt, men det er forkert</label>"
    );
  }

  /* One field's control, chosen by its type and, for a choice, by the number
   * of options: up to 3 as radio buttons, up to 10 as a select. */
  function control(place, draft, field) {
    const id = fieldId(field.attribute);
    const raw = draft.values[field.attribute];
    const errors = draft.errors;

    switch (field.type) {
      case "boolean": {
        const labels = field.labels || { yes: "Ja", no: "Nej" };

        return radioField(field, id, raw, [
          { value: "true", label: labels.yes },
          { value: "false", label: labels.no },
        ], errors);
      }
      case "choice":
        if (field.options.length <= 3) {
          return radioField(field, id, raw, field.options, errors);
        }
        if (field.options.length > 10) {
          throw new Error(field.attribute + " has more than 10 options and needs a searchable select.");
        }

        return (
          '<div class="felt">' +
          '<label for="' + id + '">' + esc(field.label) + "</label>" +
          '<select id="' + id + '" data-field="' + esc(field.attribute) + '"' + describedBy(id, errors) + ">" +
          '<option value="">Ved ikke</option>' +
          field.options
            .map(function (option) {
              return (
                '<option value="' + esc(option.value) + '"' + (option.value === raw ? " selected" : "") + ">" +
                esc(option.label) + "</option>"
              );
            })
            .join("") +
          "</select>" +
          errorText(id, errors) +
          "</div>"
        );
      case "number":
        return textField(id, field.label, raw || "", errors[id], {
          data: 'data-field="' + esc(field.attribute) + '"',
          inputmode: field.step < 1 ? "decimal" : "numeric",
          unit: field.unit,
          narrow: true,
          hint: field.min !== undefined ? "Mellem " + field.min + " og " + field.max + (field.unit ? " " + field.unit : "") + "." : "",
        });
      case "text":
        // A description gets room to write; a name or a time limit one line.
        if (field.multiline) {
          return textareaField(id, field.label, raw || "", errors[id], {
            data: 'data-field="' + esc(field.attribute) + '"',
            hint: field.hint,
          });
        }

        return textField(id, field.label, raw || "", errors[id], {
          data: 'data-field="' + esc(field.attribute) + '"',
          hint: field.hint,
          maxlength: 200,
        });
      case "address":
        return (
          '<div class="felt felt--adresse">' +
          '<label for="' + id + '">' + esc(field.label) + "</label>" +
          '<input id="' + id + '" type="text" role="combobox" autocomplete="off" aria-autocomplete="list" ' +
          'aria-expanded="false" aria-controls="' + id + '-forslag" data-address="' + esc(field.attribute) + '" ' +
          'value="' + esc(draft.addressText[field.attribute] || "") + '"' +
          describedBy(id, errors, id + "-hjaelp") + " />" +
          '<ul id="' + id + '-forslag" class="forslag" role="listbox" aria-label="Forslag" hidden></ul>' +
          '<p class="felt__hjaelp" id="' + id + '-hjaelp">Skriv adressen, og vælg den på listen.</p>' +
          '<p class="felt__hjaelp" id="' + id + '-svarer-ikke" role="status" hidden>Adressesøgningen svarer ikke lige nu. Prøv igen om lidt.</p>' +
          errorText(id, errors) +
          "</div>"
        );
      case "openingHours":
        return hoursControl(place, draft, field);
      default:
        return "";
    }
  }

  function radioField(field, id, raw, options, errors) {
    return (
      '<fieldset class="felt valg" id="' + id + '" tabindex="-1"' + describedBy(id, errors) + ">" +
      "<legend>" + esc(field.label) + "</legend>" +
      '<div class="valg__muligheder">' +
      options
        .map(function (option, index) {
          return radio(id, id + "-" + index, option.value, option.label, option.value === raw, 'data-field="' + esc(field.attribute) + '"');
        })
        .join("") +
      '<button type="button" class="link-knap valg__ryd" data-action="clear" data-attribute="' + esc(field.attribute) + '"' +
      ' aria-label="Ryd ' + esc(field.label.toLowerCase()) + '"' + (raw ? "" : " hidden") + ">Ryd</button>" +
      "</div>" +
      errorText(id, errors) +
      "</fieldset>"
    );
  }

  function radio(name, id, value, label, checked, data) {
    return (
      '<label class="valg__mulighed" for="' + id + '">' +
      '<input type="radio" name="' + name + '" id="' + id + '" value="' + esc(value) + '"' +
      (checked ? " checked" : "") + (data ? " " + data : "") + " />" +
      esc(label) + "</label>"
    );
  }

  function hoursControl(place, draft, field) {
    const id = fieldId(field.attribute);
    const errors = draft.errors;
    const raw = current(place, field.attribute);
    let note = "";

    // A registered value is put into the days when picked; one that is not
    // in the simple form the days can show is quoted instead.
    if (!draft.hours) {
      draft.hours = emptyHours();
    }
    if (raw && !parseHours(raw)) {
      note = '<p class="felt__hjaelp">Registreret i dag: ' + esc([].concat(raw).join("; ")) + "</p>";
    }

    return (
      '<fieldset class="felt timer" id="' + id + '" tabindex="-1"' + describedBy(id, errors, id + "-hjaelp") + ">" +
      "<legend>" + esc(field.label) + "</legend>" +
      note +
      '<p class="felt__hjaelp" id="' + id + '-hjaelp">Vælg for hver dag. Lad alle dage stå tomme, hvis du ikke ved det.</p>' +
      draft.hours
        .map(function (day, index) {
          const dayId = id + "-" + DAYS[index].key;

          return (
            '<fieldset class="timer__dag">' +
            "<legend>" + DAYS[index].label + "</legend>" +
            '<div class="valg__muligheder valg__muligheder--smal">' +
            DAY_STATES.map(function (state) {
              return radio(dayId, dayId + "-" + state.value, state.value, state.label, day.state === state.value, 'data-day="' + index + '"');
            }).join("") +
            '<button type="button" class="link-knap valg__ryd" data-action="clear-day" data-day="' + index + '"' +
            ' aria-label="Ryd ' + DAYS[index].label.toLowerCase() + '"' + (day.state ? "" : " hidden") + ">Ryd</button>" +
            "</div>" +
            (day.state === "open"
              ? '<div class="timer__tider">' +
                '<label for="' + dayId + '-fra">Fra</label><input type="time" id="' + dayId + '-fra" data-day-from="' + index + '" value="' + esc(day.from) + '" />' +
                '<label for="' + dayId + '-til">Til</label><input type="time" id="' + dayId + '-til" data-day-to="' + index + '" value="' + esc(day.to) + '" />' +
                "</div>"
              : "") +
            "</fieldset>"
          );
        })
        .join("") +
      (draft.hours[0].state
        ? '<button type="button" class="link-knap timer__kopier" data-action="copy-weekdays">Brug mandagens tider tirsdag til fredag</button>'
        : "") +
      errorText(id, errors) +
      "</fieldset>"
    );
  }

  function textField(id, label, value, error, options) {
    const opts = options || {};
    const hint = opts.hint ? '<p class="felt__hjaelp" id="' + id + '-hjaelp">' + esc(opts.hint) + "</p>" : "";

    return (
      '<div class="felt' + (opts.narrow ? " felt--smal" : "") + '">' +
      '<label for="' + id + '">' + esc(label) + "</label>" +
      '<div class="felt__input">' +
      '<input id="' + id + '" type="text" value="' + esc(value) + '"' +
      (opts.inputmode ? ' inputmode="' + opts.inputmode + '"' : "") +
      (opts.maxlength ? ' maxlength="' + opts.maxlength + '"' : "") +
      (opts.data ? " " + opts.data : "") +
      describedBy(id, error ? { [id]: error } : {}, opts.hint ? id + "-hjaelp" : "") +
      " />" +
      (opts.unit ? '<span class="felt__enhed">' + esc(opts.unit) + "</span>" : "") +
      "</div>" +
      hint +
      errorText(id, error ? { [id]: error } : {}) +
      "</div>"
    );
  }

  function textareaField(id, label, value, error, options) {
    const opts = options || {};

    return (
      '<div class="felt">' +
      '<label for="' + id + '">' + esc(label) + "</label>" +
      '<textarea id="' + id + '" rows="3" maxlength="1000"' + (opts.data ? " " + opts.data : "") +
      describedBy(id, error ? { [id]: error } : {}, opts.hint ? id + "-hjaelp" : "") + ">" +
      esc(value) + "</textarea>" +
      (opts.hint ? '<p class="felt__hjaelp" id="' + id + '-hjaelp">' + esc(opts.hint) + "</p>" : "") +
      errorText(id, error ? { [id]: error } : {}) +
      "</div>"
    );
  }

  function describedBy(id, errors, hintId) {
    const ids = [hintId, errors[id] ? id + "-fejl" : ""].filter(Boolean);

    return (ids.length ? ' aria-describedby="' + ids.join(" ") + '"' : "") + (errors[id] ? ' aria-invalid="true"' : "");
  }

  function errorText(id, errors) {
    return errors[id]
      ? '<p class="felt__fejl" id="' + id + '-fejl">' + icon("alert") + "<span>" + esc(errors[id]) + "</span></p>"
      : "";
  }

  /* Photos ----------------------------------------------------------------- */

  function photoSection(draft) {
    const full = draft.photos.length >= MAX_PHOTOS;

    return (
      '<section class="fotos" aria-labelledby="fotos-titel">' +
      '<h4 id="fotos-titel">Foto</h4>' +
      '<div class="fotos__regler">' +
      "<p><strong>Før du tager eller vælger et foto</strong></p>" +
      "<ul>" +
      "<li>Vis kun selve stedet, fx indgangen, pladsen eller toilettet.</li>" +
      "<li>Ingen ansigter eller personer.</li>" +
      "<li>Ingen nummerplader.</li>" +
      "<li>Ikke ind i private hjem, haver eller vinduer.</li>" +
      "<li>Du skal selv have taget billedet.</li>" +
      "</ul>" +
      "<p>Billeder med ansigter eller nummerplader bliver ikke godkendt. Godkendte fotos vises på kortet med det navn, du vælger nedenfor.</p>" +
      "</div>" +
      (draft.photos.length
        ? '<ul class="fotos__liste">' +
          draft.photos
            .map(function (photo, index) {
              const id = "foto-" + photo.id;

              return (
                '<li class="foto">' +
                '<img src="' + photo.url + '" alt="Dit foto ' + (index + 1) + '" width="96" height="72" />' +
                '<div class="foto__tekst">' +
                '<label class="afkryds"><input type="checkbox" id="' + id + '" data-photo-consent="' + photo.id + '"' +
                (photo.consent ? " checked" : "") + describedBy(id, draft.errors) + " />" +
                "Billedet viser ingen ansigter eller nummerplader, og jeg har selv taget det</label>" +
                errorText(id, draft.errors) +
                '<button type="button" class="link-knap" data-action="remove-photo" data-photo="' + photo.id + '"' +
                ' aria-label="Fjern foto ' + (index + 1) + '">Fjern</button>' +
                "</div></li>"
              );
            })
            .join("") +
          "</ul>"
        : "") +
      '<input type="file" id="foto-fil" accept="image/*" multiple hidden />' +
      '<button type="button" class="knap knap--sekundaer" data-action="add-photo" id="foto-tilfoej"' +
      (full ? " disabled" : "") + ' aria-describedby="foto-hjaelp">' + icon("camera") + "Tilføj foto</button>" +
      '<p class="felt__hjaelp" id="foto-hjaelp">' +
      (full
        ? "Du kan højst tilføje " + MAX_PHOTOS + " fotos."
        : "Op til " + MAX_PHOTOS + " fotos. Vi gemmer en mindre kopi uden billedets placering og andre oplysninger fra kameraet.") +
      "</p>" +
      (draft.photoError
        ? '<p class="felt__fejl" role="alert">' + icon("alert") + "<span>" + esc(draft.photoError) + "</span></p>"
        : "") +
      "</section>"
    );
  }

  /* A smaller JPEG copy: at most 1600 px on the long edge, and re-encoding
   * drops the EXIF data, the camera's GPS position with it. */
  async function addPhotos(files) {
    const place = view.place;
    const draft = draftFor(place);
    const room = MAX_PHOTOS - draft.photos.length;
    const chosen = Array.prototype.slice.call(files, 0, room);
    let failed = 0;

    draft.photoError = files.length > room ? "Du kan højst tilføje " + MAX_PHOTOS + " fotos. De første " + room + " er tilføjet." : "";

    for (const file of chosen) {
      try {
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, PHOTO_EDGE / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement("canvas");

        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();

        const blob = await new Promise(function (resolve, reject) {
          canvas.toBlob(function (result) {
            return result ? resolve(result) : reject(new Error("toBlob"));
          }, "image/jpeg", 0.85);
        });

        draft.photos.push({
          id: crypto.randomUUID(),
          blob: blob,
          width: canvas.width,
          height: canvas.height,
          url: URL.createObjectURL(blob),
          consent: false,
        });
      } catch (error) {
        failed++;
      }
    }

    if (failed) {
      draft.photoError =
        (failed === 1 ? "En fil" : failed + " filer") + " kunne ikke læses som et billede. Brug et foto i JPEG- eller PNG-format.";
    }

    if (view && view.place === place && view.step === "form") {
      const last = draft.photos[draft.photos.length - 1];

      showForm({ focus: last && !failed ? "foto-" + last.id : "foto-tilfoej" });
    }
  }

  /* Preview ---------------------------------------------------------------- */

  function showPreview() {
    const place = view.place;
    const draft = draftFor(place);
    const person = session();
    const result = collect(place, draft);
    const type = entityType(place);
    let properties = place.properties;

    result.changes.forEach(function (change) {
      properties = C.write(properties, change.attribute, change.incorrect ? undefined : change.value);
    });

    const described = place.source.describe(properties);
    const attributes = described.attributes || {};

    renderStep(
      "preview",
      '<h3 class="bidrag__titel" tabindex="-1">Sådan ser stedet ud med dit forslag</h3>' +
        "<p>Når forslaget er godkendt, ser stedet sådan ud på kortet. Det, du har ændret, er markeret.</p>" +
        (picked(draft, "closure") && draft.closure
          ? '<p class="bidrag-besked bidrag-besked--advarsel">' + icon("alert") + "<span>Du melder: " + esc(C.CLOSURES[draft.closure]) + ".</span></p>"
          : "") +
        '<div class="forhaand">' +
        (draft.photos.length
          ? '<div class="forhaand__fotos">' +
            draft.photos
              .map(function (photo, index) {
                return '<img src="' + photo.url + '" alt="Dit foto ' + (index + 1) + '" />';
              })
              .join("") +
            "</div>"
          : "") +
        '<p class="forhaand__titel"' + dataAttribute(attributes.title) + ">" + esc(described.title) + "</p>" +
        '<p class="forhaand__adresse"' + dataAttribute(attributes.address) + ">" +
        [described.address, described.city].filter(Boolean).map(esc).join("<br />") + "</p>" +
        '<p class="detalje__spots"' + dataAttribute(attributes.fact) + ">" + esc(described.fact) + "</p>" +
        app.renderFacts(described.facts) +
        '<div class="forhaand__andet"></div>' +
        "</div>" +
        (picked(draft, "message") ? '<div class="felt"><p class="ret__label">Din besked</p><p class="forhaand__citat">' + esc(draft.message) + "</p></div>" : "") +
        (draft.note.trim()
          ? '<div class="felt"><p class="ret__label">Hvordan du ved det</p><p class="forhaand__citat">' + esc(draft.note) + "</p></div>"
          : "") +
        '<p class="bidrag-bruger">' + icon("user") + "<span>" + showNameText(draft, person) + "</span></p>" +
        '<div class="bidrag-send bidrag-send--raekke">' +
        '<button type="button" class="knap knap--primaer" data-action="submit">Send til godkendelse</button>' +
        '<button type="button" class="knap knap--sekundaer" data-action="edit-draft">Ret i forslaget</button>' +
        "</div>" +
        (draft.saveError ? '<p class="felt__fejl" role="alert">' + icon("alert") + "<span>" + esc(draft.saveError) + "</span></p>" : ""),
    );

    const preview = app.detailHost.querySelector(".forhaand");
    const other = preview.querySelector(".forhaand__andet");

    result.changes.forEach(function (change) {
      const field = C.field(type, change.attribute);
      const element = elementFor(preview, change.attribute);
      const mark = change.incorrect ? "Fjernes" : change.previous === null ? "Nyt" : "Ændret";
      const before = change.previous === null ? "" : '<p class="forhaand__foer">Før: ' + esc(C.format(field, change.previous)) + "</p>";
      const badge = '<span class="maerke">' + mark + "</span>";

      if (element) {
        element.classList.add("is-aendret");
        element.insertAdjacentHTML("afterbegin", badge);
        element.insertAdjacentHTML("beforeend", before);
      } else {
        // The detail shows some values inside another, the amount in the
        // price; those are listed on their own.
        other.insertAdjacentHTML(
          "beforeend",
          '<div class="detalje__section is-aendret">' + badge + "<h4>" + esc(field.label) + "</h4><p>" +
            esc(change.incorrect ? "Fjernes" : C.format(field, change.value)) + "</p>" + before + "</div>",
        );
      }
    });
  }

  function dataAttribute(attribute) {
    return attribute ? ' data-attribute="' + esc(attribute) + '"' : "";
  }

  async function submit() {
    const place = view.place;
    const draft = draftFor(place);
    const person = session();
    const result = collect(place, draft);
    const record = {
      id: "bidrag-" + crypto.randomUUID(),
      entityId: place.id,
      entityType: entityType(place),
      place: { title: place.title, address: [place.address, place.city].filter(Boolean).join(", ") },
      createdAt: new Date().toISOString(),
      contributor: Object.assign({}, person, { showName: draft.showName }),
      changes: result.changes,
      closure: picked(draft, "closure") ? { value: draft.closure, review: null } : null,
      message: picked(draft, "message") ? { text: draft.message.trim(), review: null } : null,
      photos: draft.photos.map(function (photo) {
        return { id: photo.id, blob: photo.blob, width: photo.width, height: photo.height, review: null };
      }),
      note: draft.note.trim(),
    };

    try {
      await C.save(record);
    } catch (error) {
      draft.saveError = "Forslaget kunne ikke gemmes. Prøv igen.";
      showPreview();

      return;
    }

    discardDraft(place);
    showReceipt(record);
  }

  /* Receipt and own contributions ------------------------------------------ */

  function showReceipt(record) {
    const person = session();

    renderStep(
      "receipt",
      '<div class="kvittering">' +
        '<span class="kvittering__ikon">' + icon("check") + "</span>" +
        '<h3 class="bidrag__titel" tabindex="-1">Tak, ' + esc(firstName(person.name)) + "</h3>" +
        '<p role="status">Dit forslag er sendt til gennemgang hos Aarhus Kommune. Når det er godkendt, vises det på kortet' +
        (record.contributor.showName ? " med dit navn (" + esc(person.displayName) + ")." : ".") +
        "</p>" +
        '<p><span class="status status--pending">' + icon("clock") + esc(C.STATUSES.pending) + "</span></p>" +
        "<p>Du kan følge forslaget under Mine bidrag. Hvis vi ikke kan godkende det, skriver vi hvorfor.</p>" +
        "</div>" +
        '<div class="bidrag-send bidrag-send--raekke">' +
        '<button type="button" class="knap knap--primaer" data-action="to-place">Tilbage til stedet</button>' +
        '<button type="button" class="knap knap--sekundaer" data-action="mine">Se mine bidrag</button>' +
        "</div>" +
        '<p><button type="button" class="link-knap bidrag-mere" data-action="choose">' + icon("plus") + "Tilføj eller ret mere</button></p>" +
        demoNote(
          'Godkend eller afvis forslaget på <a href="./bidrag-gennemgang.html" target="_blank" rel="noopener">gennemgangssiden (åbner i en ny fane)</a>. Kortet her følger med.',
        ),
    );
  }

  function showMine() {
    const person = session();

    if (!person) {
      backToPlace();

      return;
    }

    const own = records.filter(function (record) {
      return record.contributor.subject === person.subject;
    });

    renderStep(
      "mine",
      '<h3 class="bidrag__titel" tabindex="-1">Mine bidrag</h3>' +
        "<p>Her kan du følge dine forslag. Godkendte oplysninger vises på kortet.</p>" +
        (own.length
          ? '<ul class="mine">' + own.map(mineEntry).join("") + "</ul>"
          : '<p class="bidrag-tom">Du har ikke sendt nogen forslag endnu.</p>'),
    );
  }

  function mineEntry(record) {
    const status = C.status(record);
    const lines = record.changes
      .map(function (change) {
        const field = C.field(record.entityType, change.attribute);

        return itemLine(
          field ? field.label : change.attribute,
          change.incorrect ? "Markeret som forkert" : C.format(field, change.value),
          change.review,
        );
      })
      .concat(record.closure ? [itemLine("Stedet", C.CLOSURES[record.closure.value], record.closure.review)] : [])
      .concat(record.message ? [itemLine("Besked", record.message.text, record.message.review)] : [])
      .concat(record.rating ? [itemLine("Vurdering", C.stars(record.rating.stars), record.rating.review)] : [])
      .concat(record.comment ? [itemLine("Kommentar", record.comment.text, record.comment.review)] : [])
      .concat(
        record.photos.map(function (photo, index) {
          return itemLine("Foto " + (index + 1), "", photo.review);
        }),
      );

    return (
      '<li class="mine__bidrag">' +
      '<div class="mine__hoved">' +
      '<button type="button" class="link-knap mine__sted" data-action="open-place" data-entity="' + esc(record.entityId) + '">' +
      esc(record.place.title) + "</button>" +
      statusBadge(status) +
      "</div>" +
      '<p class="mine__meta">' + esc(C.summary(record)) + " · " + esc(C.formatDateTime(record.createdAt)) + "</p>" +
      '<ul class="mine__punkter">' + lines.join("") + "</ul>" +
      "</li>"
    );
  }

  function itemLine(label, value, review) {
    const state = review ? review.status : "pending";

    return (
      "<li><span>" + esc(label) + (value ? ": " + esc(value) : "") + "</span> " +
      '<span class="mine__punkt-status mine__punkt-status--' + state + '">' +
      (state === "approved" ? "Godkendt" : state === "rejected" ? "Ikke godkendt" : "Afventer") +
      "</span>" +
      (review && review.status === "rejected" && review.reason
        ? '<span class="mine__grund">Begrundelse: ' + esc(review.reason) + "</span>"
        : "") +
      "</li>"
    );
  }

  function statusBadge(status) {
    const icons = { pending: "clock", approved: "check", partial: "check", rejected: "alert" };

    return '<span class="status status--' + status + '">' + icon(icons[status]) + esc(C.STATUSES[status]) + "</span>";
  }

  /* Events ----------------------------------------------------------------- */

  function onClick(event) {
    // A pointer on the place's stars goes straight on, also on the star that
    // is already chosen, which fires no change.
    if (event.target.name === "stjerner-sted" && starPointer) {
      starPointer = false;
      startRating(app.selected(), Number(event.target.value));

      return;
    }

    const button = event.target.closest("[data-action]");

    if (!button || button.disabled) {
      return;
    }

    const action = button.dataset.action;
    const place = view ? view.place : app.selected();

    if (action === "choose") {
      if (!view) {
        start(place);
      } else {
        showChooser();
      }
    } else if (action === "pick") {
      // Something already in the draft is found in the form, not added again.
      choose(button.dataset.item);
    } else if (action === "to-form") {
      showForm();
    } else if (action === "unpick") {
      unpick(place, draftFor(place), button.dataset.item);
      showForm({ focus: "bidrag-note" });
    } else if (action === "back") {
      back();
    } else if (action === "close") {
      view = null;
      app.closeDetail();
    } else if (action === "mitid") {
      showMitid();
    } else if (action === "approve-mitid") {
      const chosen = app.detailHost.querySelector('input[name="mitid-person"]:checked');
      const person = DEMO_PEOPLE[Number(chosen ? chosen.value : 0)];

      signIn({
        subject: person.subject,
        name: person.name,
        displayName: shortName(person.name),
        authMethod: "mitid",
        assurance: "substantial",
      });
      if (view.flow === "rating") {
        showRating();
      } else {
        showForm({ focus: view.focus });
      }
    } else if (action === "logout") {
      // Unsent drafts belong to the person who wrote them, not to the next
      // one to log in on this browser.
      signOut();
      Array.from(drafts.keys()).forEach(function (id) {
        discardDraft({ id: id });
      });
      ratingDrafts.clear();
      backToPlace();
    } else if (action === "mine") {
      if (!view) {
        view = { step: null, place: place, focus: null };
      }
      showMine();
    } else if (action === "open-place") {
      view = null;
      app.select(button.dataset.entity);
    } else if (action === "rate") {
      const chosen = app.detailHost.querySelector('input[name="stjerner-sted"]:checked');

      if (chosen) {
        startRating(place, Number(chosen.value));
      }
    } else if (action === "submit-rating") {
      submitRating();
    } else if (action === "to-place") {
      backToPlace();
    } else if (action === "clear") {
      const draft = draftFor(place);

      delete draft.values[button.dataset.attribute];
      delete draft.errors[fieldId(button.dataset.attribute)];
      showForm({ focus: fieldId(button.dataset.attribute) });
    } else if (action === "clear-day") {
      const draft = draftFor(place);

      draft.hours[Number(button.dataset.day)] = { state: "", from: "", to: "" };
      showForm({ focus: fieldId("openingHours") + "-" + DAYS[Number(button.dataset.day)].key + "-open" });
    } else if (action === "copy-weekdays") {
      const draft = draftFor(place);

      for (let i = 1; i <= 4; i++) {
        draft.hours[i] = Object.assign({}, draft.hours[0]);
      }
      showForm({ focus: fieldId("openingHours") });
    } else if (action === "add-photo") {
      app.detailHost.querySelector("#foto-fil").click();
    } else if (action === "remove-photo") {
      const draft = draftFor(place);
      const index = draft.photos.findIndex(function (photo) {
        return photo.id === button.dataset.photo;
      });

      URL.revokeObjectURL(draft.photos[index].url);
      draft.photos.splice(index, 1);
      delete draft.errors["foto-" + button.dataset.photo];
      draft.photoError = "";
      showForm({ focus: "foto-tilfoej" });
    } else if (action === "preview") {
      const draft = draftFor(place);
      const result = collect(place, draft);

      draft.errors = result.errors;
      draft.saveError = "";
      draft.attempted = true;

      const first = Object.keys(result.errors)[0];

      if (first) {
        showForm({ focus: first });
      } else {
        showPreview();
      }
    } else if (action === "edit-draft") {
      showForm();
    } else if (action === "submit") {
      submit();
    }
  }

  /* Correcting starts from the value the place has now. */
  function prefill(place, draft, field) {
    const value = current(place, field.attribute);

    if (C.isEmpty(value)) {
      return;
    }
    if (field.type === "boolean") {
      draft.values[field.attribute] = String(value);
    } else if (field.type === "number") {
      draft.values[field.attribute] = String(value).replace(".", ",");
    } else if (field.type === "address") {
      draft.values[field.attribute] = value;
      draft.addressText[field.attribute] = C.format(field, value);
    } else if (field.type === "openingHours") {
      draft.hours = parseHours(value) || emptyHours();
    } else {
      draft.values[field.attribute] = value;
    }
  }

  function firstControlId(field) {
    if (field.type === "boolean" || (field.type === "choice" && field.options.length <= 3)) {
      return fieldId(field.attribute) + "-0";
    }
    if (field.type === "openingHours") {
      return fieldId(field.attribute);
    }

    return fieldId(field.attribute);
  }

  function onInput(event) {
    if (view && view.step === "rating" && event.target.dataset.ratingComment !== undefined) {
      ratingDrafts.get(view.place.id).comment = event.target.value;

      return;
    }
    if (!view || view.step !== "form") {
      return;
    }

    const target = event.target;
    const draft = draftFor(view.place);

    if (target.dataset.field !== undefined && target.type !== "radio" && target.tagName !== "SELECT") {
      draft.values[target.dataset.field] = target.value;
    } else if (target.dataset.address !== undefined) {
      // Typing after choosing an address un-chooses it.
      delete draft.values[target.dataset.address];
      draft.addressText[target.dataset.address] = target.value;
    } else if (target.dataset.dayFrom !== undefined) {
      draft.hours[Number(target.dataset.dayFrom)].from = target.value;
    } else if (target.dataset.dayTo !== undefined) {
      draft.hours[Number(target.dataset.dayTo)].to = target.value;
    } else if (target.dataset.message !== undefined) {
      draft.message = target.value;
    } else if (target.dataset.note !== undefined) {
      draft.note = target.value;
    }

    updateSendState();
  }

  function onChange(event) {
    const target = event.target;

    // Stars on the place chosen with the keyboard: the arrow keys move the
    // choice, and "Fortsæt" or Enter goes on. A pointer is handled on click.
    if (target.name === "stjerner-sted") {
      const place = app.selected();
      const draft = ratingDrafts.get(place.id) || { stars: 0, comment: "", showName: false };

      draft.stars = Number(target.value);
      ratingDrafts.set(place.id, draft);
      app.detailHost.querySelector('[data-action="rate"]').hidden = false;

      return;
    }

    if (!view) {
      return;
    }

    if (view.step === "rating") {
      const draft = ratingDrafts.get(view.place.id);

      if (target.name === "stjerner-form") {
        draft.stars = Number(target.value);
        target.closest(".stjerner-felt").nextElementSibling.textContent = C.stars(draft.stars) + " af 5.";
      } else if (target.dataset.ratingShowName !== undefined) {
        draft.showName = target.checked;
        app.detailHost.querySelector("#vurdering-vis-navn-tekst").innerHTML = showNameText(draft, session());
      }

      return;
    }

    if (target.id === "foto-fil") {
      if (target.files.length) {
        addPhotos(target.files);
      }

      return;
    }
    if (view.step !== "form") {
      return;
    }

    const place = view.place;
    const draft = draftFor(place);

    if (target.dataset.field !== undefined) {
      const attribute = target.dataset.field;
      const field = C.field(entityType(place), attribute);
      const id = fieldId(attribute);

      draft.values[attribute] = target.value;

      // A field others depend on shows or hides them; the form is drawn
      // again with focus kept on the choice just made.
      const dependants = C.fields(entityType(place)).some(function (candidate) {
        return candidate.when && candidate.when.attribute === attribute;
      });

      if (dependants) {
        delete draft.errors[id];
        showForm({ focus: target.id });

        return;
      }

      // Numbers and text are checked when the user leaves the field, not on
      // every keystroke.
      const parsed = parse(place, draft, field);

      if (parsed.error) {
        draft.errors[id] = parsed.error;
      } else {
        delete draft.errors[id];
      }
      if (field.type === "number" || field.type === "text") {
        refreshError(target, id, draft.errors[id]);
      } else {
        refreshError(app.detailHost.querySelector("#" + CSS.escape(id)), id, draft.errors[id]);
        const clear = app.detailHost.querySelector('[data-action="clear"][data-attribute="' + CSS.escape(attribute) + '"]');

        if (clear) {
          clear.hidden = !target.value;
        }
      }
    } else if (target.dataset.day !== undefined) {
      draft.hours[Number(target.dataset.day)].state = target.value;
      delete draft.errors[fieldId("openingHours")];
      showForm({ focus: target.id });
    } else if (target.dataset.incorrect !== undefined) {
      draft.incorrect[target.dataset.incorrect] = target.checked;
      showForm({ focus: target.id });
    } else if (target.dataset.closure !== undefined) {
      draft.closure = target.value;
      delete draft.errors["bidrag-lukket"];
      refreshError(app.detailHost.querySelector("#bidrag-lukket"), "bidrag-lukket", null);
    } else if (target.dataset.photoConsent !== undefined) {
      const photo = draft.photos.find(function (candidate) {
        return candidate.id === target.dataset.photoConsent;
      });

      photo.consent = target.checked;
      if (target.checked) {
        delete draft.errors["foto-" + photo.id];
        refreshError(target, "foto-" + photo.id, null);
      }
    } else if (target.dataset.showName !== undefined) {
      draft.showName = target.checked;
      app.detailHost.querySelector("#bidrag-vis-navn-tekst").innerHTML = showNameText(draft, session());
    }

    updateSendState();
  }

  /* Shows or removes the error under one control without drawing the form
   * again, so focus and what the user typed stay put. */
  function refreshError(control, id, message) {
    const existing = app.detailHost.querySelector("#" + CSS.escape(id + "-fejl"));
    const described = (control.getAttribute("aria-describedby") || "")
      .split(" ")
      .filter(function (part) {
        return part && part !== id + "-fejl";
      });

    if (existing) {
      existing.remove();
    }

    if (message) {
      const anchor = control.closest(".felt__input") || control.closest(".afkryds") || control.lastElementChild || control;

      anchor.insertAdjacentHTML(
        "afterend",
        '<p class="felt__fejl" id="' + id + '-fejl">' + icon("alert") + "<span>" + esc(message) + "</span></p>",
      );
      described.push(id + "-fejl");
      control.setAttribute("aria-invalid", "true");
    } else {
      control.removeAttribute("aria-invalid");
    }

    if (described.length) {
      control.setAttribute("aria-describedby", described.join(" "));
    } else {
      control.removeAttribute("aria-describedby");
    }
  }

  /* "Se forslaget" waits for something to send, and says so. */
  function updateSendState() {
    const button = app.detailHost.querySelector("#bidrag-videre");

    if (!button) {
      return;
    }

    const ready = hasContent(view.place, draftFor(view.place));

    button.disabled = !ready;
    app.detailHost.querySelector("#bidrag-videre-hjaelp").hidden = ready;

    // The summary counts what is still wrong, and goes when nothing is.
    const box = app.detailHost.querySelector("#bidrag-opsummering");
    const html = summary(draftFor(view.place));

    if (box.innerHTML !== html) {
      box.innerHTML = html;
    }
  }

  /* After a try at going on with errors: how many fields to fix. */
  function summary(draft) {
    const count = Object.keys(draft.errors).length;

    if (!draft.attempted || !count) {
      return "";
    }

    return (
      '<p class="felt__fejl" role="alert">' +
      icon("alert") +
      "<span>Ret " +
      (count === 1 ? "det markerede felt" : "de " + count + " markerede felter") +
      ", før du går videre.</span></p>"
    );
  }

  /* The address field's suggestions come from Adressevælger, as in the map's
   * search; choosing one stores it as the PublicToilet address. */
  function bindAddressFields(place, draft) {
    app.detailHost.querySelectorAll("[data-address]").forEach(function (input) {
      const attribute = input.dataset.address;
      const listbox = document.getElementById(input.getAttribute("aria-controls"));
      const unavailable = document.getElementById(input.id + "-svarer-ikke");

      window.ADRESSEVAELGER.combobox(input, listbox, {
        onChoose: function (hit) {
          draft.values[attribute] = window.ADRESSEVAELGER.postalAddress(hit);
          draft.addressText[attribute] = hit.titel;
          input.value = hit.titel;
          delete draft.errors[input.id];
          refreshError(input, input.id, null);
          updateSendState();
        },
        onError: function (failed) {
          unavailable.hidden = !failed;
        },
      });
    });
  }

  return { plugin: plugin };
})();
