(function () {
  function flag(value) {
    return value === true || value === "t" || value === "true";
  }

  function zmSellerTrustKind(info) {
    if (!info) return "";
    const accountType = info.account_type || info.seller_account_type || "";
    const shopStatus = info.shop_status || info.seller_shop_status || "";
    const subscribed = flag(info.subscription_active)
      || flag(info.seller_subscription_active)
      || info.payment_status === "active"
      || flag(info.has_active_subscription);
    const nrc = flag(info.nrc_verified) || flag(info.seller_nrc_verified);
    const isShop = accountType === "shop";
    if (isShop && subscribed) return "verified_shop";
    if (nrc) return "id_verified";
    if (isShop && shopStatus === "approved") return "approved_shop";
    if (isShop) return "registered_shop";
    return "";
  }

  function zmSellerTrustLabel(kind) {
    if (kind === "verified_shop") return typeof t === "function" ? t("verified_shop") : "Verified Shop";
    if (kind === "id_verified") return typeof t === "function" ? t("seller_id_verified", "ID Verified") : "ID Verified";
    if (kind === "approved_shop") return typeof t === "function" ? t("approved_shop") : "Approved Shop";
    if (kind === "registered_shop") return typeof t === "function" ? t("registered_shop") : "Registered Shop";
    return "";
  }

  window.zmSellerTrustKind = zmSellerTrustKind;
  window.zmSellerTrustLabel = zmSellerTrustLabel;
})();
