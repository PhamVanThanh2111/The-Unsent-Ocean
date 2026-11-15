# The Unsent Ocean — Bảo Tàng Tin Nhắn Chưa Gửi

**The Unsent Ocean** là một web-app fullstack (Monolith) nơi cất giữ những lá thư không người nhận dưới hình hài những chiếc chai thủy tinh phát sáng sinh học (bioluminescent) trôi dạt giữa đại dương đêm.

---

## Kiến trúc & Công nghệ

- **Framework:** Next.js 14 (App Router, TypeScript, Server Actions)
- **Styling & Animation:** Tailwind CSS, Framer Motion, Lucide React
- **Visual Canvas:** HTML5 Canvas API mô phỏng biển đêm 60fps, ánh trăng phản chiếu, sóng vỗ nhiều tầng, vệt nước lăn tăn theo chuột và các chai thư phát sáng dập dềnh theo nhịp sóng
- **Database & ORM:** SQLite (`prisma/dev.db`) tích hợp qua Prisma ORM
- **Audio Engine:** Web Audio API (`src/lib/audio.ts`) tổng hợp tiếng sóng biển đêm, âm trầm thiền định 432Hz, tiếng đàn piano đêm khuya và hiệu ứng âm thanh (Cork Pop, Water Splash, Wind Chime)
- **Export Thẻ Kỷ Niệm (9:16):** `html-to-image` kết hợp Canvas 1080x1920 fallback để tải ảnh Story/TikTok sắc nét

---

## Khởi chạy dự án

```bash
# 1. Cài đặt dependencies
npm install

# 2. Khởi tạo SQLite Database & Seed dữ liệu mẫu
npx prisma generate
npx prisma db push
npm run db:seed

# 3. Chạy server development
npm run dev
```

Truy cập ứng dụng tại `http://localhost:3000`.

