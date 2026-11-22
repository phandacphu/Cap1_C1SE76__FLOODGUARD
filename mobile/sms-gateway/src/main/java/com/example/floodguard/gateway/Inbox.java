package com.example.floodguard.gateway;

import android.content.*;
import android.database.Cursor;
import android.database.sqlite.*;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.*;

final class Inbox extends SQLiteOpenHelper {
    Inbox(Context context) { super(context, "sos_sms_inbox.db", null, 1); }
    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE inbox (id TEXT PRIMARY KEY, fingerprint TEXT UNIQUE NOT NULL, sender TEXT NOT NULL, received TEXT NOT NULL, body TEXT NOT NULL, state TEXT NOT NULL, result TEXT)");
    }
    @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        throw new IllegalStateException("Migration required; never discard queued SMS");
    }
    void receive(String sender, long received, String body) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        byte[] hash = md.digest((sender + "\n" + received + "\n" + body).getBytes(StandardCharsets.UTF_8));
        StringBuilder fp = new StringBuilder(); for (byte b : hash) fp.append(String.format(Locale.ROOT, "%02x", b & 255));
        ContentValues values = new ContentValues();
        values.put("id", UUID.randomUUID().toString()); values.put("fingerprint", fp.toString());
        values.put("sender", sender); values.put("received", Instant.now().toString());
        values.put("body", body); values.put("state", "pending");
        // Only a duplicate fingerprint may be ignored; disk/other DB errors must surface.
        getWritableDatabase().insertWithOnConflict("inbox", null, values, SQLiteDatabase.CONFLICT_IGNORE);
    }
    List<JSONObject> pending() throws Exception {
        List<JSONObject> rows = new ArrayList<>();
        try (Cursor c = getReadableDatabase().rawQuery("SELECT id,sender,received,body FROM inbox WHERE state='pending' ORDER BY rowid LIMIT 20", null)) {
            while (c.moveToNext()) rows.add(new JSONObject().put("messageId", c.getString(0)).put("senderPhone", c.getString(1)).put("receivedAt", c.getString(2)).put("body", c.getString(3)));
        }
        return rows;
    }
    void state(String id, String state, String result) {
        ContentValues values = new ContentValues(); values.put("state", state); values.put("result", result);
        getWritableDatabase().update("inbox", values, "id=?", new String[]{id});
    }
    boolean hasPending() {
        try (Cursor c = getReadableDatabase().rawQuery("SELECT 1 FROM inbox WHERE state='pending' LIMIT 1", null)) { return c.moveToFirst(); }
    }
    void retryBlocked() { getWritableDatabase().execSQL("UPDATE inbox SET state='pending' WHERE state='blocked'"); }
    String summary() {
        StringBuilder text = new StringBuilder();
        try (Cursor c = getReadableDatabase().rawQuery("SELECT sender,received,state,result FROM inbox ORDER BY rowid DESC LIMIT 30", null)) {
            while(c.moveToNext()) {
                String state = c.getString(2);
                String label = state.equals("created") ? "Đã đồng bộ SOS" : state.equals("needs_review") ? "Cần kiểm tra" : state.equals("blocked") ? "Lỗi cấu hình / dữ liệu" : "Chờ chuyển";
                text.append(c.getString(0)).append(" • ").append(c.getString(1)).append("\n").append(label);
                if (!c.isNull(3)) text.append(" • ").append(c.getString(3));
                text.append("\n\n");
            }
        }
        return text.length() == 0 ? "Chưa nhận SMS FLOODGUARD." : text.toString();
    }
}
