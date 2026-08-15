# Hướng dẫn test Document Flow bằng Postman

Import `docs/c17-api-postman-collection.json`, chọn environment có `baseUrl=http://localhost:3000`, rồi chạy theo thứ tự dưới đây.

## Luồng chính

1. `1.1 Login as Task Creator` — tạo `creatorToken`.
2. `1.3 Register Task Assignee` và `1.3.1 Login as Task Assignee` — tạo `assigneeId` và `assigneeToken`.
3. `3.1 Creator Creates Task`, sau đó `3.4 Creator Assigns Task to Assignee` — tạo `taskId` và gắn assignee trực tiếp vào task.
4. `4.1.1 Upload Clean Document` — tạo `documentId` bằng `creatorToken`.
5. `4.1.5 List Documents` — kiểm tra tài liệu nằm trong inventory của owner. Kết quả này chỉ chứng minh quyền liệt kê, chưa chứng minh quyền đọc nội dung.
6. `4.1.6 Get Document Metadata (Should DENY)` và `4.1.7 List Document Versions (Should DENY)` — chạy trước khi grant; `403 NO_GRANT` là đúng.
7. `4.2.1 Attach Document and Grant Assignee` — dùng `creatorToken`, cấp `PREVIEW` và `DOWNLOAD` cho `assigneeId`.
8. Dùng `assigneeToken` chạy `4.2.2` và `4.2.3` — kiểm tra assignee thấy tài liệu và đọc được metadata.
9. Dùng `assigneeToken` chạy `4.4.1 Create Download Ticket`, rồi `4.4.2 Redeem Ticket (Download Plaintext)` — kiểm tra tải file.
10. `4.4.3 Replay Ticket (Should DENY)` — dùng lại ticket; phải bị từ chối.
11. `4.5.1 Detach Document and Revoke Task Grants`, sau đó chạy `4.5.2` và `4.5.3` — xác nhận grant bị thu hồi và assignee không còn đọc được.

## Ý nghĩa quyền

- `PREVIEW`: đọc metadata, preview và danh sách version.
- `DOWNLOAD`: xin download ticket và redeem ticket để nhận file.
- `GET /documents`: inventory theo owner; không thay thế cho quyền `PREVIEW`.
- Token phải khớp với `actor_id` trong grant. Grant cho `assigneeId` thì request dương tính phải dùng `assigneeToken`.

## Kiểm tra quyền chuyên sâu

Thư mục `4.3 Permission Management` dùng để kiểm tra trực tiếp grant, delegation và revoke. Có thể chạy sau `4.2.1` nếu cần kiểm tra `PREVIEW`/`DOWNLOAD` ở Permission Service.

## Kết quả mong đợi

| Bước | Kết quả |
|---|---|
| Upload | `201 Created` |
| List owner inventory | `200 OK`, có `documentId` |
| Đọc trước khi grant | `403 NO_GRANT` |
| Đọc sau grant `PREVIEW` | `200 OK` |
| Xin ticket sau grant `DOWNLOAD` | `201 Created` hoặc `200 OK` tùy request |
| Redeem ticket | `200 OK` và response dạng file |
| Replay hoặc sau detach | `403`/`404` theo assertion của request |
