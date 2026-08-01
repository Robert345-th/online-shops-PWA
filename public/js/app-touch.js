(function () {
  const style = document.createElement("style");
  style.textContent = `
    html, body {
      -webkit-touch-callout: none;
    }
    body {
      user-select: none;
      -webkit-user-select: none;
      touch-action: manipulation;
    }
    input, textarea, [contenteditable="true"] {
      user-select: text;
      -webkit-user-select: text;
    }
  `;
  document.head.appendChild(style);

  document.addEventListener("selectstart", (e) => {
    if (!e.target.closest("input, textarea, [contenteditable=\"true\"]")) {
      e.preventDefault();
    }
  });

  document.addEventListener("contextmenu", (e) => {
    if (!e.target.closest("input, textarea, [contenteditable=\"true\"]")) {
      e.preventDefault();
    }
  });
})();
