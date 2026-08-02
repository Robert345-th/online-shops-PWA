(function () {
  function normalizeZambianPhone(raw) {
    let phone = String(raw || "").trim().replace(/[\s-]/g, "");
    if (!phone) return "";
    if (phone.startsWith("+")) phone = phone.slice(1);
    if (phone.startsWith("260")) phone = phone.slice(3);
    if (phone.length === 9 && /^(573\d{6}|574\d{6}|75\d{7}|77\d{7}|96\d{7}|97\d{7}|95\d{7})$/.test(phone)) {
      phone = "0" + phone;
    }
    return phone;
  }

  function isValidZambianPhone(raw) {
    const phone = normalizeZambianPhone(raw);
    return /^(0573\d{6}|0574\d{6}|075\d{7}|077\d{7}|095\d{7}|096\d{7}|097\d{7})$/.test(phone);
  }

  window.normalizeZambianPhone = normalizeZambianPhone;
  window.isValidZambianPhone = isValidZambianPhone;
})();
