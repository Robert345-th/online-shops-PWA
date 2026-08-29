package app.zedmarket.twa;

import android.util.Log;

import androidx.annotation.NonNull;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

public class ZedMarketFcmService extends FirebaseMessagingService {
    private static final String TAG = "ZedMarketFcm";
    private static final String PREFS = "zm_loc_perm";
    private static final String KEY_TOKEN = "fcm_token";

    @Override
    public void onNewToken(@NonNull String token) {
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(KEY_TOKEN, token).apply();
        Log.i(TAG, "FCM token refreshed");
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        if (ZedMarketNotifier.appVisible) {
            return;
        }
        Map<String, String> data = message.getData();
        String title = data.get("title");
        String body = data.get("body");
        String url = data.get("url");
        String type = data.get("type");
        String otherUserId = data.get("otherUserId");
        if (message.getNotification() != null) {
            if (title == null || title.isEmpty()) title = message.getNotification().getTitle();
            if (body == null || body.isEmpty()) body = message.getNotification().getBody();
        }
        if ((title == null || title.isEmpty()) && (body == null || body.isEmpty())) {
            return;
        }
        ZedMarketNotifier.show(this, title, body, url, type, otherUserId);
    }
}
