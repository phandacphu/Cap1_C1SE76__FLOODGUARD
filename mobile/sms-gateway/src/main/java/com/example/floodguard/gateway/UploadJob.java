package com.example.floodguard.gateway;

import android.app.job.*;
import android.content.*;
import org.json.JSONObject;
import javax.net.ssl.HttpsURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.io.*;

public class UploadJob extends JobService {
    private volatile boolean stopped;
    private volatile HttpsURLConnection current;
    static void schedule(Context context, boolean periodic) {
        JobInfo.Builder builder = new JobInfo.Builder(periodic ? 5202 : 5201, new ComponentName(context, UploadJob.class))
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPersisted(true)
            .setBackoffCriteria(30000, JobInfo.BACKOFF_POLICY_EXPONENTIAL);
        if (periodic) builder.setPeriodic(15 * 60 * 1000L);
        context.getSystemService(JobScheduler.class).schedule(builder.build());
    }
    @Override public boolean onStartJob(JobParameters params) {
        stopped = false;
        new Thread(() -> {
            boolean retry = false;
            try (Inbox inbox = new Inbox(this)) {
                SharedPreferences prefs = getSharedPreferences("gateway", 0);
                String base = prefs.getString("base", ""); String key = prefs.getString("key", "");
                if (!base.startsWith("https://") || key.length() < 32) {
                    prefs.edit().putString("lastError", "Chưa cấu hình HTTPS và khóa Gateway.").apply();
                    if (!stopped) jobFinished(params, false);
                    return;
                }
                for (JSONObject message : inbox.pending()) {
                    if (stopped) break;
                    try {
                        HttpsURLConnection conn = (HttpsURLConnection) new URL(base + "/api/sos-sms/inbound").openConnection();
                        current = conn;
                        conn.setInstanceFollowRedirects(false); conn.setRequestMethod("POST");
                        conn.setConnectTimeout(20000); conn.setReadTimeout(90000);
                        conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                        conn.setRequestProperty("Authorization", "Bearer " + key); conn.setDoOutput(true);
                        byte[] bytes = message.toString().getBytes(StandardCharsets.UTF_8);
                        conn.setFixedLengthStreamingMode(bytes.length);
                        try (OutputStream out = conn.getOutputStream()) { out.write(bytes); }
                        int code = conn.getResponseCode();
                        if (code >= 200 && code < 300) {
                            StringBuilder response = new StringBuilder();
                            try (BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
                                String line; while ((line = reader.readLine()) != null) {
                                    response.append(line); if (response.length() > 16000) throw new IOException("Oversized response");
                                }
                            }
                            JSONObject root = new JSONObject(response.toString()); JSONObject data = root.getJSONObject("data");
                            String state = data.getString("state");
                            if (!root.optBoolean("success") || !(state.equals("created") || state.equals("needs_review"))) throw new IOException("Unconfirmed response");
                            String result = state.equals("created") ? data.optString("requestId", "") : data.optString("code", "REVIEW");
                            if (state.equals("created") && (result.isEmpty() || result.equals("null"))) throw new IOException("Missing SOS ID");
                            inbox.state(message.getString("messageId"), state, result);
                            prefs.edit().remove("lastError").apply();
                        } else if (code == 400 || code == 401 || code == 403 || code == 404 || code == 409 || code == 413) {
                            inbox.state(message.getString("messageId"), "blocked", "HTTP " + code);
                            prefs.edit().putString("lastError", "Có tin bị chặn. Kiểm tra cấu hình trước khi thử lại.").apply();
                        } else { retry = true; break; }
                    } catch (Exception error) { retry = true; break; }
                    finally { if (current != null) current.disconnect(); current = null; }
                }
                retry |= inbox.hasPending();
            } catch (Exception error) { retry = true; }
            if (!stopped) jobFinished(params, retry);
        }, "sms-upload").start();
        return true;
    }
    @Override public boolean onStopJob(JobParameters params) {
        stopped = true; if (current != null) current.disconnect(); return true;
    }
}
