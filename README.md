# AI Novel Studio - Tạo Truyện Ngắn AI

Ứng dụng sáng tác truyện ngắn, truyện dài kỳ (10.000 - 20.000 từ) và kịch bản phim ngắn / Zhihu Trung Quốc sử dụng Google Gemini Free API, tự động định dạng và làm sạch văn bản sẵn sàng chuyển sang Audio / TTS.

---

## 🌟 Tính Năng Nổi Bật

- **Trope Tag Cloud Phong Phú:** Đầy đủ các trope thịnh hành (Zhihu style, Vả mặt cực mạnh, Trọng sinh, Hào môn thế gia, Xuyên thư, Thật giả thiên kim, Nữ cường, Cá mặn...).
- **AI Đề Xuất 3 Bản Cốt Truyện:** Tự động tạo 3 bản Concept (Bối cảnh, Nhân vật Hán Việt, Motif xung đột, Cú twist vả mặt) để người dùng chọn lựa.
- **Quy Trình 4 Bước Chuyên Nghiệp:**
  1. **Bước 1:** Chọn Trope & Nhập ý tưởng mở đầu (Premise).
  2. **Bước 2 (Checkpoint 1):** Duyệt & Chỉnh sửa Dàn ý chi tiết cùng Bảng nhân vật (Story Bible).
  3. **Bước 3:** Viết từng chương trực tiếp với Live Streaming Text, thanh tiến độ và đồng hồ đếm ngược an toàn chống lỗi 429.
  4. **Bước 4 (Checkpoint 2):** Trình đọc Reader Mode & Xuất file sẵn sàng cho Audio.
- **Tối Ưu Cho Gemini API Free Tier:**
  - Hỗ trợ **Multi-Key Rotation** (nhập nhiều API key để tự động xoay tua).
  - Tự động **Exponential Backoff Retry** khi gặp lỗi rate limit (429).
  - Hỗ trợ các model mới nhất: `gemini-3.6-flash`, `gemini-3.5-flash-lite` (15 RPM / 500 lượt/ngày), `gemini-3.7-flash`...
- **Bộ Chuẩn Hóa Text Cho Audio (1-Click Clean Text):**
  - Chuyển 100% số, năm, phần trăm, tiền tệ, giờ giấc thành chữ tiếng Việt (`1995` ➔ `năm một nghìn chín trăm chín mươi lăm`).
  - Xóa sạch markdown thừa, sẵn sàng dán trực tiếp vào CapCut, Vbee, Edge-TTS, ElevenLabs.
- **Lưu Trữ Offline (IndexedDB / LocalStorage):** Tự động lưu tiến trình, không lo mất dữ liệu.

---

## 🚀 Hướng Dẫn Cài Đặt & Khởi Chạy

### Cách 1: Khởi động nhanh (Windows)
Nhấp đúp chuột vào file `start.bat`. Trình duyệt sẽ tự động mở tại `http://localhost:3000`.

### Cách 2: Khởi động bằng Node.js
```bash
# Khởi chạy server nội bộ
npm start
# Hoặc
node server.js
```
Truy cập `http://localhost:3000` trên trình duyệt.

---

## 🔑 Hướng Dẫn Cấu Hình API Key
1. Bấm vào nút **"⚙️ Cài Đặt API"** ở góc trên bên phải giao diện.
2. Dán một hoặc nhiều API Key từ [Google AI Studio](https://aistudio.google.com/).
3. Chọn model mong muốn (khuyên dùng `gemini-3.6-flash` hoặc `gemini-3.5-flash-lite`) và bấm **"Lưu Cấu Hình"**.

---

## 📄 Bản Quyền & Giấy Phép
Dự án được phân phối dưới giấy phép MIT License.
