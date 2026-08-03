/*
 * Full-screen WebView for Play Store testing app with native location + photo picker.
 */
package app.zedmarket.twa;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.util.Log;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.RequiresApi;
import androidx.browser.customtabs.CustomTabsIntent;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.google.androidbrowserhelper.trusted.LauncherActivityMetadata;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class ZedMarketWebViewActivity extends Activity {
    private static final String TAG = "ZedMarketWebView";
    private static final int REQ_LOCATION = 9001;
    private static final int REQ_FILE_CHOOSER = 9002;
    private static final int FALLBACK_COLOR = Color.parseColor("#111111");

    private static final String KEY_PREFIX =
            "app.zedmarket.twa.ZedMarketWebViewActivity.";
    private static final String KEY_LAUNCH_URI = KEY_PREFIX + "LAUNCH_URL";
    private static final String KEY_NAVIGATION_BAR_COLOR = KEY_PREFIX + "NAV_BAR_COLOR";
    private static final String KEY_STATUS_BAR_COLOR = KEY_PREFIX + "STATUS_BAR_COLOR";
    private static final String KEY_EXTRA_ORIGINS = KEY_PREFIX + "EXTRA_ORIGINS";

    private Uri mLaunchUrl;
    private int mStatusBarColor = FALLBACK_COLOR;
    private WebView mWebView;
    private final List<Uri> mExtraOrigins = new ArrayList<>();

    private String mPendingGeoOrigin;
    private GeolocationPermissions.Callback mPendingGeoCallback;
    private boolean mRetryLocationAfterSettings;
    private ValueCallback<Uri[]> mFilePathCallback;

    public static Intent createLaunchIntent(
            Context context,
            Uri launchUrl,
            LauncherActivityMetadata metadata) {
        Intent intent = new Intent(context, ZedMarketWebViewActivity.class);
        intent.putExtra(KEY_LAUNCH_URI, launchUrl);
        intent.putExtra(KEY_STATUS_BAR_COLOR, safeColor(context, metadata.statusBarColorId));
        intent.putExtra(KEY_NAVIGATION_BAR_COLOR, safeColor(context, metadata.navigationBarColorId));
        if (metadata.additionalTrustedOrigins != null) {
            intent.putStringArrayListExtra(KEY_EXTRA_ORIGINS,
                    new ArrayList<>(metadata.additionalTrustedOrigins));
        }
        return intent;
    }

    private static int safeColor(Context context, int colorResId) {
        try {
            if (colorResId != 0) {
                return ContextCompat.getColor(context, colorResId);
            }
        } catch (Exception ignored) {
            // Fall through to default brand color.
        }
        return FALLBACK_COLOR;
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        try {
            mLaunchUrl = getIntent().getParcelableExtra(KEY_LAUNCH_URI);
            if (mLaunchUrl == null || mLaunchUrl.getScheme() == null
                    || !"https".equalsIgnoreCase(mLaunchUrl.getScheme())) {
                mLaunchUrl = Uri.parse("https://zedmarket.app/?utm_source=android");
            }

            mStatusBarColor = getIntent().getIntExtra(KEY_STATUS_BAR_COLOR, FALLBACK_COLOR);
            int navigationBarColor = getIntent().getIntExtra(KEY_NAVIGATION_BAR_COLOR, FALLBACK_COLOR);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                try {
                    getWindow().setStatusBarColor(mStatusBarColor);
                    getWindow().setNavigationBarColor(navigationBarColor);
                } catch (Exception ignored) {
                    // Some OEMs reject status/nav bar color changes.
                }
            }

            if (getIntent().hasExtra(KEY_EXTRA_ORIGINS)) {
                List<String> extraOrigins = getIntent().getStringArrayListExtra(KEY_EXTRA_ORIGINS);
                if (extraOrigins != null) {
                    for (String extraOrigin : extraOrigins) {
                        Uri extraOriginUri = Uri.parse(extraOrigin);
                        if (extraOriginUri != null
                                && "https".equalsIgnoreCase(extraOriginUri.getScheme())) {
                            mExtraOrigins.add(extraOriginUri);
                        }
                    }
                }
            }

            mWebView = new WebView(this);
            mWebView.addJavascriptInterface(new LocationBridge(), "ZedMarketLocation");
            mWebView.setWebViewClient(createWebViewClient());
            mWebView.setWebChromeClient(createWebChromeClient());
            setupWebSettings(mWebView.getSettings());

            setContentView(mWebView, new ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT));

            if (savedInstanceState != null) {
                mWebView.restoreState(savedInstanceState);
                return;
            }

            Map<String, String> headers = new HashMap<>();
            headers.put("Referer", "android-app://" + getPackageName() + "/");
            mWebView.loadUrl(mLaunchUrl.toString(), headers);
        } catch (Exception ex) {
            Log.e(TAG, "Failed to start WebView", ex);
            Toast.makeText(this, "Could not open ZedMarket. Update Android System WebView.", Toast.LENGTH_LONG).show();
            finish();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (mWebView != null) {
            mWebView.onResume();
        }
        if (mRetryLocationAfterSettings && hasLocationPermission()) {
            mRetryLocationAfterSettings = false;
            showLocationNotice(getString(R.string.loc_settings_enabled_retry));
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (mWebView != null) {
            mWebView.onPause();
        }
    }

    @Override
    protected void onSaveInstanceState(@NonNull Bundle outState) {
        super.onSaveInstanceState(outState);
        if (mWebView != null) {
            mWebView.saveState(outState);
        }
    }

    @Override
    public void onConfigurationChanged(@NonNull Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && mWebView != null && mWebView.canGoBack()) {
            mWebView.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE_CHOOSER) {
            if (mFilePathCallback == null) {
                return;
            }
            Uri[] results = null;
            if (resultCode == Activity.RESULT_OK && data != null) {
                ClipData clipData = data.getClipData();
                if (clipData != null && clipData.getItemCount() > 0) {
                    results = new Uri[clipData.getItemCount()];
                    for (int i = 0; i < clipData.getItemCount(); i++) {
                        results[i] = clipData.getItemAt(i).getUri();
                    }
                } else if (data.getData() != null) {
                    results = new Uri[]{data.getData()};
                } else {
                    results = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
                }
            }
            mFilePathCallback.onReceiveValue(results);
            mFilePathCallback = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    public void onRequestPermissionsResult(
            int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != REQ_LOCATION) {
            return;
        }
        if (mPendingGeoCallback == null || mPendingGeoOrigin == null) {
            return;
        }
        GeolocationPermissions.Callback callback = mPendingGeoCallback;
        String origin = mPendingGeoOrigin;
        mPendingGeoCallback = null;
        mPendingGeoOrigin = null;

        boolean granted = false;
        for (int result : grantResults) {
            if (result == PackageManager.PERMISSION_GRANTED) {
                granted = true;
                break;
            }
        }
        if (granted) {
            callback.invoke(origin, true, false);
            return;
        }

        callback.invoke(origin, false, false);
        if (!ActivityCompat.shouldShowRequestPermissionRationale(this,
                Manifest.permission.ACCESS_FINE_LOCATION)) {
            openAppLocationSettings(true);
        } else {
            showLocationNotice(getString(R.string.loc_declined_notice));
        }
    }

    private boolean hasLocationPermission() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED
                || ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
    }

    private void openAppLocationSettings(boolean retryAfter) {
        mRetryLocationAfterSettings = retryAfter;
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.parse("package:" + getPackageName()));
            startActivity(intent);
            showLocationNotice(getString(R.string.loc_open_settings));
        } catch (ActivityNotFoundException ex) {
            Log.e(TAG, "Could not open app settings", ex);
        }
    }

    private void showLocationNotice(String message) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show();
    }

    private void injectLocationHelper(WebView view) {
        view.evaluateJavascript(
                "(function(){"
                        + "if(window.__zmLocHook)return;"
                        + "window.__zmLocHook=1;"
                        + "var g=navigator.geolocation;"
                        + "if(!g)return;"
                        + "var gp=g.getCurrentPosition.bind(g);"
                        + "g.getCurrentPosition=function(ok,err,opt){"
                        + "gp(function(p){if(ok)ok(p);},function(e){"
                        + "try{ZedMarketLocation.onGeolocationError(e&&e.code!=null?e.code:-1);}"
                        + "catch(x){}"
                        + "if(err)err(e);"
                        + "},opt);"
                        + "};"
                        + "})();",
                null);
    }

    private WebViewClient createWebViewClient() {
        return new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                injectLocationHelper(view);
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                try {
                    ViewGroup parent = (ViewGroup) view.getParent();
                    if (parent != null) {
                        parent.removeView(view);
                    }
                    view.destroy();
                    mWebView = new WebView(ZedMarketWebViewActivity.this);
                    mWebView.addJavascriptInterface(new LocationBridge(), "ZedMarketLocation");
                    mWebView.setWebViewClient(this);
                    mWebView.setWebChromeClient(createWebChromeClient());
                    setupWebSettings(mWebView.getSettings());
                    if (parent != null) {
                        parent.addView(mWebView);
                    } else {
                        setContentView(mWebView);
                    }
                    mWebView.loadUrl(mLaunchUrl.toString());
                } catch (Exception ex) {
                    Log.e(TAG, "WebView recovery failed", ex);
                    finish();
                }
                return true;
            }

            private boolean shouldOverrideUrlLoading(Uri navigationUrl) {
                if (navigationUrl == null) {
                    return false;
                }
                if ("data".equals(navigationUrl.getScheme())) {
                    return false;
                }
                if (uriOriginsMatch(navigationUrl, mLaunchUrl) || matchExtraOrigins(navigationUrl)) {
                    return false;
                }
                try {
                    new CustomTabsIntent.Builder()
                            .setToolbarColor(mStatusBarColor)
                            .build()
                            .launchUrl(ZedMarketWebViewActivity.this, navigationUrl);
                    return true;
                } catch (ActivityNotFoundException ex) {
                    return false;
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return shouldOverrideUrlLoading(Uri.parse(url));
            }

            @RequiresApi(api = Build.VERSION_CODES.LOLLIPOP)
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return shouldOverrideUrlLoading(request.getUrl());
            }
        };
    }

    private WebChromeClient createWebChromeClient() {
        return new WebChromeClient() {
            private View fullScreenView;
            private int originalOrientation;

            @Override
            public void onGeolocationPermissionsShowPrompt(
                    String origin, GeolocationPermissions.Callback callback) {
                mPendingGeoOrigin = origin;
                mPendingGeoCallback = callback;

                if (hasLocationPermission()) {
                    callback.invoke(origin, true, false);
                    mPendingGeoCallback = null;
                    mPendingGeoOrigin = null;
                    return;
                }

                ActivityCompat.requestPermissions(
                        ZedMarketWebViewActivity.this,
                        new String[]{
                                Manifest.permission.ACCESS_FINE_LOCATION,
                                Manifest.permission.ACCESS_COARSE_LOCATION
                        },
                        REQ_LOCATION);
            }

            @Override
            public boolean onShowFileChooser(
                    WebView webView,
                    ValueCallback<Uri[]> filePathCallback,
                    FileChooserParams fileChooserParams) {
                if (mFilePathCallback != null) {
                    mFilePathCallback.onReceiveValue(null);
                }
                mFilePathCallback = filePathCallback;
                Intent intent = fileChooserParams.createIntent();
                try {
                    startActivityForResult(intent, REQ_FILE_CHOOSER);
                } catch (ActivityNotFoundException ex) {
                    mFilePathCallback = null;
                    Toast.makeText(
                            ZedMarketWebViewActivity.this,
                            "No app found to pick photos",
                            Toast.LENGTH_LONG
                    ).show();
                    return false;
                }
                return true;
            }

            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (fullScreenView != null) {
                    onHideCustomView();
                }
                fullScreenView = view;
                originalOrientation = getRequestedOrientation();
                getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
                getWindow().addContentView(fullScreenView,
                        new FrameLayout.LayoutParams(
                                ViewGroup.LayoutParams.MATCH_PARENT,
                                ViewGroup.LayoutParams.MATCH_PARENT,
                                Gravity.CENTER));
            }

            @Override
            public void onHideCustomView() {
                if (fullScreenView == null) {
                    return;
                }
                getWindow().clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
                ((ViewGroup) fullScreenView.getParent()).removeView(fullScreenView);
                fullScreenView = null;
                setRequestedOrientation(originalOrientation);
            }
        };
    }

    private boolean matchExtraOrigins(Uri navigationUri) {
        for (Uri uri : mExtraOrigins) {
            if (uriOriginsMatch(uri, navigationUri)) {
                return true;
            }
        }
        return false;
    }

    private static boolean uriOriginsMatch(Uri uriA, Uri uriB) {
        if (uriA == null || uriB == null
                || uriA.getScheme() == null || uriB.getScheme() == null
                || uriA.getHost() == null || uriB.getHost() == null) {
            return false;
        }
        return uriA.getScheme().equalsIgnoreCase(uriB.getScheme())
                && uriA.getHost().equalsIgnoreCase(uriB.getHost())
                && uriA.getPort() == uriB.getPort();
    }

    @SuppressLint("SetJavaScriptEnabled")
    private static void setupWebSettings(WebSettings webSettings) {
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);
        webSettings.setDatabaseEnabled(true);
        webSettings.setGeolocationEnabled(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR1) {
            webSettings.setMediaPlaybackRequiresUserGesture(false);
        }
    }

    private final class LocationBridge {
        @JavascriptInterface
        public void onGeolocationError(int code) {
            runOnUiThread(() -> {
                if (code == 1) {
                    openAppLocationSettings(false);
                    return;
                }
                showLocationNotice(getString(R.string.loc_declined_notice));
            });
        }
    }
}
