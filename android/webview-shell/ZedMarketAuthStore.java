package app.zedmarket.twa;

import android.content.Context;
import android.content.SharedPreferences;

public final class ZedMarketAuthStore {
    static final String PREFS = "zm_loc_perm";
    static final String KEY_JWT = "zm_jwt";
    static final String API_URL = "https://online-shops-production.up.railway.app";

    private ZedMarketAuthStore() {}

    public static void saveJwt(Context context, String token) {
        if (context == null) return;
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        prefs.edit().putString(KEY_JWT, token == null ? "" : token.trim()).apply();
    }

    public static String getJwt(Context context) {
        if (context == null) return "";
        String token = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getString(KEY_JWT, "");
        return token == null ? "" : token.trim();
    }
}
