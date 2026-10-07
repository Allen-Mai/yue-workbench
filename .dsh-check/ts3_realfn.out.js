"use strict";
function h(...a) {
  return a[0];
}
const x = [
  h(
    "div",
    { class: "g" },
    h(1)
  )
];
