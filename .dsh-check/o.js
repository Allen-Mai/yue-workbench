"use strict";
function f(a, b) {
  const stats = Card({
    body: h(
      "div",
      { class: "grid grid-auto" },
      Stat({ label: "a", value: fmtMoney(a) }),
      Stat({ label: "b", value: fmtMoney(b) })
    )
  });
}
