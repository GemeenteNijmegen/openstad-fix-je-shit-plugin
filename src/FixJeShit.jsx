import React, { useState, useRef, useMemo } from "react";
import { createPortal } from "react-dom";

/*
  Fix je Shit — Phase 1 standalone prototype
  --------------------------------------------------
  Goal: turn the Phase 0 spec into a working in-browser prototype.
  No Docker; once finalized it will be ported to packages/fix-je-shit as an IIFE.
  Convention: code/keys in English, UI text in Dutch.
  All design tokens live in TOKENS — update here once Figma dev-mode values arrive.
*/

const TOKENS = {
  navy: "#2A2E65", // primary brand navy (logo + headings)
  navyText: "#2A2E65",
  red: "#861629", // logo maroon + "Nog niet"
  green: "#1a7a3c",
  greenRing: "#2ea043",
  amber: "#9a5a00",
  amberBg: "#fdf3e3",
  pageBg: "#e6e7f4", // light lilac-grey background matching the logo navy
  cardBg: "#ffffff",
  cardSub: "#f4f4f7",
  pill: "#e8e8f3",
  border: "#e2e2ee",
  textMuted: "#5b5b72",
  radiusCard: 24,
  radiusBtn: 28,
};

// Visually hidden but announced by screen readers.
const SR_ONLY = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};

// Render text but wrap any emoji in aria-hidden so screen readers skip them
// (kept visible for sighted users). Handles single-codepoint emoji incl. VS16.
function hideEmoji(text) {
  if (typeof text !== "string") return text;
  const parts = text.split(/(\p{Extended_Pictographic}\uFE0F?)/u);
  return parts.map((part, i) =>
    /\p{Extended_Pictographic}/u.test(part) ? (
      <span key={i} aria-hidden="true">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

/* ---- Question schema (Phase 0 §3) ---------------------------------
   category: shown as a pill in the quiz (result category is separate, in RESULT_CATEGORIES)
   scored:   if true it counts toward the score; if false it's a status/branching question
   answers:  value + label + status (ok | gap | context)
   branch:   (value) => question ids to skip (branching)
------------------------------------------------------------------- */
const QUESTIONS = [
  {
    id: "digid",
    category: "DigiD",
    scored: true,
    scoreOn: "ja",
    availableUnder18: true,
    title: "Heb je al een DigiD aangevraagd?",
    subtitle:
      "Veel overheidszaken kan je online regelen. Hiervoor moet je inloggen met jouw DigiD. Dit is jouw persoonlijke digitale identiteit.",
    answers: [
      { value: "nee", label: "Nog niet", tone: "neg", status: "gap" },
      { value: "ja", label: "Ja, geregeld", tone: "pos", status: "ok" },
    ],
  },
  {
    id: "zorgverzekering",
    category: "Zorgverzekering",
    scored: true,
    scoreOn: "ja",
    title: "Heb je een zorgverzekering?",
    subtitle:
      "Vanaf je 18e ben je verplicht om een eigen zorgverzekering af te sluiten. Je kan op de polis van je ouders blijven, of zelf een andere verzekering afsluiten.",
    answers: [
      { value: "nee", label: "Nog niet", tone: "neg", status: "gap" },
      { value: "ja", label: "Ja, geregeld", tone: "pos", status: "ok" },
    ],
    // nog geen zorgverzekering → skip zorgtoeslag (eerst een eigen polis regelen)
    branch: (value) => (value === "nee" ? ["zorgtoeslag"] : []),
  },
  {
    id: "zorgtoeslag",
    category: "Zorgverzekering",
    scored: true,
    scoreOn: "ja",
    title: "Heb je al zorgtoeslag aangevraagd?",
    subtitle:
      " Zorgtoeslag is geld van de overheid dat helpt om je zorgverzekering te betalen",
    answers: [
      { value: "nee", label: "Nog niet", tone: "neg", status: "gap" },
      { value: "ja", label: "Ja, geregeld", tone: "pos", status: "ok" },
    ],
  },
  {
    id: "huurwoning",
    category: "Wonen",
    scored: true,
    scoreOn: "ja",
    title: "Heb jij je ingeschreven voor een kamer of sociale huurwoning?",
    subtitle: "Hoe eerder jij je inschrijft, des te meer kans op een woning",
    answers: [
      { value: "nee", label: "Nog niet", tone: "neg", status: "gap" },
      { value: "ja", label: "Ja, geregeld", tone: "pos", status: "ok" },
    ],
  },
  {
    id: "op_jezelf",
    category: "Wonen",
    scored: false,
    title: "Woon je op jezelf?",
    subtitle: "Op jezelf wonen betekent meer zelf regelen.",
    answers: [
      { value: "nee", label: "Nee", tone: "neutral", status: "context" },
      { value: "ja", label: "Ja", tone: "neutral", status: "context" },
    ],
    // op_jezelf = nee → skip the inboedel question
    branch: (value) => (value === "nee" ? ["inboedel"] : []),
  },
  {
    id: "inboedel",
    category: "Wonen",
    scored: true,
    scoreOn: "ja",
    title: "Heb je een inboedelverzekering?",
    subtitle:
      "Met een inboedelverzekering zijn jouw spullen verzekerd bij diefstal, brand of schade.",
    answers: [
      { value: "nee", label: "Nog niet", tone: "neg", status: "gap" },
      { value: "ja", label: "Ja, geregeld", tone: "pos", status: "ok" },
    ],
  },
  {
    id: "werk",
    category: "Werk & geld",
    scored: false, // status/opportunity — does not affect the score
    availableUnder18: true,
    title: "Werk je wel eens of heb je een bijbaan?",
    //subtitle:
    //"Als je werkt, krijg je te maken met belasting en andere regelzaken.",
    answers: [
      { value: "nee", label: "Nee", tone: "neutral", status: "context" },
      { value: "ja", label: "Ja", tone: "neutral", status: "gap" }, // gap = triggers a recommendation, not a point
    ],
  },
  {
    id: "geldzorgen",
    category: "Werk & geld",
    scored: true,
    scoreOn: "nee",
    availableUnder18: true,
    title:
      "Maak je je weleens zorgen over geld of heb je rekeningen die je niet kunt betalen?",
    subtitle: "Je bent niet de enige. We helpen je graag.",
    answers: [
      { value: "nee", label: "Nee", tone: "neutral", status: "ok" },
      { value: "ja", label: "Ja", tone: "neutral", status: "gap" },
    ],
  },
  {
    id: "school",
    category: "Over jou",
    scored: true,
    scoreOn: "nee",
    title: "Zit je nog op de middelbare school?",
    subtitle:
      "Check bij DUO of je recht hebt op een tegemoetkoming scholieren.",
    answers: [
      { value: "nee", label: "Nee", tone: "neutral", status: "ok" },
      { value: "ja", label: "Ja", tone: "neutral", status: "gap" },
    ],
  },
  {
    id: "ouders_gescheiden",
    category: "Over jou",
    scored: true,
    scoreOn: "nee",
    title: "Zijn jouw ouders gescheiden?",
    //subtitle: "Dit kan invloed hebben op toeslagen en financiële regelingen.",
    answers: [
      { value: "nee", label: "Nee", tone: "neutral", status: "ok" },
      { value: "ja", label: "Ja", tone: "neutral", status: "gap" },
    ],
  },
  {
    id: "donorregister",
    category: "Over jou",
    scored: true,
    scoreOn: "ja",
    title: "Heb je jouw keuze in het Donorregister ingevuld?",
    subtitle: "Als je niets doorgeeft ben je automatisch donor.",
    answers: [
      { value: "nee", label: "Nee", tone: "neutral", status: "gap" },
      { value: "ja", label: "Ja", tone: "neutral", status: "ok" },
    ],
  },
];

/* ---- Recommendation cards (Phase 0 §7) — gap answer → card ---------------- */
/* Recommendation & help-card icons (design assets, embedded as data URIs) */
const ICON_BELASTING =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADoAAAA6CAYAAADhu0ooAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAOdEVYdFNvZnR3YXJlAEZpZ21hnrGWYwAACVJJREFUeAHdWw1wFOUZfr7dvd/cxdxdAsFScgGjFis5BIZORbi0VihYfhxm2kE7BEfpONASqoOl045B+6NDLVS0DI4tYbAzVItAOxaKZQgz2mktDqEgLRhIUCBiwuX/5/Zud/t+313Chbvk9vIjSR44bm/33d3v+d7f792FYRhQU2PkuFzRACQjwCAVM8YCtDuHPv4bRGsNGLX03WQYxknoqGxrU6oKC1kThhgMQwRBLjtSypi0hKGH2IBA5Ct1Xd+lRbTKCRMctRgCDJpofX0kSBorZRJbgkGQ6xMGKlRV3TRYwgMmWldn+C02bSdpL4jPA4MknDFRbqLZ2fo6OrMMw6HBdDBQ7vPJm5AhMiLKtWi1GfvobgHcXNSqYbUkE+1KZgUbGqIrrTb9xAggyUETbj1Rf00tM3uCKaLXrmnPULCpwM0w1b6RIzF5Cx+bGeG0pisuxFCOkQwTftsv0VFBshtpyPZJtL5eLZNkeQtGESRmlHo8yq5Ux1ISjUVXHnhGlE+aQRNF4+mponHKYEQp5ChGH0mOHJvNtq+x0UgaexLRWBQz/BiloDo5ENWjSWmnl+nGTbYGox9JJtxLoxaLVo6xAW7COxN39Gh0DGmzB7qml+TlWSr5do9Gx5A2eyBJ0srubaHRsajNOJokJhV6PKxJaFS2aEGMTeRE9Ugp31D4P5KElRhhoFYKmptbcOFCDT48U4NPrzYgFGpFW0cEbW2dUMMapcI22O0WHHhrc5/XkZnCOx9bFZ5cdUMPYogRjUZpoM0Ih1UoFgVWiwWKIsMwgEuXr+Ds2VpE1AguXbmGlpZWXKlrpoF3oL1TFyS4nKarFFBUiOzId6SaEEPvdxw8r3KOCg0oIMn9r9ZO/ecMqi9cxIkT1bgWakdzSxhqJAoHzWZLq4qopkOL8sHJCKtRfnX+l7SixjbitwSTaeAaGOOyWmxvHwT6AjXfIMlWyLKNtKlg0kRXulNyOEeF4m4wneSasu00IE7AIJIdaGvvBJ9Ibl4xJtQ5khjd2Ir88R54vG44bBZ4vXnw+dxwu53Ips+4cTnw3JKFrdv2kwZDsFrlVFTiZCzkUvwjwemQ6bpO3F6Uj9kzp+Lu4qnw5GRQoVLbVWEGtSbTrko1dHWpNDALfrjuIXzv8YVkhgrNKhPmaBZcewf/dhynTtfgJxtX4KVXDsDptCGRZEnwTixbPA+TJxciK8tJac8ijrS2ttLvLLqGTvdVkAlosopZQyh6NF0nb8GiMkyffhv2vnEMzCLh3cotuG3KrXRD050YaGTeVz9rwrTiR1E8rQg7Xl2P4P0bhKYTcf/XpsHndeFcdR3Jt5H1aOSzOrlHBA6HGwf/XI5MQXqsUmCwwnQazfW58N57p3H50h7keBdj5qzV+OTiG8IkzZDlJDkKp6wgQ5dw5O+b0djYSgQigLu37JGjpxBz22TfVck3BwJDtF0YCtIJerxOiqI6bOR3H57eCQuZcP6tywVJM8GEy+WOX0YTY0Pt+d2CeFaWHZ1dkSRZRgGLBxqr1QW7g3za48WEfB9K5t2FJ9c9kHHwisNvythdNCgeZTkKJo3Hob9uxqJvbSQNPYya838QN6dufcpz+bFlyzfB6XZjz+sbRbDiAUZYgqbdIM3wxOr5eHBRkCbFTakpjI6OTiI7+KWxKaJOhxXtHV1imwegmTOKcPDt5zF/wQbMnL0Gx//1SkqyfN/6p3bgxMkLFFRk3HfvXb004nTZb7iTgR2vvYPXdr4r5Ax66qTIDuz9I/lythuDgaloUlCQj85O9fpJlEoCxZPx1t5n0RBqQ+Ce1YJkIgm+vem51/G73x/Cb7d9H40NTfjKvWt7Xdd9QyDiiEZV0mQzVLWFCoo2sX3uXDUGC4nGczGdkN//hdgMJxDhaeWBBT/Aiy88jo+qL2Fy0UqKkF09x59Yuw2/+vWb2L1rA745fwYO7HsWZ6s/xaHDx+P5l1o2VkVMmiwKADtVUE7alw2Xy0v3zMfCBQH89MfLEQjcjUGiViFFNNJGvwFpyuQC2Kx2oVWe93TdwEPffg6zZk3H0iVfRXPoL/hiwXcw0f8wlWSxskiPhvHO4Rcxe9Ydwifn3jcNjz26AIuXPgO1420xadxSrlzpwJ/2/Ehck+dNh8PRp78PFKSii5J4AJsGPp8Xt1Al8vEnn1H80PD+v/+HA3uP4cjhF4RG+Kfu8pt4+aU1KJiYh0dWfB31V/cJkt3ph8ts/uVj8HqyUHRHqSAzd86XiWCUrMOCvLxcmkTnkJOMo0kih69KJ2W328Ugjn/wEQ1cxpzgk3h64yMiwPCBcY1xfJcInj75Kra/vJbqYGtSjuUme6F6N5V/DVi5ajOmfqkAkUgnqs8P71KYlEkFg86qYKKKUxQJdVdD+Mb8pymIOPD8z1f1K59KM3xCspx2fPD+dswpeQoSX83Qn+rqjzHjnmIMGyRUsvgyjU9pv8nqwaUbqZoJiXy6cP4snD5zkbr5TeigABSmfV0dqhg0J5NIUSat8wVAV1dY/I4FNIZJk8YJN+AF/Nw5d+IXP1uHYePJJI/C2wyhkF5Fgwz2J+z12BGNOEVh9o9//peChhWF/nGU35xwu6xUn2YRGV78RwQBTb++TuSFeHt7lCoqma7jAq/T7TYrrW5yhKXcXlSI4QLxOsY5isnnzxn5IziMQRi6tio311ohooUiWSroa8hfeRkJkGWtkn8Loly15DsHMNbAUOHxxLr1PfHf0I0KjDFIUDdd346Dd7RpAV6JsYIEbXL0yuiU+3hyHBO+mqjN2O8EkK/WUk79DUY7aOGUqE2OpPKFFxAUmI4aI+M1m4xBhGq9XjkpMSetR0VyZWwZRqEJE0kau1qS6ljKhTc3YYrC6zHKYKQw2W702WHIzVUquK1jtIDG6vPJW/s6bOaFqnKSMvV21k1DjGR5fyKmVrkjmqwJkhyml/NEtixOdkS8lsMDD7Vf1gsXMydvHpR6/PHU48dNBFVwVYyFl/UVeFLB/MMTxKKx1ysV3qwgxbXI703pryQTkvFzBwauXU3Xyummn8vTcr6AllmkNFOC3Rh0y204CXMNGgz7dei78jyx12gGca2hgSCsaUFyhlLyoXkYIESQgXGSGfp+ehBcwSs1DAGGpYnK6+UoogF6dBLs/s89RN6P5EY5f0rAF/1VjNquusSoLalUDRW5RPwfBHHM7NGX5pgAAAAASUVORK5CYII=";
const ICON_STUDIEFIN =
  "data:image/png;base64,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";
const ICON_GELDZAKEN =
  "data:image/png;base64,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";
const ICON_STUDIETOESLAG =
  "data:image/png;base64,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";
const ICON_INFO_JONGEREN =
  "data:image/png;base64,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";

/* New design pictos: card icons */
const ICON_ZORGTOESLAG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHQAAAB0CAMAAABjROYVAAAA/1BMVEXZ6fwAAAAoLWX9/f0tM2vO2OtRV4aPl7cdImGvt9BESXxvdZzm5uxyeqLHyNY8QnalrciEiqxkapRbYpAcIV0SF1Sbpse2wty8yeJ7gqikpr2TnsEgJV7AzebS0t0IDk1GTYGdoLlLUH4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAk1QlmAAAAQHRSTlP/AP///////////////////////////////////////////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAk+OQTgAABAFJREFUeNrl2wtzoyAQAOCNLiDgA9RoTNLH3f//kQeJVq9Neooic1Nm2k47nXxdcDdQVzgsHvBpOLzCKs9Rhg3AxTBsJS5xYUtyLgubijNd2JycwYIP818q+CD/xYIf8nsWvJnfqODPfK6CP/I5C17NJyr4NR+r4Nl8qIJv85EK3s0HKvg3v6qwg/lFhT3MzyrsYn5SYR/zbzU4CrCTCnuZUxV2MydqWBRgP3UdSvjJfDq5ok4mF4iXViA9LVNhTZwFYoSN+RBkkboGVcaMImFQbBxQt+uCW/MGI1+0rGtQqAxIC2NmsB9KzMy2JUYMHFBHUvWRIm2Wqc7oheJ9OW/rKrKGLEMdyJZacUBvbsFmq24oEbcwsRfvNl78osrmJgpaVSIaB5L5qMPsMqxYo5isKE5MTWaG6oaSE2lKtFOM+DHHqMArCkrcLYzq43FAqV/UFMC7eUXJWDGoL7NRl0BpH+eVpjHn9Hqf4bll3w3l/TJeMSU4Tu/cEuyGdsOCsri8TpK1IB5R2ofG4zgl+aRCcH8oGZiapDgtDshmog7jNNTbcxyr869iRDt/O8l2QDsSs0xPpjfzh/LBeOti/fZ23AU9jfPJY3I+V0Oe+kShGGdU5mla1gOqPaJ6zM26nl69apvXJ61irMtklulm3MdLHKHxbRzLLcCmoyaU5Paaifny/rETYpN3tEHfIGFeNI0S83Yl9ZnzPM+VNvs+84PsXnUIM5sGHEaE75WeHGiIIyoRqeZpPBnpK6OYRLTjpJ/5C2Ps0nDe3pUXzrKK0kwyZzSPHwy72U1qs1tpP0XTMmn+IrMIdt6pY6glpvHjQbgUBhbycvo4pmbULrrIFM9J+ioi7oZSJPHzQc7mNJFEFTMh8UzYxS7Va78KGbpGSp9GOoycmfAwq4wodD78di4xmX1IXo7agJnZ96LMx+9/R4lgzikzC41jdpTD76VnG3mpZkzt4Sn6NDxBS82UyV3OaF33YXJps4nNmdjDN6iWJRWFGYJm50n+pGZbf+xHLbj9UStN4Si6du3GzCRdHWHxTqmpRKYUFiUb4TTnv3SnGSf9wiYo52fJc5RXl5aQe+khnJU2LQT7ss6pKs20Vs2SHFmwMTuZ00tidyiT8arR5svCDFl2rCC6SKIyn16tUbm4+Cw+y5CG2ms0J7myV6uYe+2sPUApW4JMDawLqZyqndup7eWSlZJx1zdN5390rPv/689CDzubAdHDvuaPQw+7mkHRw57m/3gHai36c+4qhrlpG+b29A+6+x+muSJMG0mYhpkwrUFhmqDCtHuFaWwL08IXplkxTFtmmAbUQK22YZqKw7RPB2oUD9QSH6b5P9BjDqEe6Aj06Eqoh3Q2fBzpD09XMPEsKwczAAAAAElFTkSuQmCC";
const ICON_HUURWONING =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHQAAAB0CAMAAABjROYVAAAA/1BMVEXZ6fwAAAApLmUsMWrJ2O6pttO6yOGKlrpkbZlPVod5hKtxeqSYpMVCSXxcZJKCjLI7QXa1w91pcp1HToCgrsySncAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACUUzNbAAAAQHRSTlP/AP//////////////////////////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAZNlZNwAAA0VJREFUeNrl29uyqyAMANBIQEWtt+7+/68enV7EipJwKQ+Hpz17qmuiCAEjFOwGX83jDEGepwwRQDYMsUSOCzFJKgtRRaIL0UkCCylMlwopSBcLachrFpKZFyqkM89VSEees5DUPFEhrWlXIbFpVSG1aVMhuWlRIb15VOEH5kGFX5jfKvzE/FLhN+ZezY7yztJV3ir4mg/EzlcFT3NAgegbqyfaIAohUAWiHqYQo/RSvdDHyxTYB6GcY9WLXNXKRwW+KUexoV63lY9KvQW6spMvyjnuy8SbZKtstMUdurBapkabL3KNtfdC6cdUeEAXtWWqPFRZzFUd+Cj5gNJGch9XJirv4lTtUqH9Gcl6XJ8od5S3o5oRKh3trsxFbROg0yXJua10dOlErka9rStK+2WN6FTvxPGQilZukj4eElFFiJM+HtJQeRO0RhuZaGiPVJTUhUkXd6Ca/Kz0tP0hAxW8ROJ8auGYiHMEk9yJPmqEUAdWoKtahqMNG+3C0ZprYhOOai4qdARUcNstHL2x0TG4+5qrpfPbuF9phKP7860AHsj9P6Oi64n3wPLnqPu5bdt5HiOiRn6te637um2G6tm5sJZyO/+M8dBt1W3MH89ndz9l1zFR26T1inS2okh4ZArXvHZM9l73+SRSN+rMHDrLVUuObmngeECbH6DfPToduk2nBvo6+2DvvSMBLWjTqRGAA3U9MgUD1Qe0SoV+dnCwvkaN3HgKRecP2l6jxryrCGhBWa2ZWUh5TIZkOVJRwp7D+6qZ29hvtFXqUQ1D09R6RHJmRkLxDN3mUuSkg4TNK43HpVF5yMUYSzfKjpn+xPR3igovtCAsKoyZrQxIfAseOv0OvbPR68tL2U43It3WRZMj0iFwD39Lew1URUILZwYaBaW9DJK2uUM57ukQ+AbKC63IaHGCPse4JZWX1jdQnyHwMx6eb+sUDPTVpLndYjRjuYHPtY6io3a1W5Ypdd33vfHEl8/Fxdq6TqmynNS7TWWpJpcZ8Hqa2/77t/95iivylJHkKZjJUxqUpwgqT7lXnsK2PCV8eYoV85Rl5ilAzVRqm6eoOE/5dKZC8Uwl8XmK/zN95pDrg45Mn67k+kgn4udI/wA1HShJQue7TQAAAABJRU5ErkJggg==";
const ICON_VERZEKEREN =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHQAAAB0CAMAAABjROYVAAAA/1BMVEXZ6fwAAAApLmUsMWrI1+1PV4ipttOLl7qBjLJDSX2YpMWzwdy7yuM7QXZweqN5g6tia5dbZJJocZ1IToGTnsChrszAzuYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACdSPwkAAAAQHRSTlP/AP///////////////////////////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAXDyq8gAAA5VJREFUeNrl29m2qyAMANDUgPPY4fz/p15UHAq0TSiUh+vb6VqnuwQSUSNc2AcYh8c3fOV5yhAAZMMQSuS4EJKkshBUJLoQnCSwEMP8pEIM8hMLccj3LEQz36gQz3ytQjzyNQtRzRcqxDXdKkQ2nSrENl0qRDcdKsQ3bRV+YFoq/MI0VfiJaajwG/NZTY7S/rsYy/zvOxW4Zo3zIZUsvFXgxrZXZJZli3wVfiobzRdzORCXMLdD3Xii5N/bDNWGFssHUg26m8q8JavgsXIbPVa5xVuH+zYwUdbkyHWg4znci9zTVPDJ0FE7YlnN2THHFS3AXugVjzkVuJOoJ5mIgh+6TOq0/QKRN8QV7IXq8GY4KwUeP+An6LDHF3Muyi2j0zaP3Zqn9IGuqhcq97VTr/ElLCET5ZrbglUpMlehFnX2kFUfNH8yxaRyZYTYqF6veJuHJ5YpvXNR9ul4XKutnM22mv+grl2teqAPnZizmXdrpNvI6BrcrDoX3shoM52cfK+7XJSVLP2+b8DrGeXMKbBQUR5blXV0cht2HwvNbydyHep+MkURBy2fyPUcI/btUh8FHUxz2a7sAV+qMBklJ4qNquXTHvvRGkIfwiJnZ9o3EewVTNvXZy71cWRNhpUIa7Zucz6LyiNzx7CoY0b1bkVIPM9xyGN0mqUKgTyXCxkUrVxmMZ9k0MjcuFM6mzUac1wGRHOHWbtq1BQQrW0zB3G1x18FXbzWtwtVF220C4iW1ver2SscE13FRTshHMVYxq0Naqi9+WnY1euKJJ7KbpQ8rd31yCwZSJ7Si1+eqliaAUAcqCQFbZznmMJcSuRrVBLqPoUX+yXjlqUiJAqVMz2MTCJvzoiotIeKzd0zukC8rOjt6jA8jM/IlYF6LWOVJKxq62fcA6NWHcCxs5JUBEat5WuHm5qkGr34rSQTpQ+Uig74QeUMlIo+Po5UMNGLZ00ytmnh75i9n1TGjoxzQ7J8jzYck4w2+G7lDhAFfRdfznaXdzs9f4liJ3gm4x7+LXvBsq78mY9ICtQPvEzzyjU5D4Oaey+7FT7VXn5w2U+gRF4rOUP0utXg/YBvlpu6n7RML0XfPFU8yYOKNuumlfdD22e59TE9Hk/7Hv/90/80zRVp2kjSNMykaQ1K0wSVpt0rTWNbmha+NM2Kadoy0zSgJmq1TdNUnKZ9OlGjeKKW+DTN/4lec0j1QkeiV1dSvaQT8HWkf3bVJClp0GXYAAAAAElFTkSuQmCC";
const ICON_DONOR =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHQAAAB0CAMAAABjROYVAAAA/1BMVEXZ6fwAAAAoLWX9/f0uM2zN1+kdI2FSWIaQl7euuNJDSHpuc5rn5+1lapRbY5CCia1ye6R5g6q7yeKlrMfGx9Y8QncdI16Zpca3wtykpr0QFVNHTYCTnsEhJl/BzebS095LUH6foboAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsWUf/AAAAQHRSTlP/AP//////////////////////////////////////////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAApsF5qgAAA3tJREFUeNrl29uaojAMAOBQU2ipnEE8zc7u+7/kpngYRHBopfTCXKHfjL9Jaa0SIDAOGITFK7zlWcqwAGgMw1KiiQtLknNZWFSc6cLi5AwWXJi/qeCC/I0FN+RrFpyZL1RwZ06r4I6cZsGpOaGCW3NcBcfmqAquzTEVnJsjKrg3n1VYwXxSYQ1zqMIq5kCFdcxH1TsKsJIKa5l9FVYze6pfFGA91SsKsKIKdqYsCsGvx6XIs72RaocWqEP0jjNz1NDMNMMYKjpOkekHeDZQbdBSixSIBajrMUPuFs1vEENxO2IzC/yDGlb3xJ4DMZpfX7CpLhsLg/qCeaJyHGX72alaoOeJTKVLVEyglQlquhq172UKVujUmJYuUY6jasxdonrlG5mnORig5h9QcnRIy9n/b4VC8pwqLcOOUY72I2qN0lTFwYhW4BwdnEvYfbIaoHYxWPRNivtGPCxLsxejdyP7+SS/bpbWiPv+wWS2mEyRLobPqutOKV9akyJPo7jRu784KiR/WiNwWZPLLMVdyDRHEbOQjlPBH3Nd1mzjXYhxfqj55hKUdYJhiHkvX/U0nlzKfWmNJqgq2AxiW6mY7Sjf2xzpv35ZZWnDGBUnbq3R7WY0pNKVblTbB3mVn6gMrIlSpWgDbplsinwzFfyQEMxO1zPrD9WdHsbJgXdvdBvP3RkOI3qB6qhFhOEuLrjUIkaivr2jDJntzI2mytsbYalPX8oxPdz/lt5C2JzBHaoj28Xi+569asIwEvar/wtU1vwyeJttnRz/3coqaJyb/K21n8YUalkJip+52sX38Xj8ohUjiWI8HqPtRaQRRiVnJhlMonpBD7tgGCeivmdeH7LkL7IvelpV3eyNaGDnl3V656DwlBSZaKuqPReX9TA59Cu+3V4e7RWSmBnMzBfblcepVrb5idbFbDCPeEYDiYYDabRHKrOGxq3uTZlEJ9manq2GGzM6X0ipurrW9BYoSYu1x/xrRZVSPVOV6rKmZ5spafVdZl+c2I41yfmP7c9mYPUL3cjmxT365g+EEKytBp+GBiubHtFgXfPj0GBV0yvq5RLJB12B+qCrin4u2vq5PP1BV//9NFf4aSPx0zDjpzXITxOUn3YvP41tflr4/DQr+mnL9NOA6qnV1k9TsZ/2aU+N4p5a4v00/3u6zcHXDR2ebl3xdZPOgrcj/QcCrSkfmJKNvgAAAABJRU5ErkJggg==";
const ICON_ALIMENTATIE =
  "data:image/png;base64,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";
const ICON_RISICO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEgAAABICAMAAABiM0N1AAAAflBMVEUeImLY2eNjZo4pLmeTlbEpL2exs8cAAP8gJV4AYWFITHsxNj88QXN/f399gKEAAKpqAGpVVaoAfwB/fwAAAAD+/v4oLWQsMWgcIVsAAH9VVVUoLGQoLWQYHlkpLmZlaJAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD5HjAIAAAAIHRSTlMP//+i/2H/Af8C/wT/Av8DAgMCAgD//P7/AgMvTv/S/02vkWwAAAOBSURBVHja1VjZkqMwDBT3lcyxCzYQjv//yxUyNjYIAsy+jGpSQwHutKVW2w6U/yngNwI1BUCb/Bgoa9z/d4EyfKXrugjfa38AhCy6QEgMEbx+xAgCxKCQMiq/bwIlX4gjTCDS5z2gZ2njEFJ2B6gtOwcH41U2N4AaGKTKDmV7uhrgBlBbRmq06Ou6T9V1UBZXgZIEFEydh3Ec+rUgqGhvBOwTmjMdVhSxnJBwcheBmhJUfuNqDk9Xrr0EBERI9mFlIq6JIiTJBaCsBBqVV1aEExLm+/MC0LMlQnVsA1U+ceLFxAN9Uell7Ts4Kk1IKTsNlMAwDUk9F6j66BUlOAnU8oSQ0qQBpHQSqFFaFJIIebE/jn5s57tjhsGuFufSx7KmyNU0c+wVtuWA0+KLCD2moWE/N22t+MUzpewEkK1FTwjtkLM2faL0N3kPhJmmivmq4NqSZB0u+mYaBXZsaNaiZ6zNiJNUOcDzHZDyRVmPapjlkZ7VctvCAa9FMyxPzdw8q1GwcNkx0LfSoun6UbW8ztl+4eBIi6YpXJlT4YJjoHZtQ6EGspwprpmOA0aL0rKhWE/NdpRcbCkBp0VrkLcu2kLT9SV40/XepmhTPBSlXSC9JNpjdNFc0yVKYCPBOxtSQjICNZTIKlseaNaiM4lZSM5ywlKCDaHVEGX462WAUudQgk3pHxXz3W7eLEoMUFtyK5AWkvS4BcVyE1gR2hg+OZJ0V8plyrBlNGtxswJ5Um6LxlAC3obsSvdTBT4290dlcFtGWy3OX+2LVPjMfaE8t3CA+NLrIZ7H3VYGVyQO0NqGXKAw5O5rg2ssoGK7G7IkI/o+jZkHc5/AApSp0qc5ywd3j/wj7SZ/DNCT16LTbMzknD4B+rwEX3plh6wg16IEEnWwU3pi1OPKv1POdFEAHOyG9ARwwx7yz/xFlHCkxcPqr1ZdWI4Ke28fhE43bgTA7MzFDSBamNR6AobQXh4OQx91YAIyp7vrlGbXw3QnUGgg7MDQu5wiqQ+EFiM8UT1G34nRDfehn5t9Ie4D8NQULbsyUZ+OFMPsCydGZTbLSCzHzrOhRw2ko8n114fga0HODXTGG24iKWK0mwByEYgGsc98JwYVQbQY2wQ4/ZTiRBR13ev1AvrDD6grWAf69GK1SXb/F6gmWy1HBeEXFC1G1mYYdLNxI0mYY+2v/I3tXPwD4x2Pz4Td5sAAAAAASUVORK5CYII=";

const RECOMMENDATIONS = {
  digid: {
    title: "DigiD aanvragen",
    body: "Regel dit via digid.nl. Je hebt het nodig voor bijna alle online regelzaken.",
    href: "https://www.digid.nl/aanvragen-en-activeren/digid-aanvragen/",
    priority: true,
    icon: ICON_ZORGTOESLAG,
    waarom:
      "Met DigiD log je in bij de overheid. Zonder DigiD kun je veel zaken niet online regelen, zoals toeslagen of studiefinanciering.",
  },
  zorgverzekering: {
    title: "Zorgverzekering afsluiten",
    body: "Vanaf je 18e ben je verplicht om een eigen zorgverzekering af te sluiten. Je kan op de polis van je ouders blijven, of zelf een andere verzekering afsluiten.",
    href: "https://www.consumentenbond.nl/zorgverzekering",
    priority: true,
    icon: ICON_ZORGTOESLAG,
    waarom:
      "Vanaf 18 jaar is een eigen zorgverzekering verplicht. Zo ben je verzekerd voor zorgkosten, zoals de dokter of medicijnen.",
  },
  zorgtoeslag: {
    title: "Zorgtoeslag aanvragen",
    body: "Zorgtoeslag is geld van de overheid dat helpt om je zorgverzekering te betalen. Laat geen geld liggen en vraag het aan.",
    href: "https://www.toeslagen.nl/",
    icon: ICON_ZORGTOESLAG,
    //waarom:
    //  " Zorgtoeslag is geld van de overheid dat helpt om je zorgverzekering te betalen. Hoe minder je verdient, hoe meer zorgtoeslag je meestal krijgt.",
  },
  huurwoning: {
    title: "Inschrijven voor een kamer of sociale huurwoning",
    body: "Hoe eerder jij je inschrijft, des te meer kans op een woning.",
    href: "https://www.entree.nu/",
    icon: ICON_HUURWONING,
    waarom:
      "Er zijn lange wachtlijsten bij de woningcorporaties. Hoe eerder je je inschrijft, hoe meer kans je later maakt op een woning. Soms gaat een woning via loting.",
  },
  inboedel: {
    title: "Shit happens, zorg dat je verzekerd bent.",
    body: "Denk aan een inboedel- en aansprakelijkheidsverzekering.",
    href: "",
    icon: ICON_VERZEKEREN,
    waarom:
      "Met een inboedelverzekering zijn jouw spullen verzekerd bij diefstal, brand of schade. Met een aansprakelijkheidsverzekering ben je verzekerd als jij zorgt voor schade bij een ander. ",
  },
  werk: {
    title: " Werk je? Doe belastingaangifte!",
    body: "Heb je een bijbaan? Dan kan je soms geld terugkrijgen via de Belastingdienst.",
    href: "https://www.belastingdienst.nl/",
    optional: true,
    icon: ICON_BELASTING,
    waarom:
      "Werk je naast school of studie? Dan betaal je soms te veel belasting. Die kan je terugvragen bij de Belastingdienst.",
  },
  geldzorgen: {
    title: "Hulp bij geldzaken",
    body: "De gemeente helpt gratis bij geldzorgen of schulden.",
    href: "https://www.bindkracht10.nl/projecten/financieel-experts-jongeren/",
    priority: true,
    icon: ICON_GELDZAKEN,
    waarom:
      "Geldzorgen lossen niet vanzelf op. De gemeente Nijmegen helpt gratis, ook bij kleine vragen.",
  },
  school: {
    title: "Studeren?",
    body: "Regel dit via DUO. Je kunt recht hebben op studiefinanciering.",
    href: "https://duo.nl/",
    priority: true,
    icon: ICON_STUDIEFIN,
    waarom:
      "Ga je studeren? Dan kun je studiefinanciering aanvragen bij DUO. Dat is geld waarmee je jouw studie kan betalen.",
  },
  ouders_gescheiden: {
    title: "Kinderalimentatie zelf krijgen",
    body: "Vanaf je 18e kun je dit zelf krijgen. Bespreek dit met je ouders.",
    href: "",
    icon: ICON_ALIMENTATIE,
    waarom:
      "Zijn je ouders gescheiden? Vanaf 18 jaar mag je kinderalimentatie zelf ontvangen, op je eigen rekening.",
  },
  donorregister: {
    title: "Jouw keuze over orgaandonatie",
    body: "Vul jouw keuze in op donorregister.nl.",
    href: "https://www.donorregister.nl/",
    icon: ICON_DONOR,
    waarom:
      "Vanaf 18 jaar is een keuze verplicht. Vul je niets in? Dan sta je geregistreerd als 'geen bezwaar'. Jouw naasten moeten dan de keuze voor jou maken na jouw overlijden. Bekijk jouw opties en kies zelf.",
  },
};

/* ---- Result categories (Phase 0 §2) ------------------------------- */
const RESULT_CATEGORIES = [
  {
    key: "DigiD",
    label: "DigiD",
    questionIds: ["digid"],
  },
  {
    key: "Zorgverzekering",
    label: "Zorgverzekering",
    questionIds: ["zorgverzekering", "zorgtoeslag"],
  },
  { key: "Wonen", label: "Wonen", questionIds: ["huurwoning", "inboedel"] },
  { key: "Studie", label: "Studie", questionIds: ["school"] },
  { key: "Werk & geld", label: "Werk & geld", questionIds: ["geldzorgen"] },
];

const HELP_CARDS = [
  {
    iconImg: ICON_GELDZAKEN,
    title: "Hulp bij geldzaken",
    body: "De gemeente kan helpen bij geldzorgen of schulden",
    link: "Bekijk hulp",
    href: "https://www.bindkracht10.nl/projecten/financieel-experts-jongeren/",
  },
  {
    iconImg: ICON_STUDIETOESLAG,
    title: "Studietoeslag",
    body: "Volg je een voltijd studie en lukt het je door jouw ziekte of handicap niet om erbij te werken, dan heb je misschien recht op studietoeslag via de gemeente.",
    link: "Bekijk regeling",
    href: "https://www.nijmegen.nl/diensten/uitkering-schulden-laag-inkomen/studietoeslag/",
  },
  {
    iconImg: ICON_INFO_JONGEREN,
    title: "Informatie voor jongeren",
    body: "Informatie over wonen, werk en studie voor jongeren",
    link: "Meer informatie",
    href: "https://www.kwikstart.nl/gemeenten/nijmegen",
  },
];

/* ================================================================= */

/* Logo + yan ikonlar — header'da sabit durur (arka planla birlikte hareket etmez) */
const COIN_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAG4AAABKCAYAAABaZmHbAAABCGlDQ1BJQ0MgUHJvZmlsZQAAeJxjYGA8wQAELAYMDLl5JUVB7k4KEZFRCuwPGBiBEAwSk4sLGHADoKpv1yBqL+viUYcLcKakFicD6Q9ArFIEtBxopAiQLZIOYWuA2EkQtg2IXV5SUAJkB4DYRSFBzkB2CpCtkY7ETkJiJxcUgdT3ANk2uTmlyQh3M/Ck5oUGA2kOIJZhKGYIYnBncAL5H6IkfxEDg8VXBgbmCQixpJkMDNtbGRgkbiHEVBYwMPC3MDBsO48QQ4RJQWJRIliIBYiZ0tIYGD4tZ2DgjWRgEL7AwMAVDQsIHG5TALvNnSEfCNMZchhSgSKeDHkMyQx6QJYRgwGDIYMZAKbWPz9HbOBQAAAuCElEQVR42u2dd7ydVZX3v7s87bRbcpPcm0ZC6NJ7UyAoTVDAwviqiA1mBNRXsaAORWEYHWd0RlFHx0FQsQ6KCI6oCCKiQCiChJJG+s3tpz5t7/3+8Zx7ExBfUGfm/byRzeckhyT3nGfv37PWXmv9fms/ghfGzOiZfYSLgllUywMEfpU4zhAqQEoQ0uBIMTYmSZu02hO02pMkkw+I/xfXKv7SwarO2tMtWrQHnheRxDmBXyNNLGliqNV6SZIMpERiMRgkBitynMkxNkGQYWxCszHJlg13ixeA+28eCxYc7Pr6h/D8uUyMNwkjnzD0abVa+IEiDEMajSmCIMA6gc0dmTFI56H9AC01QkAY+kxNjmJsSlRSpMkUGzetpD75pHgBuP/isdPiY1xvbS5xKgn9HpwQOJuBzFEqxcmEeUMD7L7nbjhrqTdajG6dYGTrJK1mijUaZyXOKtI0pVIt4fuaLG/jTAdHSqs9Sb0xysjwI+IF4P7M0TtrNzc4Z2dK4WyEK2GcIE6aBKEG22bOvD5OO3UZJ522jJ0WDWDI8FBYJHEnY+vwJKtXbeTB+1dw7z0PsnLlWrQKMMaRpYY8z1HKw/d9hHDkJqbVrjM5NczY6P3iBeD+hNE/exc3e2ARldJcko4kTiSlUoTvJ/T2RZz+ylN49VmnMTAAuQMtcyDr/rQEFKABMDk0J2Gq2eK2n93O7XfcxUMPPopSAeWon3YrI0myws3anDRv0GyNMFnfTGPqCfECcM9zDM7f2/XU5uD5NaKwRtyxOCsZmjvAqae9mNPPPImF80KsLCCyAkzmkBKkAoHAue6CCcCBcGABJ4s/37ihwX/e8nN+dPMvWLVyA3muCYIyaZoSBArpO9rxGGPjG9i6abl4AbjnCvH7dnND85fge2VMXkzX8zxOOOEELjj/zcybX4AgBDgHeQ6et+3nrQGltv2/e8a73GZI5c/8kbOwaQP85Ce/5Kc/vZ0nn1hDlmXkLkdph5A5zeYkW0Y20Z58VLwA3LOMSm2p22nhXmi/TJrmaF9RLnlccOHbec1ZL8HmBSha2K47LEajnlKr+OQ5aP0sqyXyGeAc3tO+026Pq4Pl96/nK9d8jTvu/DVahUgVYnKBMZaxsY0Mb75NvADcdiMs7eQG5+1MFPTh6TJe4JObNv/wD5dxyGG7oX1HqB0CQ5Z18LwAiUduLFpphPtDKzYNWl7sec4rIBTPAG47/BoNx1133se1132XR3+3Cs+rkXQMQuZMTa2hXt9Cs7FGvAAcsHjJMa6vfx7WKLQXMVUf44tf+gyHHDoPP4As66A8i4dPbnOklEjkzJLkWYpSCi3lMz55e2gUOF24SLH9auYz/yrLHVoXVtlswHe//WOu/eq3qY+30FqifUOjOc6K3/30BeAGhw5xs2YvQKmILDNIKfnwR97PSSftT6lS7Fte1wU++cQaOknKzouXEEYeYDE2oeT7WMx2UMpnLJncFpnQBe5p4NoueJIkzZAiQOniUx5/fIyPX/VJ7n/gYYyxVCplGo0pHlvxE/EXC1xPbR83NLQzYalGO+5Q6ylx7HFHccWV5yK6yy+Ae+55lMsvu4qtW1skmcOZhJefegIXve9dzBoQTwtKtrc54Z4WoRQfJn7fPc687wY+03AmnZwg0jSnEj73hWu44T9+ysjWSRYsmMfmLetotsbZuuXh58RF7WjADcza97JazyBC+hibE5Qkn7n6CkpRkX+16vCbXz/CxRd9lPqURctemo2M2XPm88ADv+UHN/6Agw46gsF5NawBKQsgxB+60+U0JNv+lXgGcEmSorXCGodSEiUFQag5/LCDEbKHhx96jDTNCKMABEyMP3X5c81T7kigReEerlzqR4oIkws83+eMM0+lt3fbqo+MjPLh93+U+phA5jXmzN2J4192AhOTdSq1Gmlu+PAllzI6niPVTHCI7f7nhMV1vaT7vdXLu68M0X0pmRP4EmctWgnSOKPVSBAOtII3vP5E3vimt1IpV4tr1gHzFx7oSpUh9xcDXBCW8EtlcgdJFiOVZZ99diFJi4mmieVDF19KZgQq8Dn8JYfx1es/wr989m189rOfoD41jnOODRs28MMf3vIsQUnWfSVdgKaBld2XxqExeDOvJNcIqRFSkhuIyj6VSkCSWAQQhvC2t57Ii/beDa0lvldmcO4SStHgX47F+eUAq3Jy2UaHhtw2qFVDSh4oCzd9/6ds2DhKvdNin0OXcNWn30rUU2wYRx09xLHHHEIat9BCs/ye5QgHzjCzN0osuesAOc4WS2e6r1ZWQLpmneGKv7uegw95PYce9kYuvewaxqeg2S6+J3fgRI4fGpy0OKCnBz508XlUKj5KVkhaZWYP7E1P32HuLwM438NiiioIBnCMbBkmT4uKxi9v/zWNekJPby/vePffIDywxEUZWcKhhxyJUj5pYmk3YiYnij0uz8F1dy4tNHGaI4Uk6RR7WL0Jw8MdPnTx51l2/Onc+P3byfIqrXbIzT/8JcuOP5trr7uZJAMpwCIxzpDbDkplCAFzBquc9Venk2UZ2i8hKTNr1sK/FFfp4Ywt6orOBxvyxONr8P1i8fM8p6enh04rwaYCkwJ5iMkkGHhw+Wo81YtWZWq1/pm9sahTSkCTW0Xo99BsgufDk0+kfOzyL3D8sWdy0w9uZfbAEPV6HQm43CFFQBoLrr3mO5x5+l8zPmqxVqJEiJYBAgFYokjzqlefyvwF/eS2hdKOcrnCnHkHuR0eOKVcN2TXOOODC7n3vkdxFpQPO+28BGMK+uUD7/8wmzc6tAAl4AffX81tP7sLnMQ5xytecWoX7CItEAiyHKQIyDNoTDnOfdvfc/orXs/NN93OvKElBH6ZJO1QKgXESZ1KNaLZbNJbG6DTgtGtbV531tt54rGtdNp02QZNO25hyZg9p8Qppx5Hkk4hlcFaS2/P7B0/j1uy2xEuihYhbA/OekhlmTNH8pl/uYrdd6+yYX3CG95wLnFqyYzBOcfee+1Dp5Hw+GNrUUrheQmHHbEPV171QWq92z47bseUSiEAv7n7cT5y8ScZG0uRfkhuDbnp4EjwAsVLX7qMjRuHeWzFKvJEgtNEQUSrXUeLmCOO2pfPfeFD5AZ8D9IsRng5ipD1Gxqcddbf0Gl6WCNQXsro+AY2rbtL7LAW12hOoITEOQHOA+cxPFznoYcfpdmC+YsC3vPeCxHS0Go10Vrz2KMPs2btk/T2lfEDx5Klg3zkkvfOgNaJC05uGrS44/j2t77Lls1bMcaSpY64k+L7Pnme8dmrP8WVV53HV667hNe9/jS8IAXZodWeRAhHpVZFa58kKQrYzoLvheR5jsOwYEEfhx+xH7mJUUohiOjvnbdjJ+Dtxujl8+fve1meekhZRqCQKqbdHuPM1xxDnsOee81j//0OY/Xq1Wxcvwbt57Rb40hpOOPME7n4IxcyOBTiSEnzFqEfAoJGq43neyhP0Gzm3HvfQ0gV4KRG+x5plhBGHnFS56ijD8NZOPLIvdhp0SLuuONWEDlRWRGGjiuvuozZc3yyHES3lCMECCEATVSq8vPb7u5KJBSe5yMoXdZsrr98hy15HXTI6127FaLFLJyweEGdzI5ww/e+zE479WGyok5pM1izdoIVKx6hXInYZemeDA2V8YIiZ4uzKUIvBCJyUyTLAHGSE/qa39y9mg996O8ZHonx/BLOGRwxuZ3iw3/7bl77mmVFumBh3VOb+dIXr2Ppzrvxv/7qDCqV7Xg/C3ECYQSOnHaWEnolTjnxXLZuSbC5h/Ykztb57cPfEjsscEuWHO+CYD6emoOQjsyN4peanH7GMVz8wQsRrghGpAPbpeE6HYgKw6LdySiVPBwpRUjiYW0RWSoFWZ7haQ/nYMP6jAsuuIKnnhojiTPKFY84GaNSc9x2+zcJfICM1KaEsjwDZGFdDoFAWMgzUMG22osEPn/1D7jm375DngY451BeykT9KTasvVPscHscQKM+gacsSmUYkyCkI4kzfvXr3zAyVgcBrVaKoNhfZLd6kWWwYX2br173Le666x7i2CHwyLpVFyULoKWC3MYIAQsWerz3ogsIAkWlUqHVSvBUBWs0t/3sLiyWTtbCl5rMGIwtmAkpYGoq5q67HuRXd63hkYdH2LIpmwk64gROO+1kctPBDyRBECClJgzKM/PUOxpwo2P3i8G5i52QVSwplhztezy5cgPf+/6PeMvZZ1Eu+6RpjO+FmLywwG9c/wuuvfYa2vEY7U6D5Q/+nE4L0hjuvvsRxieG6ZsVctIpR4GwWGKaseDQI2fTMxCwddMUvq8By+REg8dWrOLkk4+i7BVRTp4X1M/yezZx9dVX8/CK31Iul2nXOwgh6Ovv4YwzT+Ud73wNgV/cFAcdsjfL71mFVhG5Bc8v0zNnTze1dYXY4YADaNZH6JtVQWlBZjKqpRpxmnDtv3+XM087i7l94Ps+Ns3Ystlw8cVX8diKJ2i1G/T1h3zso1eCgzCAj176JW772R2kWYvd9pjPSacchUMigHLk0U4giCydeIpqZRZZGhOGIXGcbguaWmBz+OhlX+LWH99BGJSwWYnGVEbgaYIgYGy0wde/+l323HtPjj1ub3IDr3ntK7nvnquw1gMnUSqiVh1gausO6CoBRsfXE6cTaM/ghx5jE02iaJDxcfjut36MkpC1c6RSPP7446xY8TuUFpx55iv4+vXXctLJR2JtYSX3L38IQUCaSdatG2Xzpg7g0WwVNOlkI2Zicgt+4IiTKaR01HrKhKEPBoSFpA3nvPFSfnbrcpyrYWxIGFTp7e1l592WYIXFCU2rY7n5hz9BAErD4UccwOBQH0JafD9EiRJh2M8OuccBNNtrRb05jHVJUdc3CpMFlMI5fPXa77Hi4Sae74OQLDt+P973gQv41D9fwUevOJdFi8toH6QuSlp+oBFCEgZVcBHXf+1G8gQqpYAkhu9/70eMjU8hVFBIFIRlcnKcww85FClh/foWb33LhYxsnUSrEN/3aTTHOet1p/Hla/6Zb3zzk7zj/PMol3ooRb08/thqkuKyqdVg3/32xJiMPHOYXKJllXLvoW6HdJUA9alRokovTlXp75vP1LjAJgav7POxy/+Jb3zjElAZKI/TzzgWqYqs1hEjcCSZIfAqLNl5Aaue/A1hVCNPBV+77ga0ijj44ENZtWYN13/1FjA95NanHEakaZ3ddtuDw4/Yg5WrtvCed72P8dGE0RFDpdxH30CNz3zhExx0+DyUKNiBBQsHyfOcyYkW2iuKzgJIc8tLX3YsP7v1XvLMItAov0SlPHvHtLgiulwtOu0m5VKJqfEJapUSlUqFJEl4YtU6rvi7L4L0sA58v3BNlgRBTpw1iLwicTvq6IMZmF3D2pwkyfB0hWuvu4H3XnQJ//iPX6Q5DpE3gBY+nbgNwvD2t70FJeFzV/8bGzeM4pykXArZd99d+Mw/f4zDD5uHLzpIOghgcqpBnudUq1VmzRpAusIV+lpy3DH709cb4nugPYWSPp4u/88CF0SLXKmyxEXlxe5/4vuGh4fJ4w7lUNNqb0LICcKKYKw5xW13Pc7VXyj2EwckicWaIm+T+Ag0zsCZZxzLTkvmkNsGpbJPmlukDIlTh3MByvWQdyDwBc41eOUrj+OEE3fjlpt/yx23PUCeVHB5hRftsTv/+IkPsveeZZQFhQSryXO47bZfY5xFacuuS3fG1yAMeN3S1plnnkCplNFoDON7CinUf10C3tO3m6v01CiHZYTyUCiskJTDEkiNcwJjDM4KnHNYazE2I0mbNBoTjG7572kQ7J99qBsaWoLvl8hyhxSaOE5R0mfevH4uveR8DjtkEZ4/XY7IZsAUeNTrliyRvOe9l3H33Q/QPzCP8YlJKtUerJVkLYHSoPwGR714fy7/2HuIInjVK85nfKyFzRQ9vVWu/cqnmT+/SMCVNKBznAtoJbDs+LfiDNSnJrjyYx/hjDMPRIptcvfly1dy9tnvRqg+lCozVW/9eXlcGO7lhuYvxg/KhH6AExKT5RgL2vPw/ICkE4NUOOfI84Lu11qjtcaXoHWFnp5B5s/f3XXaddrtJmncot4YJ26v+bPBHB+5R/T19TjfL+FySY4gDMrEeYfVa1fysSv/nqv/5ePstKSKsRD6Hp2kSRiEdJKYajUk9eEL/3oZX7/+p1z3tW8SlR3N1ha01khfUalEvPVtb+DsN52Ak3DddTezcctG4jinp9LDVR+/ip6+IhSUqmg8cLZI6L/97Z+zdetW+nv7mDd/NocfceCMcsy4HCk0+++/S/Fd2iPPHVr7f5rF9c86wA3OWUypMkC7kyK6tWqlFEoV4s80TUmShCAIUEohpWR7Mam1ltyk5HmK7xf1uDzPMcYghENJC8IwNTXG5NQI9fHf/ckg9s3aw82atStRNBtnNQiB8CySDOdi5s7p4bprv8DAHOi0i5KXwBQcXObwtCIz0GmD9mDlylGWP/AAlWqJ+UNzOPDAXQuLBeIOnPGqc1izagtz5gxy3DFHccmlb0d73YYSl6JEQcqOjiS85nUXMDkZ06hP8M4L3875578SJ0CQgnAkHQjCgJcuezvDwx20VyFJ7XNbXE//fDc1vlEADAzt5wbnLMHTFbJE0mgkhGGIVAUQSRJjk2aX1/Ko+B7GZBjXIU0NYGesDSzOZARRQJYZ0k6O74UEgY8xhixJsS6nUl5AT88QbqfdXLM1wfjEZuojj/9RIE6MPSYUZVcaqiE9SZoZXGYQEnxVYt26Ud75rg/xxX/7Oyplj8yApxQOW0jOhcLkObWqxgpYtKiPvfd+GWkG1sX4XdCSFFpNGBueolLuY2J8iqNecjRKQ5o7fG0wOCSakeEOV1z5KcZHxhFodt1lIaeffmJhlTiStEPoh3hhQJoUmVtuDRiDFe65gZsa3yii6h5uwfwlhFEVKQKStGBn/cAjtw3SOMZh6O3tZddd92SvvfZiaHAOfujRW6sSRCHlUoTn++RZwujoKGvWrGHT5q0sv+8h6lMdWq0O1qTkzmGdIAgivMAnSTpFr7UU9PZG9PcP0hpa4oa3bmTyeQhHt5XClosgLLla71yCoIZxknackOKolQf43Yq1nHPO+7jm2n+gXCp8g0DgaY92p04pqpBmMUmS0dtTLRRaftFHkLoGWpTxPcn69ZvJM4F1kiiscdSRexZ+RgkcGik0w6MdLvnbj3Prrb+gUqqiPcsF55/L/AUhzoBUBq01FoUUsG59nbGJOlFUJs1y8jx/buB22eUE19s3nzQRtFsdymUP7UOatfDClIHZvSw77iROOeVkdt99duGbuxUDoYs6oC2YEqwALQDmA/sVYtEYVq4eYfl9D/HgAw+zauV6to6M02lN0YnB90MkCmMcnZbpFnprLBiaxZKd9nWrVj9KfeT5BTYbN94pcnOwmzVnIUHQRxhWSBOH9qt00oRVqzbzrgsv55OfvJS+XrAIHA7nHGAIPEHg+RTyPEuaJfieh8sN0pMYVwQ0ni5hXUQSp7Tb4AWgvGIdVq0a4ZKPXMWW9XXmzN4Jz8t4xWnHc8rJBxTEbdYhUh5SRqSpIOnA9264pasTFSjtSOqTf3iPq/QucH21RdRqi9GySpIaPF8hvYx2PMKBB+/OW97yvzjmJQegAOuKCruWz2hN6g5HEUlKKRGIwt9v393UVZ4aCxs2JPzm1/dz/4OPcPvP7yLPLLkRCCGLPdQV+2GaJ5RqHmOj69gy/CRZc93zAnBwwSGuWp1HFM7G2JA0N1jToVRW5NkUBx64J5/+9Efp7dnGfVnbAWvwtMLarKBalCa3OUqWcM7DWRgfhyOPOJXevoXEccoJJy3jove/HqHgBzf9kK9+5XqSGLZu6dDfU+Mlx+7Dp/7pouKGtw6lHM1OTCkqYQzcfddTvOP89xGGvTQaDcKyZO1Tq/4wcHu+aJnzVD/WVrDGQ3seuW2BavPGc87gwne/Dj1NoW+nj2eGbwLrcpQoFlkIgVJqBilnptlf28VNbo9yYaWu2Ox/dfcT3PSDW7nv3ocYn2jheRFSeOTWkOYx1R5Nkoyxdu2jtKdWPS/wBgYPcfOGdseJXvKsOMckzVpEgcTaFvvutxtXXPFhFi2MEIDJM3wtmFZS5kmKDoIuyRpgrEQKSDP43//7EyxfvpJWMwUsng/GNUmzDqWoTKuVUKvM5VVnvJwPfOAMksQQREWA1+y0KUUl0hhWr25x3tvfw8RkG4sjKvlM1jey5olbxbNOctddX+ycK9PfN0S74/D9kEZrkuNfejR/e+n5lHog9Ld1RksK9yhlwTVNR5UFzdFFk0KGbXJXtC4VPboFdfh7zWiFBNUhZywxTWDtUzE/uuU2bvz+jxjePE7/wCwSm5PmMe3WBL5v2bRhDZMTz733BaWFrlodYv78/Rif7DCrtweEo92u40ipVn323W93Lr30Awz0e0RRMc/61AQ9PdXCrbXbRFENBIU7FYJmw4BQnHH6uYyOt+i0M2YN9DA2vgXtObTWDM4d4m/++l2c+vI9UBLiuEMYBRjrMFZhDGzZZDn77POpT2UIIRDKkuaTjI6tZmTTg78P3JKdj3MD/QtRMqDdjlG+ICpp3v/Bd3HMsfsSRoWlGFO4RQ/IEvC7DG6nkxFGXpHEurzw/0oVVdtplzj9u7HFh4i8i5fZDuhpAVBMtdJX9KB1QRzeAj+48cd85z9uZOPwCM1Wh9kDQ4SBR31ylHp9K+vW3/G8LG/B4pe5MJxFrdJDHMdo5SMVjI+PUCprXvSipbz/fRdy4EHzocueCyBNLb4vids5YVnTiRuEYUGjNzsWnM/Vn/k6v7zzN6xbt46opNln3z055tijOfbYYxkaDLAG4jimVvVpdd2jdfDkEy3OO+8DjI/HJLGlUo0QosXWsdUzDPjTJjc4dIhbtGAv2i3TrW5kDAyV+e4N/06lWuxd09lYs265/ee/YHBgNvvv/yKiqFtt6E6s6Ozsur+uO3xal4ShqwcQz7A8u91rmsAonHKagFYSKQsAmy34/k138q9f+grjox1MaimVSgiZMtXYyKqVtz8/8HZa5mb1D5KklsCvoFVxUE2lGtJqTzI42Msbz34trz5zGZ6GLIdK1L3sbt+4DjLitE7gh0Vvgir2qDyDyUnHnLnFPJNOoS/Bgcmm5Xk5nq+ZauRsHW7xrndfwprV45TCPpIkwQssnXgLmzevoDG56veB22f/M1zW9vF0iJCWE09+CRe+62yG5vtYirujHIZMTjreef77eWzFSuKkzaJFCzjrr17Fq151CqVydxcTRS+YkEVC7XkeousS8yxDS6+wwqf1ME0D5p7mYjtxBykVgR8BkiTJcFYQBpo4gckp+MTff56f/PQOKuVeppoTSD/F0WbNmhV0ptY/J4BLdn6J65+1kGbDoFWE50e02y38QCJkTpxMcfyyo7n4Q+9j3mARDZeC7qULSLIOQTAtfVe0YojCaKZVqxNbwkiCcSRJQqkUIrpbgO8X7PiGjTFveMN5jIzElEpzqDfaVCsBjdYWto4+ztTotmb/GXneLnsc7wKviqd8tFa8+S2v4y1vey2D81T3vs9RUiGF5Me33M2tN/+Sej0jCKpY4fOru+/j5ltuwxqfJUuXFkmplGhPI5XuRi+iiCiVLGYzfdzBDHCisEqhwCkQGmsFvuejlYcxBoTB0xLtFVGYryXlCE484RAGBpbwq3t+jdIerXa7IB89jzhzl5m0/n/tOZuceOpy3++5LArKKBVhjMAYgR+EGAvlcplVq1fzne/cwNhYws677EOlLFDdeqL2PayzZCZDSIWnA5qtBM/TCAmedijhkNLiexpcIT5XEnIDq9dOcdFFH2FiMqHdsRgj8TxNblqMja9jfOvTU54Z4OYO7n1ZlhnK1Yh99t+dD37wHHr7p4uiljTpEHghGPjSF77Dysc2onUVoSoMD9cxuSZN4a67fsN//udtpLFi8eJdUKqgTECQGYHJDUppQGCdQQgLGIQQOES3YYNthd4u4AiBkAqHIMsTpBIoKSCXCAlT9Zz9D1rAnMEl3HzLjyjX+klTRxBFpCYlrm9+zmbBqcl1l0el+ZeBxlpFT08/I6NjlEol0jTFOofSmgceeJCf/ORnrF09Sm91HkPzKl2pukapglnASUJfIwVkaY6nHcakGFOcPpQlFiUlzQY89NBG3vveD7Jq1TqyTFGu9NHppFiXsXXrU4xtvUs8qwS9Z+Bgt2BoMVEU0Wk1ufpz/8TRRy8mySAMipMJikgRfK354Q8e4PJLPkWeh1gdglZYm4NLEDLD2QREjtaCFx99JC87YRnHHLsPUXdfmA6Jcmvx5DaXyDN+fVowwza3BBaHKSzQeGituuotCMrwpjf/LQ8/vJLMKLSWjI6vZ8ua2593laVcPsDNm78rSgeUogp5npPbrBAJ2cL1CyEQ1hD5goH+Ci9/5QkcdviB7LR4PtWeAF8XqYHvdc9PMYWOMmlbRkcn2bxhhHvvfZhf3f0Qv3v0SaQEg8M6hbMKIQTtTp01K2981usWAEv3OMH5qkbohRyw/4u4+rMfJAy7y6kgNzFaCRySLJOkmeKcsz/IY49tInUBShcnzyVxi9zEhL5GSa84W0T6pGnC0LzZHP/Soznp5cey+55VtN7WPp1b8GVBqUBCZlN8qZF4xd2LR54VolRjCk2iVAKT51in0J6g1coplzVJDo88sppzz3svzkUYE5CmMWOTaxjd+Js/qsZZru7mdlq0C0JGSBWC87oLKxFCdffsDogUhEVKge9rKrUq/b2zKFeqTIyPI4TAWkOWZXQ6HTqdmDSxmFxgjcLzAhwZuekU6yJzJsa3smXrU2Tttc96zRooFt4vYVLDoYceWuxPYlujuhK6GwZaPE8hNbzkmCN4fOV3ibRPO82pNwqiUTlNq90mUCHOKVAeQig2b2rwzW/+kO/feBOLls7m+JcdybEvOYqdF/cWmkUgzhwlL8CXCtm1KoHE2ATtBZhsm9vNM1Psn8D4ZEZ/b8FKBB4ccMDO7L/P7vzyV48QhYNoFRGFvX80q9BqPCEe/d0TzJ5zoOsfmE+p1I81gtQWi44q6CuHwBqHM444dTTbbbZuTZFyGCFU10JUN1IXWBvgHDgnkEqT5UVE7XkeiIRmc5zx8XV/ELQZi9tj39NdJeij02rx7W9/hT33iIqqxvSRAd19yHW3RYtk1ZMd3vTmdzLZyBFS43mOffbdHZt3+N3vHsbmAoFGighrNMZYjDMImaE9B6IQrO68eCmHHX4Ir37V6SzdJSxafjMI/KKMpgU0W00q5QoCmJiYoq+3B2MgThyTUwmDg0WEZm3XS2hYfu9q/ub8D5GlJZT2SfMJNmx8mMbYij+JHipXd3OV6ixq1QHCqIKSEUhJ3EkBWZyTIiWym68aUxTicQVx7LrnaUipi7KfEDNpjzEdpHT4vqMTTzK8ZS0TY//34xJ1qfdAh1PkeU6pWmLxkogsLxROQpqZk1e2DxgAlu4csWTxQh55dC3tuIXn+Zz1mlew7KW7c9+9T3LLzf/JrbfeRqfZROsSgV/BCU2WGfLM4GmPUlBm86ZxvvOtH/Ktr9/I/gfszTlnv5Ejj1o0ozJODZTKFTLrSNOUWl8PqYGJiQ4XvfdiHn9sHT21Pk5/5Um84/zXoETRrnvQQTvT01NleHOOVAXbUK320Rj70zi9VuMJ0WpAq7ar6+mbTaXcg/bKBH4Vh9oWTDmL7XaEI8HXPsZZnHE4QAnVbUt1OCxCZkhhkOQknRZjo5ueEzQANWv23pcFQYhwin322YNXverF5LnD86a7mylKJa6I+Iy1WFvQDSuf2MJjj61FoEjTBkcddQgvetF8Fi6YxbJlh/GmN/0Vc2bPwtiMjevXEiftLr3jkSUZcSfBGovJDWFQYdPGMW6++ac88sgmarVFzJlTmfl6KQWyeyprswnvec8lPPzblTjj06i3WbXycXbfYy/mDg1gnUBJ2LipzcO/XYVzAqUFzsWMj666nD9jpMn45Y2p9ZePjay8PM+5TOsAYy3YHGMzrMmxNkNKh1KCLI0xJsXZgjIRGKxLsSYhz9tI18HaNp32JGPjmxkdefB5eQQd+GWUDMDBwYcciBMgfYcjQ2BBBOBc11fb4oK6bMDsOf10Oh0Cv0wQlKmUSzON7saCFJbXve4EXvvaE9iyKeahhx7jgfsf4bEnV7Jp/SZGx8cplQKyzNLpNAn8ClFU5hd33M2dd97JTkvmceCBezB7sI+Fi4ZYunQpni7zL//8eR58cDXWRCghCEOPqakxJibG8H0xU6A+8aSX8v0b7qTVzjDG4vvRf6meZWLsUTEx9ih+tJcrBSE68PGkQno+gfZQvkcpCHFCoYTAiaLJw9ocZw3OpgyPDmPzmNGJP+4kWQ1FVJMnMbvuuhTEdEuuxXVb1nPj0BqMKaK56aLG5MQIvvbIkpw4btOcamALqSJKgpbF6VgoWLggpH/W/pzy8v1xQKcFjz2+jptuuon77nuQNWu3YJwlNTnlaoAQIVuGx7jxxp8QRD5JGlOr9jA50UbrgNDrx2DwZEarNcYFF7yNk05+8UypLM0ke+45QE9vlXZnApM7vOmC6n/xSDuPirTz7H8XlRY4pEKJItyyuSXurPuztTTaWYFSmtgaarXatvovlmkRmDEOrSDLDIHSM2HNho1rUTLHKkkpCKjVqnjTfWSthHI5KG4A67AoyqUuxZ8V5OKBBy1iv/3PJ8vh13c/zNe+/h3uufdBrNF4foSxFj+okmcGpXoYn8goh/1Y42g0E6JQobTj36/5Vw49dIjcgnExVoDvl0gzqFRKKFXHWDGjh/mfHJ32hv8W9ZqMSgGTkxOUSiXGxsZoNBwChUDTyfNCKxF4BWcU+IX7dAYl4Ny3vYm99loE1InjCeYNzcJ1t8ZKKejmaRItFUpO522WwLMEXg7YojFeWo45dh8+/8WP8o1v/ysnnnwkUidYkSO0wjhNGPTgrCbJcpyEMFIs3XUe13/zyxxw0BAI0NriyGasLk5g/fr1xbFOzpCm6Q4j+NXj42MsXbqE4S1buO3nd3DiKXvRbMUolVEKy8juQZoFCdotEpsUT0fsvsd8vnLdlWzc3GHLpo3ss98g01lEsZEX1AfPKGeLrhuW3eAnKMonaAEL5g/w8U9cxEO/Hebqz32FX//qYcqlXiYmJqhUKgiX4uhw7HFHcOWVf00UFhlLvd6kVgvQQmFRJIll1aphnHOFnrObh+4oQ0qR0W41KJVK/OIXd7FhXUqlHBIGNcAjiYsGwCIXKTJyT2tMZrvNfob5C0L23nsBUkC7lczQHb63jQideXVpGoHXfUmSTtHlEKcplXJxo+y991wuu+QDDAz00mhMUC37NBtb8fyY0884jo9d8dczVJLDUKuFdJIOaW66dQXJ9264qdBzmiLKS7PWjgOckIV7McZgjeQTH/8U7U5xF7daOUFQvPc8UURDLu8W8ovczvMsgphSSQA55UqAkJDnDmP4/ZrjM4Bst2NKUVBYqtl2LGFjCi688N3UJ8eRIkOolL4+j+OPP4xLPnIO5ahL6omEbhxJFJTwdZk4EcRtuPMXv8Y5gXMGP5BMTo3uOMCNjG5Ea4GUEmskd/3yPq7+zLfAQqmkyS20212/qmVRTKaoy4lueJnkHXJbiHem3ZGUli4J8KxnOk6PUhRu994nTQqO6rOfuYZVT6zFmpQoVMTxOK973Sv5uysuoNmMUSJHkSOnqw+2OLEgiTWhr/nadd9n08axbsHWIZVh64b7dpied2niJ0SzNdntokwIg15u+I+bue7anzE+ViT5yisYbSjOW5weeQrgEegqWgZI4c1U9sV0qUxMi0rt7+11RcQak2ed4sCzvPjpW29Zzg3f/QFhWEIIgVaON5/zei684Cwk0FsNyfNsRmKUGYPqnlGoFdx5x0r+/cvX4+sq1haV/FZ7aofqRlIAXjD7MikieqoDjI+No5TH7T+/jbGxcfba8wB6+1Rx1mLWRslpCZaHBHIrEEohnERKhc27HKmwZFnSzQm7oeYMeNsCFikTpHIkabF3btniOPft7ySKatSnGmglectbz+aCd5yJ1oW+BevwtIfoHhIipU+zblBC8ugjI1z03kto1i09vYMkicGJjM3Dq0jaWy7fYSwOYHjD3SIMBFnWolarYHLLrIF53PTDn3Luee9kxYoxjAOogCiDCgvLUds0lGla7FkzZ08LUfBkT9OQ5F0Q82mbxZnigIjAD4ozt1zO0sVDJK0peqo+f33em3jz2aeiVXGxgU9BMRnIUkmaexgkpYrmuq//lHPeegETEx16egeYnJws0gOXP2/R7P8vY2YyA7MPcHMGFxIGVeKOxdiiwT3NE3ZespDTzzyZV5x2HP2zuhI8W8QXkq6Fbfeh1uYI6Wb2wKeH4XIbUeq6T2lAdU+DL6LQ0ZE2TzzxJMZZDjvsgBltft615umbI8uhbeCGG+/mu9+6gZVPrkGrsKCojCNPE7I8ZsvmNdTr9+2YwAHstORIN6tvHpmRZFlRvbDWYoUFm7HPvrvzhje8mqNfvFdRBRFdX2shSRKUUgS+fhqAz+zSwViMswhbUB3KC4oPstupvizk1qH1Nj2KNU/3sps2NVm7fiuf+PSX2bhpjMmJOr7vo5Ui7cRI4aiUPVavfJyxsd/scAfx/N6EhuYd6gbmLETrCnFi8Dy/4JUw5CYGl7PLros59dSTWbbsKBbNL22TnHdP7JkWx4puH4GS2ymdnyYoAets14LkzF/neSFlUKprlHbbzzdbcM89D/C9793IbT+/m9yU0F4VpSXOGTxVpCXt9iSN+hjDG+/ZIY/of9ZJDc073PX2zwV8wrDC+MQE5XKZ3r4a7WaDNIsJwwAhMw7cby/23nsPjjzySHbffSFRqWDOpzlYa7vubcYKuz0D0xpMr+g5mBF5sW3fdLaQNYyMZKxY8Tj33rOc++5/gKfWridNs4ILcxFCafI0IU7qeH6hqBoZWcemp5bvsA/E+IMTi6p7uDlzFxCFVWrVPprtDo1Gg1JUQWtNmsX4WhGEEmfTbp6nqdVqLJg3j0WLFjEwMMDChQvwfZ8oivB9H197eJ6HH2iUJ0FBmidIocmyjLGxCSYn62zavJVVK9fw6KNP0Kg3aTbbhRVKD+cESZ5hclu0LLsc34MglHSScYaH1zAx/PgO/dyg55xcrX8/1z9rDj21WYjuopncdbtVFJ24UbwXEs8rQCkCiaKPS0g3Q+tji46d6dKZEAK0JMkTPOlhnCNPMrwwQquQTifBWdDaLwQ1zpEmOdZavCCgFIYIm+JsgrEd2vE4w1vX0hh/cod/StfznmD/3IPd/HmLMcYh0Gg/oN2KiaIIJ1X3NDpbFHSdQ4hCV+G6FWchRLe3w21fcCO3DifA1x5IgcksiEKelue2W9wWM58hZ6gmg8liJB1M3mZ8YgujI/f9xTzI8I+eaM/AAW7u3Hn4XgmEJre6q0vpBhddtlxKiRR6pjhddLNYpAMnRRHEUCibkjSdaeyf7heXKBzTN4HrKqTyotVACNI0JombTI5totF46C/uWa9/8oQr/Xu5cnkWlepclI6QUuPstgcGCSG7i/70rxAOnHCF9QmLMVlX9bTNMqUSYHJyU7RqpVmHNG2TpB3iTpNms07SePIv+lHYfz6FXj7Elcq9VMq9RFFUPIdNSnCqe4LCM75iuuzVffCJ6J7577DF/pdn5CYlSTokaZv65ARZ3sEmT/7FP7N8+/F/AKEa8yLqaNWFAAAAAElFTkSuQmCC";
const ENV_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAG0AAABUCAYAAACIjbkzAAABCGlDQ1BJQ0MgUHJvZmlsZQAAeJxjYGA8wQAELAYMDLl5JUVB7k4KEZFRCuwPGBiBEAwSk4sLGHADoKpv1yBqL+viUYcLcKakFicD6Q9ArFIEtBxopAiQLZIOYWuA2EkQtg2IXV5SUAJkB4DYRSFBzkB2CpCtkY7ETkJiJxcUgdT3ANk2uTmlyQh3M/Ck5oUGA2kOIJZhKGYIYnBncAL5H6IkfxEDg8VXBgbmCQixpJkMDNtbGRgkbiHEVBYwMPC3MDBsO48QQ4RJQWJRIliIBYiZ0tIYGD4tZ2DgjWRgEL7AwMAVDQsIHG5TALvNnSEfCNMZchhSgSKeDHkMyQx6QJYRgwGDIYMZAKbWPz9HbOBQAAAhWklEQVR42u2cebidVX3vP2utd9rT2XufOSQ5mUkIIQwZmEFQFEIUA2IBLRbhtr2KpXq91ts+VrhDvdXbq9LB9uK9pdVSQBSDoAxSghRCBGQOU4DMOSdn3vM7rLXuH+/OSaLSYgWM9HyfZ/9xzn72et53fdf6re/v+/u9L0xjGtOYxjSmMY1p/Iog3sjBioUF1vczRHGdiclXxfT0vjlw3qiB8oV5trdvLuVSL62wQXZv2U5MjtBobZ8m71DdaTPnnGC7O+fgyRxhGGIJcVzB+PgolUqFsbFHp8k7lEgrdB9u5w4sw3OKjI81KOSL+IFidGwvvusRBB61Wo3JyihDezZMk/dLQr4Rg/T2ziWKIE7grHe/m1YUMjFZpVTuQhuoN1t4gU9HqcjiZWtsue8oOz31v0LSZgycZj2vGz9T5JTTT+Fz13yUTMFB+ZDryPCZ//JJZs7uxQ0EXiBxPJdZsxdw+FHvscWeI20mP3OawLeStCAz2xZy3WBdlLD8/lUfpasTzl3zDpK4Sr02xqrVx/C3f3stf/zHn+bIIxeAjUiimMDLM3/ekSyYv4z+mcttJjswTd5bQVpXqROJwlWStWvPZGAAKlVYt+4sclmHamWMH91/L/19sGbNMfzd332J6677Kuec8w4cqWhUQ+LEYcZhCznqqFXMnX/yNHFvphAp5GbYgYElKKebGbNm8rd//2VKZVAKoiZcctHH2b5tDytWHstf/OXnsAJ8DyxgNTz2yE7Wr7+HBzduZHh4GCEtuVyGJGoxOTnG2Ogwk5PPTYuWNzJPKxW7CQIPIQ3nnXcGPd37v8tk4Khly9i9Y4zNT7+A1eBnIQwrZHwflM+K42axauVlbHn1Mr75D9/m3nvvoVaroGRAqbOPzs4eWq05dtfOrbTCOq3mjmkC21D/lh/lsrNsT89MfC9Pd2+ZP/qjTxNkBNo0cCVYFF2lw/jOd75HklhOOOF0ZszM4TiKJKkjsDjSxcTQ2Q2nnbaUD1y4lnnzljC4ewdDQ7ux1iAEdHd3E/hZIHd1szl8zTRl/8YzrdjZQ748i1rTcOlHLiGXlTgCHOEiMEgMcxb0gYrQONx970MkBrR1cJ0sUdhMt7kLjoC4BcUOeN/aI/nqtf+dyy+/mN6eIkkcog1kskVmz17MkiVrbanzBCvUUju9035R92PgqKvrdc0pp57MZb/1QcqdDsKCtSClwWDwPI9Xtw/x3LNbabQizl17Jp4PSlhcV4EWWG0xgJ8RGAPNZki55HL86qM44cTT6OvrZdvW7USRJkksQbZAqdhDrlDCMuPqVvPVa6ZJex3o7j3adnX3oxzFxz9+BcceMxMhUkUjhEUIg7EWKR0aTdj08JMMDQ2x5IgjGBjoRYoYJS3gIpRCqvTHUoLvOlPSqFzMsvzoIzjvvPdTLJUZHBxkz9Ae4iSko5Cju7tEV/fiqwO/9+rJya3XTIfHfwHlYj9JbDn1lFWccupyAFotfZAOVSJdCwvnz0NKCxjuuOMOfD/VPtak39s4BmGA9keATgxxkupaz4VyEX7zw2dxww3X8tWv/AmnnbKKKKkyMb4bq2MyQScnHv/bdmDWO//dhMxfSD2WikdbR+Xo6Chy3rqzKeTbJKmUe4vG2BgpfAAWLOhn5qwZbNu+iyeeeIK9eyNm9Hopv1YipCWOWrieB4DWGsdxaQ9GrMFRKYFBBt71ruWc8Y7lPP/iIOtv/S633XY3rspTrbTo6ppNT+8ldnRskL0jO2jUXhLTOw3o7ZmFUi4nrFrN6pVH7U/2RDo/UkiEEGidIAHfh5NOWo3WEc1mkzt/cDfWpmvFxDE4Atf1sEa3yReAodGo0Qpb7IuWsp1QagPSgSOP7Oczn/1dbrnlm7zzrJPIFRwmK6NobekodDF/7lEsXbrW9s843v67Jq1UXG7zuSKH9c/gvPevIZ9XaFoYa5ASrNWAReIghCCONQI4ftVx6CTCdV0eemhTmlwD2gpskrRJVxitiaMIrCWbzRIEHlprjDUpcQJcBSaxWA2eA7MGsvzJn/42t952HZf+1vuJkxoIi+9liUOPvu5FHL5one3peXs5La87hCxacLbN58qsWn0cf/XXnwYFsamhbICjHASmHRr3rQWXWEMYwlnvuYTRsTGKHVm+fcs3Oawvm4Y9SM8yY0DtXz9Ga4QQCCkBSRRFKKVQSmEBY80BdyBpRQbPlezZ3eJbN93GXXduYGS4ik4s1lqkgkQ3mazsZWR0J63Gtl/r0Pm61GM+v8TOm7uYeqPGV679AqVODyNiPCkR0sUagRAJUoj2OkiDmhSpxBgdq/Pii1toNFoMzJ7NMcvnIwRYYxBCgpAH/E4ghEr/315TSimkTA86gUWKdOcJYbBolLIIIcjkXE46+UjOWfMeiqUsO3dtpdGsIBUIIcllinR3zyQIZl4dhtmrk2TvNW9L0jKZefaw/gVYC2e+81TOWXMq2ZzAaRMkUG3Jb1MSAIQCm+Ze0gHH7eCWW75LPttBZaLK2veemeZ0Kh3h9cUE0Q6sB8KiMe0xLNomIAS5rMPyoxdxzppzKJXz7Nmzi5GRYYIgB1bheVl6ewYolxdc3YzM1VE4es3b6kwrl/opl7vxPMX7znsP5ZJAYtp7wvmpeRUHDSlkOs9z5w4we/ZssA6De8YYHwPHAWPFawftn/5MXe6BHwejfQQuAhdP+ThCIUijbWen4tKPrOXbt/4VX/9/X+HEk5eBbJLoOsY2MDZm0cIjOGble+2sgVX2bUFaNjvfdnXOIAxDVq0+hmOOW4xUABqQWENbDR64GyRYuX9TCOjpUSw5/AiU4/PyKzt59tlXqTVoh7yfg9c5fcKC114YNtl/LdpoYh0S65AoSq2wVasX8Wdf/iy33X4jn7jqCmbP6SHISLSVjE80yea6OG71BXbg16A89C+S1tU1B8/PEiURF1x4LsWSApJ2nsWUE7J/KAFWkLRiksRODS4kLFq0mFqtRSHfyf0bHsJxINJgxc//vF5YDdKCI9NYLy24UuErH1f5+J6PwE5dc1eXyxVXrOX/Xv9nfP6//QGLlyyls/MwXLeItQHZbC9HLl9nFy4+2yp/4SFJ4GtOT0fHSjswazFKCQbmdvGPN30F19d4MkkJMm66IUS7RmbiVABaN/1HO6xpke6ADfft5FOf+hz5bJFKbQ8/3nQTfua1V83r4s2m6tT39v9gH+EWSxRFqQpVLiqVtek5214YjSbUq/DVr36He354F1EUETZbgCWf89EmpNGs0mhUqEyMUqseGvU957Xtqpm4qgCywUUXX0iQAW3jgw4Za1L+UqEnMEankr99a/V6RCbn8eBDm7n55juJooSJsEKxXGbjxic44eRlZH2nbWP9NB/yXydTgB8kgCXREcYYHFcikQgkvifbWkvQikDH6Vn3yiuTPPjPP2bLlp1semwzk9UWUSSRMiAIAhAWrQ2JtuTzvQSZPIVCmSieYaNWhXpjgonRLeKQIq2zc7ntyBewJBQKAedfcDJxYnGddp5kNEo4SAWxbcsC6ZBEqn3mwdiY4dVtO/nGDd/grrvuJ5Ppx/M84jihXo+5/0ebeMcZx7TnXv4c4szriOAJlgiwKCVRygEUibFgHYQSDO6p8eILW3nm2Rd5/CfPsPnZF0lii+tmqFbqWOXieQGYBNfNUC51Uq83GR8fxw8yRFECwsd1HfwgiygUKeleunoOs3HYYGR4D43aLvErJ62np4fEVPBdzWWXXY6SIB2BsQopDFIqkiRCOQ5CQITAaoHnCnbuhvXfuZvb1t/Bzp07UZ5AyA5c32PBojm88PzLxHHMk09vpV6Djtz+M9EkMdJ1AUOrXifI5UBrUGr/rhYpobVGnVw2wKAwCMLI4Hk+w8Mxz29+lR/e8wCbN7/C9u27CVsJGIvrukjlkSQRraiO4xo6Oixz5vTyrrPO5aSTT2T3nhqf+YPPobFY4WCVQGuBROMIgRI+Qvv4XpaMJ+juWkyz2bC1yhjV2hgT40+Lt5y0zuJyG/gFkiSh3JnlvHXvnNo9UkiMhTiOCVyfKAbdNnTv3/A0N914Gy9sfpXKZAsTJ3QUi7TiOietXsl571/L8qOX8bGP/T4vbdnK0NAE27bHHLXEJYwSfN9Bui7NWoVMPkuQy5GEIY6fIQpjPD81kqMYXFeSyRbQpL2We4ZG2fTwT7j//k089ugz1Koxkiyen8UkLoEfIKQm0SFWxsxfOINTTzuJ41cdy5FL5uF5AuWA68IXvnAd1eo4ruu2HRkxZXAnicFaibWynY8KwpZASpdiuUCh1Edv/xzbaI7TrI8ThlVqlTe+TeJnSOvtm0s228nk5Dgfu/JKsvn00NY6IU5Ccn4OjI81kETwzX/8Ed9dfzvbt+4ik8nQrNVRytDVlyNOalz5uxdz9tqz6OvNY4HTTl+VJrvDQ2y4/59YtvQ9+BmI4jpSSjIFH4vBGI0TpNUCN3DRGupNCLIwWYONmx7hjtvv4uUXdlKZbFKt1mmGEblcjlwmj7WWenOYcqlAd3eJo5Yv4bTTT2TFqmWUO5x2agBuWwEb4O67n+InT2wkk+2gWg9JtMCwz52xKWEGlHKRQmCtIRExUkqUcnFlBt8rEfjdxNkWcdKkmhmwYVRjYvxJ8Yarx2xhwGb8bgZmHY4RkrlzB7jxpi8QxpDLMiU8jIaND2zm7jsf5EcPPMJ4pQnCxVECIQ1J1KC7J8e6C87mw5eeT7G4T2hI6i3D00++wsc//hlsnKFUzvGNf/gis2aWDjrTojjBddMSThKnifjgYMKmRx9j48OPsvGhTUxUJsl4BYTxCRshrqfQOiZfyFAoZDj5lBM4bsUyjj5mKfmCRza7/6wMkwYIg6d8dCIxWuG4kg/+xn9k69YRrPWJEwdtJLEG13VRQmCMQRmQUoIRaGtAgbW2/REIIXBlarsJCYKIMKpRrw9Tq4/Sao7TqP5yD6VM7bRGdbuYO3+xxY1o1Ft86NL/hFAQOBBGMDjY4onHnuCbf3czW17aRsYpYlDt7ipBq15j/oJZXHLJ+Zx+xmrKnQrXA0lMParjuRlygc+xyxcyZ/Z8tjy3m7AF11//Ha78vY9SKEgmJzXlDoXreEQhuA7cc++T/OAH9/DUU88zPlGl3owJgjyO20OtGVHOOcyc383JJ5/ASSev5phjZ7ZV5YFL0mBIprL2wHGn8krpOODA44+/ws4dg8SxpdmM6OyayWSlgee4bZ8z1bTGmtSuswJrBRgPi2gb3On42hoSrUFrJBrlBJQ6Z9BR7iaKGlRrA7ZaGaM2tln8Ujutd/bRduGiJezaMciKlav5+te/iE7guc2D3Hfffdx37wbqtRb1Sp1cpgMdaqyyNKNJ3vHOU/jA+eezcuUC8vl0VCn2KcA4nTarQDhg4I7bn+Gaz/9vkiShZSZYc+5ZXHjhhcye3c/uXXvZtm0bTzz+JHfccQeOm2F0dJx8oYSfKTJZqVPIl+np6+f889Zw0YXH4DsQeAfbXgLQNgJrEBJkajVDO9XW2qKtAiOIYvjElX/Ic89vpVqN8fwC2koSbZFSYq1FSIuwBtHeVa5ycFyfZqhTa8fKqR1nTDtqCIPVGqnAcSRSpVX8JImI4hY2bjI+vJMkqlGtv/7n+QSAk1tklyxZSiNskfPz/NEff55yqYtbbvk2P3nkCZRS1Ks1rDb4rkKbiEIuy9HHLuGiD72P1ccfiaOg2YBcJh04bGmCTKpgoihCSQ+poF4D14O/+dod/MVf/jX5UheT1QoSMeXmS5lWtYPAp9lsEgQB/TNmodwML215lUY9ord/Jutv/SI5H/LZfYsEEt3CUeKnUgiJTizGKhzlTi1V0y7uPfDATj5x5aeQTpZEQzZXZHyyQi6XJUpCtAlRUuC6ApNEtFoNADzPwyqT2nYIrFFY4yCEixQuSvqpKjaGxMRYmxIopUA5FocEYVtErRr1RoV6Y5JWs0q18rL4V0mbe/jZNlcoIqVLHFmWLVvOU08+jZQSz3FoNKpkMy5x0mJgdh8nHH8s6857H8uW92EFxKaJJ1O2ksjieQJhIYosUgocJ3VF9pXNjIVWC677+re4df29TEw2kAiSJGmXUSxCGubOHeDsc85i5apVLDy8xK3rH+GLf/plpPKJI/jkVR/l8stORRGTJHGaR9oEISRaJ+28TbQTbNXeDenZnBZiYWQYLr/iDxkZHqfRjLEojIFMLkcYNbEibi8E8HxJs15heHiIRqOFUpbe/iKu6+K5WZT0EHhY42KNg8FBGInZl2tKgURg0FiTYEnwlcUSt3tkDCZJCKM69UaFZrPKxMjPphBOsWeVdV0fZbNEDYElYPNTe1CijNExVqYX3dXTwYW/cSHnnH0mPb0dOHKfZZTgyv1iw/MEOgElwHPFQV6ycsxUupzNwe9ddSFr3vtuHnn0GR5+8GHGxkaYO3cuq49fybJlS+jpzZHJpiNrDSuPWwhmEsfJkxjN0089iuBUQKB1WptzlA/WomTbTts3YTZtg1CuM1Uyshr+/pvfY3S0nobFIINOIJvxqTeaWGvwfAehHKSyJElMK4pptCKiWg2I2DY5CEriZ/MUi2Vy2QKel8Fzs/huQNhM8LwAowWtyOAqBUKiEEjpEychQrgIodLQKsDxi3T6MxBdht6eRVbrJpWJIYb3/kRM7bSZc0+zXeUBIIvVAdY4WDRSWqJknHUXnM3Fl6xl8ZKOqUNQAolJEFKjkBhriCOLpzwcRyIshE2N3w6R+7uu7FT3lcXF4Ey5+lqnbj0qbScwot0X0p73ZgiX/ubH2LZtmHotYdbsHm695f9MNRiJAysEph3/1D7P0SKdtA3CcRVRlDA6EfGx3/0fPP3Mdnwvi+N4hK0E3/eJjcZ1JVHcwBKhlMBxUwXZajVIwgRLzODubURhHUw0tXCl56QtE9kchXwRz8ugZJCqbBFgSW9OSEWk05RBCInFwVqB0em5KNAoxyBFCKZOFI1SqQymRdDqxLZrwsRenZgmnidS1ScMUhqiqMmunTsZGtpLLttDd1d5yqx1lETiYLAo4eA4qt01YBHC4rgirZ+IA+o07PMDHQSCJInSdgWRhk5H7VNq6Tml2kMg0u9een6Ip558EUcUmJyssHLVkfTP6MVR+83gKcPatt1sSVuOg5KSONE4nsPNt9zGXXc9QBhrcoUc2mgSk6AchTEJjuOkoRqZLjUtwCqUClAqi6uyzOiZR1exn1yuE8/PICQkSZ2wOUmjPsxkdZhGcxxrQxxH4kiBNhodJyRJghAabQ3a2LQ9wiiQLq4X4PsBcZSGfSE09WaV8bE9+yvXrcbea6oTW6+x2Ktj3SDRdSwJQeCjpMvLL2/lnrv/iec2byGX66S3uyctzch2FxaCKI6JogbSSSfPWN0ujFqw6mcrm0KgpE2jfKKxxiKVnJLY1hiksBgrMEk6ZhRlufeef8b3y8RxQiZvOeWUVWm1QR+oXA+2LYXavwkTIxnaW+FLX/pzqnWNcjykEMRxgpIK13VJkhiEbivB/QtPCgclXZRycaQHRqJcl0IuT75YpFQski3kCYIAN+PTbDSIGy1qk1UmJitUqxW0jshkXHL5DFIaXEcilUCmiR3WJJgkJk5CpNR4HjRbk+zevZVWfav4F1VK78xjbUd+Bq7qwPfyaK1p1CbJZBXHrTiK1ccfzfkffC9BRlDI7dtLBokGdNsAklMi4OcVN7WN220H7kHfG5OWV5QSUyrPAo06fPADn2VwsIGhyZwFHjfd8pep1JDp3EoBOk5QKt22UajxfIW1EMbpMwRX/9fr+O767yPdLHEiMTFobQn8PFJKwjBN2JMkSRNlYdvnjsCadNFJC1HYSCW9VCAtKs0vwGoMMbl8hvHxMaq1cWq1CtWxJw6a876ZJ1jfCwgyBYIghxABiU2bdrXWeI4g0Q3GR3ezd8/D4nWXrTL5o2x310zKpR4UgjBqopQlm/NxA5fVx6/gnPecwbHHLaWjQ5DoBCU0nqP2V7I5MGztj5bGGoSwbWL3PQ9woLZNsEg0kjgGV8Kn//N13HnHg/hZB+GM841/+BqLFvbiyH0BOEHrGGdKPTpYoNkCz4NHHh3iqt//DM1WTKxFO38USJnuoiRJMDbBdRVKCeKkhdZxugiQaG3BpilK4HlYm4a21JsUKOmkNpewWJ0QJ008X6EcTaM5SRQ1adQnGd7zk6n5z+Tm2iDbQS5XJMhkCYJs6n8Ky57BnezZtlH8Qh3GzdrTYkftaXZsg77+lbZU6sKROVpNTaUCd37/UX5w+wP09xVYu/ZdXPyh99PfG2DaZZuppbEv4Rbm4A6FfZch9nOqTYzWLTwn9f0MEiscUB7Hn3gEd975fRB5Ws2Ee+95mMMXvg/d7kg2aBxlgJDEaBwZYKyLsRKt4Wtf+xuiUGONC1bhOP5+waLThaNUWskQFioTe6m1qvi+i+9nUErhexmCbIFqpYaj/HQXinRnW6kwxhJrQ8bLoo1o+5cG13HI5SSFXIjRyo7ufUQANOtbRbMO48PtPtPehdb3fYrFIs36nn97WzjA0OCjYmgQisUjbEdHP729C6nVQ1wnoNbQXH/9zdx407c5d827uOjiCzl8YedPZYWm3WNi2qatREnnoPYB0w6LSjpooqk2Hs8RxAmsOG4pfkZjTJNMUOKJx59H8L40jELqEcp0khypiE2ElD5BBjZseIlHH3sKxykQJRap0rCpE4O16Vb3PBfHFdRqTQSa8fFxGpOPHBSVnI4jbD5XpKvzsLaNJUEKBBIlDFYqpDYYY9qKUGA16ESDK9AmphXWX3OeJ/amRdahHb9Es+prIcgttaVyP11dXekBHmm0jsn6Adlchg9/+CLOOPM05s33QLadkkBN2Vuqncxq3X4EyqaNOZZ4ytmITZLuFtz0XGrBxRddwdZXR1BuN/lChrvu+nN8H4SNkEJgNEilMCQYBJFxqUxafu8Tn2fzM9vTBFhItNVYKZBCpf6hte3+yjQtCaMGjUaFWnWUWm0CG77wM3PmFY6w+XyWfD5PR0cJYRVxKPHcPFgfKRVxHBNHdfyMwfUS9o5sY+erj4g3pDTzi6JV3ywG65sZHZ1vi6Vuusp95LIdWCSVasjX/uZ6vnfHXbzjjJNYd8EaBmb5WKDesGQzHiYJ0+LkAfIuPTvS1aiki2x3LAubtgw4AhYvms+ObcPEcUyrJahUDD1dMnXgsUjhoGONdB2iJMFx4Ef3b+Tpp55HyA6kECRRTKYjQ2INOoqJo1QtKiFxHAflKFwnoFT06Sx2gkhI9FLbatVoNmqEYYvJkcdFVH1OjFVhbF/FpHS4zWc6KeS7EAQo6eG6Ltmci6Oa1Btj1KrDb35b+OtFvmOB7Sh0U8h3pk6AgVwuhzEJpXKec845m9+46AL6+tqqXGokaUZtDCRJKqsd54AmHbv/YpMkPbe+9a17+ML/vJbYFFBK8fXr/pTjjjkMpVLxsq+VTkqXBEmzCZdf/lkee/QlstkCHfk8lVqVRivE8Xx8N0hdFMDEOjWUtcb33TTEGQ0iaavI/WZBNuNTr1eoN8ap1sYYGXz8oDkNgqVWSo9cLkehkANajE8MMj72ojhkSNvfzXW4LZZ6KRW7cBxvyjjWWjNjRh9r167l/PPPZs6cACssRqdPzQjbzon3eZVqP3FTTcYWNm/ezSUf+g8It0gUJnz6U7/DZR95Z7tlb191QdIMNa4fcMMN9/OFL1xLJlMiiiKsbRHHEdlcR/vMaTsyJm1Ld5WPkJKoFU814gqZEiaEaCteiKMWxsYEGYuhyfDerQzueupNbTl4SxpS+vtW23JnD9lsHpC0Wi0cx6FcLvDud5/GGWeewooVC5Dt11l42QNyOJEW/K1J/USbPnvI+BisO/83majHtMKId515Otd++ao0T1MQJ5O4boDFZ2jY8JFLP8nuPWNYa0l0nRee/a4ICguskj6BnyOf7yCb6cB1U7vJJgKDwJHulItvjMGwv/RircV3A4SNcLyYWmOI7dufpVF/c9/E4LwVpA0O/VhMTM63vX0z6e7uwXUFYdhiZERz4423s379vaxYcTQXfvB8TjxhHti2bSjddqizSLkvp0tL/qUSHLviGH54/0Ycx+GVl3egk/Tp0YN6cQ3ceMN6BveMo6RLlFQYHd2VnsfVtARSB0b3tsNZZpHt6ChTKvYSZAskUQMrFFK4bUdEIV2BlKmFR2KQQhK1mkyOj7/phL1lpAG0Wq+I7dteYWh4tu3q7KZYLBNkOgnDLI2G4u57NvFP921i5YojOf8D53DSycfS2e0SJ7STdIMRBonEtpPoU049gXs2PITnBQyPjLFnEAZmp2HUdbNYXF5+pcbtt/0Qz81Qb1WxtsnI4GurtlbzJdFqwt6h9O9C4QjrB1nyuSJ+NoPjeKk6jNMmH6U9Mr5L2KpQq478aptV3yyEjR1id2MHu3dCV88y29OzGEmGQr4DIQ2PPvYsTzz1DEuPmMfyo5dw+RUfplR2cB055ahonfaNLFg4gDEGKR1q1QY7dgwyo78fMHi+i07gnx94jKHBcWINflawe3DXL3S91epzolpN625T4qKwwBayOTJBAYkHZKnVh6nWX35LjptDos251H2s7e6aQT5XROCjk7b5iMbYFmvOPYvzP3AOS44YIJvbXwVoRbBu3VUM7p7E6JiLP3gun/3DS6Z84rERy4UfuJLRsSrKk1Tru3n5xXt+7Z/FlofCRUyMPC62vPB98eq25xgbGUTHMUr6OCpHxu/mO7fcxYcv+R0uv+yTfOvmuxkbC9Mw4cBJJ56OthJrNVt3bN//cIiFG/5xPbV6iOd5hFGFicoQbweoQ+liwubgNZOTW64JI/9q2y7rhFGLUqlIudzJ8PAYd//wPjZseIgkyTJv3nyG9mo2bvwxSmiq1THOe+86MlnYsqXF//rSn1OpNHF8wXhlN4M7f/y2eOOBPBQvqlJ5VGzf8QOxc/dzNMMR9o7sYHhkEANkM2V2bh/jL669nnXnfYLHH386LaP4HuNjVZ5/YQcY+NbN32N4ZByUodEaZ2JykLcLnEP54qrVJ0W1CqWuw21MicSWcZ0ciACtfRoNuPeH95EkCdZ4eG6Ohx96mqzfx4YNG3EcD+nF7Ny1k+ov4UAcavi1uhE/P9d2dc2m2NGLJEsUg5UifX1FHKKEZPZh85k/dy6bNj1IGE9gVIVnn7zzbfUimF/bm+kbONl2lvtBZMgEeRrVBhgFiU/guSBDEjvC4NjzjOzePE3aoYRy3/G2t2cmnpNBCQ+pA7CGenOEbF7z+BPffdu9bultc0OzZx9vezp7gLSs0mrV2LV7K6PjL06TdiijszRg87kO8vk8jWaNrdufmX6F7jSmMY1pTGMa05jGNKYxjWlMYxrTmMY0pjGNaUxjGtOYxjSmMY1pTGMabzj+P866CFuDsTC3AAAAAElFTkSuQmCC";
const LOGO_DATA_URI =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI3MiIgaGVpZ2h0PSI3MCIgZmlsbD0ibm9uZSI+PGcgY2xpcC1wYXRoPSJ1cmwoI2EpIj48cGF0aCBmaWxsPSIjMkEyRTY1IiBkPSJNNjIuNyAxNC43di44aC4ybDEtLjFoLjhsLjUtLjEgMS4yLS4yaC4zbC41LS4xaC40cS40IDAgLjUuNHYuOGwuMS40LS4xLjFoLS4ybC0xLjMuM2gtLjJsLS44LjFoLS43Yy0xIC4zLTEgLjMtMi4xLjN2LjdsLjgtLjEgMS44LS4yaC42cS4zLjkuMyAxLjdINjZsLTEuMS4yLTEgLjItMS4zLjJoLS45bC0uOS4yaC0uN3YuMWwuMyAxLjQuMSAxLjEuMS43cTAgLjQtLjMuNGgtMy4xbC0uOS4xaC04LjJxLS44IDAtMS40LjJoLTIuOXYtLjVsLS4yLTEuMXYtMWwtLjItMS4zLS4yLTEuOFYxOGwtLjEtMS0uMi0ydi0xLjRxMC0uMi4yLS4zaDFsLjYtLjEgMS44LS4xaC45bDEuOC0uMUg1MWwuMi0uMWguN2wxLjUtLjJoNC41cS40LS4yIDEtLjFoLjVsLjQtLjFoLjVsMS41LS4xIDEuMS0uMmguNWwxLjEtLjEgMS44LS4zaC43bDEuNS0uMSAxLjItLjEgMS4xLS4xLjYtLjFxLjMgMCAuMy4zdjEuNHEwIC4xIDAgLjJoLS4ycS0uNyAwLTEuMy4zbC0xLjIuMS0uOS4yLTEgLjEtMSAuMi0xLjUuMmgtMWwtLjguMm0tMTcuNC0uMi41LjZxMCAuMy40LjVsMS4xIDEuMyAxIDFxLjQuNi45IDFsLjQuNC40LjQuNy4zaC45cS4zIDAgLjQgMGwuOS0uNS4zLS4zLjYtLjcuNy0uNy42LS42IDEtMS40LjctLjcuMy0uNS41LS41aC01LjFsLTEgLjEtMSAuMS0zIC4yaC0yLjJNNTggMjNsLS4yLS40LTEtMS40LS43LS44LS4zLS40LS44LTFxLS4yIDAtLjMuMmwtLjcuNy0xLjEgMS0uNi4zLS42LjItMS0uMS0xLjYtMS0uNi0uNS0uMS0uMS0uNyAxLTEuNiAyLjV2LjFsMS4yLS4xSDQ5bC44LS4xaDYuM3pNNDcuOCAxOWgtLjFsLTEuMy0xLjMtLjYtLjYtMS0xLjEtLjYtLjhWMThsLjIuOXYxbC4zIDIuMi4xIDEgLjEuMXptMTEuNCAzLjdWMjFsLS4yLS44di0xLjZsLS4yLTEuNC0uMi0xLjZ2LTEuMWwtLjYuNy0uOCAxLS4zLjYtLjIuMi0uNi42LS4zLjMuNS44LjUuNiAxLjQgMiAuMy40eiIvPjxwYXRoIGZpbGw9IiNmZmYiIGQ9Ik00NS4zIDE0LjVoMi4ybDMtLjJoMWwxLS4xaDEuN2wxLjctLjJoMS43di4xbC0uNS41cTAgLjMtLjMuNWwtLjcuNy0xIDEuNC0uNi42LS43LjctLjYuNy0uMy4zLS45LjVxMCAwLS40IDBoLTFsLS42LS4zLS40LS40LS4zLS4zaC0uMWwtMS0xLS45LTEtMS4xLTEuNC0uNC0uNXoiLz48cGF0aCBmaWxsPSIjZmZmIiBkPSJNNTggMjIuOUg1NWwtLjcuMWgtNy4xbC0xLjIuMnYtLjFsMi4zLTMuNS43LjYgMS41IDFxLjUuMiAxLjEgMGguNmwuNi0uNCAxLjEtMSAuNy0uNy4yLS4zLjEuMi44LjkuMy40LjYuOCAxIDEuNHpNNDcuOCAxOWwtMi45IDQuMVYyM2wtLjItLjl2LS44bC0uMy0xLjV2LTFsLS4xLS44LS4xLTIuNy42LjggMSAxLjEuNi42IDEuMyAxLjJ6TTU5LjIgMjIuN2wtLjctLjktLjMtLjQtMS45LTIuNi0uNi0uN1YxOGwuNC0uMy42LS42LjItLjJxMC0uMy4zLS41bC44LTEuMS41LS43LjEgMSAuMiAxLjcuMSAxLjR2MWwuMS42LjEuOHYuNGwuMS44eiIvPjxwYXRoIGZpbGw9IiM4NjE2MjkiIGQ9Ik02Mi4xIDMxLjdoLS4zbC0yLjYuMmgtMS42di0xLjNsLS4xLS41VjMwbC0uNS0uNnEtLjQtLjMtLjctLjFsLS40LjFxLS4zIDAtLjQuM2wtLjEuMS0uMi4zdjEuNGgxLjFsLjIuMXYxLjloLTEuM3YuOGgxLjR2LjRsLjEgMXYuM2wtLjEuMUg1NmwtLjIuMWgtLjd2LjJsLjEgMSAuMi40LjIuMmguMWwuMy4yaC42bC4yLS4xLjItLjJxLjMtLjMuMi0uNmwuMS0uNS4xLS40di0uMkg2MlYzOGwtLjEuN3EwIC40LS4zLjhsLS41LjYtLjEuMS0uNS41LS4zLjMtLjguNC0xLjEuMi0uNC4xaC0yLjNsLS42LS4xLTEuNC0uNC0uMy0uMi0uNi0uM2gtLjFxLS41LS40LS44LS45bC0uNC0uNC0uNC0xdi0uNmwtLjMtMWgtMS4xbC0uMi0uMXYtMmgxLjJ2LS45aC0xLjF2LTEuOGwuMS0uMmgxbC4xLS4zdi0uMmwuMS0uMi4yLS45cTAtLjYuNC0xLjJsLjUtMSAuNy0uNy40LS4zLjMtLjIuMy0uMkw1NSAyNmwuNy0uMWgxbC43LjEgMS41LjNxLjQgMCAuOC4zbC40LjMuMy4zLjUuNS4zLjQuMi4zLjQuNy4xLjV2LjdsLjIuNnpNMjkuMyA0Mi42aDVsLS4xIDF2LjFMMzQgNDVsLS4xIDEtLjEuOHYuNmwtLjEuNHYuNWwtLjIgMS42LS4xIDEuMnYuNmwtLjIgMS41djEuNWwtLjEuNS0uMSAxLS4xLjd2MWwtLjEuMWgtNC43cS0uMiAwLS4yLS4ydi0uNGwuMS0xVjU2bC4yLTEuMnYtMS4xbC4xLTEuMnYtLjNsLjItMXYtLjRIMjdsLS4xLjV2LjlxLS4yLjgtLjIgMS41bC0uMSAxLjN2LjZsLS4xLjItLjEgMS4zLS4xLjdIMjZsLTEuMi4yaC0zLjJsLS4xLS4ydi0xLjRsLjItMS4ydi0uNWwuMS0uNnYtLjdsLjItMSAuMS0uOHYtLjhsLjItMXYtMS4ybC4yLTFWNDdsLjEtMS4zLjMtMS44LjEtMXYtLjFoMS40bDEuNy0uMUgyOHYuMWwtLjEuOXYuOGwtLjEuNi0uMSAxLjItLjEuNXYuMmgxLjN2LTFMMjkgNDV2LS43bC4yLS42di0uNHpNMzUuMyAzMy45bC0uMy0uNS0uMS0uNS0uMi0uNi0uMy0uOC0uMS0uMi0uMS4xLS42IDEuMi0uMy43LS40LjZoLS4ybC0uNC4xaC0xLjZsLS45LjFIMjlsLS4xLS4yLjItLjYuMy0uNnEwLS40LjQtMWwuNC0xIC4zLS43LjItLjUuNC0xLjEuMi0uNC4yLS4zLjItLjQuMi0uNS4zLS45cS4zLS4zLjEtLjRsLS4yLS42LS4yLS42LS4zLS45LS4zLS45LS4zLS42di0uMmwtLjQtMS0uMy0uOS0uNC0xLjEtLjEtLjR2LS4xbC4xLS4ySDM0bC41IDEgLjYgMS4ydi4xbC41LS44LjUtMSAuMy0uN2g0LjF2LjJsLS4xLjNxLS4yLjMtLjMuN2wtLjMuOC0uMy43cTAgLjQtLjMuN2wtLjQgMS0uMy42LS41IDEuMS0uNyAxLjV2LjJsLjEuNC45IDIuNS4zLjkuMy42di4zbC4zLjUuMi42LjMuOS4yLjQuMi42LjEuMy0uMS4xaC0xLjFsLS43LjFoLTIuOU0xOC4zIDIzLjJsLS4yIDEuNGgyLjdxLjIgMCAuMi4ybC0uMiAxLjQtLjIgMS40di40bC0uMi41cTAgLjMtLjMuNGgtMi42bC0uMS40LS4yLjl2LjVsLS4xLjgtLjIuOHYxLjZxMCAuMy0uMy4zSDEycS0uMi0uMi0uMi0uM1YzM2wuMi0uOS4xLTEuMS4xLS43di0uNWwuMS0xIC4yLS45di0uN2wuMi0uNi4xLTEuMi4xLS45LjMtMS4xVjIzbC4yLTEuMS4xLS44LjItMS41VjE5bC4yLS43di0uM3EwLS4yLjItLjJIMjBsMi42LjF2LjZsLS4zIDEuMi0uMS45LS4zIDEuNXYuOGwtLjMuMWgtMS4zbC0uNi4xaC0xLjMiLz48cGF0aCBmaWxsPSIjODYxNjI5IiBkPSJNNDQuMiAyNmgyLjZsMi0uMWguNHYxLjZsLS4xIDEtLjEuOC0uMS41LS4yIDEuMi0uMSAxcTAgLjUtLjIgMWwtLjEgMS0uMS41LS4zIDEuOS0uMS41LS40IDEtLjMuOS0uNC42LS4zLjQtLjEuMS0uNi42LS41LjQtLjYuMi0uNy4zaC0yLjdxLS44IDAtMS40LS4ybC0uNi0uMy0uNC0uMi0uNi0uNC0uNC0uMi0uNS0uNC0uMy0uMy0uMy0uNmExMSAxMSAwIDAgMS0uOC0zLjV2LS4yaC4ybC40LS4xaDMuM2wuNi0uMS4yLjF2LjJsLS4xLjV2LjVsLjIuMy41LjRoLjlxLjUtLjIuNi0uN2wuMS0uNS4xLS40LjEtLjcuMS0xLjIuMS0xIC4xLS44LjItMS4yLjEtLjV2LS4zbC4yLTEuNnEwLTEgLjMtMS43ek0yMS4xIDQ3LjhIMjFsLS45LjFoLTNsLS4yLS4xdi0uNGwtLjItMS41cS0uMS0uMy0uNS0uNGwtLjMuMS0uMy4zcTAgLjQgMCAuOHYuM2wuMy45LjEuMS4zLjIgMS4xLjUgMiAuOS44LjcuMy40LjUgMS41VjU0bC0uMyAxLS4zLjgtLjkgMS41cS0uMi4zLS42LjVsLS43LjMtLjguMmgtMi42bC0uOS0uMi0uNC0uMy0uMy0uMi0uMi0uMS0uNi0uNi0xLTEuOHEtLjMtLjUtLjMtMWwtLjEtMVY1Mmw0LS4zLjIgMS40LjEuN3EwIC4zLjQuNWEuNy43IDAgMCAwIDEtLjdsLS4yLTEuNXEtLjEtLjMtLjUtLjZsLS4yLS4yLS43LS40LTEuMi0uNC0xLS41cS0uOC0uNS0xLjEtMS4xIDAtLjMtLjMtLjUtLjMtLjgtLjItMS43bC4xLTEgLjItLjZxLjItLjcuNi0xLjJsLjQtLjQuMi0uMi41LS40LjctLjQuOC0uMmguNWwxLS4xcS44IDAgMS40LjJsMS41LjUuOC43cS41LjUuNyAxLjJsLjIuNC4yLjkuMS45di45TTQ1LjMgNDcuN2gtMy41bC0uMS0uMXYtLjdsLjItMXYtMWwuMi0uOHYtMS4ybC4xLS4zaDEybC4yLjFxLjMgMCAuMi4ydi40bC0uMSAxLjItLjEgMS0uMiAxLjR2LjZsLS4yLjFoLTFsLTEuMi4xaC0xLjN2LjVsLS4yIDEuNXYuOWwtLjMgMS44di44bC0uMSAxLjJ2LjFsLS4xIDF2Mi4zbC0uMy4yaC01LjF2LS40bC4xLTEuNy4yLTEuM3YtMWwuMS0xLjF2LS45bC4yLTEuMnYtMWwuMi0xLjF2LS42TTM0LjUgNTkuMXYtMWwuMS0uNFY1NmwuMS0uNS4xLTFMMzUgNTN2LS42bC4xLS41LjEtMS4zVjUwbC4xLTEuM3YtLjVsLjItMS4ydi0uNGwuMS0uOXYtMi41bC4xLS41cTAtLjMuMy0uM2g1di45bC0uMi43djFsLS4xIDEuNnYuMmwtLjIgMS42di42bC0uMS41LS4xIDEuNS0uMSAxLjItLjEgMS4zdi43bC0uMSAxLjN2MS43bC0uMSAxLjJ2LjVoMS41di4zbC0uNyAxLS42LjgtLjYgMS0uNC42LS42LjktLjggMS0uMS4yLS40LjQtLjIuMy0uMS4xLS4yLS4xLS44LTEuMnEwLS4zLS40LS42di0uMWwtLjUtLjgtMS0xLjYtLjItLjQtLjItLjQtLjQtLjctLjItLjN2LS4yaDEuNHpNMjMuOSAyMy42YTMgMyAwIDAgMS0xLTEuM2wtLjItLjZ2LS45bC4xLS40LjEtLjUuMi0uNC4yLS40LjMtLjRxLjMgMCAuNS0uNGwxLS41aDEuMXEuNCAwIDEgLjJsLjcuNy4zLjYuMy41LjIgMS0uMS43LS42IDEuMi0uNS43LS4yLjEtLjIuMnYuOGwuMS43LjEgMXYuN2wuMS44LjEgMS4zdjEuMmwuMiAxLjN2Mi40bC0uMS4zSDIzbC0uNy0uMWgtMS42di0uNWwuMi0uNC44LTIuMi4xLS42LjQtMS4xcTAtLjUuMy0uOGwuMi0uOS4zLTEgLjEtLjRxLjItLjUuMy0xbC4yLS45eiIvPjxwYXRoIGZpbGw9IiMyQTJFNjUiIGQ9Ik0zMy42IDE2LjNWOS42SDMzbC0xLjIuMUgzMXYxLjRsLS4xIDF2MWwtLjEuNFYxNmwtLjEuNGgtMi4zbC0uMi0uMnYtMi43bC4xLTF2LTEuN2wuMS0uOXYtLjNsLjItMi4yLjgtMSAuNy0uOC43LS45LjYtLjcuOC0xIC4xLS4yLjUtLjRxMC0uMy4zLS40bC4yLS4ydi0uMmwuNy0uNy41LS40LjEtLjEuMy0uMnEwLS4yLjIgMGwuNS40LjEuMi4zLjMuMi40LjYuNi41LjYuNC41LjUuNS41LjYuNi45IDEuNyAyLjF2LjVxLjMuNS4yLjhWMTJsLjEuOFYxNmwtLjEuMmgtNi43bC0uOS4xem0xLjgtMy40aDJsLjItLjEuOS0uMS4xLS4zVjkuNWgtMy4xVjEzTTkuMyAzOC40aDExLjJxMS40LjIgMi43LjJoNS42di4ybC4yIDJxMCAuNC4zLjRIMzFxLjIgMCAuMi0uMnYtMS44bC0uMS0uNGgxbC4xLjUuMiAxLjV2LjJxMCAuMy4zLjNoMS41bC40LS4ydi0xbC0uMi0xLjFxMC0uOS0uMy0xLjd2LS44bC0uMS0uMnEwLS4yLS4yLS4yaC0uM2wtMS43LS4yaC0xLjZsLS40LS4xaC00LjVsLTUuOC0uMkg5LjRxLS4yLS4yLS4yLS40bC0uMS0xcS0uMy0uNy0xLTEuNS0uNi0uNi0xLjItLjZINS4zbC0xLjQuNi0uNC41UTMgMzQgMyAzNC44bC0uMSAxdi40cS0uMi44LS4yIDEuNGE3IDcgMCAwIDAgLjcgMi40cS42IDEuMiAyIDEuMkg3cTEgMCAxLjYtLjh0LjgtMS45em0tNC0uOFYzN2wuMy0xLjhxMC0uNi42LS42LjUtLjEuNy4zbC4xLjJxLjEuNi4xIDFMNyAzNy40cTAgLjUtLjMuOC0uMy41LS43LjRsLS41LS40ek02NiA1MC43di41bC44LS4yLjYtLjFoLjFsLjUtLjEgMS4zLS4yaC43di44bC0uMS4yLS4yLjEtLjcuMmgtLjVsLS41LjJoLS40bC0uNy4xLTEgLjJ2LjVoLjNsLjctLjIuNy0uMmguNGwuMi0uMS4yLjF2LjlsLS4yLjItLjQuMS0uNS4xLS44LjItMS4xLjItMSAuM2gtLjJ2MS4ybC0uMS41djFsLS4xLjRxMCAuMy0uMy4zaC02LjNsLTEuMy0uMWgtNC41di0xLjRsLjEtLjN2LS43bC4xLS42LjEtMS43di0yLjRsLjEtLjh2LS4zbC4yLS4xaDIuNWwxLjMtLjFoOC4zbC44LS4yaC42bC42LS4xaC4zbC43LS4xaC41bDEuMi0uMWguMWwuOC0uMWguM2wuOS0uMmguOHEwIDAgMCAuMnYxbC0uMy4yLTEgLjFoLS43bC0uNy4yaC0uOGwtMSAuMi0uNS4xaC0uNGwtLjMuMXptLTMtLjdoLTkuNnYuMWwuMi4zLjQuNHEwIC4zLjMuNGwuOC44IDEuMyAxLjQuOC44aC45bC44LS44LjgtLjcuMy0uMy41LS40IDEuMi0xIC41LS40em0tMy41IDMuN2gtLjFsLS44LjgtLjguNC0uNy0uMXEtLjQgMC0uNi0uNEw1NiA1NEg1NmwtLjMuMy0uNS43LS42LjYtLjUuNy0uOC44aDlsLS40LS41LS41LS42VjU2bC0uNi0uNi0xLTEuMnptNC4yLTMuNS0uOC43LS43LjUtLjYuNS0uNS40LS4zLjItLjcuNi4yLjQuNi42LjkgMS4xdi4xbC4yLjMuNC40LjQuNi40LjVoLjF2LS41bC4xLS44di0xLjJsLjEtMVY1M2wuMS0xdi0xLjFsLjEtLjV6bS04IDMuM3EtLjItLjEtLjMtLjJsLS42LS44LS40LS40LS4zLS4zLS43LS44LS43LS44aC0uMWwtLjEgMS4ydjFsLS4xLjl2Mi45bC0uMS44di4xbC40LS41LjctLjcuNy0uNy4yLS4zLjctLjd6Ii8+PHBhdGggZmlsbD0iI2ZmZiIgZD0iTTYzIDUwcS0uNC40LS44LjZsLS41LjQtLjcuNS0uNS41LS41LjQtLjMuMy0uOC43LS44LjctLjQuMi0uNS0uMS0uNS0uNS0uMy0uMy0xLjMtMS40LS4zLS4zLS41LS41LS4zLS40LS40LS40LS4yLS4zaDIuNXEuMi0uMS40IDBoNi42Ii8+PHBhdGggZmlsbD0iI2ZmZiIgZD0ibTU5LjUgNTMuNy4zLjQuNi42LjQuNi41LjYuMS4xLjUuNi40LjVoLTguOWwuNy0uOC42LS43LjUtLjYuNS0uNy4zLS40LjUuNXEuMS4zLjYuNGguN3EuNSAwIC44LS4zbC44LS43ek02My43IDUwLjJ2MS43bC0uMSAxdi42bC0uMSAxLjEtLjEgMS4ydjEuM2gtLjJsLS40LS41LS40LS42LS40LS40cTAgMC0uMi0uM2wtMS0xLjItLjUtLjYtLjMtLjNoLjFsLjctLjcuMy0uMi41LS40LjctLjUuNi0uNXpNNTUuNiA1My41bC0uNi43LS43LjctLjIuMy0uNy43LS43LjdxMCAuMy0uMy40bC0uMS4xdi0zLjhsLjEtLjkuMS0xdi0xLjJoLjJsLjcuOC43LjguMy4zLjQuNC42Ljh6Ii8+PHBhdGggZmlsbD0iIzJBMkU2NSIgZD0ibTQxLjEgNjMgLjQtLjIgMi4xLTEgMS0uNSAxLjQtLjYgMS0uNS41LS4zaDIuOGwyLjItLjJoMy45bDEgLjFoNy4zbDIuNS4xaDIuNGwuMi4yLjEuNS0uMSAxLjctLjEgMS4yLS4xIDIuNHYxbC0uMy4yLS41LjFoLTVsLTEuMS4xaC0xLjVsLTUuOC0uMmgtNS42bC0xIC4xSDQ4bC0uNC0uMS0uNy0uNC0uNi0uMy0uMy0uMi0xLjMtLjktMS0uNS0xLS43LTEuNS0xem02LjgtMi4yLS40LjEtLjQuMi0uNC4yLS44LjUtMS4xLjUtLjEgMnExLjQgMSAzIDJ2LTEuNGwuMS0zeiIvPjxwYXRoIGZpbGw9IiNmZmYiIGQ9Ik00Ny45IDYwLjhWNjJsLS4yIDIuOXYxLjNxLTEuNi0uOC0zLTEuOWwuMS0yIDEtLjUgMS4zLS43cS4zIDAgLjQtLjJ6Ii8+PHBhdGggZmlsbD0iIzJBMkU2NSIgZD0ibTcuNCA2NiAuOC0uMiAxLjItLjEuOC0uMnEuNS0uMiAxLjItLjNoLjF2LS42SDExbC0xLjYuNC0uOS4yLTEuMy4yLTEuNS4yLTEgLjJIMy40bC0uMS0uMy4yLTEuNC41LS4xIDEuNC0uMiAzLjQtLjYgMS43LS4yIDEtLjN2LS44aC0uMmwtMS4zLjItMS40LjItMi4yLjQtMS4xLjItMi4yLjItMS4zLjEtMS41LjJxLS4zIDAtLjMtLjJ2LTEuOXEwLS4zLjMtLjJsMS40LS4xaC45bDEuMi0uMyAyLjQtLjQgMS4yLS4xLjctLjEgMi41LS4yIDEuNi0uMnExLS4zIDIuMS0uMWg4LjVsLjQtLjEgMS43LS4xSDMxcS4zIDAgLjMuM3YuNWwtLjEgMi0uMSAxLjMtLjIgMS44LS4yIDEuOC0uMiAxLjl2LjZxLS4xLjQtLjUuNGgtMi45bC0xLS4xaC0zLjVsLTEtLjFoLTMuMWwtMi4zLjJIMTNxLS4zIDAtLjMtLjR2LS40bC4yLTJWNjdoLS4zcS0xLjMuNC0yLjguNmgtLjRsLTEuMy4yaC0uN3EtLjIgMC0uMi0uMnYtMS41bTguNS01LjV2LjFsLjUuNi44LjguNC41cS40LjggMS4yIDEuNGwuMi4yLjkuOS4yLjIuNy4zcS42LjMgMS0uMmwxLjMtMSAyLjctMnEuMy0uNC44LS41bC43LS41IDEuMy0uOC4xLS4yaC01LjlsLS40LjFoLTEuOXEtLjcuMS0xLjYgMGgtM20yIDQuMXYuMnEtLjcuOC0xLjIgMS44bC0xLjQgMi4ydi4xaDEwLjJsMi0uMmguMmwtMi40LTQuNXEtLjQgMC0uNy4zbC0xLjIgMS0uNi41LTEgLjYtLjcuMnEtLjYgMC0xLjItLjRsLS42LS41em0xMS40IDMuOXYtLjdsLjEtLjcuMi0xLjQuMi0yLjcuMS0uNi4yLTEuNHYtLjRxLTEuOCAxLjUtMy44IDIuN2wtLjIuMi4xLjIuOCAxLjIgMS40IDIuMy43IDEuMnptLTE1LjIgMCAuMy0uNC4zLS42LjctMXYtLjFsMS4zLTIgLjQtLjUtLjctLjgtLjUtLjctLjYtLjgtLjctLjd2LjJsLS4yIDEuOS0uMSAydi43UTE0IDY3IDE0IDY4LjJ6Ii8+PHBhdGggZmlsbD0iI2ZmZiIgZD0iTTE1LjkgNjAuNWgyLjZxLjItLjEuNCAwaDMuNWwuNC0uMWg1LjNsLjYtLjEtLjEuMi0xLjMuOC0uNy41cS0uNSAwLS44LjRsLTIuNyAyLTEuMiAxLjFhMSAxIDAgMCAxLTEuMS4ycS0uNCAwLS43LS4zTDIwIDY1IDE5IDY0bC0uMi0uM3EtLjctLjYtMS4yLTEuM2wtLjQtLjUtLjgtLjgtLjQtLjZ6Ii8+PHBhdGggZmlsbD0iI2ZmZiIgZD0ibTE4IDY0LjYgMS4zIDEuMy42LjVxLjYuNCAxLjIuNHQuOC0uMmwuOS0uNi42LS41IDEuMi0xIC42LS40aC4xdi4ybDIuNCA0LjNxMCAuMi0uMy4xbC0xLjkuMUgxOWwtMS41LjFoLTIuMnYtLjFsLjMtLjUgMS4xLTEuN3EuNS0xIDEuMi0xLjh6TTI5LjMgNjguNWwtLjItLjEtLjctMS4yTDI3IDY1bC0uOC0xLjJ2LS4ybC4xLS4yIDMuOS0yLjctLjEuNC0uMiAxLjR2LjZsLS4zIDIuNy0uMiAxLjR6TTE0IDY4LjR2LS4ybC4zLTMuMi4xLTIgLjItMS45di0uMmwuNy43LjYuOC41LjcuNy44LS40LjVxLS43IDEtMS4yIDJsLS44IDEuMS0uMy42LS4zLjNNMTMuNyAxNGwxLTEuMiAxLjYtLjggMS42LS4zIDEgLjIgMSAuOS40LjktLjUgMS0yIDEuNi0yLjUuNC0xLjItLjQtLjctMS40eiIvPjxwYXRoIGZpbGw9IiMyQTJFNjUiIGQ9Ik0xMy4zIDE1LjFWMTRsLjEtLjFxLjYtLjkgMS40LTEuM2wuMy0uMi40LS4yLjYtLjIuNS0uMnEuMyAwIC44IDBsLjItLjFoMS4zbDEgLjguNC42LjIuNHYuN2wtLjEuMy0uMy42cS0uNi43LTEuMiAxbC0uMy4yLS41LjItLjMuMnEtLjIgMC0uNS4yaC0uMWwtLjguMmgtMS42cS0uNSAwLS44LS4zbC0uMi0uMi0uNC0xem0zLjMgMXEuOCAwIDEuNS0uNmguMXEuMyAwIC41LS4zbC40LS4zLjItLjIuMy0uNi4yLS42VjEzbC0uNC0uNS0uNS0uNC0uNC0uMmgtMWwtMSAuMS0uNC4ySDE2bC0uNC4yLS42LjMtMSAuOC0uMy43di40bC4zIDFxLjIuNS44LjVoLjh6Ii8+PHBhdGggZmlsbD0iIzJBMkU2NSIgZD0ibTE2LjkgMTQuOS0uNC0xLjNoLS4xcS0uMi41LS42LjdsLS4yLjJoLS4ybC0uMS0uNFYxNHEuNCAwIC41LS4zbC4zLS42VjEzbC4xLS4xLjUtLjJoLjFsLjIuNi4yLjcuMi42di4xbC41LS4xLjQtLjJoLjJ2LjJxLjMuMy0uMS41bC0uNS4yLS45LjItLjguNEgxNnEtLjEtLjItLjEtLjR6Ii8+PHBhdGggZmlsbD0iI2ZmZiIgZD0ibTU2LjcgNDUgMS0xIDEuNi0uNCAyLjUuNy43LjYuMSAxLS4zLjgtMS40LjgtMiAuMi0yLjItMS0uMi0uOXoiLz48cGF0aCBmaWxsPSIjMkEyRTY1IiBkPSJNNTkuMyA0Ny45aC0uNmwtLjYtLjEtMS40LS44LS4xLS4xLS4zLTF2LS41bC4yLS43LjItLjNxLjctLjcgMS43LTFoMS40bDEuMi4zLjguNC41LjRxLjMgMCAuMy4zbC4yLjVxLjIuNiAwIDFhMiAyIDAgMCAxLS44IDFsLTEgLjQtLjYuMWgtMS4xbS40LS42aDFsLjYtLjIuNy0uNHEuNC0uMy41LS44di0uMnEwLS41LS40LS45SDYycS0uNC0uNC0xLS42dC0xLjMtLjNoLTEuNGwtLjUuMi0uMS4xLS4zLjItLjMuMy0uNC42di45bC4zLjMuMy4yLjguNC44LjJ6Ii8+PHBhdGggZmlsbD0iIzJBMkU2NSIgZD0ibTYxLjIgNDUuNy4yLS4zcS4xIDAgLjQgMGguMXYuM2wtLjQuMy0uMy4zLS41LjRoLS4zdi0uMWwuMi0uNGguMXEtLjUtLjQtMS0uNWwtLjQtLjEtLjgtLjNoLS4xdi42bC0uMi4xSDU4di0uMnEwLS40LS4yLS44di0uMmwuMS0uM2guMmwuMy4yLjMuMSAxLjcuN3oiLz48cGF0aCBmaWxsPSIjZmZmIiBkPSJtMjUuMyAxNC4yIDEuNS0xLjguNS0xLjQtLjMtMS4yLTEuMy0uOS0xLjUuNC0xIC40LS42LjgtLjggMS40LS41IDEuNC4yIDEgMS4yIDEuMmguOGwxLjQtLjd6Ii8+PHBhdGggZmlsbD0iIzJBMkU2NSIgZD0iTTIzLjMgMTUuOGgtLjZsLS44LS41LS41LS43LS4yLS42cTAtLjguMi0xLjRsLjItMSAuMy0uNC4yLS40LjUtLjYuNi0uNi4zLS4zcS4zIDAgLjUtLjMuNy0uNSAxLjYtLjMuNCAwIC43LjNsLjcuNS41Ljd2LjJxLjIuNSAwIC44YTYgNiAwIDAgMS0uOSAyLjNsLS42LjktLjcuNkgyNXEtLjYuNi0xLjMuOHptLTEuNy0yLjF2LjZsLjUuNS4yLjIuNC4yaC42bDEtLjQuMy0uMS40LS41LjUtLjYuMi0uMyAxLTEuN3EuMy0uNS4zLTEuMXQtLjUtLjlsLS42LS40cS0uNC0uNC0uOC0uMWgtLjNsLS4yLjEtLjMuMi0uOS40LS42LjctLjggMS4xLS40IDEuNnoiLz48cGF0aCBmaWxsPSIjMkEyRTY1IiBkPSJtMjMuMSAxMi44LjguN3EuMiAwIC4zLjIgMCAwIDAgLjJ2LjJxLS4xLjMtLjUgMGwtLjgtLjVoLS4xbC0uNS0uM3EtLjIgMC0uMS0uM2wuMS0uMnEuNC0uNSAxLS42bC42LS4xcS42IDAgMS0uNGwuMy0uMnYtLjJMMjUgMTFxLS40LS4zLS43LS4xbC0uMy4yaC0uM2wtLjItLjF2LS4zcS4zLS41IDEtLjUuNi0uMSAxIC40bC4xLjRxLjEuNi0uMiAxbC0uMy4yLS4zLjMtMSAuMmgtLjV6Ii8+PHBhdGggZmlsbD0iI2ZmZiIgZD0ibTYyLjMgNDEuMiAxLjMtMS4xIDEuNy0uMSAxLjUuOS45LjkuNSAxLjR2LjhsLS45IDEuMi0xLjUuMi0yLjItMS4zLTEuMS0xLjZ6Ii8+PHBhdGggZmlsbD0iIzJBMkU2NSIgZD0ibTYyLjQgNDAuNy40LS40LjktLjVoLjlxLjcgMCAxLjMuM2wxIC42LjguOC44IDEuN3YuN2wtLjEuMi0uNS43LS40LjVxLS4yLjItLjUuM2gtMS40bC0xLS4zLS41LS4zLS42LS41LS41LS41LS41LS43LS41LTEuMXYtMWwuMi0uMnptMiAzLjcuNi40cS42LjMgMS4xLjJoLjlsLjItLjIuNy0uOHEuMiAwIC4xLS40di0uM2wtLjUtMS4zLS43LTEtLjMtLjEtLjUtLjMtMS0uMy0uNS0uMWgtLjdsLS40LjNxLS40LjEtLjcuNi0uMi4zLS4yLjYuMS42LjYgMS4zdDEuMiAxLjQiLz48cGF0aCBmaWxsPSIjMkEyRTY1IiBkPSJtNjUuMSA0MS41LS4yLjF2LjFxLjUuNS4xIDEtLjMuNy0xIC40LS40LS4xLS40LS43IDAtLjIuMi0uMmguMnYuMmwuMi4zLjMtLjF2LS43bC0uMy0uMXYtLjNsLjItLjEuNy0uM2guM3EuMyAwIC41LjMgMCAwIDAgLjJsLS4xLjJoLS40ek02NS4zIDQyLjZxLjMgMCAuNC0uMy4zLS4zLjctLjJ0LjMuM3YuNHEwIC42LS42IDFsLS40LjJxLS4zIDAtLjYtLjJsLS4xLS4zdi0uNHEuMy0uMi4zLS41bS44LjcuMy0uNnYtLjJoLS4zbC0uNi42LS4yLjNxMCAuMy4zLjNsLjItLjF6Ii8+PC9nPjxkZWZzPjxjbGlwUGF0aCBpZD0iYSI+PHBhdGggZmlsbD0iI2ZmZiIgZD0iTTAgMGg3MnY3MEgweiIvPjwvY2xpcFBhdGg+PC9kZWZzPjwvc3ZnPg==";

function Logo({ height = 108 }) {
  // Real "Fix je Shit" logo (wordmark + decorations in one SVG).
  // Optimized with svgo precision=1, embedded as a base64 data URI → works everywhere.
  return (
    <img
      src={LOGO_DATA_URI}
      alt="Fix je Shit"
      style={{ height, width: "auto", display: "block" }}
      draggable="false"
    />
  );
}

/* Background decoration glyphs (design icons, circle background removed) */
const DECO_GELD =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAMAAADVRocKAAAAwFBMVEVcZZmeqciKlLemsc9xcbB5g6sSFlsAAP/Q3e57e3yNl7i3yuJ7hbCgpa5veaiFj7F/f/8pKXU9RIQA//+VoMNESn07Qnx6hrA0O4Nlpq1sdap///9doeXgsOoAAD8/P78/f38AVaq/v3+KlcC/37+5x9z/AP///38AAAAnLWktM27+/v4cImRPVpBsdqhueKoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC4p8ifAAAAMHRSTlP0WaAqBt37ARkCaR6hEKzYAgP+AY73/3v+DnoCBA76BAQDBMcISQECAP7+BPz99s/OO65/AAAFK0lEQVR42u2ZiXLjNgyGQVLUffh2jm63dylSpN7/7fpTSho7iSXFjNvOdjmZOHEy/AjgBwjIpC4vo6bXSi1YpAKXmTlMMODmFlwPMNd4aiHA3NKC5NYuCgQk/74F6jvg2wAk36CLkpt56WaA7a0B5y7aXl9r5so3BWnw01W0VYIzdf+RW+hjgEfFpDTKGHOrPNgWFZfs8120ivzKVIXT19QrIW5jQSVUQXrfpDu2+N6mRSnDaqrrEsdmFN9JIarqcywY0yNTzBE5ko0Q/d2mLpQS6VIDDC2QtZHEWX7MuSPbI8KGuXqhVpNpCwqRPY6AQThFb/sdE6sVc04sa32nXcQa7CuYgIsc99JPC8OJBM7Fm2ohgS5nYcHhGOEBPr2o5t7v4qH/tQC6EYhNoIsE+106Dm1GkUq5tZIJURQqd5I7maoo0AIv9N3mrn7u/xnjkizUhEhbxz5BpqYobUxHxR6Ox4cjtGmgIgAkr4m4KphYVFcvAiLF6WARUecP7YYSV8BHSAHDUC1YszNL0pkuD2Csd7wQXNZlXdfIspPduOTQq1mFxqBIDW/48FsOyRaMiTRao+LBunzhHDihouwr/MCZ67HhDyqFbIkkH7RnSpv/CaCZ1+pUomUVk7nqiR9xXLh/AOxygfgAoCrOd2I2DLPVNFI7sg5xHaVZNP4HI11umgbENKxcm3WW/ZzyB9aTRqL5Ii1KJyFW2JQzThumqs+4cHy9lrJBKsMnjT1Y7i81IzUSIhywSmvHEc9UMM55k4MGJ/UuNdRaph6DAVFKtlJr/PSbYDkXhu3SIi3LtJBUGhUa5MzXCP6lqkxWPb+TynKohjthVDAAweTPpQ39UKKSX7LU2kG6JiiTn1JBcF/aojPhMtuirjKVZaEAZBRtdEu5iU7fzDdx22pixgQC4G0XY6+YxIkNAOi41a0uw12UNhZH1T/q6AVgEsM9oGv7UAAaItI4qY5PAZnJB2rrPRemIlwJ1I2A+yx6qeIcALgIURAoswGAe98pjoBKReNhK98McOrwru4sy6IQQKX4JvYn1bbExr6/XqO/kF9SG3tATKUKAQwh6HDQlhpH7DnshPpDA7bT6F6yqwHG31ve2Z3uTe7sHgWVaH/otGOMxiBYHlCLVkgCvw0igImD4rjTBx3HPigAav/atk6EALDrCOAptV3XwZzYvxNTmt8NgI6K5GrA/RMAjpAOFD2khP/ebaTbDEqFjuYai8sAJKzt/CZ7soM7XpY+0F4PAGrmGouJ7poNWsHXuNnJ/l5CT39DfxRd3zr+ve3Z+U9+R6Etr+9Newi0nV74j3rmSQepPy6IyDwBLkC0fgLMtMB0UaTmxQKt39v9OQmvA5gR4EuaHiRztv/eHgbKIkByOQa4zDrsz+m1TPeoGqhR/taZdhFmNHNZRb4SdRtUA9l25zLFuZm784XQz1jbq6dMP+KU6OLKVwA4Bu1kSTo+9HMD8+QAwmXjZzMj3wJ8x8Iw+M+OUZP3gRKYVjOE+x0L1o/RMKSHzge+XXwLaGnoVcdTBACS1XC+dwH+6P4Z1RLAnJWIwalMvf77RY3p0oeC71lglj7yojdPUt8BuG7I6fG68fdah9lsdoLdLh6hjE+5eFy+Idpb2s2fPzm3YDvlSaQc2vXNYUP+lWReLPDPK0Ay4SSMZ3npnyfUZVnynKWLnJ98YMp8jc4+8FnksjHWVNFP62FFkVj4JOot4DafIXz/HO3/CLj5B9bqPwwwH+wqgvf+1mVq/kkLtldHQKm/ACkPQdSDFpBdAAAAAElFTkSuQmCC";
const DECO_BELASTING =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAMAAADVRocKAAAAwFBMVEXV2OOYmrZeYpKlpq8fI16srdGusMeRk7EVFW1bW6VucZlMT3uDhqUCAjI8QXR9gaZ/f/9XXWN+gaKzxdMAAD84PoE6QYR3fKJVqqp///8AVVUA/////wDJzdUAAAAmK2QxNmv+/v4VGVZTV4d+fn5laZIEB0hFSHkdIlxxdZmIiqqUlrF0d5t/f7gAAP9maJIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABiQmCEAAAAMHRSTlMZaOcR/iNQlgMDqdbM/P7SAgSfGQT//2IDAgMBAUMA/v4E/fsC9/38/vGwjsgEAdB9HVBoAAAEbUlEQVR42u1aaZuaSBDu5hQFvDabZI+iT5oGlP//77YamInRjMM4Ok/G9fULItRbdxU8EngZHM5jBRNA4DrgtyaA35CA39BF/FO7aP8+efspBPyauXrPafr/JtjfoYv2N/PSzQjggwmuDn4fWcQ/uQX80ex+DwJObljEjxg8u1mpM037MgL13Q99P9w5rAcWBHHg77ZA+cmxDNrEdbq01mpP2u0rBOcMPkg+EkWU0hixqVur5cLkDBGUJgJ1jmB3KoyP5o8HUdPEaa8swkPkrHgCKwQS8PMuIpQ2I+Kmdlgul54doBEo2aC+RVWJHlXgZA9fAiHD8wQUtZODuYNiwYhBQ3dyEHgE/MVzBmmPnCHgEHq5YYEoDyACd7tx/tA2taYS1bPY6onXSJ1SiokVknNZpCBipSjw8sUzvK5t27RuKI0ijEMkC8NGU5zYDoFxqGlEfr3DHxMYUVX5ErP5hYeETcFSiTrgp8ht/NPtCcJXr1hgmBSlofAHfp3NZn/NZkq5cvL91Ur5QE3ZES2qnsAsY+rSIF2iDfQFlU4JtAyyRcT90+tR/iJDcl2OBBoLwDhvsSCQHNSrBBy2EhO5Fpkkp5c7+qyiQDxH0Mc271OtqgpRehy+T2h2RJcMeIc2hKjwz/qvqcyCOSguRwIUWw6FwJj0+GpKNyVWMPRmJ7LFkQ0JEJS/gRn8IGC5q2SXwDaNfu2hU4KAUSyHVpRdCMmhf8hciJbgOe6VYoiBjWmPmIZTn/S5rdCCFZAOGfjBC5sZzIvS9m2A65FApvxH4quJBGlVUEh8xyC67RPDfgY16u0N1+inILvydg4i4XQL6gIJfFijlwLnETXqv2G5xPrgOKO4q4O+VwV9gyuxBmaTRyZlVePyx3fxFuglf7cLARoj2thkkmI/51ZU7KDPCTw7dSYrLNWeYD3zsTGLrBt+r5nQWGZFOXdZZLH/DZ0aD3Kp65CriQQJhFI4Aoxpufi3C8oF9rho3st3ccY6Vs4CIz1srg5tTTmo6RYQWdQ4dqHxxBxIHZQszxnmpw84SrGGDbb7tAh05FPszWG4Jfwta4vCJGe1CwD6nGwx902RZSUbagIdyLLOdbyiPSxxPp0Au/T8C3YDaCpGIETLSS2ZjgDccsIT7oqN+7roiNol3/xvyUq9yQLE/Au2LcrEvHcs1i2lIainYvK7LIj5hmEz9C/a7DCQf3oEu44ka0zQnUrcYEh2A9QOw1CYuGaSvoNAx5iHX1+8oxXSMtmAupTAk5pVXkPdqPLaAdgzcXXpD2spAhYwS6a9WT4mWMNXD6ey0XIYJeIZ1fNxP++tD8klBDuY56WTUbl9qh9Z435UuE0LJwszWF3Wjft/LiOgVmrtRohd4rLi1rs4rgekaR27MzgBoslL8+mFIRmBi+jJkvr296sXPaPhLsMvt+DxEHj8jMYfLnoQXIPgZonEHzF4pYg/lmB/9Vjv77DQ9o80fRBciWB/lfL6pC7ibyK40r8e7jlN+Uda8Pc7CP4DV5QiHSJvv2sAAAAASUVORK5CYII=";
const DECO_STUDIEFIN =
  "data:image/png;base64,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";
const DECO_INFO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAMAAADVRocKAAAAwFBMVEVgaZ2eq8pxdKfP2+tfZJSosNcOFFqNmLW4x9x5hKianbmWn7s6RYNVVXhDSnw6QngbG2QA//+MmMMwN4B///+Cja4fHz8Van9yrKx/i7lmmcz/AP92dqZmZsyq/6r/f/8AAAAuNXD8//8kKmgNE1ZkaZcdI2l/f/8AAP9VVapVqqp/f3+qqqpaYpttdZtQV4oAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAuL8ukAAAAMHRSTlPuWCcdlir9lyvZO3P2Bf/9BAGW/wLjBAQEqwUBRQUDAgD+B/38+/4CAQMDAgPY7/1ZW5JDAAADhklEQVR42u2Zi3aiMBCGh2IAiwW0t912L5NEIIrC+7/dDkFbtSAIodv29D89p7VivvyTzOQiYLMEnleKHQQ4UKKlM4MBozvoDxB9ItURIMZ0oMYO0UCA+v8O8BvwNQDqC4ZIjRal0QDzsQHHIZobb1f0GWSlUM3Fi4zOomyTrbOT/911stEJcNR01XvTDizXdadaoFX+sjotfdBlwrFFDkVRBEEQhpzzMJzBjHMiZGYciOlMci5PlHAQRkIk0APHqRoNSyOFZnGZkIXUACBFC6i90gIv8jyHPEiql4XbbkFAaxKvSwCvVMRxnMdB9VIDRFtFanewIUCyrESRSqRcOvSXs5TgdqgxXQA+JI5ufq8drAQMGwORVYBCFkDBiascgInWtgRscEiIxIsD8AVjNumgEPlcVoCnp/4OPFYOsh8U16dvRY9XnLc7OAd4zuyfU4aCAFBcZ7/TNNOqHERIAJ/oVEasc3UJzkxPBoW3ok66BMDV8burCrDBzANgGnQpQNkuTClMJQCaAGXDAK7dwwFDd+raZB8JEF+fRlsDLPyBzLLpQXr8UsAV9YwxmFCy3gcEWNcCbnACzAKgxy8HbMGySoA9DWPWAEAxKZ/a9gWQA0Qv542AqHLQDwDlR8nBOQDiAAcAXgUAXjvIt6Gnx8Dyeo2BQOveXSyok42AmUftsoXl3lvNKd2cB5mgGiRo/nm5bAToJYUqVdY/k6mPBKgdg5lNPtf9MxmpFtmUSlZcDvKqFkDrjVgsbKF6VlP7D0WZADk7Xd53gGELjqhmUwmwT7dABwClxJAVrQNg2JpcAbxRQrSrqucG2QiA5by2mt7qaToYsNG1qCnRDAHqM5mHzCSgvppmYwPSTw9YDwfQmgwcRgTcod2QB8ZCVAcQD/hLmgEIDWA3Vzd7RdFDhFFkKkQp7Ys41FQdv+vu+rntlE8bLz55KzqVuPjXjIMiWTqJ1tERKnZNZPIOcCBn9yNjv9MYqHZAsD/GHkl2OIjTGU205oFHAHlwk7BvvwTcGZmmGvDWgAR/0BntdYfnFkki3yhJzDjAORWjxJHJiaSTGLptwUekI8z2jfSNlBEA7avE6wn8RbbodBsK2OFiLGu5uhx8KYhZWqMMLwqRya+2Di+XAceSOnYwHxugjAdJ4cghwvcHqE/v4BvwUQCjf2GNHxggLrwvGtz2V5+m4j0dzHuPAOI/32tatFA1hN8AAAAASUVORK5CYII=";
const DECO_TOESLAG =
  "data:image/png;base64,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";

/* New design pictos: background glyphs */
const DECO_HUURWONING =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAMAAADVRocKAAAAflBMVEUeLFsGHjt/f38oL2QHWFgqMGhVVaoAAKpjAGP//wD///8A/wD/AAAAAAAoLWUrMGoAAH42N28pLmYnLWQoLWUAAFUnK2IoLGQpLmcmJmQAAP8qMGknKFkqMGlVVVU9PT0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACE9w5JAAAAIHRSTlMZBAJdA4wDAwIBAQEBAP78AgbQT5IDMWyuFAHXE7QDBBykz80AAAPBSURBVHja1ZoLc5swDMdFSdJ2my0/eEPg+3/LmbQZloPBgNlt/7v2Lj1Ov1Mk62EK7GTBxuebkwHi++csQM7gXjJ5GkAwUIiavZ8EkKxQyLkhJKcAelbwhwxhOAEATCP/JhTsEh0wTPY5qi44XyE8f/gkzHKIC+hZp9AmBCdrGKDpobLtGxXGqXgAyTLHPqr6VxMNIFjKXWFV9yISoGMp8ldCFhSGAEBiJSingU5iAHoGLZ+VOdHiOEA4CeoQ5GHAJ9x99g0BVpN1BdC8ycpv/1Ez+kMA8XIA3GTtVuIAKwcsXbQ/EpLbfsDNk6DOccibnQBBKugC4X0fQAhQGEJYrKx+QCOTKsT+SoODAwG2KusOD3KmeahMGIatgOE5QoTJXzM8gCYwwOsNDkJb2FoYwDNngOev5Sb744kebk0w4BZ0wl4C3YV70LW4naBnwwCzPazabt+XSjAX4HKX/bH9DAEAM0Tvs8+xla/N4QWQf9SK75SZld5+rALYHfluQsY+VgBDcIkLLN3g9hh9xP6jdPcLALGtxHlqxpIHheJHVdBMAhrgCg8DNHvzAgRThwFumMHdsw8DnO5mA94YHP+GUEnSGYC2yeMAd8YAUuU0jyB6D+AAYniQkiifACgXAOV/D8i2zhJGKwfBBlwCAYhfhlEZtUoFAxoHgE+NH6xVNitH6QI6WdddXRehAObUuqosr8aY1oVROh3V6fmfj991u3ADQAGkW5pBx34Qp4ovpeykHHrRNI0QwgF4g9wwemeDZXPp+0uSG12EnjxInCa1AdA6o1o/k8H7AeOlgVNU+rkMjgewymIkgNMO6qmwWwBU+X4AdwBzhxzvLBbAeu7dAlT7Ac5Q1Nnzhu3BZxQPyAiVEw/iAEi2UMCPRUDmB5C51xhqZgEZnaxMdrsAEQa4WoZswJWOtxcnu50kAO9kTQwtAKQoHEASCCit+YYAhBS9/NZ46LSz5kgvoHQAuccDYgAK2smdlwukmpbo23tJkE0nK/SXykq1M7Oj8DQcCkjnAeM2iVM/fW3ZC4AsxIN1dWEAckOzCQBeQBUHUIQB0H5uIyAPAah6P+ASAmhhvhbF86DbDxCbAcmWBTcMgC2di6sYX5G9xOKdLqAxAMMCIL9HAEgCqMBuXHV8wD2xAfAvAby1yAGwnQDV+QE8AgDb2guYtjIchwP79RKYJoNUT4N0lxuvHr0HTd8r9VRb2u9+cnE1O2VVZQ9d0/SxuoHZ3bSlcZfTRbdyMZskybiBvbxo7T7+yj/P/HmBsaAYgHD9BgoI9E0f4rdKAAAAAElFTkSuQmCC";
const DECO_VERZEKEREN =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAMAAADVRocKAAAAflBMVEUdLV4AYGApMGgpMGYqMGl6en0LEjxVVaoMDKV/AH8A/wAA/////wD/AAD///8AAAAoLWUrMGo2OHEAAH4oLWQpLmYnK2MoLWUpLmZVVVUpLWYnKFgAAP8AAFUoKWc9PT0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABXSd3sAAAAIHRSTlMZAqVZ0wIEAwMCAQEBAQEA/vwGAlHQLW2OA6wQAQMRBLc4eZUAAAS8SURBVHjatZqJlqMgEEXRmKR7tmIRlYD6/385habjEiAgiX16znQWrrW9KkgIfPgiMS8S+GuEMB8DAPDpX8O5Mp8A8FLe2ppMr/1VjOq9AGMGyShjlFZIacjbLVBQ4+LTxfBCW04DzI66FJwXbwCcfgA/kIrAEgoxcpHnot/oojWCspIXZjKtRJ/NL1K9yAiy7uQGUMMIcIbGRobJrm2IXf2Sk6YjoQ8j2M2uJQyR7O4zSsuyJhkWGKWgW7w0wD9rwOqRKTItmIxCE/VjLTngA/029HfPicOAAhq2CYGC9gnQQXEYIDCiqxhc4Wv1gH3M/rZZAF0tyzVowG+yziz7/3LIyKINAG+V488SZNaR5kQUZAGWGFBWaauvDwWhUmfLdb8GWB/1ILRkD4t6oc5vBLASy+DhI5SmQC+KBKht0lD0yRXqVUjyO1q9SfsW14fx7qMBxBsAm7rCUuA/YjFLUy6AbJWnasxiVW2tyQWc4bZK00mNOExyyiR5x1QBWq7W1+h0gmrHZgVS+YDeNJv1FRLquc2h9BX5gK8lxuxGcPWVWjehHIqdi0Av6w9YtmexxDwf0GMzeKgC3r/6BWSVU7mAvgc4PRoya4AbIKuUygXg+NCUbK3USqxTllKSA8C7bzq6EYkBxu9N0VllPQgoCtDtduayaU82usTaYCGHAOidWu47+xQFJddlfbSS+20sVyacN8qHlcaPAL5+SvXZBGP4+m9Jvg/I9Qite33bzvhWW0tI78nX57lqlZhmNxS1ATkiHnWu/etjh9HFJjzsZDMiASB6Lf0Am0i7G5gH+ngADznImnBRfHcHg6/ciHuMkzR04Q3vboGVOmGHcwkbMPlcDE/lET86/hEvDOgISmrJnio8ErBLQsf6PYdLx/aBGb8jAeJFiE/4Jn1ziZSIA6i99XRXVXrpcNsoRO/RbgFAi29pKpcKuod44ggBr/wAK52157kmDlBstwJ7//uL0G4TYgAqkES13fUzb3a5SoG4JnV/fIfBnwAogmMkwOcDHHqbkES5So2kKB1qEPFnWOxGPATABu8vwtiNeEirrQl+H53izip4oJvhhvLizSIZKXb+LJpN8KZAFynXYxAgB+7ppu7THAegD6o1LuPxkSSRYofbr5CYSk0S6tgNGGRYrp1P+/b7zqb/AuBMY0+/cQH6UD9AFzkTFXVCxDb9ETqWHGTviYjTgjakmJ4ndfxkJ0KDqXavP50gQfTYQvwd7cR87TJhdITBt37psY3duEoa3z1ti3WVN/Q8AaC8akCZT6FEyv6gD0WZpuSod3xvaNo1GJME+PNif/BsgErbo/FQLT9flQaTCkgJwoFzUxWYHh01oFXyTl8EFTtm5n0BSAhC2EE+wDXU+HfFp4tDpy1DpI9QJNQRgIITe4eDvAARGhE3/ed88MPSMSrM1YsTwQBABaejuMOu8IlXwV+GGWet8fgH1jhBlvNnlP4M5WCOA6YzfVJ3N+mDoIP6rI/c7+HjllLRJwo6iAPkWQDFVX1NBzy8qctSrj3GbqQX2YDJEMX5+cljdscZs370R42iV39nDZkotGog7usVSV+TKNT8BYRCNzr2PanfwwBTzDOW+BTg7jEBHwUkXP8BkjEz9HDd3moAAAAASUVORK5CYII=";
const DECO_DONOR =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAMAAADVRocKAAAAflBMVEUeIV0jKGIrMGgqLmbb3OVjY2NnapGSlLBGSnm1tskaID0AAP8AXV1VVaoAAKo9QXL//wD///9/AABqAGp9gaL/AAAAVaoA/wAA//8AAAAoLWX9/f0tMmsAAH84OXMWHFgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACoAzSpAAAAIHRSTlMZ6qFg/gL9/vv+BAECAwP9AQECAv4BAwEBAP7/+wIG/giKKAYAAAP2SURBVHja7Zlbl6MgDICDirVq27nuLgzB//8vNwG0ar3g2DlnHszLnjqYD3LHBfXDAgfgAByAXwZAqAEHD+oanweovC5ZtQ+s/0c+CUDqgcR2GqWy/KBc1gHx+iHR2miRgiPQi2mijdEJLCqBaP1WGM1iRKp415AY98CYtDXWHkBJ+nQQ4wji/hsU7gVYlXb6WOO/Hk+bBF93ArACoXsAMeDxkS77ADBUSHsWw5+q3geQKhkAHgRmsyHSBz2XTslCIEUBKmUX978bIBWsABJ13QdIzRqg3gOwEQD5qwExJir3AOoIJ8O+MIWfDdPVTKZ6uiuK6O1FJyxYKLZUvAyq6YSF5FP7wcMBdvcDWlfOlzuz1JVjAQvlaCHLtkwVs342AhCfAKjkXE9IF0ev+MHLKjAbQ3Tj6HiZMhIZ6P1pwy9eJ/IZnjab0trPh3RzM9jzxvd67IaFMj0LQCmldSJxLaFJ/2XDBQTLB2u+SKzmHW0SkDISIK0/Kg/8aSvg/oi2mp7xSL9CFQPwKkhzkghjuveNEUnKFw7Vvyd1BNYffUdDUk66tRCNEE630U0jWohSr3fG1RNYvxyHMZmMBGAEgISLAGm+5fnpnAU5n/KCHxIjdW+UVraeZv22bx+0Vo7uWz0ApU+ji/yUfY0lO+eGDmVM4h1CcVA5gujbX5YQ/EdGJvF2vQPehS4mlHeMU058byt0Ve+K/Bq2Ue3UpM7GpnNPhb0TiOb0tSjZyRlLB4fwZv94w7jroA8OWsFLiqIw/RZB68tVgGOQR5zbg7Vs9UaGeAN/1WQ7ev/xWtpO2TMRmAhAgJBH/EGsN4zT3jROebcs7w/DWwDBI4ZDSyQWvGEoPM5ZfxemoRqu1PcAXWhxYNPexTA83J+GKf4NgFfEl36Tn0exwIdL0lEefANAkje3czaKNI5mLiBQqc2AzGV494stnQ9PFCKMC+eoFrWAtkZM5VwmeHcFlRKW3EXT+a79FrKd0xoeih11qZzeoQQxvogW/aBrLXIjnXcROg8rXDHhLyRAoQ+XqWoK2idhT4RwtWlAIbPQNmgfdI6PEDvBrT7B/9p6ulzTQEVLuEgFCZlPMZg/nOSr54hQpIJpcL4fQNu87t9uuv4wWwZ9MgTtIFd7clWibQV9gXQQTWUgm6p+3jRu7xbXWqaEatSbwgBADO4Vo3yiza+bJmIuQg5o/tJFtrh3o+yj4KjRCXxSSUWl1J7BC+1L6KiuGvsuek8ojG76SwskW0q4qBKN0HMJtWN0RMse52P4vgmDr7NP+bTMCI5d8NFs5ZaJOfJ+00a6rFFtkk3frrFSm+X4D4oDcAAOwOrXjR8G4OGDA3AADsAvAfwHjiFSqH3DIa8AAAAASUVORK5CYII=";
const DECO_ZORGTOESLAG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAMAAADVRocKAAAAflBMVEUbHl0rL2cqLmbZ2uMmK2SSlbBlaZBmZmYoLT6ytMhHS3oAAP88QXIIAKcHanFVVap9gaH//wD///8AADsA/wB/AH/AvtAAAAAoLWX9/f0sMmoXHFgcIVwAAH82OHEoK2MAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACBB1eNAAAAIHRSTlMQnmD+3/79AgT+/AH8AwMD/gEB/wEC/wD9//r+/gIGMnSCUEUAAAS5SURBVHja7VnrlqssDA2C4q09M+e7oAj6/m95ElALaltbnT9nNWtNnVabTZKdCxTUDwt8AD4AfyuABJBKVX1vfwbAzi/Pv/+eBUmSDPhd93o+QKWYRklA6EYzwPfnAoBKdIOiB4ZXzfLL2RaAaBwAIwDEeawDXncQNKHo5GQA9eMAVjnXTPoZ2OpkgCswt3KHw+Bkmsqe0oAAICGWKtXLEwHc0+BpyoT3kIO1pwBU36icCe1D4C9as4SMyk+xABLUrptY8AOWgJKHAf61wFbaJwwx3EOAN+m5griHAPv1w+R7smPlKMyHYwCgBqe8EQyLNWNiiXDHBHiliCJjYCAiibUBjksHXYQ6kEeN3gw1KHucpgO7Kdc6AsKc7g+zKAk06sZ0XRcAiDut7QUXDeGKjc7SNNUBm44GWUZpYL5423KeGR30hf4IgCSWzspM2rZpvQzCIQv6wABtsrbNugWNxDaP9udBwP0ubXlnRJzOd3rnToAcQzyvn/yPAeCp0c1TH8FeDyUzQJNhBHiaFlmU0ETUIwBBCITgbfaPEN0io/utTICXazVaQBRNiyJb1NTNKO+OwQ3ApC4HMAaLijqo69sAYZrppuNtIZBGCxclW1F+A6DRHeZB2hhjlhbIM1zkpHA8SrOIqEdcFNDUC8Whbb+6GOBpkCsr+5vkNixFEefHalpGPHqWBzJfT08g78wUmkJg4q75oOFU8OubrhcYksT1dOrsibv5282FlYQFQtzR7g4upAP8yOm7uQ41MOZA/HwLD+YiTO8kyONqaQEu3E1tpjOkuUbRosM32k0S+EB+xdetyXFaCqiLlXmfo0S7Z3C9nFKmM7rEwBV8lCLNMm06mguZ263mNFgwNnpnFhyUGG1nw34GeQjwn3Ck+Coc8yLh/2el6ASNPcNIB6AwMScuXMMA053pBl5uEwC4XWOZrpXPIGmmO3LyDWQdSdJ9819Yuek/gR3qoRCGMc5Zbm9f9dBLiR6/XtxQz9y8RAHUdZmVOmw+CJA/BSCMIisb6pITs3Lrpt1xR2Kw8mWpix0+WzYiDywAvQNgNKR2EREeg7TT/qMzTvn8WLawYDeAM4QiYoj2AF57U2YhPXiqO4yBte8BjN7S6BEaKowog6WjFEQISgqr3gfwGL7gFbELS6ICS1RQVt8DaGnwqiNuY4DQXT4pF5m8C4AXnEeerqmtLVzjy8oF1DbAVCO2co5TzUCOUxNIfQ0Rk3twBq4xJl67snJVTUGLDL+DCeJ2d1qjmlXZyLSmDcEsTcmntdfGuYa0f693guCPZ2jSDIZzX/giEBpTcBllXZdkCJ/CKmbXKFlt94MezRNirl60g6TqKgwyfKP+8ZBKZtbeP9iID7hFjE3rfe1Cw+6WQf5Vo52YcFSc5LV6dlZRYZ/I+18o2DMgaEILNkacHFkjnx3Q2NUJLn4C0+kH5VMMwam2PnPNjrkI8t90+MSo3tzKDS5+jKs7Yj56MCulsrQ7NoZKmi91YvS8laccjpP3XNOmKYj+qFjnUds9eqRGw5frK82t3Uir1GkA6IzcsYr6+564vrXDmZXu+c3gzbMKi+t/TfnnR6IPwAfgA7DrF6sfBpCfGHwAPgB/CcAfyoMSfDbk4R0AAAAASUVORK5CYII=";
const DECO_MOBIEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAMAAADVRocKAAAAflBMVEUlK2EcIVwoLWSPka5kaI8qNz7a2+QAAP9/f38AampHTHspMGh+gaKztMk+Q3X/AAAAAKpVVaoAAAD9/f0oLWQsMWobIFsoLWU4OXIAAH8oLWUoLWUAAFV0d5onLWRVVVUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACOJgq3AAAAIHRSTlMg+VH//wT/AQIC/5j///8BAwMA//79/skFAo2xA/9vA45ytQcAAAOVSURBVHja7ZrZlqMgEIZLI+3W3TNDSxDc3v8tpwqXaKIGMM6ZPqf/C29M+KzFokCAnyzYvx0rozg+B6C6vZsKL3UJzB+AIwAqDNu2DbXONSrPq0FSSroUMiw9AYqDDoKiKMSO6G4FXewBwPED/L+FhOaJjwVM2o2PAnKnI+APD63HFy0vnQGMt/eAhesXNyrOnAEl1/eAazDpDiA9XLQCiC6jmhcAGK+WAHG9vI36uAfE7gDF15PIOOjBRcDjVwFWs0hu5+mrAK9z0UPS+ga5B6zUnnk8rqhjABrBDGMUzB/9M8uyCPV5BCBuqf+Bepvpa1QUCJcsmqaYGgHX7Ou5mqvwzqLABhARwNpFME1P1oDGAdCxXIRD5a19AQo2AQordAA49GjBNXIGJErrxeQAizmyQAMS7g6oRoAZYxHxGSDBAq3x+VXfEDEnQD1VYb2coucuAiGMg4gQc/AAqN91P8oaoMYIoPsUwGCrlwUxQz+0N4NmgFRVGAHgOgCV9ICgsQYw42Og2T8UlUofARSeAhLqJQB/broiR0DN6RETWLQxcKsRoZBJB1Xfg6Tky+DdCdChk7HLSyRiugeAMY0CXUDPw3yzAlwQ0Kd+3OeosaNcAVCMDeWXmfPdAfhHGttEeQeQmyxGg9wBCc+fAujSTYDGDdCZsTcBJgbh8B56AagWhNsxwCzC5MTCNRrkAhh6U0mFSK4C0j4FgH6SuALaIU1DmttMIqaPb7JKiUypTC86OAJKk3m6zxOZqpVS0ZnbSZmHPhYM74EuYzNMt1FNJaSzpLIGFLM3Vxknb0yZVCaYWZ76AhQzPl4HsD5Galoe2AHelxYARZKtAuIUK904G/WAi13bcgNQICtI43UXsX426twAzT0AFgs2uFs2yVLxAwBMpHA2na00XmOT6Qmwbx39AWofoA4DTrfgB/AD4ItybdubegOasy2w7U09drwMwLp9PxUQTV3FiQB9PuDkGJwOqM500fcHRH4A+PYW0HrkbEDxA3gpoP4fAcJnz84aYPYq9gHDFnDkB+houVuIqGkuN703RrRjHWVZNm2W+wOK65YWH4oOAMS+jgNsv4C4ZxEF2R5QnQ9gHi765oDS4WOsVwzcsugfAJxdZHbfrQHa64O1tjch3P6ovwmI49LWBCFrn2MPKe2/WynYOTOwdyoBw9DS8YwnCnLwPRlCG4Qlq5+I8Z3nf3a2RVmdj1EHTucc119syZa0B7r5WQAAAABJRU5ErkJggg==";
const DECO_POTLOOD =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAMAAADVRocKAAAAflBMVEUpLmYVGVogJmBdXV0AAP8kKD8AZWXX2OKYmrVrbpSztcgqMGdITHtVVao/Q3T///8AVaoA/wB/fwB+gaL/AP8AAAAoLWQsMWr9/f4AAH45OnQoLGMpLmYoKFcmLGMpLWYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACH6hFMAAAAIHRSTlOgE+8CAQQC/////2L+A/4BAwEC/wEA/vz/AgVRzhAvccgxjwQAAAL3SURBVHjazdrbcuMgDAZgwPiQpIc9CQIG+/3fcrG9bZMdayo3P7PLXTsdf4ORhMBVVHmoQ39tQ6gH5Lg9vItRWzjQ0uxTUvOU8/qzbmLsAhB4zco7X4ZRah6n/Pb7AAIsxeS2sSg+KaUulym3qBkEysbdjFXxzpkZBmi3N7zLGEDT5PYHDLj43RkkGDAyQIMBmpIG+wChALUPKFgUVQaoTfvATLYuMH5aLIRAdLuAmzBAx+aZxgANkwbOZAwQmSBaAMgit2yUakyYBkpcGlgEYK1mgYgAQtnPuDwDAdo4Js8gQCS9H0QOBjBpgJvBXBfgijXsFTUsoEuZQiRaNuyWHwBA6brS/hKkECwEYIp1SeSWIICuC7BtnaRSyAA+z5qqgCRKJQDX1jkXMQcQtq1LUZBDjwCiJBX80SsPNBCAMhulHQLo2DwbSSMAdjcofSMIUCwQEADXdbn0eVsnAmzgmqK2Q4Tp0rNwURoQQKml/uu1VAA0bLEeMUDLzaAEUYMAStfFzEBSrGUAc/jQmEWO7CE/W0g17djdgFBXanUBS5ndDTQC4Ns6SVMkArjTjRLlmQR4qFJIAPePgFFUKQQAdw8yiSqFABjdAxumCNhPAyfKggcAEyoDSrbGAmCuC7C17oIEtrv8v/MMBOTSFZkyPj4aHGhMRW1LedgwnJ7emBVCAuUVmfP1eu3783C6cTQIWMLUnK7vozjn4efaUwQIYJevN76/3o3BlCBqMYm2ntDMcPf83jjVSr/VfQo8l87OPN09/2V5QQ0KoBDTtsxv42TEISQ+4dwuc1kA4XYsBH4sW87HMp+NN7lpgEAZ6WOZz2a5ET8wBMDzUlBfhqHv+2tfJjNJI/TIfdGawO7p5I3w3HHoFf3SaatAxTi0wEcvZtcPvZosHPj23ht5M8kz4EAUhfBnWzu6ACT+hrN9jC3bWKYawPftRqcscEdVgO3SyyvdUCVgvXhM+QsTEP/jhvYlg5+pGmBJjUcD9NgMiChQZYD+T+A3iMPvZmnPlV8AAAAASUVORK5CYII=";
const DECO_VINKJE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAMAAADVRocKAAAAflBMVEUcLWFnZ2cMMj8pMGcEeHgAAKopMGUqMGlVVaoAVaoA/wAA//9VAFV/fwAAAAApLWUrMGoAAH4pLmcoLmYnLGMAAFUoLWYoLWQoLWQ5OnUAAP8oKVgAVVUAAD4nKGc8PDwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABhrfcbAAAAIHRSTlMVAgSqAgNZ2AMDAQEDAgD+/QLNji0DsU5yBgEQAwQTBGmogkMAAAPFSURBVHjatZnrluIgDIChVp2Z3Q2kFpze3/8tN62j02oJVCjHfx7zmZA7AnY+IpUgnD77AW7Ch90ACOXlcBVg6n0AnyDOWuvDFcDsAUBoCq2U0vrSQFenB3z1dpQ/IgpSIk8NwId8IihSAtMCOvh+yJ+UKOd3HQ/I4DqXPypxBcRkgNoIuwTQuXSkVyJA+6zApITt74R4DUTxCpguApMABrisyB9D4gp1AsAHlGr96KJNoUGbF9oBsCnuwCxDYHHE7RJEZA51iacrkNEaYCecBrrcJccAKqeBdCHwTzTAMAYqHwkvAiAr61Lgm7SLBmRuDyqa9isaIBkDiVnhfBtwBOv2IBlfcLK1JHr3IInRAD7EhviS2faMgbL4oj8wOaiZ38CbgA6ujIEwui/iLsBmMrqzy3NnjlOqhHhA66iStxwho3tTpsho+9dEd9eUQzWTIzAWgNAXSvmT6PuAf9ZpoKL/g7GAFk5OA1FL2saOUAjCKZ5yRB44BMoKXYDGaSCqMohhgBocEymbgshAVdAYS458PZUvs5ynylMIVFnQIE5WvtAIIdYI7io/5Yg8BEB5bBRCHvdKQMZAFAImZJVQw7eahOjDS1BWnIEKkYfsKsxvGtO2OS4Jsik4A0k/AOU8TZJbVw74Wgh0QduWhQgyq5jLdxYxCgFn4MwAtcGDdoY+l+PGMmm8gKV9fsas3xa2GixnoI+QhdThVcJjVGydbdbk0ohewLFbu0IKzx/ncOe40YNa30qtlq5hdBpU6lbYN0JsoYHTBUvKcB0XwjYbvEtBdFuYft+1TAiP15R7AQOwFhBMG+RK0ksA0+hMItgQlgF705qzgS6+me8qiSGL2ZqrVIrVrgrb/BomUJV6J8c9ASQbSU4DNQiBALZaMdO2CV+O16LYKv/kv4AZwMBpo3yLx03r/YENhpUQ7gE3ARC5mrvmoQY2Adi2as1Dg/7/oiZ/hnsSeejHdgD9p0MooQxVYAmoRWBAnyB765GI7R2Us2Xa8AplQlKGtv0R3wRAw/VX9+TqK2Js+370u9IpIIcyA4gvoldn1U0vgZhxzqqtt0j6AC036SnVRwPGKcqpA+VoA7EAEtE4CJsigBnEBwq4NYI+9K1MASBnXScIQEgCIE8vXwk0aHSQCDDOlGcdFwGeZUj7nJaCuqAt25annvv+6JMOMD5wzOULxMQA+u53Lj83gKk1oJ743mhoZpSPAJDM6kZ4WRgnAtxbmfccNGhnN4yuRA56hJ0A4573fBFY7wYYbxoh4vjXmjXAvgDAvQFx5z8sXwrFbYSc0QAAAABJRU5ErkJggg==";
const DECO_MUNT1 =
  "data:image/png;base64,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";
const DECO_ENVELOP3 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAMAAADVRocKAAAAflBMVEUcIFxkZ48pLmYoLmUkKWJeXl+SlbG0tsnLzdotMT0AAP8AXV1HS3o9QnR9gKFqAGoAAKq+wND//wAAAAD9/f4oLWQsMmocIVwYHVgnK2M5OnYnLWMAAH/n5+3Z2eMpLmYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABVpPN/AAAAIHRSTlMR/6Fm7QL///8EAQL+//8CA/8BAP/8/f7+MgZQAv//0EpLMVMAAAQwSURBVHja7ZjblqQqDIZBUfFQNXtvC/CA8v5vOQl4wGM5a2Yu9lqk+6JXF/4fCUmIReq/bCQAAiAAAiAAAiAAAiAA/jJA67L40wBNyqRDK4n+sx4UOulyvQ0NaVvye4BCa0Jgz4mv2fd9HMcRmBEyegbQSZInSVKC31pjCLT+57+iWBeUOSEoypiUQs4mTgH4HOyshH0lqJXnpDiDgiTut+2tsBFi0tyYNMQB0NPV0b2VKISGQe1AMnJmmBRi2e2ZSZNvPCA56QiZttbG/SRlDAq5R5gQfgy+mBSTB8R5asx+wSok5XPdZb2JOgsgRvoCp1qMMaVUA6YeKAsRRXFvs9QCDqucHBibnnlVVUWtvekSr1NlYaw08VsF2a16TWLvNM045+M4DJ/V3kqyk0AKYyJfuuy6RPsAKRVFNb6VO1jaSEE3LkQoPMUDLUkI0fXRA3go+3y1TMFGRi9KMlqjkedQyO2xm+ZGMkrBczl80+coOWwBtkPENqehO0gR18m+XUe4K8gkRb8Qhhcsyj641g8R8zNaxnV3BLAXOI+Ee/1KyQaWDBvArjLApQMghgcGPD77+LXRRqrKgth1uQEg3wL0BHCE9FZfyNH+peR1oZlC7wH99CAoYIivE1Q27tMjYD4BFsVkn0XOg3Heo+CXCSSb9+qL19KgbWKVQZl15OTS13U7A4Y1ClcHvFTb0pLhDvM6A5TZCQDWce8cz5IVo/L+HAGC2bsSm3tMytOxRdfECwwSTsoBXXv59ezVgZnPgNQ/LgEs+9wRbOjWKuHb853/iM9ueAtgfvLQY0lbfbHmMJdPKmAGFAjw8n+ApdtzAP2Gjq91G+MV4Mf56JhHPoAqAS3zNW71MS5wDMMMkCd1EJ2HCFyIvB6RKUUxS+S0W07n/EybeZnfjFyFYR205GL4LX3AaMOT4s1L0+zfLJVr/gOB8bmrzmXgpPO76bqDUl4yBAKEW89AlzV4LQuxhg8+dIdDodvhNdYu0niPFZeAXrLpVFM1oQYQs4FVwjt/KdzHWHbT1VXkMEwXt+8HydorMP/m080qGFOUpHx3Y6Z2H1LGHYysWj94ASnrDhKTuxpQXr/OUpryY8fgCDhcLDcAjaOXDXTazIl4aRVeyujJeVmd14GuHYCLm+tg6RKYEJxB/tT6KSB3eTpU4sulvFTDiCNcVxcPAZ2dK2xgx++jERywHb2geZKHAGIBGRQPBmhAG0fO7di4Gs+cpZBydnhs6+RxiPDShE290jelVXUc0vEf0zzcNO6aFLJ/lEYISOp4EsLxXDF2P51Pl8B+wroFtPOunplgxjD23IMC518DP/Bg5IZlbDP4SuoZvJ1O7Qd+0X7pqwTS4utZ+/ix3/iuQpc5vr7Ca3GSd4n7ZmA1/D+M/7oodPFLAD1b+DonAAIgAAIgAAIgAALg/wr4CXxvpkqC45TqAAAAAElFTkSuQmCC";
const DECO_RISICO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAMAAADVRocKAAAAflBMVEUfIl5oa5IoLWTZ2uQmK2SQk68pLmdmZmaztchHS3sxNDoAXl4AAP99gKH//wA8QXMA/wBVVaq+wNAA//8AAKp/AH9/fwD/AAAAAAD+/v4oLWQsMWkcIVs3OHEYHVgAAH8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAswJrMAAAAIHRSTlMZ/2D/4P+iAv//BAIB/wH/AQP/AQMCAgEA//3+/wX/Arf7gsgAAATKSURBVHja7ZpZt5woEICLxl3vlswkLYv8/38ZVEDAAu1u78OcST3k5uR212ftBQbu3yzwF/AfA6hOAkipvgtQu2+p7wD0+tO3RfSXfqqrAVohVAXjWhirbp451wCUVs+06lU4r+DkV+Gs96Fy6hdEcZIAZ5+/CPTPRtzu8jJALatI/4w4ZcMpQHe/7fXPXqqvAegAMEx4dVeXAOTdc9CSpvbvt+NkhVMR5k47K8RcDC4Mv9UVMTAGcC4Eb0k7/+DWSfAyoL/fzOMyQRo6jiMtiTBFp53UvQqoTQlwxpvRSslWgs6k/v01gDQpqvXTcZNGuDjDixZYA4pm9KWcuC039QqgtgYIMoZCVoKOc/0CQH26GqMRYGwFP1EMB4Avk6J8KmP9I3Udo3saIE2TiCIchiHfVvOAfztjgNgbMDtpyVVtghqeA4CNcNFi+nWu8sNUhVM1JhoUMJKVUMj3pwBYitKmaeguzplEgvycDFOUkg8mRMHbMjYBlHocIF2KGgMIm9Z5UEzEIl3Pkw8DwI0Bk6JksnsL51NLg1RNmwCZCIQ1ZlqDQdjC0ybw1YT+QYAdxFy0viYLcHG3TQ/un48BwBpgUpS2AWB6G2MT5EMAuUtRkzCRi7aGkdiSEoChd3OMYgAmXDEcJBIc1Njkaqz0AEHzc4mETp6Ui/ZdNAAUrVfO2USCgxor487G9vNtM+EsoBvABOBj13dY5LnAhO4k4J87MgYonkSbCXouwDlAjw/6D68QwhUjl0go4N0a8ANp/n57ikyokNMnpE8DoaN9QBAbv48go20PeAd3XKLoqpVeknil6mOAaxKu3ZwApEcbYhLgfvYKAVkyVv/xSsIxILVqUa/OmjFpgswD4jGARBLdI50JXZ0HfKkqtanQ1p2VkT2PCjt4VA4gk8u0l6f4HmZNiMIcAgZlbgw44gQ3lVG6y4HIBMB3xQlT4c4cE76pFsaELgn4fF9XLXyZ3gD4JmkHBgx1CrDVWJnZddEk8pbt8PwPSI1x1qIaKMscFoLxr3BAd6+yy7QdLAXOt3kc9gtADECTZPHBNN+o4RkQLGHDgAHcrihoQgElxaSFJ3+PDB7IbSp7+VGSt5Imf22KrfAGjwMM9jjDeFrBkSAtD06mqEtVQkjmAfYtzwKUMYDnDSBiEhNr0nzXLyAC1KcMIEsaicwzuH5Rxy5KjgHk2BpuG3imRi46qrGgX+c+tMtUCK8MBBmPAalehJ47V0DfVcdfdTmSdWOcqXC6xlYHz6dYceYp7JYH3pUBP6wxMgkx8Sb7mWYKMhWCXfHtqFRLQsqjQm+D4awBtQLGThTxWdky9dcKAHfxeg2gKeylrVwA283xRQC7ARZyddHgrr5T907PWWCOVNpFalvYLjHBLR/V/PQaIP23J68TvBV28f8M8A7YgtAX9W8b7FIKsN3eGy9xPRQxeZuFHArb9Ov9pV8AwQsabYSWSYQyxf+QksI7ivLVAu8Fh3uJ8oL4mkwMeoW8w7pA9HlqrWTkLdw1gNv9a2129bcQTLcD+yaUP4/AY1FB7U00nUpVJrxZ7XPb2UkVrS3q072NPhbYiXR/yvWHVvkzWlvUIy/qT7yeHPbbtZJSgsxJp6VepJ8F9OYQyjDL3/+48b8D/AHMvEP1fWUJwwAAAABJRU5ErkJggg==";

function BgDecorations() {
  // Faint, scattered brand decorations + design pictos. Non-interactive.
  const items = [
    { src: COIN_DATA_URI, top: "2%", left: "3%", w: 88, rot: -12 },
    { src: DECO_ENVELOP3, top: "4%", left: "28%", w: 74, rot: 9, o: 0.1 },
    { src: DECO_HUURWONING, top: "3%", left: "56%", w: 62, rot: -7, o: 0.1 },
    { src: ENV_DATA_URI, top: "7%", left: "82%", w: 84, rot: 11 },
    { src: DECO_POTLOOD, top: "13%", left: "16%", w: 46, rot: 14, o: 0.1 },
    { src: DECO_GELD, top: "15%", left: "40%", w: 70, rot: -9, o: 0.1 },
    { src: DECO_MOBIEL, top: "12%", left: "68%", w: 56, rot: 8, o: 0.1 },
    { src: DECO_MUNT1, top: "17%", left: "90%", w: 76, rot: -11, o: 0.1 },
    { src: DECO_VINKJE, top: "24%", left: "6%", w: 48, rot: 10, o: 0.1 },
    { src: DECO_ZORGTOESLAG, top: "26%", left: "30%", w: 72, rot: -6, o: 0.1 },
    { src: COIN_DATA_URI, top: "23%", left: "58%", w: 78, rot: 12 },
    { src: DECO_DONOR, top: "27%", left: "84%", w: 68, rot: 7, o: 0.1 },
    { src: DECO_VERZEKEREN, top: "36%", left: "-1%", w: 74, rot: -10, o: 0.1 },
    { src: ENV_DATA_URI, top: "34%", left: "24%", w: 80, rot: 8 },
    { src: DECO_STUDIEFIN, top: "38%", left: "52%", w: 66, rot: -13, o: 0.1 },
    { src: DECO_RISICO, top: "35%", left: "78%", w: 58, rot: 9, o: 0.09 },
    { src: DECO_TOESLAG, top: "46%", left: "10%", w: 66, rot: 12, o: 0.1 },
    { src: DECO_INFO, top: "48%", left: "36%", w: 56, rot: -8, o: 0.1 },
    { src: DECO_ENVELOP3, top: "45%", left: "64%", w: 72, rot: 10, o: 0.1 },
    { src: COIN_DATA_URI, top: "49%", left: "88%", w: 84, rot: -9 },
    { src: DECO_BELASTING, top: "57%", left: "2%", w: 68, rot: 8, o: 0.1 },
    { src: DECO_HUURWONING, top: "59%", left: "28%", w: 60, rot: -12, o: 0.1 },
    { src: DECO_MUNT1, top: "56%", left: "56%", w: 70, rot: 7, o: 0.1 },
    { src: ENV_DATA_URI, top: "60%", left: "82%", w: 82, rot: -10 },
    { src: DECO_MOBIEL, top: "68%", left: "14%", w: 54, rot: 11, o: 0.1 },
    { src: DECO_GELD, top: "70%", left: "42%", w: 68, rot: -7, o: 0.1 },
    { src: DECO_VINKJE, top: "67%", left: "70%", w: 46, rot: 13, o: 0.1 },
    { src: DECO_ZORGTOESLAG, top: "72%", left: "90%", w: 66, rot: -8, o: 0.1 },
    { src: COIN_DATA_URI, top: "79%", left: "4%", w: 80, rot: 9 },
    { src: DECO_DONOR, top: "81%", left: "32%", w: 64, rot: -11, o: 0.1 },
    { src: DECO_POTLOOD, top: "78%", left: "60%", w: 44, rot: 7, o: 0.1 },
    { src: DECO_VERZEKEREN, top: "82%", left: "84%", w: 70, rot: 12, o: 0.1 },
    { src: DECO_STUDIEFIN, top: "90%", left: "12%", w: 62, rot: -9, o: 0.1 },
    { src: ENV_DATA_URI, top: "92%", left: "40%", w: 78, rot: 8 },
    { src: DECO_TOESLAG, top: "89%", left: "68%", w: 66, rot: -12, o: 0.1 },
    { src: DECO_ENVELOP3, top: "93%", left: "92%", w: 70, rot: 10, o: 0.1 },
  ];
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        top: 150,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 0,
      }}
    >
      {items.map((it, i) => (
        <img
          key={i}
          src={it.src}
          alt=""
          draggable="false"
          style={{
            position: "absolute",
            top: it.top,
            left: it.left,
            width: it.w,
            opacity: it.o || 0.08,
            transform: `rotate(${it.rot}deg)`,
          }}
        />
      ))}
    </div>
  );
}

function Header() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 38,
        padding: "14px 16px 16px",
      }}
    >
      <img
        src={COIN_DATA_URI}
        alt=""
        aria-hidden="true"
        draggable="false"
        style={{ width: 58, transform: "rotate(-8deg)", flexShrink: 0 }}
      />
      <Logo height={104} />
      <img
        src={ENV_DATA_URI}
        alt=""
        aria-hidden="true"
        draggable="false"
        style={{ width: 64, transform: "rotate(8deg)", flexShrink: 0 }}
      />
    </div>
  );
}

/* ================================================================= */

function ProgressBar({ pct, index, total }) {
  return (
    <div style={{ marginBottom: 18 }}>
      {/* Visual row is hidden from screen readers: two numbers side by side get
          glued together by NVDA ("Vraag 1" + "9%" -> "Vraag 19%"), and the card
          already announces "Vraag X". The sr-only line below states progress. */}
      <div
        aria-hidden="true"
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 14,
          color: TOKENS.textMuted,
          marginBottom: 8,
        }}
      >
        <span>{`Vraag ${index}`}</span>
        <span>{`${pct}%`}</span>
      </div>
      <span style={SR_ONLY}>{`${pct}% beantwoord`}</span>
      <div
        aria-hidden="true"
        style={{ height: 8, background: "#e3e3ee", borderRadius: 999 }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: TOKENS.greenRing,
            borderRadius: 999,
            transition: "width .3s ease",
          }}
        />
      </div>
    </div>
  );
}

function QuestionCard({
  q,
  onAnswer,
  onBack,
  canGoBack,
  progress,
  enterFrom,
  showHint,
  onHintDone,
}) {
  const drag = useRef({ x: 0, active: false });
  const headingRef = useRef(null);
  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [dx, setDx] = useState(0);
  const [leaving, setLeaving] = useState(null); // 'left' | 'right' | null
  const [hinting, setHinting] = useState(!!showHint && !reduceMotion);

  // Move focus to the question heading when a new card mounts (keyboard/SR continuity).
  React.useEffect(() => {
    if (headingRef.current) headingRef.current.focus();
  }, []);

  // First-card coach-mark (~5s): a hand demonstrates swiping and tapping the buttons.
  React.useEffect(() => {
    if (!showHint) return;
    if (reduceMotion) {
      onHintDone && onHintDone(); // skip animation, but mark the hint as seen
      return;
    }
    const t = setTimeout(() => {
      setHinting(false);
      onHintDone && onHintDone();
    }, 5000);
    return () => clearTimeout(t);
  }, [showHint]);
  const stopHint = () => {
    if (hinting) {
      setHinting(false);
      onHintDone && onHintDone();
    }
  };

  const tone = (t) =>
    t === "pos" ? TOKENS.green : t === "neg" ? TOKENS.red : TOKENS.navyText;

  // On answer: fling the card that way, then advance to the next question.
  const commit = (answer, dir) => {
    if (leaving) return; // prevent double-trigger
    setHovered(null);
    setDx(0);
    setLeaving(dir);
    setTimeout(() => onAnswer(answer), 300); // advance after the card has flown off-screen
  };

  const start = (x) => {
    if (leaving) return;
    stopHint();
    drag.current = { x, active: true };
  };
  const move = (x) => {
    if (drag.current.active) setDx(x - drag.current.x);
  };
  const end = () => {
    if (!drag.current.active) return;
    drag.current.active = false;
    const threshold = 70;
    if (dx > threshold)
      commit(q.answers[1], "right"); // right = second button (pos)
    else if (dx < -threshold)
      commit(q.answers[0], "left"); // left = first button (neg)
    else setDx(0); // below threshold → snap back to center
  };

  // Exit vs drag transform
  let transform,
    transition,
    opacity = 1;
  if (leaving) {
    const sign = leaving === "right" ? 1 : -1;
    transform = `translateX(${sign * 130}%) rotate(${sign * 14}deg)`;
    transition = "transform .3s ease-in, opacity .3s ease-in";
    opacity = 0;
  } else {
    transform = `translateX(${dx}px) rotate(${dx * 0.03}deg)`;
    transition = drag.current.active
      ? "none"
      : "transform .25s cubic-bezier(.22,1,.36,1)";
  }

  // Which answer the current swipe/exit is leaning toward (for the button lift feedback)
  const lean = leaving ? leaving : dx > 24 ? "right" : dx < -24 ? "left" : null;
  // Hover mirrors the swipe feedback (same colors/lift) when not dragging
  const [hovered, setHovered] = useState(null); // 'left' | 'right' | null
  const highlight = lean || (dx === 0 && !leaving ? hovered : null);

  return (
    // OUTER WRAPPER: new-card entrance (replays per question via the key in the parent)
    <div
      style={{
        position: "relative",
        animation: `${enterFrom === "back" ? "fjsEnterBack" : "fjsEnter"} .36s cubic-bezier(.22,1,.36,1) both`,
      }}
    >
      <div
        onMouseDown={(e) => start(e.clientX)}
        onMouseMove={(e) => move(e.clientX)}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={(e) => start(e.touches[0].clientX)}
        onTouchMove={(e) => move(e.touches[0].clientX)}
        onTouchEnd={end}
        style={{
          background: TOKENS.cardBg,
          borderRadius: TOKENS.radiusCard,
          boxShadow: "0 8px 30px rgba(20,20,60,.10)",
          overflow: "hidden",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          minHeight:
            "max(340px, var(--fjs-card-height, min(560px, calc(100dvh - 178px))))", // all cards same min size; grows at extreme zoom (reflow)
          transform,
          opacity,
          transition,
          cursor: leaving ? "default" : "grab",
          userSelect: "none",
          touchAction: "pan-y",
        }}
      >
        <div
          ref={headingRef}
          tabIndex={-1}
          role="group"
          aria-label={progress ? `Vraag ${progress.index}` : "Vraag"}
          style={{
            padding: "26px 28px 18px",
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            outline: "none",
          }}
        >
          {canGoBack && (
            <button
              onClick={onBack}
              style={{
                border: "none",
                background: "none",
                color: TOKENS.navyText,
                fontSize: 14,
                cursor: "pointer",
                padding: "6px 8px",
                margin: "-6px 0 10px -8px",
                minHeight: 24,
                display: "flex",
                alignItems: "center",
                gap: 6,
                alignSelf: "flex-start",
              }}
            >
              <span aria-hidden="true">←</span> Terug
            </button>
          )}
          {progress && <ProgressBar {...progress} />}
          {q.category && (
            <span
              style={{
                display: "inline-block",
                alignSelf: "flex-start",
                background: TOKENS.pill,
                color: TOKENS.navyText,
                fontSize: 14,
                padding: "6px 16px",
                borderRadius: 999,
                marginBottom: 14,
              }}
            >
              {q.category}
            </span>
          )}
          <h2
            id={`q-${q.id}`}
            style={{
              color: TOKENS.navyText,
              fontSize: 24,
              lineHeight: 1.25,
              margin: "0 0 12px",
              fontWeight: 700,
            }}
          >
            {q.title}
          </h2>
          <p
            style={{
              color: TOKENS.textMuted,
              fontSize: 16,
              lineHeight: 1.5,
              margin: 0,
            }}
          >
            {q.subtitle}
          </p>
        </div>
        <div
          style={{
            background: TOKENS.cardSub,
            padding: "22px 28px 18px",
            flexShrink: 0,
          }}
        >
          <div
            role="group"
            aria-labelledby={`q-${q.id}`}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 16,
            }}
          >
            {q.answers.map((a, i) => {
              const side = i === 0 ? "left" : "right";
              const isActive = highlight === side;
              const toneColor = tone(a.tone);
              return (
                <button
                  key={a.value}
                  onClick={() => commit(a, side)}
                  onMouseEnter={() => setHovered(side)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(side)}
                  onBlur={() => setHovered(null)}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: "14px 18px",
                    borderRadius: TOKENS.radiusBtn,
                    border: `1px solid ${isActive ? toneColor : TOKENS.border}`,
                    background: isActive ? toneColor : "#fff",
                    color: isActive ? "#fff" : toneColor,
                    fontSize: 16,
                    fontWeight: 600,
                    cursor: "pointer",
                    boxShadow: isActive
                      ? `0 10px 22px ${toneColor}55`
                      : "0 2px 8px rgba(20,20,60,.06)",
                    textAlign: "center",
                    transform: isActive
                      ? "translateY(-8px) scale(1.04)"
                      : "translateY(0) scale(1)",
                    opacity: highlight && !isActive ? 0.55 : 1,
                    transition:
                      "transform .18s ease, background .18s ease, box-shadow .18s ease, opacity .18s ease, color .18s ease, border-color .18s ease",
                  }}
                >
                  {a.label}
                </button>
              );
            })}
          </div>
          <p
            style={{
              textAlign: "left",
              color: TOKENS.textMuted,
              fontSize: 14,
              margin: "16px 0 0",
            }}
          >
            Tip: swipe links/rechts of gebruik de knoppen
          </p>
        </div>
      </div>
      {hinting && (
        /* WCAG 2.2.2: this animation starts automatically and runs longer than
           5s, so it must be dismissible. Tapping anywhere or the "Overslaan"
           button stops it. */
        <div
          onClick={stopHint}
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: TOKENS.radiusCard,
            background: "rgba(20,20,60,.5)",
            overflow: "hidden",
            zIndex: 5,
            animation: "fjsFade .25s ease both",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              top: 26,
              left: 18,
              right: 18,
              textAlign: "center",
              color: "#fff",
              fontSize: 16,
              fontWeight: 700,
              textShadow: "0 1px 6px rgba(0,0,0,.45)",
            }}
          >
            Swipe of tik op een knop
          </div>
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              left: "50%",
              bottom: 50,
              fontSize: 50,
              lineHeight: 1,
              pointerEvents: "none",
              transform: "translate(-50%, -190px)",
              animation: "fjsHand 4.8s ease-in-out 0s 1",
              filter: "drop-shadow(0 6px 10px rgba(0,0,0,.4))",
            }}
          >
            👆
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              stopHint();
            }}
            style={{
              position: "absolute",
              bottom: 18,
              left: "50%",
              transform: "translateX(-50%)",
              background: "#fff",
              color: TOKENS.navyText,
              border: "none",
              borderRadius: 999,
              padding: "10px 22px",
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 4px 14px rgba(0,0,0,.25)",
            }}
          >
            Overslaan
          </button>
        </div>
      )}
    </div>
  );
}

function ScoreRing({ pct }) {
  const r = 76,
    c = 2 * Math.PI * r;
  const color = pct < 50 ? TOKENS.amber : TOKENS.greenRing;
  return (
    <svg
      width="180"
      height="180"
      viewBox="0 0 180 180"
      role="img"
      aria-label={`Jouw fix score: ${pct} procent`}
      style={{ display: "block", margin: "0 auto" }}
    >
      <circle
        cx="90"
        cy="90"
        r={r}
        fill="none"
        stroke="#e3e3ee"
        strokeWidth="14"
      />
      <circle
        cx="90"
        cy="90"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="14"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c - (c * pct) / 100}
        transform="rotate(-90 90 90)"
        style={{ transition: "stroke-dashoffset .6s ease" }}
      />
      <text
        x="90"
        y="90"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="36"
        fontWeight="700"
        fill={TOKENS.navyText}
      >
        {pct}%
      </text>
    </svg>
  );
}

function Onboarding({ onStart }) {
  return (
    <div
      style={{
        background: TOKENS.cardBg,
        borderRadius: TOKENS.radiusCard,
        boxShadow: "0 8px 30px rgba(20,20,60,.10)",
        padding: "44px 30px",
        boxSizing: "border-box",
        minHeight:
          "max(340px, var(--fjs-card-height, min(560px, calc(100dvh - 178px))))", // reflow: grows with content, never clips
        display: "flex",
        flexDirection: "column",
        textAlign: "center",
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <h2
          style={{
            color: TOKENS.navyText,
            fontSize: 26,
            fontWeight: 700,
            margin: "0 0 18px",
            lineHeight: 1.25,
          }}
        >
          Heb jij jouw shit al gefixt?
        </h2>
        <p
          style={{
            color: TOKENS.textMuted,
            fontSize: 16,
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          Als volwassene mag je ineens heel veel, maar moet je ook heel veel.
          Studie, geldzaken, een woning, werk en zorgtoeslag.
        </p>
      </div>
      <button
        onClick={onStart}
        style={{
          background: TOKENS.green,
          color: "#fff",
          border: "none",
          borderRadius: TOKENS.radiusBtn,
          padding: "16px 28px",
          fontSize: 17,
          fontWeight: 700,
          cursor: "pointer",
          alignSelf: "center",
          flexShrink: 0,
        }}
      >
        {hideEmoji("Doe de snelle check! 👉")}
      </button>

      <a
        href="https://www.nijmegen.nl/fixjeshit/waarom-deze-website"
        style={{
          flexShrink: 0,
          display: "inline-block",
          marginTop: 16,
          padding: "6px 4px",
          color: TOKENS.navy,
          fontSize: 15,
          fontWeight: 600,
          alignSelf: "center",
        }}
      >
        Meer weten over deze tool?
      </a>
    </div>
  );
}

/* <18 result screen: own score (0/75/100) + "nu al regelen" + "op je 18e" (Phase 0 §1.5) */
/* ---- Share (Phase 4): draw score to an image → WhatsApp / link / download ---- */
function buildShareBlob({ pct, cats, title }) {
  return new Promise((resolve) => {
    try {
      const W = 1080,
        H = 1080;
      const NAVY = "#2A2E65",
        GREEN = "#2e7d52",
        RED = "#861629",
        AMBER = "#9a5a00",
        MUTED = "#5b5e7e";
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#e6e7f4";
      ctx.fillRect(0, 0, W, H);
      const list = Array.isArray(cats) ? cats : [];
      const slogan = (title || "").trim();
      const rr = (x, y, w, h, r) => {
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x, y, w, h, r);
          return;
        }
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
      };
      const loadImg = (src) =>
        new Promise((res) => {
          const im = new Image();
          im.onload = () => res(im);
          im.onerror = () => res(null);
          im.src = src;
        });

      Promise.all([
        loadImg(LOGO_DATA_URI),
        loadImg(COIN_DATA_URI),
        loadImg(ENV_DATA_URI),
      ]).then(([logo, coin, env]) => {
        // --- faint background decorations (kept out of the top-center content zone) ---
        const inProtected = (x, y) => x > 300 && x < 780 && y < 660;
        const decos = [
          { x: 70, y: 95, s: 96, t: 0, r: -12 },
          { x: 185, y: 255, s: 70, t: 1, r: 8 },
          { x: 90, y: 430, s: 80, t: 0, r: 10 },
          { x: 215, y: 600, s: 64, t: 1, r: -6 },
          { x: 1000, y: 110, s: 106, t: 1, r: 12 },
          { x: 880, y: 300, s: 78, t: 0, r: -10 },
          { x: 1010, y: 480, s: 70, t: 1, r: 6 },
          { x: 905, y: 620, s: 92, t: 0, r: -8 },
          { x: 120, y: 825, s: 86, t: 1, r: 14 },
          { x: 1000, y: 820, s: 76, t: 0, r: -14 },
          { x: 95, y: 985, s: 70, t: 0, r: 6 },
          { x: 990, y: 985, s: 96, t: 1, r: -6 },
          { x: 430, y: 1020, s: 64, t: 1, r: 10 },
          { x: 650, y: 1010, s: 80, t: 0, r: -10 },
        ];
        ctx.globalAlpha = 0.1;
        decos.forEach((d) => {
          if (inProtected(d.x, d.y)) return;
          const im = d.t === 0 ? coin : env;
          if (!im) return;
          const h = d.s * (im.height / im.width || 1);
          ctx.save();
          ctx.translate(d.x, d.y);
          ctx.rotate((d.r * Math.PI) / 180);
          ctx.drawImage(im, -d.s / 2, -h / 2, d.s, h);
          ctx.restore();
        });
        ctx.globalAlpha = 1;

        // --- logo ---
        if (logo) {
          const lw = 235,
            lh = lw * (logo.height / logo.width || 70 / 72);
          ctx.drawImage(logo, (W - lw) / 2, 40, lw, lh);
        }

        // --- score ring ---
        const cx = W / 2,
          cy = 410,
          r = 105;
        ctx.lineWidth = 24;
        ctx.lineCap = "round";
        ctx.strokeStyle = "#d4d6ea";
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = pct >= 50 ? GREEN : RED;
        if (pct >= 100) {
          ctx.lineCap = "butt"; //
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(
            cx,
            cy,
            r,
            -Math.PI / 2,
            -Math.PI / 2 + Math.PI * 2 * (pct / 100),
          );
          ctx.stroke();
        }
        ctx.fillStyle = NAVY;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const maxTextW = (r - ctx.lineWidth / 2) * 2 * 0.8;
        let fs = 76;
        ctx.font = `bold ${fs}px system-ui, sans-serif`;
        while (ctx.measureText(pct + "%").width > maxTextW && fs > 44) {
          fs -= 2;
          ctx.font = `bold ${fs}px system-ui, sans-serif`;
        }
        ctx.fillText(pct + "%", cx, cy);
        // --- slogan (tier message based on score) ---
        if (slogan) {
          ctx.fillStyle = NAVY;
          ctx.font = "bold 46px system-ui, sans-serif";
          ctx.fillText(slogan, cx, 565);
        }

        // --- summary line ---
        const doneCount = list.filter((c) => c.ok).length;
        ctx.fillStyle = MUTED;
        ctx.font = "32px system-ui, sans-serif";
        ctx.fillText(`${doneCount} van ${list.length} op orde`, cx, 620);

        // --- category checklist rows (vertically centered, drawn last so they cover decorations) ---
        const rowH = 62,
          gap = 12,
          rowW = 780,
          x0 = (W - rowW) / 2;
        const areaTop = 665,
          areaBot = 1040;
        const blockH = list.length * rowH + Math.max(0, list.length - 1) * gap;
        let top = areaTop + (areaBot - areaTop - blockH) / 2;
        if (top < areaTop) top = areaTop;
        list.forEach((c, i) => {
          const y = top + i * (rowH + gap),
            midY = y + rowH / 2;
          ctx.fillStyle = "#ffffff";
          rr(x0, y, rowW, rowH, 16);
          ctx.fill();
          const icx = x0 + 44,
            ir = 20;
          ctx.fillStyle = c.ok ? GREEN : AMBER;
          ctx.beginPath();
          ctx.arc(icx, midY, ir, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.font = "bold 26px system-ui, sans-serif";
          ctx.fillText(c.ok ? "\u2713" : "!", icx, midY + 1);
          ctx.fillStyle = NAVY;
          ctx.textAlign = "left";
          ctx.font = "600 32px system-ui, sans-serif";
          ctx.fillText(c.label, x0 + 84, midY);
          ctx.fillStyle = c.ok ? GREEN : AMBER;
          ctx.textAlign = "right";
          ctx.font = "600 26px system-ui, sans-serif";
          ctx.fillText(c.ok ? "Geregeld" : "Nog regelen", x0 + rowW - 28, midY);
        });

        canvas.toBlob((b) => resolve(b), "image/png");
      });
    } catch (e) {
      resolve(null);
    }
  });
}

function ShareSection({ pct, cats, title, link }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const sheetRef = useRef(null);
  const triggerRef = useRef(null);
  const shareLink = link || window.location.href;
  // The link goes in the text too: some apps drop the separate url field.
  const shareMessage = `Mijn fix score: ${pct}% — ${title}\nBekijk mijn resultaat en doe zelf de check 👉`;
  const shareText = `${shareMessage} ${shareLink}`;

  const openSheet = () => {
    setCopied(false);
    setOpen(true);
  };
  const closeSheet = () => {
    setOpen(false);
    if (triggerRef.current) triggerRef.current.focus();
  };

  // Focus the sheet when it opens; close on Escape
  React.useEffect(() => {
    if (!open) return;
    if (sheetRef.current) sheetRef.current.focus();
    const onKey = (e) => {
      if (e.key === "Escape") closeSheet();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const onWhatsApp = async () => {
    setBusy(true);
    try {
      const blob = await buildShareBlob({ pct, cats, title });
      const file = blob
        ? new File([blob], "fix-je-shit.png", { type: "image/png" })
        : null;
      const withFile = file
        ? { files: [file], text: shareMessage, url: shareLink }
        : null;
      const textOnly = { text: shareMessage, url: shareLink };
      const data =
        withFile && navigator.canShare && navigator.canShare(withFile)
          ? withFile
          : navigator.canShare && navigator.canShare(textOnly)
            ? textOnly
            : null;
      if (data && navigator.share) {
        await navigator.share(data);
      } else {
        window.open(
          "https://wa.me/?text=" + encodeURIComponent(shareText),
          "_blank",
        );
      }
      closeSheet();
    } catch (e) {
      /* user cancelled / not supported */
    }
    setBusy(false);
  };

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch (e) {
      window.prompt("Kopieer deze link:", shareLink);
    }
  };

  const onDownload = async () => {
    setBusy(true);
    try {
      const blob = await buildShareBlob({ pct, cats, title });
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "fix-je-shit.png";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
      }
      closeSheet();
    } catch (e) {}
    setBusy(false);
  };

  const optionRow = {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 14,
    background: "#fff",
    border: "none",
    borderRadius: 16,
    padding: "14px 16px",
    marginBottom: 12,
    cursor: "pointer",
    textAlign: "left",
  };
  const iconCircle = (bg) => ({
    width: 44,
    height: 44,
    flexShrink: 0,
    borderRadius: 22,
    background: bg,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  });

  return (
    <div style={{ marginTop: 8 }}>
      <p
        style={{
          color: TOKENS.navyText,
          fontSize: 15,
          fontWeight: 600,
          textAlign: "center",
          margin: "20px 0 12px",
        }}
      >
        Alles gecheckt? Deel jouw score met jezelf en deel de checklist met jouw
        vrienden
      </p>
      <button
        ref={triggerRef}
        onClick={openSheet}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          background: TOKENS.navy,
          color: "#fff",
          border: "none",
          borderRadius: 14,
          padding: "16px 18px",
          fontSize: 16,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        Deel resultaat
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="18" cy="5" r="3" fill="currentColor" />
          <circle cx="6" cy="12" r="3" fill="currentColor" />
          <circle cx="18" cy="19" r="3" fill="currentColor" />
          <path
            d="M8.6 10.7l6.8-3.9M8.6 13.3l6.8 3.9"
            stroke="currentColor"
            strokeWidth="2"
          />
        </svg>
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fjs-root"
            onClick={closeSheet}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(20,20,60,.45)",
              zIndex: 2147483000,
              animation: "fjsFade .2s ease",
            }}
          >
            <div
              ref={sheetRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-labelledby="fjs-share-title"
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                background: TOKENS.pageBg,
                borderRadius: "24px 24px 0 0",
                padding: "10px 18px 24px",
                maxWidth: 560,
                margin: "0 auto",
                outline: "none",
                animation: "fjsSheetUp .25s ease",
              }}
            >
              {/* drag handle */}
              <div
                aria-hidden="true"
                style={{
                  width: 44,
                  height: 4,
                  borderRadius: 999,
                  background: "#b9bbd1",
                  margin: "0 auto 6px",
                }}
              />
              <button
                onClick={closeSheet}
                style={{
                  position: "absolute",
                  top: 14,
                  right: 14,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  height: 34,
                  padding: "0 12px",
                  borderRadius: 17,
                  border: "none",
                  background: TOKENS.navy,
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                  lineHeight: 1,
                }}
              >
                Sluiten <span aria-hidden="true">✕</span>
              </button>
              <h3
                id="fjs-share-title"
                style={{
                  color: TOKENS.navyText,
                  fontSize: 19,
                  fontWeight: 700,
                  margin: "10px 0 2px",
                }}
              >
                Deel jouw resultaat
              </h3>
              <p
                style={{
                  color: TOKENS.textMuted,
                  fontSize: 14,
                  margin: "0 0 16px",
                }}
              >
                Met jezelf of met je vrienden
              </p>

              <div
                style={{
                  color: TOKENS.navyText,
                  fontSize: 14,
                  fontWeight: 700,
                  margin: "0 0 8px",
                }}
              >
                Deel met jezelf
              </div>
              <button onClick={onCopy} style={optionRow}>
                <span style={iconCircle("#e5e6f7")}>
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    style={{ color: TOKENS.navy }}
                  >
                    <path
                      d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.1M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.1"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong
                    style={{
                      display: "block",
                      color: copied ? TOKENS.green : TOKENS.navyText,
                      fontSize: 15,
                    }}
                  >
                    {copied ? "Gekopieerd ✓" : "Link kopiëren"}
                  </strong>
                  <span style={{ color: TOKENS.textMuted, fontSize: 13 }}>
                    Naar jezelf of je ouders/verzorgers
                  </span>
                </span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  style={{ color: TOKENS.navyText, flexShrink: 0 }}
                >
                  <path
                    d="M9 6l6 6-6 6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>

              <button onClick={onDownload} disabled={busy} style={optionRow}>
                <span style={iconCircle("#e5e6f7")}>
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    style={{ color: TOKENS.navy }}
                  >
                    <rect
                      x="3"
                      y="3"
                      width="18"
                      height="18"
                      rx="3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    />
                    <circle cx="9" cy="9" r="1.8" fill="currentColor" />
                    <path
                      d="M4 17l5-5 4 4 3-3 4 4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong
                    style={{
                      display: "block",
                      color: TOKENS.navyText,
                      fontSize: 15,
                    }}
                  >
                    Foto downloaden
                  </strong>
                  <span style={{ color: TOKENS.textMuted, fontSize: 13 }}>
                    Bewaar je resultaat als afbeelding
                  </span>
                </span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  style={{ color: TOKENS.navyText, flexShrink: 0 }}
                >
                  <path
                    d="M9 6l6 6-6 6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>

              <div
                style={{
                  color: TOKENS.navyText,
                  fontSize: 14,
                  fontWeight: 700,
                  margin: "18px 0 8px",
                }}
              >
                Deel met je vrienden
              </div>
              <button onClick={onWhatsApp} disabled={busy} style={optionRow}>
                <span style={iconCircle("#d9f2df")}>
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      fill="#25D366"
                      d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.2-.7.8-.8 1-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-2-1.2 7.4 7.4 0 0 1-1.4-1.7c-.1-.2 0-.4.1-.5l.4-.5c.1-.2.2-.3.3-.5v-.5c0-.1-.6-1.4-.8-1.9-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1.1 2.7c.1.2 1.8 2.8 4.4 3.9.6.3 1.1.4 1.5.5.6.2 1.2.2 1.6.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2l-.5-.3Z"
                    />
                  </svg>
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong
                    style={{
                      display: "block",
                      color: TOKENS.navyText,
                      fontSize: 15,
                    }}
                  >
                    Delen via WhatsApp
                  </strong>
                  <span style={{ color: TOKENS.textMuted, fontSize: 13 }}>
                    Deel de checklist met je vrienden
                  </span>
                </span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  style={{ color: TOKENS.navyText, flexShrink: 0 }}
                >
                  <path
                    d="M9 6l6 6-6 6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          </div>,
          document.body,
        )}

      <span
        aria-live="polite"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      >
        {copied ? "Link gekopieerd" : ""}
      </span>
    </div>
  );
}

/* ---- Result recommendation card (Frame_10 design):
   icon + title + always-visible body; "Waarom?" expands below ---- */
function RecAccordion({ id, rec }) {
  const [open, setOpen] = useState(false);
  const panelId = `rec-panel-${id}`;
  const btnId = `rec-btn-${id}`;
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 18,
        boxShadow: "0 6px 24px rgba(20,20,60,.07)",
        marginBottom: 14,
        padding: "16px 18px",
        display: "flex",
        gap: 14,
        alignItems: "flex-start",
      }}
    >
      {/* icon slot — real design icon if provided, otherwise a placeholder */}
      {rec.icon ? (
        <img
          src={rec.icon}
          alt=""
          aria-hidden="true"
          width={44}
          height={44}
          style={{
            width: 44,
            height: 44,
            objectFit: "contain",
            flexShrink: 0,
            borderRadius: 22,
          }}
        />
      ) : (
        <span
          aria-hidden="true"
          style={{
            width: 44,
            height: 44,
            flexShrink: 0,
            borderRadius: 22,
            border: `1px solid ${TOKENS.border}`,
            background: TOKENS.cardSub,
          }}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <strong style={{ color: TOKENS.navyText, fontSize: 16 }}>
            {rec.title}
          </strong>
          {rec.priority && (
            <span
              style={{
                background: "#f6d4d4",
                color: TOKENS.red,
                fontSize: 12,
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: 999,
              }}
            >
              Belangrijk
            </span>
          )}
        </div>
        {rec.body && (
          <p
            style={{
              color: TOKENS.textMuted,
              fontSize: 15,
              margin: "6px 0 0",
            }}
          >
            {rec.body}
          </p>
        )}
        {(rec.waarom || rec.href) && (
          <>
            {rec.waarom && (
              <button
                id={btnId}
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                aria-controls={panelId}
                aria-label={`Waarom? ${rec.title}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: "none",
                  border: "none",
                  padding: "8px 0 2px",
                  color: TOKENS.navy,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Waarom?
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  style={{
                    transform: open ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform .2s ease",
                  }}
                >
                  <path
                    d="M6 9l6 6 6-6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            )}
            <div id={panelId} hidden={rec.waarom ? !open : false}>
              {rec.waarom && (
                <p
                  style={{
                    color: TOKENS.textMuted,
                    fontSize: 15,
                    margin: "6px 0 0",
                  }}
                >
                  {rec.waarom}
                </p>
              )}
              {rec.href && (
                <a
                  href={rec.href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Bekijk: ${rec.title}`}
                  style={{
                    display: "inline-block",
                    padding: "5px 2px",
                    marginTop: 4,
                    color: TOKENS.navy,
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  Bekijk <span aria-hidden="true">↗</span>
                </a>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Under18Result({ answers, onRestart, shared }) {
  const resultHeadingRef = useRef(null);
  React.useEffect(() => {
    if (resultHeadingRef.current) resultHeadingRef.current.focus();
  }, []);
  const scoreOnOf = (id) => QUESTIONS.find((q) => q.id === id).scoreOn;
  const earned = ["digid", "geldzorgen"].filter(
    (id) => answers[id] === scoreOnOf(id),
  ).length;
  const pct = earned === 0 ? 0 : earned === 1 ? 75 : 100;

  const gaps = QUESTIONS.filter((q) => {
    const v = answers[q.id];
    if (v === undefined) return false;
    const a = q.answers.find((x) => x.value === v);
    return a && a.status === "gap";
  }).sort(
    (a, b) =>
      (RECOMMENDATIONS[b.id] && RECOMMENDATIONS[b.id].priority ? 1 : 0) -
      (RECOMMENDATIONS[a.id] && RECOMMENDATIONS[a.id].priority ? 1 : 0),
  );
  const mustFix = gaps.filter(
    (q) => !(RECOMMENDATIONS[q.id] && RECOMMENDATIONS[q.id].optional),
  );
  const extra = gaps.filter(
    (q) => RECOMMENDATIONS[q.id] && RECOMMENDATIONS[q.id].optional,
  );

  const level =
    pct === 100
      ? {
          icon: "🏆",
          title: "Goed bezig! 🎉",
          body: "Je belangrijkste zaken zijn geregeld.",
        }
      : pct >= 75
        ? {
            icon: "💪",
            title: "Goed bezig!",
            body: "Nog een kleine stap en je bent klaar.",
          }
        : {
            icon: "⚠️",
            title: "Het is belangrijk om op tijd je shit te fixen",
            body: "Begin met de stappen hieronder.",
          };

  // Share checklist: only the categories that were actually asked in the <18 flow
  const shareCats = RESULT_CATEGORIES.map((cat) => {
    const qs = cat.questionIds
      .map((id) => QUESTIONS.find((q) => q.id === id))
      .filter(Boolean);
    const answered = qs.some((q) => answers[q.id] !== undefined);
    const ok = qs.every(
      (q) =>
        !q.scored || answers[q.id] === q.scoreOn || answers[q.id] === undefined,
    );
    return { label: cat.label, ok, answered };
  })
    .filter((c) => c.answered)
    .map((c) => ({ label: c.label, ok: c.ok }));

  const VOORBEREIDING = [
    {
      title: "Zorgverzekering afsluiten",
      body: "Vanaf je 18e ben je verplicht om een eigen zorgverzekering af te sluiten. Je kan op de polis van je ouders blijven, of zelf een andere verzekering afsluiten. ",
      icon: ICON_ZORGTOESLAG,
    },
    {
      title: "Zorgtoeslag aanvragen",
      body: " Zorgtoeslag is geld van de overheid dat helpt om je zorgverzekering te betalen.",
      icon: ICON_ZORGTOESLAG,
    },
    {
      title: "Inschrijven voor een kamer of sociale huurwoning",
      body: "Hoe eerder jij je inschrijft, des te meer kans op een woning.",
      icon: ICON_HUURWONING,
    },
    {
      title: "Inboedelverzekering",
      body: "Belangrijk als je op jezelf gaat wonen! Met een inboedelverzekering zijn jouw spullen verzekerd bij diefstal, brand of schade.",
      icon: ICON_VERZEKEREN,
    },
  ];

  const card = {
    background: "#fff",
    borderRadius: 18,
    boxShadow: "0 6px 24px rgba(20,20,60,.07)",
    padding: 20,
    marginBottom: 14,
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: 12,
        }}
      >
        <button
          onClick={onRestart}
          style={{
            border: "none",
            background: "none",
            color: TOKENS.navyText,
            fontSize: 15,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span aria-hidden="true">↻</span> Opnieuw
        </button>
      </div>

      {shared && (
        <div
          role="status"
          style={{
            ...card,
            display: "flex",
            gap: 14,
            alignItems: "center",
            marginBottom: 14,
          }}
        >
          <img
            src={LOGO_DATA_URI}
            alt=""
            aria-hidden="true"
            width={40}
            style={{ width: 40, height: "auto", flexShrink: 0 }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong style={{ color: TOKENS.navyText, fontSize: 15 }}>
              Je bekijkt een gedeelde uitslag
            </strong>
            <p
              style={{
                color: TOKENS.textMuted,
                fontSize: 14,
                margin: "2px 0 0",
              }}
            >
              Benieuwd naar je eigen score? Doe zelf de check.
            </p>
          </div>
        </div>
      )}

      <div style={{ ...card, textAlign: "center", padding: "28px 20px" }}>
        <h2
          ref={resultHeadingRef}
          tabIndex={-1}
          style={{
            color: TOKENS.navyText,
            fontSize: 22,
            margin: "0 0 18px",
            fontWeight: 700,
            outline: "none",
          }}
        >
          Jouw fix score
        </h2>
        <ScoreRing pct={pct} />
        <p
          style={{ color: TOKENS.textMuted, fontSize: 16, margin: "16px 0 0" }}
        >
          {hideEmoji(level.title)}
        </p>
      </div>

      <div
        style={{
          ...card,
          background: TOKENS.amberBg,
          display: "flex",
          gap: 16,
          alignItems: "center",
        }}
      >
        {level.icon === "⚠️" ? (
          <img
            src={ICON_RISICO}
            alt=""
            aria-hidden="true"
            width={36}
            height={36}
            style={{
              width: 36,
              height: 36,
              objectFit: "contain",
              flexShrink: 0,
            }}
          />
        ) : (
          <div style={{ fontSize: 32 }} aria-hidden="true">
            {level.icon}
          </div>
        )}
        <div>
          <div
            style={{
              color: TOKENS.navyText,
              fontSize: 18,
              fontWeight: 700,
              marginBottom: 4,
            }}
          >
            {hideEmoji(level.title)}
          </div>
          <div style={{ color: TOKENS.navyText, fontSize: 15, opacity: 0.85 }}>
            {level.body}
          </div>
        </div>
      </div>

      {mustFix.length > 0 && (
        <>
          <h3
            style={{
              color: TOKENS.navyText,
              fontSize: 20,
              margin: "26px 0 14px",
              fontWeight: 700,
            }}
          >
            Belangrijk
          </h3>
          {mustFix.map((q) => {
            const rec = RECOMMENDATIONS[q.id];
            if (!rec) return null;
            return <RecAccordion key={q.id} id={q.id} rec={rec} />;
          })}
        </>
      )}

      <h3
        style={{
          color: TOKENS.navyText,
          fontSize: 20,
          margin: "26px 0 6px",
          fontWeight: 700,
        }}
      >
        Wat kan je nog meer Fixen?
      </h3>
      <p
        style={{
          color: TOKENS.navyText,
          fontSize: 15,
          fontWeight: 600,
          margin: "0 0 14px",
        }}
      >
        Niet verplicht, maar wel belangrijk.
      </p>
      {extra.map((q) => {
        const rec = RECOMMENDATIONS[q.id];
        if (!rec) return null;
        return <RecAccordion key={q.id} id={q.id} rec={rec} />;
      })}
      <RecAccordion
        id="donorregister-u18"
        rec={{
          title: "Jouw keuze over orgaandonatie",
          body: "Vanaf 12 jaar kun je jouw keuze al zelf invullen op donorregister.nl.",
          href: "https://www.donorregister.nl/",
          icon: ICON_DONOR,
          waarom:
            "Zo beslis jij zelf over orgaandonatie. Je kunt jouw keuze later altijd nog veranderen.",
        }}
      />

      <h3
        style={{
          color: TOKENS.navyText,
          fontSize: 20,
          margin: "26px 0 6px",
          fontWeight: 700,
        }}
      >
        Belangrijk vanaf jouw 18e verjaardag
      </h3>
      {VOORBEREIDING.map((v) => (
        <div
          key={v.title}
          style={{
            ...card,
            display: "flex",
            gap: 14,
            alignItems: "flex-start",
          }}
        >
          <img
            src={v.icon}
            alt=""
            aria-hidden="true"
            width={44}
            height={44}
            style={{
              width: 44,
              height: 44,
              objectFit: "contain",
              flexShrink: 0,
              borderRadius: 22,
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong style={{ color: TOKENS.navyText, fontSize: 16 }}>
              {v.title}
            </strong>
            <p
              style={{
                color: TOKENS.textMuted,
                fontSize: 15,
                margin: "4px 0 0",
              }}
            >
              {v.body}
            </p>
          </div>
        </div>
      ))}
      <h3
        style={{
          color: TOKENS.navyText,
          fontSize: 20,
          margin: "26px 0 14px",
          fontWeight: 700,
        }}
      >
        Hulp bij Jongerenstip
      </h3>
      <div
        style={{
          ...card,
          display: "flex",
          gap: 14,
          alignItems: "flex-start",
        }}
      >
        <img
          src={LOGO_DATA_URI}
          alt=""
          aria-hidden="true"
          width={44}
          style={{ width: 44, height: "auto", flexShrink: 0 }}
        />
        <div>
          <strong style={{ color: TOKENS.navyText, fontSize: 16 }}>
            Hulp nodig?
          </strong>
          <p
            style={{
              color: TOKENS.textMuted,
              fontSize: 15,
              margin: "4px 0 0",
              lineHeight: 1.6,
            }}
          >
            Chat, bel of DM ons
            <br />
            06-57723415
            <br />
            <strong>Instagram:</strong> jongerenstip
          </p>
        </div>
      </div>

      <h3
        style={{
          color: TOKENS.navyText,
          fontSize: 20,
          margin: "26px 0 14px",
          fontWeight: 700,
        }}
      >
        Hulp bij gemeente Nijmegen
      </h3>
      {HELP_CARDS.map((h) => (
        <div
          key={h.title}
          style={{
            ...card,
            display: "flex",
            gap: 14,
            alignItems: "flex-start",
          }}
        >
          <img
            src={h.iconImg}
            alt=""
            aria-hidden="true"
            width={44}
            height={44}
            style={{
              width: 44,
              height: 44,
              objectFit: "contain",
              flexShrink: 0,
              borderRadius: 22,
            }}
          />
          <div>
            <strong style={{ color: TOKENS.navyText, fontSize: 16 }}>
              {h.title}
            </strong>
            <p
              style={{
                color: TOKENS.textMuted,
                fontSize: 15,
                margin: "4px 0 8px",
              }}
            >
              {h.body}
            </p>
            <a
              href={h.href}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-block",
                padding: "5px 2px",
                color: TOKENS.navy,
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              {`${h.link} `}
              <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
      ))}

      <ShareSection
        pct={pct}
        cats={shareCats}
        title={level.title}
        link={shareUrl(answers, false)}
      />
    </div>
  );
}

/* ---- Shareable result link ------------------------------------------
   The result is fully derived from the answers, so only the answers are
   encoded — one character per question, in a fixed order:
     "0" = first answer, "1" = second answer, "-" = not asked.
   Prefix "a"/"k" marks the 18+ / under-18 flow.

   SECURITY: the code never reaches the DOM. Decoding maps each character
   onto the hard-coded QUESTIONS list (allow-list); anything unexpected
   makes the whole code invalid and it is discarded. No HTML is built from
   URL data, so a crafted link cannot inject anything.
-------------------------------------------------------------------- */
const SHARE_PREFIX = "fjs=";

/* Each question has 3 states (answer 0, answer 1, not asked) -> base-3 digits,
   plus one bit for the 18+/under-18 flow. Packed into a single base-36 number,
   which stays 4 characters short. */
function encodeResult(answers, is18plus) {
  let n = 0;
  for (let i = QUESTIONS.length - 1; i >= 0; i--) {
    const q = QUESTIONS[i];
    const v = answers[q.id];
    const idx =
      v === undefined ? -1 : q.answers.findIndex((a) => a.value === v);
    const digit = idx < 0 ? 0 : idx + 1; // 0 = not asked, 1 = first, 2 = second
    n = n * 3 + digit;
  }
  n = n * 2 + (is18plus ? 1 : 0);
  return n.toString(36);
}

function decodeResult(code) {
  if (typeof code !== "string") return null;
  if (!/^[0-9a-z]{1,6}$/.test(code)) return null; // strict allow-list
  let n = parseInt(code, 36);
  if (!Number.isSafeInteger(n) || n < 0) return null;
  const max = Math.pow(3, QUESTIONS.length) * 2;
  if (n >= max) return null; // out of range -> reject
  const is18plus = n % 2 === 1;
  n = Math.floor(n / 2);
  const answers = {};
  for (let i = 0; i < QUESTIONS.length; i++) {
    const digit = n % 3;
    n = Math.floor(n / 3);
    if (digit === 0) continue; // not asked
    const q = QUESTIONS[i];
    const idx = digit - 1;
    if (idx >= q.answers.length) return null; // unknown answer -> reject
    answers[q.id] = q.answers[idx].value;
  }
  if (Object.keys(answers).length === 0) return null;
  return { answers, is18plus };
}

function readSharedResult() {
  try {
    const hash = window.location.hash || "";
    const at = hash.indexOf(SHARE_PREFIX);
    if (at < 0) return null;
    const code = hash.slice(at + SHARE_PREFIX.length).split("&")[0];
    return decodeResult(code);
  } catch (e) {
    return null;
  }
}

function shareUrl(answers, is18plus) {
  const base = window.location.href.split("#")[0];
  return `${base}#${SHARE_PREFIX}${encodeResult(answers, is18plus)}`;
}

function ResultScreen({ answers, is18plus, onRestart, shared }) {
  const resultHeadingRef = useRef(null);
  React.useEffect(() => {
    if (resultHeadingRef.current) resultHeadingRef.current.focus();
  }, []);
  if (!is18plus)
    return (
      <Under18Result answers={answers} onRestart={onRestart} shared={shared} />
    );
  // 18+: only ASKED scored questions form the denominator (skipped conditional questions are not penalized)
  const scored = QUESTIONS.filter(
    (q) => q.scored && answers[q.id] !== undefined,
  );
  const earned = scored.filter((q) => answers[q.id] === q.scoreOn).length;
  const pct = scored.length
    ? Math.round(((earned / scored.length) * 100) / 10) * 10
    : 0;

  const catStatus = RESULT_CATEGORIES.map((cat) => {
    const qs = cat.questionIds
      .map((id) => QUESTIONS.find((q) => q.id === id))
      .filter(Boolean);
    const ok = qs.every(
      (q) =>
        !q.scored || answers[q.id] === q.scoreOn || answers[q.id] === undefined,
    );
    const answered = qs.some((q) => answers[q.id] !== undefined);
    return { ...cat, ok: answered ? ok : true };
  });
  const doneCount = catStatus.filter((c) => c.ok).length;

  const gaps = QUESTIONS.filter((q) => {
    const v = answers[q.id];
    if (v === undefined) return false;
    const a = q.answers.find((x) => x.value === v);
    return a && a.status === "gap";
  }).sort(
    (a, b) =>
      (RECOMMENDATIONS[b.id] && RECOMMENDATIONS[b.id].priority ? 1 : 0) -
      (RECOMMENDATIONS[a.id] && RECOMMENDATIONS[a.id].priority ? 1 : 0),
  );
  const mustFix = gaps.filter(
    (q) => !(RECOMMENDATIONS[q.id] && RECOMMENDATIONS[q.id].optional),
  );
  const extra = gaps.filter(
    (q) => RECOMMENDATIONS[q.id] && RECOMMENDATIONS[q.id].optional,
  );

  let level;
  if (pct === 100)
    level = {
      icon: "🏆",
      title: "Perfect! 🎉",
      body: "Al je belangrijke zaken zijn geregeld. Goed bezig!",
      bg: TOKENS.amberBg,
      color: TOKENS.navyText,
    };
  else if (pct >= 50)
    level = {
      icon: "🏆",
      title: "Goed bezig! 💪",
      body: `Je hebt al ${doneCount} van de 5 zaken geregeld.`,
      bg: TOKENS.amberBg,
      color: TOKENS.navyText,
    };
  else
    level = {
      icon: "⚠️",
      title: "Het is belangrijk om op tijd je shit te fixen",
      body: "Begin met de stappen hieronder.",
      bg: TOKENS.amberBg,
      color: TOKENS.amber,
    };

  const card = {
    background: "#fff",
    borderRadius: 18,
    boxShadow: "0 6px 24px rgba(20,20,60,.07)",
    padding: 20,
    marginBottom: 14,
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: 12,
        }}
      >
        <button
          onClick={onRestart}
          style={{
            border: "none",
            background: "none",
            color: TOKENS.navyText,
            fontSize: 15,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span aria-hidden="true">↻</span> Opnieuw
        </button>
      </div>

      {shared && (
        <div
          role="status"
          style={{
            ...card,
            display: "flex",
            gap: 14,
            alignItems: "center",
            marginBottom: 14,
          }}
        >
          <img
            src={LOGO_DATA_URI}
            alt=""
            aria-hidden="true"
            width={40}
            style={{ width: 40, height: "auto", flexShrink: 0 }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong style={{ color: TOKENS.navyText, fontSize: 15 }}>
              Je bekijkt een gedeelde uitslag
            </strong>
            <p
              style={{
                color: TOKENS.textMuted,
                fontSize: 14,
                margin: "2px 0 0",
              }}
            >
              Benieuwd naar je eigen score? Doe zelf de check.
            </p>
          </div>
        </div>
      )}

      <div style={{ ...card, textAlign: "center", padding: "28px 20px" }}>
        <h2
          ref={resultHeadingRef}
          tabIndex={-1}
          style={{
            color: TOKENS.navyText,
            fontSize: 22,
            margin: "0 0 18px",
            fontWeight: 700,
            outline: "none",
          }}
        >
          Jouw fix score
        </h2>
        <ScoreRing pct={pct} />
        <p
          style={{
            color: TOKENS.textMuted,
            fontSize: 16,
            margin: "16px 0 22px",
          }}
        >
          {hideEmoji(level.title)}
        </p>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            width: "100%",
            maxWidth: 340,
            margin: "0 auto",
          }}
        >
          {catStatus.map((c) => (
            <div
              key={c.key}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap", // reflow: status drops to next line at 320px
                gap: "6px 20px",
              }}
            >
              <span
                style={{
                  color: TOKENS.navyText,
                  fontSize: 17,
                  fontWeight: 600,
                  minWidth: 0,
                  overflowWrap: "anywhere",
                }}
              >
                {c.label}
              </span>
              <span
                style={{
                  flexShrink: 0,
                  marginLeft: "auto",
                  color: c.ok ? TOKENS.green : TOKENS.amber,
                  fontSize: 16,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {c.ok ? (
                  <>
                    <span aria-hidden="true">✓</span> Geregeld
                  </>
                ) : (
                  <>
                    <span aria-hidden="true">⚠</span> Nog regelen
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          ...card,
          background: level.bg,
          display: "flex",
          gap: 16,
          alignItems: "center",
        }}
      >
        {level.icon === "⚠️" ? (
          <img
            src={ICON_RISICO}
            alt=""
            aria-hidden="true"
            width={36}
            height={36}
            style={{
              width: 36,
              height: 36,
              objectFit: "contain",
              flexShrink: 0,
            }}
          />
        ) : (
          <div style={{ fontSize: 32 }} aria-hidden="true">
            {level.icon}
          </div>
        )}
        <div>
          <div
            style={{
              color: level.color,
              fontSize: 18,
              fontWeight: 700,
              marginBottom: 4,
            }}
          >
            {hideEmoji(level.title)}
          </div>
          <div style={{ color: TOKENS.navyText, fontSize: 15, opacity: 0.85 }}>
            {level.body}
          </div>
        </div>
      </div>

      {mustFix.length > 0 && (
        <>
          <h3
            style={{
              color: TOKENS.navyText,
              fontSize: 20,
              margin: "26px 0 6px",
              fontWeight: 700,
            }}
          >
            Wat moet je nog fixen?
          </h3>
          <p
            style={{
              color: TOKENS.navyText,
              fontSize: 15,
              fontWeight: 600,
              margin: "0 0 14px",
            }}
          >
            {`Nog ${mustFix.length} ${
              mustFix.length === 1 ? "stap" : "stappen"
            } en je bent klaar`}
          </p>
          {mustFix.map((q) => {
            const rec = RECOMMENDATIONS[q.id];
            if (!rec) return null;
            return <RecAccordion key={q.id} id={q.id} rec={rec} />;
          })}
        </>
      )}

      {extra.length > 0 && (
        <>
          <h3
            style={{
              color: TOKENS.navyText,
              fontSize: 20,
              margin: "26px 0 6px",
              fontWeight: 700,
            }}
          >
            Wat kan je nog meer doen?
          </h3>
          <p
            style={{
              color: TOKENS.navyText,
              fontSize: 15,
              fontWeight: 600,
              margin: "0 0 14px",
            }}
          >
            {hideEmoji("Niet verplicht, wel slim 💡")}
          </p>
          {extra.map((q) => {
            const rec = RECOMMENDATIONS[q.id];
            if (!rec) return null;
            return <RecAccordion key={q.id} id={q.id} rec={rec} />;
          })}
        </>
      )}
      <h3
        style={{
          color: TOKENS.navyText,
          fontSize: 20,
          margin: "26px 0 14px",
          fontWeight: 700,
        }}
      >
        Hulp bij Jongerenstip
      </h3>
      <div
        style={{
          ...card,
          display: "flex",
          gap: 14,
          alignItems: "flex-start",
        }}
      >
        <img
          src={LOGO_DATA_URI}
          alt=""
          aria-hidden="true"
          width={44}
          style={{ width: 44, height: "auto", flexShrink: 0 }}
        />
        <div>
          <strong style={{ color: TOKENS.navyText, fontSize: 16 }}>
            Hulp nodig?
          </strong>
          <p
            style={{
              color: TOKENS.textMuted,
              fontSize: 15,
              margin: "4px 0 0",
              lineHeight: 1.6,
            }}
          >
            Chat, bel of DM ons
            <br />
            06-57723415
            <br />
            <strong>Instagram:</strong> jongerenstip
          </p>
        </div>
      </div>

      <h3
        style={{
          color: TOKENS.navyText,
          fontSize: 20,
          margin: "26px 0 14px",
          fontWeight: 700,
        }}
      >
        Hulp bij gemeente Nijmegen
      </h3>
      {HELP_CARDS.map((h) => (
        <div
          key={h.title}
          style={{
            ...card,
            display: "flex",
            gap: 14,
            alignItems: "flex-start",
          }}
        >
          <img
            src={h.iconImg}
            alt=""
            aria-hidden="true"
            width={44}
            height={44}
            style={{
              width: 44,
              height: 44,
              objectFit: "contain",
              flexShrink: 0,
              borderRadius: 22,
            }}
          />
          <div>
            <strong style={{ color: TOKENS.navyText, fontSize: 16 }}>
              {h.title}
            </strong>
            <p
              style={{
                color: TOKENS.textMuted,
                fontSize: 15,
                margin: "4px 0 8px",
              }}
            >
              {h.body}
            </p>
            <a
              href={h.href}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-block",
                padding: "5px 2px",
                color: TOKENS.navy,
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              {`${h.link} `}
              <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
      ))}

      <ShareSection
        pct={pct}
        cats={catStatus.map((c) => ({ label: c.label, ok: c.ok }))}
        title={level.title}
        link={shareUrl(answers, true)}
      />
    </div>
  );
}

const GATE = {
  id: "_gate",
  bare: true,
  title: "Ben je 18 jaar of ouder?",
  subtitle:
    "Als volwassene moet je veel zaken zelf regelen. Laten we bekijken wat jij al gefixt hebt.",
  answers: [
    { value: "nee", label: "Nee", tone: "neg", status: "context" },
    { value: "ja", label: "Ja", tone: "pos", status: "context" },
  ],
};

export default function FixJeShit() {
  // A shared result link (#fjs=...) opens straight on the result screen.
  const sharedInit = useMemo(() => readSharedResult(), []);
  const [shared, setShared] = useState(sharedInit);
  const [started, setStarted] = useState(!!sharedInit);
  const [is18plus, setIs18plus] = useState(
    sharedInit ? sharedInit.is18plus : null,
  );
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState(sharedInit ? sharedInit.answers : {});
  const [skipped, setSkipped] = useState([]);
  const [history, setHistory] = useState([]);
  const [done, setDone] = useState(!!sharedInit);
  const [enterFrom, setEnterFrom] = useState("forward"); // forward | back
  const [hintDone, setHintDone] = useState(false); // first-card coach-mark plays once

  const visible = useMemo(() => {
    let qs = QUESTIONS;
    if (is18plus === false) qs = qs.filter((q) => q.availableUnder18); // verkorte flow
    return qs.filter((q) => !skipped.includes(q.id));
  }, [skipped, is18plus]);
  const current = visible[step];

  const progressInfo = useMemo(() => {
    if (!current) return null;
    const index = step + 1;
    const total = visible.length;
    const pct = Math.round((index / total) * 100);
    return { pct, index, total };
  }, [current, visible, step]);

  const handleGate = (answer) => {
    setEnterFrom("forward");
    setIs18plus(answer.value === "ja");
    setStep(0);
    setAnswers({});
    setSkipped([]);
    setHistory([]);
    setDone(false);
  };

  const handleAnswer = (answer) => {
    const q = current;
    setEnterFrom("forward");
    setAnswers((prev) => ({ ...prev, [q.id]: answer.value }));
    setHistory((h) => [...h, { step, skipped: [...skipped] }]);
    if (q.branch) {
      const toSkip = q.branch(answer.value);
      if (toSkip.length) setSkipped((s) => [...new Set([...s, ...toSkip])]);
    }
    if (step + 1 >= visible.length) setDone(true);
    else setStep((s) => s + 1);
  };

  const handleBack = () => {
    setEnterFrom("back");
    if (history.length === 0) {
      // first question → back to the age question (gate)
      setIs18plus(null);
      return;
    }
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setSkipped(prev.skipped);
    setStep(prev.step);
    setDone(false);
  };

  const restart = () => {
    // Leaving a shared result: clear the hash so the quiz starts clean.
    if (shared) {
      setShared(null);
      try {
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search,
        );
      } catch (e) {}
    }
    setStarted(false);
    setIs18plus(null);
    setStep(0);
    setAnswers({});
    setSkipped([]);
    setHistory([]);
    setDone(false);
    setEnterFrom("forward");
  };

  let body;
  if (!started) {
    body = (
      <Onboarding
        onStart={() => {
          setEnterFrom("forward");
          setStarted(true);
        }}
      />
    );
  } else if (is18plus === null) {
    body = (
      <QuestionCard
        key="_gate"
        q={GATE}
        progress={null}
        onAnswer={handleGate}
        onBack={() => setStarted(false)}
        canGoBack={true}
        enterFrom={enterFrom}
        showHint={!hintDone}
        onHintDone={() => setHintDone(true)}
      />
    );
  } else if (done) {
    body = (
      <ResultScreen
        answers={answers}
        is18plus={is18plus}
        onRestart={restart}
        shared={!!shared}
      />
    );
  } else if (current) {
    body = (
      <QuestionCard
        key={current.id}
        q={current}
        progress={progressInfo}
        onAnswer={handleAnswer}
        onBack={handleBack}
        canGoBack={true}
        enterFrom={enterFrom}
      />
    );
  }

  return (
    <div
      lang="nl"
      role="region"
      aria-label="Fix je Shit – check je zaken"
      className="fjs-root"
      style={{
        position: "relative",
        overflow: "hidden",
        minHeight: "var(--fjs-min-height, 100dvh)",
        background: "var(--fjs-bg, transparent)",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <style>{`
        /* nijmegen.nl (TYPO3) wrapper: neutralise ONLY the chain that contains this widget */
        main:has(.fjs-root),
        article.content:has(.fjs-root) {
          max-width: none !important;
          padding: 0 !important;
          margin: 0 !important;
        }
        .container:has(.fjs-root),
        #content:has(.fjs-root),
        .frame:has(.fjs-root),
        .openstad:has(.fjs-root) {
          padding: 0 !important;
          margin: 0 !important;
          background: transparent !important;
          max-width: none !important;
          width: 100% !important;
          border-radius: 0 !important;
        }
        .fjs-root button:focus-visible,
        .fjs-root a:focus-visible,
        .fjs-root [tabindex]:focus-visible {
          outline: 3px solid #2A2E65;
          outline-offset: 2px;
        }
        @media (prefers-reduced-motion: reduce) {
          .fjs-root *, .fjs-root *::before, .fjs-root *::after {
            animation-duration: .001ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: .001ms !important;
            scroll-behavior: auto !important;
          }
        }
        @keyframes fjsEnter {
          from { opacity: 0; transform: translateY(32px) scale(.93); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes fjsEnterBack {
          from { opacity: 0; transform: translateY(-32px) scale(.93); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes fjsHand {
          0%   { left: 50%; transform: translate(-50%, -190px) scale(1); }
          10%  { left: 60%; transform: translate(-50%, -190px) scale(1); }
          22%  { left: 40%; transform: translate(-50%, -190px) scale(1); }
          32%  { left: 50%; transform: translate(-50%, -190px) scale(1); }
          44%  { left: 28%; transform: translate(-50%, 0px) scale(1); }
          52%  { left: 28%; transform: translate(-50%, 0px) scale(.74); }
          60%  { left: 28%; transform: translate(-50%, 0px) scale(1); }
          72%  { left: 72%; transform: translate(-50%, 0px) scale(1); }
          80%  { left: 72%; transform: translate(-50%, 0px) scale(.74); }
          88%  { left: 72%; transform: translate(-50%, 0px) scale(1); }
          100% { left: 50%; transform: translate(-50%, -190px) scale(1); }
        }
        @keyframes fjsSheetUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes fjsFade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>
      <BgDecorations />
      <div style={{ position: "relative", zIndex: 1 }}>
        <Header />
        <div style={{ padding: "0 16px 24px" }}>
          <div style={{ maxWidth: done ? 560 : 460, margin: "0 auto" }}>
            {body}
          </div>
        </div>
      </div>
    </div>
  );
}
