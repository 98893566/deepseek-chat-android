package app.dsh.chatdemo;

import android.content.res.AssetManager;
import android.util.Log;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 只监听本机回环地址的静态资源服务：把 APK 内的 assets/web 以 http://127.0.0.1:port/ 提供给 WebView。
 * 固定端口保证 localStorage / IndexedDB 的 origin 在多次启动之间保持一致。
 */
public final class LocalServer {
  public interface Saver {
    /** 保存导出文件，返回给用户看的位置说明 */
    String save(String name, byte[] data, String mime) throws Exception;
  }

  private static final String TAG = "ChatDemoServer";
  private static final Map<String, String> MIME = new HashMap<>();

  static {
    MIME.put("html", "text/html; charset=utf-8");
    MIME.put("js", "text/javascript; charset=utf-8");
    MIME.put("mjs", "text/javascript; charset=utf-8");
    MIME.put("css", "text/css; charset=utf-8");
    MIME.put("json", "application/json; charset=utf-8");
    MIME.put("webmanifest", "application/manifest+json; charset=utf-8");
    MIME.put("map", "application/json; charset=utf-8");
    MIME.put("svg", "image/svg+xml");
    MIME.put("png", "image/png");
    MIME.put("jpg", "image/jpeg");
    MIME.put("jpeg", "image/jpeg");
    MIME.put("webp", "image/webp");
    MIME.put("gif", "image/gif");
    MIME.put("ico", "image/x-icon");
    MIME.put("woff", "font/woff");
    MIME.put("woff2", "font/woff2");
    MIME.put("ttf", "font/ttf");
    MIME.put("txt", "text/plain; charset=utf-8");
  }

  private final AssetManager assets;
  private final String root;
  private final int port;
  private final Saver saver;
  private final Map<String, byte[]> cache = new ConcurrentHashMap<>();
  private final ExecutorService pool = Executors.newFixedThreadPool(4);
  private volatile ServerSocket server;

  public LocalServer(AssetManager assets, String root, int port, Saver saver) {
    this.assets = assets;
    this.root = root;
    this.port = port;
    this.saver = saver;
  }

  public void start() throws IOException {
    ServerSocket socket = new ServerSocket();
    socket.setReuseAddress(true);
    socket.bind(new InetSocketAddress(InetAddress.getByName("127.0.0.1"), port), 64);
    server = socket;
    Thread thread = new Thread(() -> {
      while (!socket.isClosed()) {
        try {
          final Socket client = socket.accept();
          pool.execute(() -> handle(client));
        } catch (IOException error) {
          if (!socket.isClosed()) {
            Log.w(TAG, "accept failed", error);
          }
        }
      }
    }, "chat-demo-http");
    thread.setDaemon(true);
    thread.start();
  }

  public void stop() {
    try {
      if (server != null) {
        server.close();
      }
    } catch (IOException ignored) {
      // 退出时忽略关闭异常
    }
    pool.shutdownNow();
  }

  private void handle(Socket client) {
    try (Socket socket = client) {
      socket.setSoTimeout(20000);
      InputStream in = socket.getInputStream();
      String head = readHead(in);
      if (head == null) {
        return;
      }
      String[] lines = head.split("\r\n");
      String[] request = lines[0].split(" ");
      if (request.length < 2) {
        return;
      }
      String method = request[0];
      String target = request[1];
      int mark = target.indexOf('?');
      String rawPath = mark >= 0 ? target.substring(0, mark) : target;
      String query = mark >= 0 ? target.substring(mark + 1) : "";
      String path = URLDecoder.decode(rawPath, "UTF-8");

      if (path.contains("..")) {
        respond(socket.getOutputStream(), 400, "text/plain; charset=utf-8", false,
            "bad request".getBytes(StandardCharsets.UTF_8));
        return;
      }
      if ("POST".equals(method) && "/__save".equals(path)) {
        handleSave(in, head, query, socket.getOutputStream());
        return;
      }
      if (!"GET".equals(method) && !"HEAD".equals(method)) {
        respond(socket.getOutputStream(), 405, "text/plain; charset=utf-8", false,
            "method not allowed".getBytes(StandardCharsets.UTF_8));
        return;
      }

      String file = "/".equals(path) ? "index.html" : path.substring(1);
      if (file.endsWith("/")) {
        file = file + "index.html";
      }
      byte[] body = readAsset(file);
      if (body == null && !file.contains(".")) {
        body = readAsset("index.html");
        if (body != null) {
          file = "index.html";
        }
      }
      if (body == null) {
        respond(socket.getOutputStream(), 404, "text/plain; charset=utf-8", false,
            "not found".getBytes(StandardCharsets.UTF_8));
        return;
      }
      respond(socket.getOutputStream(), 200, mime(file), "HEAD".equals(method), body);
    } catch (Exception error) {
      Log.w(TAG, "request failed", error);
    }
  }

  private void handleSave(InputStream in, String head, String query, OutputStream out)
      throws IOException {
    int length = 0;
    for (String line : head.split("\r\n")) {
      if (line.toLowerCase(Locale.ROOT).startsWith("content-length:")) {
        try {
          length = Integer.parseInt(line.substring(15).trim());
        } catch (NumberFormatException ignored) {
          length = 0;
        }
      }
    }
    if (length <= 0 || length > 200 * 1024 * 1024) {
      respond(out, 400, "application/json", false, "{\"ok\":false}".getBytes(StandardCharsets.UTF_8));
      return;
    }
    byte[] data = new byte[length];
    int offset = 0;
    while (offset < length) {
      int read = in.read(data, offset, length - offset);
      if (read < 0) {
        break;
      }
      offset += read;
    }
    if (offset != length) {
      respond(out, 400, "application/json", false, "{\"ok\":false}".getBytes(StandardCharsets.UTF_8));
      return;
    }

    String name = "deepseek-chat.zip";
    for (String pair : query.split("&")) {
      if (pair.startsWith("name=")) {
        String decoded = URLDecoder.decode(pair.substring(5), "UTF-8");
        name = decoded.replaceAll("[\\\\/:*?\"<>|\\r\\n]", "_");
        break;
      }
    }
    try {
      String location = saver.save(name, data, "application/zip");
      byte[] body = ("{\"ok\":true,\"path\":\"" + location + "\"}")
          .getBytes(StandardCharsets.UTF_8);
      respond(out, 200, "application/json; charset=utf-8", false, body);
    } catch (Exception error) {
      Log.w(TAG, "save failed", error);
      respond(out, 500, "application/json", false, "{\"ok\":false}".getBytes(StandardCharsets.UTF_8));
    }
  }

  private byte[] readAsset(String name) {
    byte[] cached = cache.get(name);
    if (cached != null) {
      return cached;
    }
    try (InputStream in = assets.open(root + "/" + name)) {
      ByteArrayOutputStream out = new ByteArrayOutputStream();
      byte[] buffer = new byte[16384];
      int read;
      while ((read = in.read(buffer)) > 0) {
        out.write(buffer, 0, read);
      }
      byte[] data = out.toByteArray();
      cache.put(name, data);
      return data;
    } catch (IOException error) {
      return null;
    }
  }

  private static String mime(String name) {
    int dot = name.lastIndexOf('.');
    String extension = dot >= 0 ? name.substring(dot + 1).toLowerCase(Locale.ROOT) : "";
    String type = MIME.get(extension);
    return type != null ? type : "application/octet-stream";
  }

  private static String readHead(InputStream in) throws IOException {
    ByteArrayOutputStream buffer = new ByteArrayOutputStream();
    int[] tail = new int[4];
    while (buffer.size() < 32768) {
      int value = in.read();
      if (value < 0) {
        return null;
      }
      buffer.write(value);
      tail[0] = tail[1];
      tail[1] = tail[2];
      tail[2] = tail[3];
      tail[3] = value;
      if (tail[0] == '\r' && tail[1] == '\n' && tail[2] == '\r' && tail[3] == '\n') {
        byte[] data = buffer.toByteArray();
        return new String(data, 0, data.length - 4, StandardCharsets.ISO_8859_1);
      }
    }
    return null;
  }

  private static void respond(OutputStream out, int status, String type, boolean headOnly,
      byte[] body) throws IOException {
    String reason = status == 200 ? "OK" : status == 404 ? "Not Found" : "Error";
    String header = "HTTP/1.1 " + status + " " + reason + "\r\n"
        + "Content-Type: " + type + "\r\n"
        + "Content-Length: " + body.length + "\r\n"
        + "Cache-Control: no-cache\r\n"
        + "X-Content-Type-Options: nosniff\r\n"
        + "Connection: close\r\n\r\n";
    out.write(header.getBytes(StandardCharsets.ISO_8859_1));
    if (!headOnly) {
      out.write(body);
    }
    out.flush();
  }
}
