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

  function receiptClockSvg() {
    return `<svg class="clock" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`;
  }

  function receiptTicksSvg() {
    return `<svg class="rc" viewBox="0 0 16 11" aria-hidden="true"><path d="M1.2 6.2l2.8 3 6.4-7.4"/><path d="M5.6 6.4l2.6 2.8 6.6-7.6"/></svg>`;
  }

  function chatReceiptInner(status) {
    if (status === "sending") return receiptClockSvg();
    return receiptTicksSvg();
  }

  function readTickMarkup(read, extraClass, id, visible) {
    const cls = read ? "read" : "sent";
    const extra = extraClass ? ` ${extraClass}` : "";
    const idAttr = id ? ` id="${id}"` : "";
    const hide = visible === false ? ` style="display:none;"` : "";
    return `<span${idAttr} class="read-tick ${cls}${extra}" aria-hidden="true"${hide}>${receiptTicksSvg()}</span>`;
  }

  function updateReadTickElement(el, read, visible) {
    if (!el) return;
    if (!visible) {
      el.style.display = "none";
      return;
    }
    el.style.display = "inline-flex";
    el.innerHTML = receiptTicksSvg();
    el.classList.toggle("read", read);
    el.classList.toggle("sent", !read);
  }

  window.isConversationLastMessageRead = isConversationLastMessageRead;
  window.receiptClockSvg = receiptClockSvg;
  window.receiptTicksSvg = receiptTicksSvg;
  window.chatReceiptInner = chatReceiptInner;
  window.readTickMarkup = readTickMarkup;
  window.updateReadTickElement = updateReadTickElement;
})();
