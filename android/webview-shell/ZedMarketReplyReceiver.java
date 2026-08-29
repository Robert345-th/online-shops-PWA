package app.zedmarket.twa;

import android.app.RemoteInput;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public class ZedMarketReplyReceiver extends BroadcastReceiver {
    private static final String TAG = "ZedMarketReply";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !ZedMarketNotifier.ACTION_REPLY.equals(intent.getAction())) {
            return;
        }
        Bundle results = RemoteInput.getResultsFromIntent(intent);
        CharSequence typed = results == null
                ? null
                : results.getCharSequence(ZedMarketNotifier.KEY_REPLY);
        String reply = typed == null ? "" : typed.toString().trim();
        if (reply.length() > 2000) {
            reply = reply.substring(0, 2000);
        }
        String otherUserId = intent.getStringExtra(ZedMarketNotifier.EXTRA_OTHER_USER_ID);
        String url = intent.getStringExtra(ZedMarketNotifier.EXTRA_URL);
        String title = intent.getStringExtra(ZedMarketNotifier.EXTRA_TITLE);
        if (reply.isEmpty() || otherUserId == null || otherUserId.trim().isEmpty()) {
            return;
        }
        final String text = reply;
        final String peer = otherUserId.trim();
        final PendingResult pending = goAsync();
        new Thread(() -> {
            try {
                boolean ok = sendMessage(context, peer, text);
                if (ok) {
                    ZedMarketNotifier.show(
                            context,
                            title,
                            "You: " + text,
                            url,
                            "chat",
                            peer);
                } else {
                    new Handler(Looper.getMainLooper()).post(() ->
                            Toast.makeText(
                                    context.getApplicationContext(),
                                    "Could not send reply. Open ZedMarket.",
                                    Toast.LENGTH_LONG
                            ).show());
                }
            } finally {
                pending.finish();
            }
        }, "zm-reply").start();
    }

    private static boolean sendMessage(Context context, String otherUserId, String content) {
        String jwt = ZedMarketAuthStore.getJwt(context);
        if (jwt.isEmpty()) {
            Log.w(TAG, "Reply skipped: not signed in on this phone");
            return false;
        }
        int receiverId;
        try {
            receiverId = Integer.parseInt(otherUserId);
        } catch (NumberFormatException e) {
            return false;
        }
        HttpURLConnection conn = null;
        try {
            JSONObject body = new JSONObject();
            body.put("receiver_id", receiverId);
            body.put("content", content);
            byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
            URL endpoint = new URL(ZedMarketAuthStore.API_URL + "/messages");
            conn = (HttpURLConnection) endpoint.openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(15000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Authorization", "Bearer " + jwt);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Accept", "application/json");
            OutputStream out = conn.getOutputStream();
            out.write(payload);
            out.close();
            int code = conn.getResponseCode();
            if (code >= 200 && code < 300) {
                return true;
            }
            Log.w(TAG, "Reply failed HTTP " + code);
            return false;
        } catch (Exception e) {
            Log.e(TAG, "Reply failed", e);
            return false;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }
}
