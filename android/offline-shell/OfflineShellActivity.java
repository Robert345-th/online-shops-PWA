package app.zedmarket.twa;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.view.WindowCompat;

public class OfflineShellActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WindowCompat.enableEdgeToEdge(getWindow());

        WebView webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        webView.setBackgroundColor(Color.parseColor("#F4F1EC"));
        webView.loadDataWithBaseURL(
            "https://zedmarket.app/",
            OFFLINE_HTML,
            "text/html",
            "UTF-8",
            null
        );

        setContentView(
            webView,
            new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        );
    }

    private static final String OFFLINE_HTML =
        "<!DOCTYPE html><html><head>"
        + "<meta charset='UTF-8'>"
        + "<meta name='viewport' content='width=device-width,initial-scale=1,viewport-fit=cover'>"
        + "<style>"
        + "body{margin:0;font-family:sans-serif;background:#F4F1EC;color:#111;"
        + "min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center}"
        + ".card{max-width:360px;background:#fff;border-radius:20px;padding:28px 22px;"
        + "box-shadow:0 8px 24px rgba(0,0,0,.08)}"
        + "h1{font-size:22px;margin:0 0 8px}p{font-size:14px;line-height:1.5;color:#6B6B66;margin:0 0 20px}"
        + "button{background:#111;color:#F5C518;border:none;border-radius:12px;padding:14px 28px;"
        + "font-size:15px;font-weight:700}"
        + "</style></head><body><div class='card'>"
        + "<h1>You are offline</h1>"
        + "<p>Turn on mobile data or Wi-Fi, then tap Try again.</p>"
        + "<button onclick=\"location.href='https://zedmarket.app/?utm_source=android'\">Try again</button>"
        + "</div></body></html>";
}
