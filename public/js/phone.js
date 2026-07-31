(function () {
  function normalizeZambianPhone(raw) {
    let phone = String(raw || "").trim().replace(/[\s-]/g, "");
    if (!phone) return "";
    if (phone.startsWith("+")) phone = phone.slice(1);
    if (phone.startsWith("260")) phone = phone.slice(3);
    if (phone.length === 9 && /^(573|574|77|97)\d+$/.test(phone)) {
      phone = "0" + phone;
    }
    return phone;
  }

  function isValidZambianPhone(raw) {
    const phone = normalizeZambianPhone(raw);
    return /^(0573\d{6}|0574\d{6}|077\d{7}|097\d{7})$/.test(phone);
  }

  window.normalizeZambianPhone = normalizeZambianPhone;
  window.isValidZambianPhone = isValidZambianPhone;
})();
