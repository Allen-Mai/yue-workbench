"use strict";
function h(...a) {
  return a[0];
}
function f() {
  return "";
}
const x = [
  h(
    "div",
    { class: "g" },
    f(),
    f()
  )
];
