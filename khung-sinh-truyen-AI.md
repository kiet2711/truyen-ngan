# Khung thiết kế: Quy trình sinh truyện ngắn bằng AI (10.000-20.000 chữ) cho ứng dụng audio

## 1. Mục tiêu

Xây dựng pipeline sinh truyện ngắn đa thể loại, độ dài 10.000-20.000 chữ, có bước duyệt của người dùng trước khi chuyển sang audio (TTS). Người dùng có thể chỉ chọn thể loại mà không nhập gì thêm, hệ thống vẫn phải tạo ra truyện đa dạng, không lặp công thức.

---

## 2. Luồng tổng thể (pipeline)

```
User chọn thể loại (+ tuỳ chọn: bối cảnh, nhân vật, độ dài, tông giọng)
        ↓
[Bước A] Random hoá biến số còn thiếu (từ tag pool theo thể loại)
        ↓
[Bước B] Sinh OUTLINE (dàn ý 6-8 phần, dùng khung cấu trúc theo thể loại)
        ↓
   >>> CHECKPOINT 1: User duyệt outline <<<
   (đổi lại / sửa tay / duyệt tiếp)
        ↓
[Bước C] Sinh từng phần chi tiết (1.500-2.500 chữ/phần, tuần tự, có tóm tắt phần trước)
        ↓
[Bước D] Continuity pass (đồng nhất văn phong, sửa lỗi vênh logic) — tuỳ chọn
        ↓
   >>> CHECKPOINT 2: User duyệt bản text đầy đủ (đọc lướt / nghe preview đoạn đầu) <<<

---

## 3. Danh sách thể loại đề xuất (mở rộng được)

1. Kinh dị
2. Trinh thám / hình sự
3. Ngôn tình
4. Khoa học viễn tưởng
5. Kỳ ảo / huyền huyễn
6. Drama đời thường / gia đình
7. Phiêu lưu
8. Hài hước / châm biếm

Mỗi thể loại cần 2 thành phần dữ liệu: **Tag pool** (nguyên liệu random hoá) và **Khung cấu trúc outline** (công thức kịch tính).

---

## 4. Tag pool theo thể loại (nguyên liệu random hoá)

Mỗi thể loại cần định nghĩa các nhóm biến số sau (lưu dạng bảng/JSON, mỗi nhóm có 8-15 lựa chọn để tránh lặp):

| Nhóm biến | Ví dụ (Kinh dị) | Ví dụ (Trinh thám) | Ví dụ (Ngôn tình) |
|---|---|---|---|
| Bối cảnh | Nhà hoang, bệnh viện cũ, chung cư cũ, làng chài hẻo lánh, rừng núi Tây Bắc | Thành phố lớn hiện đại, thị trấn nhỏ, du thuyền, trường học | Quán cà phê, công ty, trường đại học, chuyến du lịch |
| Motif / kiểu xung đột chính | Ám ảnh tâm linh, sinh vật lạ, con người biến chất, tâm lý/hoang tưởng | Án mạng bí ẩn, mất tích, lừa đảo, âm mưu gia tộc | Yêu xa, hiểu lầm quá khứ, môn đăng hộ đối, tình đầu tái ngộ |
| Góc kể | Ngôi 1 hồi tưởng, ngôi 3 nhiều tuyến, dạng nhật ký/hồ sơ | Ngôi 3 theo thám tử, ngôi 1 nghi phạm, đa góc nhìn | Ngôi 1 nữ chính, ngôi 3 xen kẽ 2 nhân vật |
| Nhịp truyện | Mở chậm rợn người, mở nhanh vào biến cố | Mở bằng hiện trường án, mở bằng nhân vật đời thường trước | Mở bằng gặp gỡ định mệnh, mở bằng xung đột có sẵn |
| Kiểu kết | Đóng (giải thích rõ), mở (ám ảnh, không giải thích hết) | Phá án trọn vẹn, twist lật ngược | Có hậu, buồn/dang dở, mở |

**Lưu ý khi triển khai:** lưu lịch sử tổ hợp đã dùng cho từng user để loại trừ khi random lần sau, tránh 2 truyện liên tiếp giống nhau.

---

## 5. Khung cấu trúc outline theo thể loại (công thức kịch tính)

Đây là "công thức khung" mà bước sinh outline phải bám theo, đảm bảo truyện có nhịp kịch tính đúng thể loại thay vì để AI tự do:

- **Kinh dị:** Bình thường → dấu hiệu bất thường nhỏ → leo thang → khủng hoảng → cao trào → kết (đóng hoặc mở).
- **Trinh thám:** Giới thiệu vụ án → manh mối sai lệch (red herring) → nghi phạm giả → bước ngoặt → lộ diện thật → giải thích.
- **Ngôn tình:** Gặp gỡ → xung đột/hiểu lầm → gắn kết → biến cố chia cắt → hoà giải → kết thúc.
- **Khoa học viễn tưởng:** Thiết lập thế giới/công nghệ → vấn đề nảy sinh → khám phá/điều tra → hệ quả đạo đức → giải quyết.
- **Kỳ ảo:** Thế giới thường → lời mời gọi/dấu hiệu phép màu → bước vào thế giới khác → thử thách → biến đổi nhân vật → trở về hoặc ở lại.
- **Drama đời thường:** Trạng thái ổn định giả → rạn nứt → đối đầu → khủng hoảng cảm xúc → giải quyết/chấp nhận.
- **Phiêu lưu:** Lời kêu gọi hành trình → khởi hành → thử thách tăng dần → mất mát/hi sinh → đích đến → trở về đã thay đổi.
- **Hài hước:** Tình huống bình thường → yếu tố gây rối → hiểu lầm/leo thang hài → cao trào lố → giải quyết bất ngờ.

Outline sinh ra phải map đúng 6-8 phần theo các nhịp trên, mỗi phần gồm: tiêu đề, tóm tắt 2-3 câu, mục tiêu kịch tính, nhân vật xuất hiện.

---

## 6. Nguyên tắc điều khiển AI khi sinh nội dung

1. **Không đưa prompt chung chung khi user không nhập gì** — luôn random hoá tag pool trước, đưa tổ hợp cụ thể vào prompt outline (bối cảnh, motif, góc kể, nhịp, kiểu kết đã chọn sẵn).
2. **Outline phải bám khung cấu trúc thể loại** — prompt outline cần liệt kê rõ khung nhịp kịch tính tương ứng, yêu cầu AI map nội dung vào đúng khung đó.
3. **Sinh chi tiết theo từng phần, không sinh 1 lần toàn bộ** — mỗi phần chỉ nhận: outline tổng + tóm tắt các phần trước (không đưa full text) + yêu cầu của riêng phần đó.
4. **Temperature phân tầng:** outline dùng temperature cao hơn (~0.9-1.0) để đa dạng ý tưởng; sinh chi tiết dùng temperature thấp hơn (~0.7-0.8) để giữ mạch logic, tránh lạc đề.
5. **Không lặp tổ hợp** cho cùng 1 user trong lịch sử gần đây.

---

## 7. Hai checkpoint duyệt của người dùng

- **Checkpoint 1 (sau outline):** hiển thị bối cảnh, nhân vật, dàn ý 6-8 phần tóm tắt. User có thể: tạo lại (random tổ hợp khác) / sửa tay chi tiết / duyệt để đi tiếp. Đây là bước rẻ, lọc sớm trước khi tốn chi phí sinh full text.
- **Checkpoint 2 (sau khi có full text, trước khi chạy TTS):** cho user đọc lướt hoặc nghe preview đoạn đầu trước khi chuyển toàn bộ qua audio, tránh tốn chi phí TTS cho nội dung họ không ưng.

---

## 8. Việc cần AI code (đưa file này làm ngữ cảnh)

- Định nghĩa dữ liệu tag pool + khung cấu trúc outline cho từng thể loại (dạng JSON/DB) dựa theo mục 4 và 5.
- Cơ chế random hoá biến số còn thiếu khi user không nhập, có loại trừ lịch sử đã dùng.
- Prompt template cho từng bước (outline, sinh từng phần, continuity pass) áp dụng đúng nguyên tắc ở mục 6.
- Luồng API + UI cho 2 checkpoint duyệt ở mục 7.
- Pipeline async (queue) nối tiếp: outline → duyệt → sinh chi tiết → duyệt → TTS → ghép audio.
