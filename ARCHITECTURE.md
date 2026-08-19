# 🏛️ AI NOVEL STUDIO - HƯỚNG DẪN KIẾN TRÚC & CẤU TRÚC MÃ NGUỒN
> **Dành cho Lập trình viên và các AI bảo trì / nâng cấp hệ thống.**

---

## 📌 1. Tổng Quan Dự Án
**AI Novel Studio** là hệ thống toàn diện (All-in-One) phục vụ việc sáng tác, dịch thuật và sản xuất audio/subtitles tiểu thuyết & kịch bản video:
1. **🎬 Sáng Tác Tiểu Thuyết:** Quy trình 4 bước tạo truyện dài (10.000 – 20.000 từ) chuẩn phong cách Zhihu vả mặt.
2. **🌐 Dịch Thuật Studio:** Dịch văn bản tiểu thuyết raw tiếng Trung/Anh và file phụ đề `.srt` sang tiếng Việt với công nghệ **Smart Chunking** & **Anti-skipping**.
3. **🎙️ Tạo Audio Truyện (TTS):** Chuyển đổi văn bản thành giọng đọc tự nhiên đa luồng qua API Cloud của CapCut với 129+ giọng đọc và trình phát âm thanh tích hợp.
4. **🎧 Nhận Dạng Âm Thanh (STT):** Nhận dạng audio/video bóc băng sang văn bản & file phụ đề `.srt` timecode chuẩn xác, hỗ trợ dịch song ngữ.
5. **☁️ Neon PostgreSQL Cloud & Multi-Key:** Đồng bộ đám mây và chia tải token/hạn mức giữa nhiều Gemini API Key.

---

## 📂 2. Cấu Trúc Thư Mục & Phân Tách Trách Nhiệm (Clean Modular Architecture)

Dự án được cấu trúc theo mô hình **Controller – Service – Data – Server**:

```
truyen-ngan/
├── 📄 index.html                  # Giao diện chính (chứa 4 Workspace Tabs + Modals)
├── 📄 styles.css                  # Hệ thống Design Tokens, Glassmorphism, Theme & Layout
├── 📄 server.js                   # Node.js Server phục vụ Static Files & Database API
├── 📄 ARCHITECTURE.md             # [Tài liệu này] Hướng dẫn cấu trúc & quy trình
├── 📄 README.md                   # Giới thiệu & hướng dẫn triển khai
│
├── 📁 js/
│   ├── 📄 app.js                  # 🚀 Main Application Router & Global Coordinator
│   │
│   ├── 📁 controllers/            # 🎮 TẦNG ĐIỀU PHỐI GIAO DIỆN (UI CONTROLLERS)
│   │   ├── 📄 novelController.js      # Quản lý 4 Bước Sáng Tác Tiểu Thuyết
│   │   ├── 📄 translatorController.js # Quản lý Tab Dịch Thuật & Phụ đề SRT
│   │   ├── 📄 audioController.js      # Quản lý Tab Tạo Audio TTS & Player
│   │   └── 📄 sttController.js        # Quản lý Tab Nhận Dạng Giọng Nói STT & Phụ Đề
│   │
│   ├── 📁 services/               # ⚙️ TẦNG XỬ LÝ LOGIC NGẦM & GỌI API (SERVICES)
│   │   ├── 📄 geminiService.js        # Gọi Google Gemini API, Multi-key rotation, Retry 429
│   │   ├── 📄 translatorService.js    # SRT Parser/Serializer, Smart Chunking, Anti-skipping
│   │   ├── 📄 audioTtsService.js      # Gọi CapCut TTS API, Đa luồng, Polling task, Tách câu <250 ký tự
│   │   ├── 📄 sttService.js           # Gọi CapCut STT API, Async Polling, Tạo Subtitle SRT
│   │   ├── 📄 storageService.js       # Quản lý Quota độc lập từng Model, LocalStorage, Thư viện
│   │   └── 📄 authService.js          # Xác thực tài khoản & Đồng bộ Neon PostgreSQL
│   │
│   └── 📁 data/                   # 📦 DỮ LIỆU TĨNH & HÀM BỔ TRỢ (DATA & UTILS)
│       ├── 📄 tagPools.js             # Kho Trope, Tag, Thể loại và Ý tưởng mẫu
│       ├── 📄 numberToWordsVi.js      # Hàm chuẩn hóa văn bản Audio (chuyển số -> chữ)
│       └── 📄 Voice.json              # Danh mục 129+ giọng đọc CapCut (24 giọng tiếng Việt)
│
├── 📁 server/                     # 🗄️ BACKEND DATABASE & AUTH (NODE.JS)
│   ├── 📄 db.js                   # Kết nối Neon PostgreSQL Cloud
│   └── 📄 auth.js                 # Xử lý JWT Token & API Endpoints
│
└── 📁 scratch/                    # 🧪 CÁC FILE KIỂM THỬ ĐỘC LẬP (UNIT TESTS)
    ├── 📄 test_translator.js      # Test logic phân đoạn SRT & dịch raw
    ├── 📄 test_audio_service.js   # Test tải Voice.json & tách chunk audio
    └── 📄 test_quota_logic.js     # Test hạn mức độc lập từng Model
```

---

## 🔄 3. Cách Hoạt Động & Quy Trình Chi Tiết Từng Tab

### 🎬 Tab 1: Sáng Tác Tiểu Thuyết (`js/controllers/novelController.js`)
* **Bước 1 (Chọn Trope & Ý Tưởng):** Chọn thẻ trope có sẵn hoặc tự thêm thẻ mới ➡️ Bấm *"Lên 3 Bản Phác Thảo"* ➡️ AI sinh 3 kịch bản Zhihu kèm Móc câu (Hook) và Cú twist ➡️ Người dùng chọn 1 kịch bản.
* **Bước 2 (Checkpoint 1 - Dàn Ý):** Lập dàn ý 8 - 18 chương chi tiết gồm: Tuyến nhân vật, xung đột (Conflict) và móc câu kết chương (Cliffhanger).
* **Bước 3 (Checkpoint 2 - Viết Chương):** AI viết từng chương theo luồng (streaming) hoặc tuần tự. Có cơ chế giãn cách thời gian (Throttle Delay) để chống chạm trần 15 RPM. Hỗ trợ tạm dừng, viết lại từng chương.
* **Bước 4 (Đọc Truyện & Xuất Bản):** Chế độ đọc toàn văn, xuất file (.txt, .md, .html, .docx, .epub).
* **Nút 1-Click:** *"Gửi sang Tạo Audio"* ➡️ Tự động làm sạch số thành chữ, chuyển sang Tab 3 và nạp truyện vào khung đọc.

---

### 🌐 Tab 2: Dịch Thuật Studio (`js/controllers/translatorController.js`)
* **Chế độ:** Phụ đề `.srt` hoặc Tiểu thuyết raw (tiếng Trung/Anh/Nhật/Hàn).
* **Cơ chế Smart Chunking (`translatorService.js`):**
  * **Gemini (3.6 / 3.5 Flash Lite):** Gộp chunk lớn (1.800 từ / 80 dòng SRT) ➡️ Dịch trọn vẹn chỉ trong 1-2 request, tiết kiệm hạn mức tối đa.
  * **Gemma (4 31B / 26B):** Băm nhỏ an toàn (700 từ / 40 dòng SRT) ➡️ Tránh chạm trần 16k TPM.
* **Quy tắc Chống Dịch Thiếu (Anti-Skipping):**
  * `temperature: 0.2` giúp AI bám sát 100% nguyên tác, không tóm tắt hay cắt bớt câu chữ.
  * Đối chiếu phụ đề SRT 3 tầng: `(1) ID số thứ tự ➡️ (2) Timecode ➡️ (3) Vị trí dòng`.
* **Xoay Tua Multi-Key:** Tự động chia đều tải giữa các API Key (Round-Robin) và tự nhảy Key khi gặp 429.

---

### 🎙️ Tab 3: Tạo Audio Truyện (TTS) (`js/controllers/audioController.js`)
* **Dữ liệu Giọng Đọc (`js/data/Voice.json`):** 129+ giọng đọc CapCut, lọc theo tiếng Việt (`vi-VN`), Anh (`en-US`), Trung (`zh-CN`), Nhật (`ja-JP`).
* **Cơ chế Tách Đoạn (`audioTtsService.js`):** Tự động bóc tách văn bản dài thành các đoạn nhỏ dưới 250 ký tự tại các điểm ngắt câu tự nhiên (dấu chấm, phẩy, xuống dòng).
* **Xử Lý Đa Luồng (Multi-threading):** Gửi đồng thời 5 - 100 luồng lên máy chủ CapCut Cloud. Tạo toàn bộ truyện 10.000 từ chỉ trong 10-15 giây mà không tốn CPU server Render.
* **Trình Phát Audio:** Nghe trực tiếp, visualizer sóng nhạc, tua nhanh `+5s`/`-5s`, chỉnh tốc độ phát `0.75x` – `2.0x` và tải file `.mp3`.
* **Nút Gỡ Ban:** Đổi Device ID tức thì khi bị CapCut giới hạn.

---

### 🎧 Tab 4: Nhận Dạng Âm Thanh (STT) (`js/controllers/sttController.js`)
* **Bóc Băng Đa Định Dạng:** Tiếp nhận tệp audio/video, tải lên và gọi CapCut Cloud STT API qua backend proxy `/api/stt/*`.
* **Phân Tách Câu & Timecode:** Tính toán mốc thời gian chuẩn xác đến mili-giây cho từng phân đoạn thoại.
* **Dịch Phụ Đề & Trình Phát:** Đồng bộ lời thoại và trình phát âm thanh, cho phép nghe lại từng đoạn thoại và tải file `.srt` / `.txt`.

---

## ⚡ 4. Tầng Điều Phối Chính (`js/app.js`)

`app.js` đóng vai trò là **Main Router & Coordinator**:
1. Khởi tạo 4 Controllers con: `this.novelController`, `this.translatorController`, `this.audioController`, `this.sttController`.
2. Điều phối chuyển đổi Workspace: `switchWorkspace("novel" | "translator" | "audio" | "stt")`.
3. Quản lý các Modal dùng chung: Cài đặt Gemini API, Thư viện truyện, Đăng nhập Neon Cloud, Bảng Admin.
4. Cung cấp các hàm tiện ích toàn cục: `showToast()`, `countWords()`, `formatTokenCount()`, `triggerDownload()`.

---

## 🛠️ 5. Hướng Dẫn Bảo Trì & Nâng Cấp Sau Này

Khi cần sửa đổi hoặc thêm tính năng mới:

| Bạn muốn làm gì? | File cần mở |
| :--- | :--- |
| **Sửa giao diện / logic 4 bước Sáng Tác** | [`js/controllers/novelController.js`](file:///d:/truyen-ngan/js/controllers/novelController.js) |
| **Sửa giao diện / chức năng Tab Dịch Thuật** | [`js/controllers/translatorController.js`](file:///d:/truyen-ngan/js/controllers/translatorController.js) |
| **Sửa thuật toán dịch, chunking, prompt dịch** | [`js/services/translatorService.js`](file:///d:/truyen-ngan/js/services/translatorService.js) |
| **Sửa giao diện / chức năng Tab Tạo Audio** | [`js/controllers/audioController.js`](file:///d:/truyen-ngan/js/controllers/audioController.js) |
| **Sửa kết nối API CapCut TTS, ghép MP3** | [`js/services/audioTtsService.js`](file:///d:/truyen-ngan/js/services/audioTtsService.js) |
| **Sửa giao diện / chức năng Tab Nhận Dạng STT** | [`js/controllers/sttController.js`](file:///d:/truyen-ngan/js/controllers/sttController.js) |
| **Sửa logic gọi CapCut STT & tạo SRT** | [`js/services/sttService.js`](file:///d:/truyen-ngan/js/services/sttService.js) |
| **Thêm / sửa giọng đọc mới** | [`js/data/Voice.json`](file:///d:/truyen-ngan/js/data/Voice.json) |
| **Sửa logic Quota, Hạn mức Model, API Keys** | [`js/services/storageService.js`](file:///d:/truyen-ngan/js/services/storageService.js) |
| **Sửa giao diện HTML tổng thể / Modal** | [`index.html`](file:///d:/truyen-ngan/index.html) |
| **Sửa giao diện CSS / Màu sắc / Layout** | [`styles.css`](file:///d:/truyen-ngan/styles.css) |

---

## ⚠️ 6. Quy Tắc Bất Di Bất Dịch (Critical Guidelines)
1. **Tuyệt đối KHÔNG chạy `git push`** trừ khi người dùng yêu cầu trực tiếp bằng chữ *"push"*. Chỉ commit cục bộ (`git commit`).
2. **Không dùng `gemini-1.5-flash` và `gemini-2.0-flash`** (hai model này đã bị xóa hoàn toàn). Khuyên dùng `gemini-3.6-flash` hoặc `gemini-3.5-flash-lite`.
3. **Giữ nguyên cấu trúc Modular:** Khi thêm tính năng mới cho từng tab, hãy viết trong Controller hoặc Service tương ứng, tránh nhét code cồng kềnh vào `app.js`.
