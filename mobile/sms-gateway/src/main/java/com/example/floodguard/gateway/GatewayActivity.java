package com.example.floodguard.gateway;

import android.Manifest;
import android.app.Activity;
import android.os.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.net.*;
import android.text.InputType;
import android.view.WindowManager;
import android.widget.*;
import java.net.URI;

public class GatewayActivity extends Activity {
    private EditText base, key;
    private TextView status, inboxText;
    private final Handler timer = new Handler(Looper.getMainLooper());
    private final Runnable refresh = new Runnable() { public void run() { render(); timer.postDelayed(this, 3000); } };
    private void label(LinearLayout layout, String text) { TextView view = new TextView(this); view.setText(text); view.setPadding(0, 18, 0, 8); layout.addView(view); }
    private void button(LinearLayout layout, String text, Runnable action) { Button button = new Button(this); button.setText(text); button.setOnClickListener(v -> action.run()); layout.addView(button); }
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        ScrollView scroll = new ScrollView(this); LinearLayout layout = new LinearLayout(this); layout.setOrientation(LinearLayout.VERTICAL); layout.setPadding(32, 24, 32, 24); scroll.addView(layout); setContentView(scroll);
        label(layout, "FLOODGUARD SMS Gateway • Chẩn đoán 01");
        label(layout, "Dùng trên điện thoại trực có SIM. Chỉ nhận tin FGSOS1. Không tự trả lời SMS.");
        status = new TextView(this); layout.addView(status);
        button(layout, "Cấp quyền nhận SMS", () -> requestPermissions(new String[]{Manifest.permission.RECEIVE_SMS}, 1));
        label(layout, "Địa chỉ Backend HTTPS (không thêm /api)");
        base = new EditText(this); base.setSingleLine(true); base.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        base.setText(getSharedPreferences("gateway", 0).getString("base", "https://floodguard-backend-demo.onrender.com")); layout.addView(base);
        label(layout, "Khóa Gateway riêng • để trống để giữ khóa đã lưu");
        key = new EditText(this); key.setSingleLine(true); key.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD); layout.addView(key);
        button(layout, "Lưu cấu hình", () -> {
            try {
                String url = base.getText().toString().trim().replaceAll("/+$", ""); URI uri = URI.create(url);
                if (!"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null || (uri.getPath() != null && !uri.getPath().isEmpty()) || uri.getQuery() != null || uri.getFragment() != null) throw new IllegalArgumentException();
                SharedPreferences prefs = getSharedPreferences("gateway", 0);
                String entered = key.getText().toString().trim(); String saved = entered.isEmpty() ? prefs.getString("key", "") : entered;
                if (saved.length() < 32 || saved.matches(".*\\s.*")) throw new IllegalArgumentException();
                prefs.edit().putString("base", url).putString("key", saved).remove("lastError").commit();
                key.setText(""); UploadJob.schedule(this, true); UploadJob.schedule(this, false);
                Toast.makeText(this, "Đã lưu cấu hình", Toast.LENGTH_SHORT).show();
            } catch (Exception error) { Toast.makeText(this, "Cần địa chỉ HTTPS hợp lệ và khóa ít nhất 32 ký tự.", Toast.LENGTH_LONG).show(); }
        });
        button(layout, "Thử chuyển lại tin chờ / tin bị chặn", () -> {
            try (Inbox inbox = new Inbox(this)) { inbox.retryBlocked(); }
            UploadJob.schedule(this, false); render();
        });
        label(layout, "30 tin gần nhất • không hiển thị nội dung chứa mã truy cập");
        inboxText = new TextView(this); layout.addView(inboxText);
        label(layout, "Không xóa dữ liệu ứng dụng khi còn tin chờ. Sau khi khởi động lại, mở khóa máy. Nếu buộc dừng ứng dụng, cần mở lại để tiếp tục.");
        UploadJob.schedule(this, true); UploadJob.schedule(this, false);
    }
    private void render() {
        ConnectivityManager cm = getSystemService(ConnectivityManager.class);
        NetworkCapabilities caps = cm.getNetworkCapabilities(cm.getActiveNetwork());
        boolean online = caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
        String permission = checkSelfPermission(Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED ? "Đã cấp" : "Chưa cấp";
        status.setText("Quyền SMS: " + permission + "\nInternet: " + (online ? "Có" : "Chưa có") + "\n" + getSharedPreferences("gateway", 0).getString("lastError", ""));
        String diagnostic = getSharedPreferences("gateway", 0).getString("smsDiagnostic", "Chưa nhận broadcast SMS kể từ bản chẩn đoán.");
        status.append("\n\nChẩn đoán SMS:\n" + diagnostic);
        try (Inbox inbox = new Inbox(this)) { inboxText.setText(inbox.summary()); }
    }
    @Override protected void onResume() { super.onResume(); timer.post(refresh); }
    @Override protected void onPause() { timer.removeCallbacks(refresh); super.onPause(); }
}
