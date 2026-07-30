(function () {
  function isReadAt(value) {
    return value != null && value !== "" && value !== false;
  }

  function isConversationLastMessageRead(conv) {
    if (!conv) return false;
    if (conv.last_message_read === true) return true;
    if (conv.last_message_read === false) return false;
    return isReadAt(conv.last_read_at) || isReadAt(conv.read_at);
  }

  function readTickMarkup(read, extraClass) {
    const cls = read ? "read" : "sent";
    const extra = extraClass ? ` ${extraClass}` : "";
    return `<span class="read-tick ${cls}${extra}" aria-hidden="true">${read ? "✓✓" : "✓"}</span>`;
  }

  function updateReadTickElement(el, read, visible) {
    if (!el) return;
    if (!visible) {
      el.style.display = "none";
      return;
    }
    el.style.display = "inline";
    el.textContent = read ? "✓✓" : "✓";
    el.classList.toggle("read", read);
    el.classList.toggle("sent", !read);
  }

  window.isConversationLastMessageRead = isConversationLastMessageRead;
  window.readTickMarkup = readTickMarkup;
  window.updateReadTickElement = updateReadTickElement;
})();
