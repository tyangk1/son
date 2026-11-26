# NÉT · Matte Lip: "mỗi lần cuộn là một nét son"

Concept landing page cho một thương hiệu son môi **hư cấu** (NÉT), do Web Atelier làm để chạy thử quy trình Web Atelier Studio. Cuộn để vặn son, quẹt từng nét son, nét son phủ kín màn hình thành màu tiếp theo; cuối trang kéo ngón tay để vẽ thử một nét. Không bán gì. Ảnh sản phẩm tạo bằng AI (Codex image generation), tách lớp bằng PhotoCraft.

- `site/`: trang tĩnh (GSAP 3.12.5 + ScrollTrigger, Lenis 1.1.13, font OFL, tất cả đặt trong `site/vendor` và `site/fonts`, không gọi CDN), phục vụ bằng nginx (`Dockerfile`, `nginx.conf`, `/healthz`).
- Live: https://son.yan.io.vn (noindex). Umami website `1a59d7f5-b87d-49ca-a7b7-c7bb9989fbac`.
- Nguồn để sửa: `video-plans/web-atelier/studio/projects/net-lip/site`, copy sang đây trước mỗi lần deploy.
