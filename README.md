# 🎬 AI Story & Novel Studio - All-in-One Content Production Suite

> **Hệ thống toàn diện (4-trong-1) ứng dụng Google Gemini API & CapCut Engine: Sáng tác tiểu thuyết dài kỳ, Dịch thuật raw & phụ đề SRT, Tạo Audio TTS đa luồng siêu tốc và Nhận dạng âm thanh STT.**

🌐 **Live Demo:** [https://taotruyen.onrender.com/](https://taotruyen.onrender.com/)  
👑 **Trang quản trị (Admin):** Tài khoản `admin` / Mật khẩu `admin` (hoặc cấu hình qua `.env`)

---

## 🌟 4 Phân Hệ Workspace Cốt Lõi

### 1. 🎬 Sáng Tác Tiểu Thuyết (AI Novel Studio)
* **Quy trình 4 Bước chuẩn mực:**
  * **Bước 1 (Chọn Trope & Ý tưởng):** Kho trope thịnh hành phong phú (Zhihu vả mặt, Trọng sinh, Hào môn thế gia, Xuyên thư, Nữ cường, Thật giả thiên kim...). AI tự động đề xuất 3 bản phác thảo kịch bản (Bối cảnh, Tuyến nhân vật Hán Việt, Xung đột, Hook & Twist).
  * **Bước 2 (Checkpoint 1 - Dàn ý & Story Bible):** Sinh dàn ý chi tiết 8 – 18 chương kèm tóm tắt từng hồi và bảng thiết lập nhân vật. Người dùng có toàn quyền duyệt và tinh chỉnh trước khi viết.
  * **Bước 3 (Checkpoint 2 - Viết chương):** Tạo chương trực tiếp qua Live Streaming Text. Tích hợp cơ chế điều tiết độ trễ (Throttle Delay) và đếm ngược thông minh để chống lỗi chạm trần 15 RPM của Gemini Free Tier. Hỗ trợ tạm dừng, viết lại hoặc sửa trực tiếp từng chương.
  * **Bước 4 (Đọc & Xuất bản):** Trình đọc Reader Mode thanh lịch, hỗ trợ xuất đa định dạng (`.txt`, `.md`, `.html`, `.docx`, `.epub`).
* **Nút 1-Click "Gửi sang Tạo Audio":** Tự động làm sạch số thành chữ, chuyển tức thì sang phân hệ TTS.

---

### 2. 🌐 Dịch Thuật Studio (AI Translator)
* **Đa định dạng đầu vào:** Dịch văn bản tiểu thuyết raw (tiếng Trung, Anh, Nhật, Hàn...) hoặc file phụ đề `.srt`.
* **Công nghệ Smart Chunking:**
  * Tự động tính toán dung lượng phân đoạn tối ưu theo từng Model (1.800 từ với Gemini 3.6/3.5 Flash-Lite, 700 từ với Gemma).
  * Giảm tối đa số lượng request, tiết kiệm hạn mức API mà không lo chạm trần TPM (Tokens Per Minute).
* **Quy chuẩn Chống Bỏ Sót (Anti-Skipping):**
  * Thiết lập nhiệt độ `temperature: 0.2` giúp AI bám sát 100% nguyên tác, dịch đủ từng câu thoại, không tự ý tóm tắt hay cắt xén.
  * Thuật toán đối chiếu phụ đề 3 tầng: `ID số thứ tự ➔ Timecode ➔ Vị trí dòng`, đảm bảo file `.srt` dịch xong khớp thời gian chuẩn xác 100%.

---

### 3. 🎙️ Tạo Audio Truyện TTS (CapCut Multi-Thread)
* **Kho 129+ Giọng Đọc Đa Dạng:** Hỗ trợ 24 giọng đọc tiếng Việt chuẩn studio (Bắc/Nam/Kể chuyện/Tâm sự/Review phim) cùng hơn 100 giọng quốc tế (Anh, Trung, Nhật, Hàn...).
* **Xử lý Đa Luồng Siêu Tốc (5 - 100 Threads):**
  * Tự động ngắt văn bản thành các câu tự nhiên dưới 250 ký tự.
  * Bắn đồng thời hàng chục request lên máy chủ CapCut Cloud. Tạo xong toàn bộ audio cho truyện 10.000 – 20.000 từ chỉ trong **10 – 15 giây**.
* **Trình Phát & Quản Lý Audio:** Trình phát tích hợp visualizer sóng nhạc, tua nhanh `+5s`/`-5s`, điều chỉnh tốc độ `0.75x` – `2.0x`, tải file `.mp3` trọn gói hoặc từng phân đoạn.
* **Nút Gỡ Ban Tức Thì:** Tự động tạo Device ID mới nếu gặp giới hạn rate-limit từ nền tảng.

---

### 4. 🎧 Nhận Dạng Âm Thanh (Speech-to-Text / STT Studio)
* **Bóc Băng Âm Thanh / Video Siêu Chuẩn:** Tải lên tệp âm thanh/video (`.mp3`, `.wav`, `.m4a`, `.mp4`, `.webm`...) để tự động nhận dạng giọng nói thành văn bản.
* **Xuất Phụ Đề Chuẩn Timecode:** Tự động gắn mốc thời gian chi tiết từng mili-giây, xuất file phụ đề `.srt` hoặc văn bản thuần `.txt`.
* **Dịch Phụ Đề Song Ngữ Tự Động:** Hỗ trợ nhận dạng và dịch trực tiếp sang phụ đề tiếng Việt hoặc ngôn ngữ đích mong muốn.
* **Đồng Bộ Phát & Highlight Lời:** Vừa nghe file gốc vừa xem từng dòng chữ sáng theo đúng giọng đọc.

---

## ⚡ Các Tính Năng Kỹ Thuật Nổi Bật

* **Bộ Chuẩn Hóa Text Cho Audio (1-Click Clean Text):**
  * Chuyển đổi 100% số, năm, phần trăm, giờ giấc, đơn vị tiền tệ sang chữ tiếng Việt (`1995` ➔ `năm một nghìn chín trăm chín mươi lăm`, `25%` ➔ `hai mươi lăm phần trăm`).
  * Làm sạch toàn bộ ký tự markdown thừa, khoảng trắng lỗi, sẵn sàng dán trực tiếp vào CapCut, Vbee, Edge-TTS, ElevenLabs.
* **Tối Ưu Hoá Cho Gemini API Free Tier:**
  * **Multi-Key Rotation:** Tự động xoay tua danh sách nhiều API Key theo cơ chế Round-Robin.
  * **Live Quota Tracker:** Hiển thị trực quan và đo lường độc lập RPM (Requests/phút), RPD (Requests/ngày) và Tokens sử dụng cho từng model (`gemini-3.6-flash`, `gemini-3.5-flash-lite`, `gemini-3.7-flash`...).
  * **Exponential Backoff Retry:** Tự động bắt lỗi 429 và thử lại thông minh mà không làm gián đoạn tiến trình.
* **Hệ Thống Lưu Trữ Kép (Hybrid Storage):**
  * **Cục bộ (Offline):** Lưu tự động vào LocalStorage & IndexedDB, bảo toàn dữ liệu khi tải lại trang.
  * **Đám mây (Neon PostgreSQL Serverless):** Đăng nhập tài khoản để đồng bộ thư viện truyện, cài đặt API Key trên mọi thiết bị.
* **Hệ Thống Phân Quyền & Bảng Quản Trị Admin:** Quản lý danh sách thành viên, cấp quyền, kiểm soát dung lượng lưu trữ.

---

## 🚀 Hướng Dẫn Cài Đặt & Khởi Chạy

### Yêu cầu môi trường
* **Node.js:** Phiên bản 18.x trở lên.
* **Trình duyệt:** Chrome, Edge, Firefox hoặc Safari bản mới nhất.

### 1. Khởi động nhanh trên Windows (1-Click)
Nhấp đúp chuột vào file **`start.bat`**. Ứng dụng sẽ tự động khởi động server và mở trình duyệt tại `http://localhost:3000`.

### 2. Khởi động bằng dòng lệnh (Command Line)
```bash
# 1. Cài đặt dependencies (nếu dùng kết nối Database Neon)
npm install

# 2. Tạo file cấu hình môi trường từ file mẫu
cp .env.example .env

# 3. Khởi chạy server
npm start
```
Truy cập `http://localhost:3000` trên trình duyệt của bạn.

---

## 🔑 Cấu Hình Biến Môi Trường (`.env`)

Tạo file `.env` tại thư mục gốc của dự án:

```env
# Cổng chạy ứng dụng
PORT=3000

# Kết nối Neon PostgreSQL Serverless (Tùy chọn - Dùng để lưu tài khoản & đồng bộ Cloud)
DATABASE_URL=postgresql://USERNAME:PASSWORD@HOST/neondb?sslmode=require

# Tài khoản quản trị khởi tạo mặc định
ADMIN_USERNAME=admin
ADMIN_EMAIL=admin@novels.ai
ADMIN_PASSWORD=admin
```

> **Mẹo cấu hình API Key:**
> Trong giao diện web, bấm vào nút **"⚙️ Cài Đặt API"** (góc trên bên phải) để nhập một hoặc nhiều Gemini API Key từ [Google AI Studio](https://aistudio.google.com/).

---

## 📂 Cấu Trúc Mã Nguồn (Clean Architecture)

```
truyen-ngan/
├── 📄 index.html                  # Giao diện chính (4 Workspace Tabs + Modals)
├── 📄 styles.css                  # Hệ thống Design Tokens, Dark Mode & Glassmorphism
├── 📄 server.js                   # Node.js Server & Backend API (Auth, Cloud DB, STT/TTS Proxy)
├── 📄 ARCHITECTURE.md             # Tài liệu kiến trúc chi tiết dành cho lập trình viên
├── 📄 README.md                   # Giới thiệu & hướng dẫn sử dụng dự án
│
├── 📁 js/
│   ├── 📄 app.js                  # Global Router & Coordinator
│   │
│   ├── 📁 controllers/            # Tầng điều phối giao diện (UI Controllers)
│   │   ├── 📄 novelController.js      # Workspace 1: Sáng tác tiểu thuyết (4 Steps)
│   │   ├── 📄 translatorController.js # Workspace 2: Dịch thuật raw & SRT Subtitles
│   │   ├── 📄 audioController.js      # Workspace 3: Tạo Audio TTS & Audio Player
│   │   └── 📄 sttController.js        # Workspace 4: Nhận dạng âm thanh STT
│   │
│   ├── 📁 services/               # Tầng xử lý nghiệp vụ & API (Services)
│   │   ├── 📄 geminiService.js        # Gemini API, Multi-Key Rotation, Retry 429
│   │   ├── 📄 translatorService.js    # Smart Chunking, Anti-skipping, SRT Parser
│   │   ├── 📄 audioTtsService.js      # CapCut Cloud TTS API, Multi-threading
│   │   ├── 📄 sttService.js           # CapCut Cloud STT API, Async Polling
│   │   ├── 📄 storageService.js       # Quản lý Quota độc lập, LocalStorage & Cloud sync
│   │   └── 📄 authService.js          # Xác thực JWT & Đồng bộ Neon Database
│   │
│   └── 📁 data/                   # Dữ liệu tĩnh & Tiện ích bổ trợ
│       ├── 📄 tagPools.js             # Kho Trope, Tag, Thể loại và Mẫu ý tưởng
│       ├── 📄 numberToWordsVi.js      # Thuật toán chuyển đổi số ➔ chữ tiếng Việt
│       └── 📄 Voice.json              # Danh mục 129+ giọng đọc CapCut
│
└── 📁 server/                     # Backend Database & Authentication
    ├── 📄 db.js                   # Kết nối Neon PostgreSQL Serverless
    └── 📄 auth.js                 # Xử lý JWT Token & API Endpoints
```

---

## 📄 Bản Quyền & Giấy Phép

Dự án được phân phối dưới giấy phép **MIT License**. Bạn được toàn quyền sử dụng, chỉnh sửa và triển khai cho mục đích cá nhân hoặc thương mại.
