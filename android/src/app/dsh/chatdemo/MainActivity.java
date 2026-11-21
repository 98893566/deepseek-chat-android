package app.dsh.chatdemo;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Message;
import android.provider.MediaStore;
import android.util.Log;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.TextView;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/** DeepSeek Chat 的手机外壳：内置静态服务 + WebView，首次打开在设置里填 API Key。 */
public class MainActivity extends Activity {
  private static final String TAG = "ChatDemo";
  private static final String HOST = "127.0.0.1";
  private static final int PORT = 18777;
  private static final int REQ_FILE = 1001;
  private static final int REQ_AUDIO = 1002;

  private WebView webView;
  private LocalServer server;
  private ValueCallback<Uri[]> fileCallback;
  private PermissionRequest pendingPermission;

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    Window window = getWindow();
    window.setStatusBarColor(Color.WHITE);
    window.setNavigationBarColor(Color.WHITE);
    applyLightBars(true);

    try {
      server = new LocalServer(getAssets(), "web", PORT, this::saveExport);
      server.start();
    } catch (Exception error) {
      Log.e(TAG, "server start failed", error);
      TextView view = new TextView(this);
      view.setText("应用资源加载失败：" + error.getMessage());
      view.setPadding(48, 96, 48, 48);
      setContentView(view);
      return;
    }

    WebView.setWebContentsDebuggingEnabled(false);
    webView = new WebView(this);
    webView.setBackgroundColor(Color.WHITE);

    WebSettings settings = webView.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setDatabaseEnabled(true);
    settings.setMediaPlaybackRequiresUserGesture(false);
    settings.setAllowFileAccess(false);
    settings.setAllowContentAccess(true);
    settings.setSupportMultipleWindows(true);
    settings.setJavaScriptCanOpenWindowsAutomatically(true);
    settings.setUserAgentString(settings.getUserAgentString() + " DSHChatApp/1.0");

    webView.addJavascriptInterface(new Bridge(), "DSHAndroid");
    webView.setWebViewClient(new WebViewClient() {
      @Override
      public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        return openExternal(request.getUrl());
      }

      @Override
      @SuppressWarnings("deprecation")
      public boolean shouldOverrideUrlLoading(WebView view, String url) {
        return openExternal(Uri.parse(url));
      }
    });
    webView.setWebChromeClient(new WebChromeClient() {
      @Override
      public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
          FileChooserParams params) {
        if (fileCallback != null) {
          fileCallback.onReceiveValue(null);
        }
        fileCallback = callback;
        try {
          Intent intent = params.createIntent();
          intent.addCategory(Intent.CATEGORY_OPENABLE);
          startActivityForResult(Intent.createChooser(intent, "选择文件"), REQ_FILE);
          return true;
        } catch (Exception error) {
          Log.w(TAG, "file chooser failed", error);
          fileCallback = null;
          return false;
        }
      }

      @Override
      public void onPermissionRequest(final PermissionRequest request) {
        boolean wantsAudio = false;
        for (String resource : request.getResources()) {
          if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
            wantsAudio = true;
          }
        }
        if (!wantsAudio) {
          request.deny();
          return;
        }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO)
            == PackageManager.PERMISSION_GRANTED) {
          request.grant(new String[] { PermissionRequest.RESOURCE_AUDIO_CAPTURE });
        } else {
          pendingPermission = request;
          requestPermissions(new String[] { Manifest.permission.RECORD_AUDIO }, REQ_AUDIO);
        }
      }

      @Override
      public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture,
          Message resultMsg) {
        final WebView popup = new WebView(MainActivity.this);
        popup.setWebViewClient(new WebViewClient() {
          @Override
          public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return handlePopup(view, request.getUrl());
          }

          @Override
          @SuppressWarnings("deprecation")
          public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return handlePopup(view, Uri.parse(url));
          }
        });
        WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
        transport.setWebView(popup);
        resultMsg.sendToTarget();
        return true;
      }

      @Override
      public void onConsoleMessage(String message, int lineNumber, String sourceID) {
        Log.d(TAG, sourceID + ":" + lineNumber + " " + message);
      }
    });

    setContentView(webView);
    webView.loadUrl("http://" + HOST + ":" + PORT + "/");
  }

  /** window.open：本机页面在主窗口打开，外部链接交给系统浏览器 */
  private boolean handlePopup(WebView popup, Uri uri) {
    if (("http".equals(uri.getScheme()) || "https".equals(uri.getScheme()))
        && (HOST.equals(uri.getHost()) || "localhost".equals(uri.getHost()))) {
      if (webView != null) {
        webView.loadUrl(uri.toString());
      }
    } else {
      openExternal(uri);
    }
    popup.destroy();
    return true;
  }

  /** 页面内链接：本机地址留在应用里，其余交给系统浏览器 */
  private boolean openExternal(Uri uri) {
    String scheme = uri.getScheme();
    if (scheme == null) {
      return true;
    }
    if (("http".equals(scheme) || "https".equals(scheme))
        && (HOST.equals(uri.getHost()) || "localhost".equals(uri.getHost()))) {
      return false;
    }
    if ("http".equals(scheme) || "https".equals(scheme)
        || "mailto".equals(scheme) || "tel".equals(scheme)) {
      try {
        startActivity(new Intent(Intent.ACTION_VIEW, uri));
      } catch (Exception error) {
        Log.w(TAG, "open external failed", error);
      }
      return true;
    }
    return true;
  }

  @Override
  protected void onActivityResult(int requestCode, int resultCode, Intent data) {
    super.onActivityResult(requestCode, resultCode, data);
    if (requestCode != REQ_FILE) {
      return;
    }
    Uri[] results = null;
    if (resultCode == RESULT_OK && data != null) {
      ClipData clip = data.getClipData();
      if (clip != null) {
        results = new Uri[clip.getItemCount()];
        for (int i = 0; i < clip.getItemCount(); i++) {
          results[i] = clip.getItemAt(i).getUri();
        }
      } else if (data.getData() != null) {
        results = new Uri[] { data.getData() };
      }
    }
    if (fileCallback != null) {
      fileCallback.onReceiveValue(results);
      fileCallback = null;
    }
  }

  @Override
  public void onRequestPermissionsResult(int requestCode, String[] permissions,
      int[] grantResults) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    if (requestCode != REQ_AUDIO || pendingPermission == null) {
      return;
    }
    boolean granted = grantResults.length > 0
        && grantResults[0] == PackageManager.PERMISSION_GRANTED;
    if (granted) {
      pendingPermission.grant(new String[] { PermissionRequest.RESOURCE_AUDIO_CAPTURE });
    } else {
      pendingPermission.deny();
    }
    pendingPermission = null;
  }

  private void applyLightBars(boolean light) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return;
    }
    int flags = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
    getWindow().getDecorView().setSystemUiVisibility(light ? flags : 0);
  }

  private void applyChromeColor(String color) {
    try {
      int value = Color.parseColor(color);
      getWindow().setStatusBarColor(value);
      getWindow().setNavigationBarColor(value);
      double luminance = (0.299 * Color.red(value) + 0.587 * Color.green(value)
          + 0.114 * Color.blue(value)) / 255;
      applyLightBars(luminance > 0.6);
    } catch (Exception error) {
      Log.w(TAG, "invalid theme color " + color, error);
    }
  }

  /** 把导出的 ZIP 写到「下载/DeepSeek」，Android 9 及以下写到应用专属目录 */
  private String saveExport(String name, byte[] data, String mime) throws Exception {
    String location;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      ContentValues values = new ContentValues();
      values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
      values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
      values.put(MediaStore.MediaColumns.RELATIVE_PATH,
          Environment.DIRECTORY_DOWNLOADS + "/DeepSeek");
      Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
      if (uri == null) {
        throw new IllegalStateException("无法创建下载文件");
      }
      try (OutputStream out = getContentResolver().openOutputStream(uri)) {
        if (out == null) {
          throw new IllegalStateException("无法写入下载文件");
        }
        out.write(data);
      }
      location = "下载/DeepSeek/" + name;
    } else {
      File base = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
      File dir = new File(base != null ? base : getFilesDir(), "DeepSeek");
      if (!dir.exists() && !dir.mkdirs()) {
        throw new IllegalStateException("无法创建目录");
      }
      File file = new File(dir, name);
      try (OutputStream out = new FileOutputStream(file)) {
        out.write(data);
      }
      location = file.getAbsolutePath();
    }
    final String message = "已保存到 " + location;
    runOnUiThread(() -> Toast.makeText(this, message, Toast.LENGTH_LONG).show());
    return location;
  }

  private class Bridge {
    @JavascriptInterface
    public String platform() {
      return "android";
    }

    @JavascriptInterface
    public void setThemeColor(String color) {
      runOnUiThread(() -> applyChromeColor(color));
    }
  }

  @Override
  protected void onPause() {
    if (webView != null) {
      webView.onPause();
    }
    super.onPause();
  }

  @Override
  protected void onResume() {
    super.onResume();
    if (webView != null) {
      webView.onResume();
    }
  }

  @Override
  @SuppressWarnings("deprecation")
  public void onBackPressed() {
    if (webView != null && webView.canGoBack()) {
      webView.goBack();
      return;
    }
    super.onBackPressed();
  }

  @Override
  protected void onDestroy() {
    if (server != null) {
      server.stop();
      server = null;
    }
    if (webView != null) {
      webView.destroy();
      webView = null;
    }
    super.onDestroy();
  }
}
