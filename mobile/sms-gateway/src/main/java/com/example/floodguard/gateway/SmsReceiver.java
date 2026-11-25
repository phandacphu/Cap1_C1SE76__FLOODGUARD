package com.example.floodguard.gateway;
import android.content.*;
import android.provider.Telephony;
import android.telephony.SmsMessage;
import java.time.Instant;

public class SmsReceiver extends BroadcastReceiver {
    // Diagnostics deliberately contain no SMS body, phone, credential or key.
    private static void diagnostic(Context context, String text) {
        context.getSharedPreferences("gateway", 0).edit()
            .putString("smsDiagnostic", Instant.now() + " • " + text).commit();
    }
    @Override public void onReceive(Context context, Intent intent) {
        if (!Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) return;
        diagnostic(context, "Đã nhận broadcast SMS; đang đọc các phần.");
        try {
            SmsMessage[] parts = Telephony.Sms.Intents.getMessagesFromIntent(intent);
            if (parts == null || parts.length == 0) {
                diagnostic(context, "Broadcast SMS không có phần nội dung."); return;
            }
            String sender = parts[0].getOriginatingAddress();
            if (sender == null) {
                diagnostic(context, "Broadcast SMS thiếu thông tin người gửi."); return;
            }
            StringBuilder body = new StringBuilder();
            for (SmsMessage part : parts) {
                if (!sender.equals(part.getOriginatingAddress()) || part.getMessageBody() == null) {
                    diagnostic(context, "Không ghép được SMS: thông tin các phần không hợp lệ."); return;
                }
                body.append(part.getMessageBody());
            }
            if (!body.toString().startsWith("FGSOS1")) {
                diagnostic(context, "Đã nhận SMS nhưng bỏ qua: đầu tin không đúng FGSOS1. Số phần: " + parts.length + "; độ dài: " + body.length());
                return;
            }
            diagnostic(context, "Đúng tiền tố FGSOS1; đang lưu. Số phần: " + parts.length + "; độ dài: " + body.length());
            PendingResult pending = goAsync();
            new Thread(() -> {
                try (Inbox inbox = new Inbox(context)) {
                    inbox.receive(sender, parts[0].getTimestampMillis(), body.toString());
                    diagnostic(context, "Đã xử lý lưu SMS đúng tiền tố (tin lặp giữ bản cũ).");
                    UploadJob.schedule(context, false);
                } catch (Exception error) {
                    diagnostic(context, "Lỗi lưu hoặc lên lịch chuyển SMS: " + error.getClass().getSimpleName());
                    context.getSharedPreferences("gateway", 0).edit().putString("lastError", "Không lưu hoặc lên lịch được SMS. Giữ tin gốc để đối chiếu.").commit();
                } finally { pending.finish(); }
            }, "sms-persist").start();
        } catch (Exception error) {
            diagnostic(context, "Lỗi xử lý broadcast SMS: " + error.getClass().getSimpleName());
        }
    }
}
