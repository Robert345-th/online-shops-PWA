(function () {
  async function fetchShopAccess(apiUrl, token) {
    const res = await fetch(`${apiUrl}/auth/shop-status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Could not verify shop status.");
    const data = await res.json();
    const accountType = data.account_type || "individual";
    const shopStatus = data.shop_status || null;
    const step1Approved = accountType === "shop" && shopStatus === "approved";
    const nrcBlocked = data.nrc_grace_expired === true && data.nrc_verified !== true;
    const canPost = step1Approved && !nrcBlocked;
    return {
      canSell: canPost,
      step1Approved,
      accountType,
      shopStatus,
      hasLocation: data.has_location === true,
      nrcGraceEnd: data.nrc_grace_end || null,
      nrcGraceActive: data.nrc_grace_active === true,
      nrcGraceExpired: data.nrc_grace_expired === true,
      nrcSubmitted: data.nrc_submitted === true,
      nrcVerified: data.nrc_verified === true,
      nrcStatus: data.nrc_status || null,
      needsNrc: data.nrc_grace_expired === true && data.nrc_verified !== true,
    };
  }

  window.fetchShopAccess = fetchShopAccess;
})();
