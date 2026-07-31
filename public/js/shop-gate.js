(function () {
  async function fetchShopAccess(apiUrl, token) {
    const res = await fetch(`${apiUrl}/auth/shop-status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Could not verify shop status.");
    const data = await res.json();
    const accountType = data.account_type || "individual";
    const shopStatus = data.shop_status || null;
    return {
      canSell: accountType === "shop" && shopStatus === "approved",
      accountType,
      shopStatus,
    };
  }

  window.fetchShopAccess = fetchShopAccess;
})();
