# Script thuyết trình và demo đồ án

## Thông tin chung

- **Đề tài:** Xây dựng ứng dụng giao việc và chia sẻ tài liệu số trong tổ chức
- **Định hướng:** Ứng dụng cho môi trường cơ quan nhà nước, ví dụ Ủy ban nhân dân
- **Thời lượng:** 10–15 phút
- **Luồng demo chính:** Đăng nhập → giao việc → chia sẻ tài liệu → cấp quyền có thời hạn → xử lý → nộp kết quả → phê duyệt

### Thành viên

- N22DCCN068 Nguyễn Lưu Tấn Sang — D22CQCNPM01-N
- N22DCCN071 Vũ Ngọc Sơn — D22CQCNPM01-N
- N22DCCN088 Đỗ Xuân Trí — D22CQCNPM01-N

Phân công dưới đây là gợi ý, có thể đổi theo phần mỗi thành viên đã thực hiện:

- Sang: mở đầu và bài toán nghiệp vụ.
- Sơn: kiến trúc và bảo mật.
- Trí: thao tác demo và kết luận.

> **Nguyên tắc trình bày:** chỉ khẳng định phần đã được kiểm tra trên server. Với phần mới dừng ở mức mã nguồn hoặc thiết kế, dùng cụm “đã xây dựng trong kiến trúc/mã nguồn, đang tiếp tục xác minh runtime”. Không đưa password, JWT, secret, object key hoặc thông tin database lên màn hình.

## 1. Lời thoại theo thời gian

### 0:00–0:45 — Mở đầu

“Em xin chào thầy. Nhóm em gồm Nguyễn Lưu Tấn Sang, Vũ Ngọc Sơn và Đỗ Xuân Trí, lớp D22CQCNPM01-N.

Đề tài của nhóm em là ‘Xây dựng ứng dụng giao việc và chia sẻ tài liệu số trong tổ chức’, với định hướng áp dụng cho môi trường cơ quan nhà nước như Ủy ban nhân dân.

Hệ thống giải quyết hai nghiệp vụ chính: giao và theo dõi công việc; chia sẻ tài liệu theo đúng người, đúng quyền và đúng thời hạn.”

### 0:45–2:00 — Bài toán thực tế

“Trong một UBND, một công việc thường liên quan đến nhiều phòng ban và nhiều cán bộ. Ví dụ, lãnh đạo giao cho một chuyên viên xử lý hồ sơ hoặc dự thảo văn bản.

Nếu tài liệu chỉ được gửi qua email hoặc đường dẫn thông thường thì khó kiểm soát ai được xem, ai được tải, ai được chia sẻ tiếp và quyền truy cập có còn tồn tại sau khi công việc kết thúc hay không.

Vì vậy nhóm em xây dựng hệ thống trong đó quyền truy cập tài liệu được gắn với công việc. Người dùng chỉ được cấp đúng quyền cần thiết và quyền có thể tự hết hạn theo deadline của công việc.

Về lý thuyết, hệ thống định hướng theo các nguyên tắc bảo vệ dữ liệu, kiểm soát truy cập, xác thực, ghi vết và phát hiện truy cập trái phép. Đây là các nhóm yêu cầu được đề cập trong các văn bản về bảo vệ dữ liệu cá nhân và an toàn thông tin của Chính phủ Việt Nam. Phần mềm là công cụ hỗ trợ thực thi chính sách, không tự thay thế quy trình pháp lý của từng cơ quan.”

### 2:00–3:15 — Đối tượng sử dụng

“Hệ thống có ba nhóm người dùng chính.

Thứ nhất là người giao việc. Người này có thể tạo công việc, giao cho cán bộ khác, chia sẻ tài liệu, giới hạn quyền sử dụng tài liệu và phê duyệt kết quả.

Thứ hai là người được giao việc. Người này xem công việc, xem tài liệu được chia sẻ, cập nhật tiến độ và gửi kết quả xử lý. Nếu được cấp quyền, người này có thể giao tiếp công việc, nhưng quyền được giao không thể vượt quá quyền gốc.

Thứ ba là Admin. Admin quản lý người dùng, vai trò, capability, khóa hoặc mở khóa tài khoản và cấu hình cảnh báo bảo mật. Theo nguyên tắc tách biệt trách nhiệm, Admin không mặc định được xem hoặc chia sẻ nội dung tài liệu.”

### 3:15–5:00 — Kiến trúc Microservices

“Kiến trúc của nhóm em gồm một API Gateway và chín service nghiệp vụ.

Client Web hoặc Mobile không gọi trực tiếp từng service mà chỉ gọi API Gateway. Gateway xác thực JWT, giới hạn tốc độ truy cập và chuyển request đến service phù hợp.

Các service chính gồm:

- Authentication & Identity: đăng ký, đăng nhập, refresh token và session.
- User & Role Management: người dùng, vai trò, khóa tài khoản và capability.
- Task Management: tạo việc, giao việc, deadline, trạng thái, comment và kết quả.
- Document Management: metadata, phiên bản tài liệu và download ticket.
- Document Security: scan, mã hóa, chữ ký số và quản lý khóa.
- Permission: cấp quyền, kiểm tra quyền, hết hạn quyền và ủy quyền.
- Audit Log: ghi lịch sử hoạt động theo mô hình append-only.
- Notification: thông báo và tùy chọn nhận thông báo.
- Security Monitoring: sự kiện, rule, threshold và cảnh báo.

Mỗi service sở hữu database riêng. Một service không truy cập trực tiếp database của service khác mà giao tiếp qua API hoặc event.

HTTP được dùng cho các thao tác cần phản hồi ngay, ví dụ Task Service gọi Permission Service để kiểm tra quyền. RabbitMQ được dùng cho các sự kiện bất đồng bộ, ví dụ sau khi tạo task thì service khác có thể nhận event để tạo thông báo hoặc ghi nhận hoạt động.

Docker Compose dùng để đóng gói và chạy các service cùng PostgreSQL, Redis, RabbitMQ, MinIO và ClamAV.”

### 5:00–6:45 — Các concept bảo mật

#### JWT và session

“Sau khi đăng nhập thành công, hệ thống cấp token JWT. JWT chứa thông tin định danh như user ID, role và thời hạn hết hiệu lực.

Gateway kiểm tra chữ ký và thời hạn của JWT trước khi chuyển request vào service. Token có thời hạn nên nếu bị lộ thì thời gian sử dụng cũng bị giới hạn. Refresh token và session được quản lý riêng để hỗ trợ đăng xuất hoặc thu hồi phiên.”

#### RBAC và capability

“RBAC là phân quyền theo vai trò, ví dụ ADMIN hoặc EMPLOYEE. Tuy nhiên chỉ role là chưa đủ. Hệ thống còn dùng capability để biểu diễn quyền chi tiết hơn, ví dụ quyền xem, tải, cập nhật hoặc chia sẻ tài liệu.”

#### Least privilege

“Least privilege nghĩa là mỗi người chỉ được cấp quyền tối thiểu cần thiết cho công việc. Một cán bộ chỉ cần xem tài liệu thì không được cấp quyền cập nhật hoặc chia sẻ lại.”

#### Task-derived grant

“Trong hệ thống, quyền tài liệu phải gắn với một task. Người dùng không tự nhiên có quyền tải tài liệu nếu không có một công việc làm căn cứ.

Thời hạn hiệu lực thực tế được giới hạn bởi thời hạn ngắn nhất giữa grant, deadline của task và quyền cha nếu đây là quyền được ủy quyền.”

#### Delegation

“Nếu người được giao muốn giao tiếp công việc cho người khác thì chỉ được cấp các quyền nhỏ hơn hoặc bằng quyền mình đang có. Người được ủy quyền cũng không thể có thời hạn dài hơn quyền gốc.”

#### Fail-closed

“Fail-closed nghĩa là khi Permission Service bị lỗi hoặc timeout thì hệ thống từ chối quyền thay vì cho phép mặc định. Với tài liệu mật, từ chối nhầm an toàn hơn cho phép nhầm.”

#### Mã hóa và chữ ký số

“Mã hóa bảo vệ tính bí mật của nội dung. Trong thiết kế, tài liệu có thể được mã hóa bằng AES-256-GCM. DEK dùng để mã hóa nội dung cụ thể, còn KEK dùng để bảo vệ DEK. Version hóa KEK giúp hỗ trợ thay đổi khóa trong tương lai.

Chữ ký số có mục tiêu khác với mã hóa. Chữ ký giúp kiểm tra nguồn gốc và tính toàn vẹn của tài liệu, còn mã hóa giúp người không có khóa không đọc được nội dung.”

#### Audit Log

“Audit Log là nhật ký truy cập không cho sửa hoặc xóa tùy ý. Mỗi sự kiện chứa hash liên kết với sự kiện trước đó. Nếu một bản ghi bị sửa, việc kiểm tra lại hash-chain sẽ phát hiện vị trí bị sai lệch.”

#### Security Monitoring

“Security Monitoring theo dõi các sự kiện như đăng nhập thất bại nhiều lần hoặc bị từ chối truy cập tài liệu nhiều lần. Khi số lần vượt ngưỡng trong một khoảng thời gian, hệ thống tạo cảnh báo và có thể thu hồi session tùy chính sách.”

### Slide bổ sung — ClamAV và MinIO hoạt động như thế nào?

#### Nội dung hiển thị trên slide

| Thành phần | Vai trò |
|---|---|
| **ClamAV** | Quét virus/malware cho file upload trước khi lưu lâu dài |
| **MinIO** | Object storage tương thích S3, lưu ciphertext sau khi mã hóa |
| **PostgreSQL** | Lưu metadata, không lưu nội dung file trực tiếp |

```text
Client
  → API Gateway
  → Document Management Service
  → Document Security Service
  → Lưu plaintext tạm thời
  → ClamAV qua TCP :3310
       ├─ FOUND → từ chối upload, dọn file tạm
       └─ OK
            → mã hóa AES-256-GCM
            → lưu ciphertext vào MinIO :9000
            → lưu metadata vào PostgreSQL
            → dọn plaintext/ciphertext tạm
```

Khi tải xuống:

```text
Download ticket và permission check
  → lấy ciphertext từ MinIO
  → kiểm tra HMAC integrity signature
  → giải mã bằng DEK/KEK và AES-256-GCM
  → kiểm tra lại SHA-256 checksum
  → trả plaintext cho người dùng được phép
```

#### Lời thoại trình bày

“Slide này giải thích hai thành phần thường dễ bị nhầm là ClamAV và MinIO.

ClamAV không phải nơi lưu file. ClamAV là antivirus service. Khi người dùng upload DOCX hoặc PDF, Document Security Service ghi file vào vùng tạm, sau đó mở kết nối TCP đến ClamAV ở port 3310 và gửi nội dung file theo giao thức INSTREAM.

Nếu ClamAV trả về FOUND thì file bị coi là không an toàn. Security Service trả lỗi, không tạo bản lưu lâu dài và xóa file tạm.

Nếu ClamAV trả về OK thì file được mã hóa bằng AES-256-GCM. Hệ thống tạo DEK riêng cho phiên bản file, dùng KEK để bảo vệ DEK, tạo IV và authentication tag. Ciphertext sau đó được đưa vào MinIO.

MinIO có vai trò giống một object storage nội bộ, tương tự Amazon S3. MinIO chỉ lưu file đã mã hóa. PostgreSQL không lưu bytes của DOCX hoặc PDF mà chỉ lưu metadata như object key, checksum, encrypted DEK, IV, authentication tag, KEK version, kích thước file và trạng thái scan.

Khi tải xuống, hệ thống không cho browser truy cập trực tiếp MinIO. Request phải vượt qua permission check và download ticket. Security Service lấy ciphertext từ MinIO, kiểm tra integrity signature, giải mã bằng DEK được unwrap qua KEK, rồi tính lại SHA-256 checksum. Chỉ khi các bước kiểm tra hợp lệ thì file plaintext mới được trả về cho người dùng.”

#### Cấu hình Docker cần giải thích nếu thầy hỏi

```text
MINIO_ENDPOINT=minio
MINIO_PORT=9000

CLAMAV_HOST=clamav
CLAMAV_PORT=3310
```

“Trong Docker Compose, các container gọi nhau bằng tên service trên Docker network. Vì vậy Security Service dùng `minio` và `clamav`, không dùng `localhost`. Nếu dùng localhost trong Security Service thì request sẽ quay lại chính container Security Service, không đi đến container MinIO hoặc ClamAV.”

#### Điểm cần nhấn mạnh

- ClamAV bảo vệ **tính an toàn của file trước khi lưu**.
- MinIO bảo vệ **cách lưu trữ và mở rộng object file**.
- PostgreSQL lưu **metadata**, không lưu trực tiếp nội dung DOCX/PDF.
- Plaintext chỉ tồn tại tạm thời trong Security Service và được dọn sau pipeline.
- Browser không nhận credential MinIO, object key nội bộ hoặc private storage URL.

#### Code minh chứng

- `backend/apps/document-security-service/src/security/security-pipeline.service.ts:89` — điều phối upload, scan, encrypt và lưu metadata.
- `backend/apps/document-security-service/src/security/clamav.service.ts:22` — gửi file qua TCP đến ClamAV và xử lý `OK`/`FOUND`.
- `backend/apps/document-security-service/src/security/minio-storage.service.ts:24` — ghi ciphertext vào MinIO.
- `backend/apps/document-security-service/src/security/security-pipeline.service.ts:301` — lấy, xác minh và giải mã file khi tải xuống.

## 2. Kịch bản thao tác demo

### Bước 1 — Mở hệ thống

Mở:

```text
http://<server-ip>:3100
```

Lời nói:

“Client truy cập vào Web frontend. Frontend chỉ gọi API Gateway, không gọi trực tiếp các port service nội bộ.”

Không mở trực tiếp port 3001–3009 trên trình duyệt.

### Bước 2 — Đăng nhập người giao việc

“Đầu tiên em đăng nhập bằng tài khoản người giao việc.

Sau khi đăng nhập, hệ thống tạo session và cấp JWT. Những request tiếp theo được gửi qua Gateway. Người dùng không truy cập trực tiếp database hoặc service nội bộ.”

### Bước 3 — Tạo công việc

Vào **Tasks → Create Task**.

Dữ liệu mẫu:

```text
Tiêu đề: Xử lý hồ sơ đề xuất dự án chuyển đổi số
Mô tả: Kiểm tra tài liệu, tổng hợp ý kiến và gửi báo cáo
Người được giao: tài khoản chuyên viên
Deadline: một thời điểm cụ thể trước ngày demo
```

Lời nói:

“Task có creator là người giao việc, assignee là người xử lý và deadline cụ thể. Task có thể đi qua các trạng thái CREATED, ASSIGNED, IN_PROGRESS, WAITING_REVIEW và APPROVED.”

### Bước 4 — Tạo hoặc chọn tài liệu

Vào **Documents → Create/Upload**.

Dữ liệu mẫu:

```text
Tên tài liệu: Hồ sơ dự án chuyển đổi số
Security level: INTERNAL hoặc CONFIDENTIAL
```

Lời nói:

“Tài liệu có metadata, phiên bản và mức độ bảo mật. Trong kiến trúc đầy đủ, phần nội dung file được xử lý qua Document Security Service trước khi lưu vào object storage.”

Nếu upload trên server chưa ổn định, dùng tài liệu mẫu đã tạo sẵn hoặc trình bày request bằng Postman. Không giả định pipeline MinIO/ClamAV đã chạy end-to-end nếu chưa kiểm tra thực tế.

### Bước 5 — Gắn tài liệu với task

Trong task chọn **Attach Document**.

Lời nói:

“Việc gắn tài liệu vào task tạo mối quan hệ giữa công việc và tài liệu. Đây là căn cứ để Permission Service xác định người dùng nào được truy cập.”

### Bước 6 — Cấp quyền có giới hạn

Vào **Grants → Create Grant**.

Dữ liệu mẫu:

```text
Người nhận: tài khoản chuyên viên
Quyền: PREVIEW, DOWNLOAD
Thời hạn: trước deadline của task
```

Không cấp `UPDATE` hoặc `SHARE`.

Lời nói:

“Người giao việc chỉ cấp PREVIEW và DOWNLOAD. Người nhận được xem và tải tài liệu nhưng không được cập nhật hoặc chia sẻ tiếp.

Grant có thời hạn. Khi grant hoặc task hết hạn, Permission Service sẽ trả về trạng thái từ chối.”

### Bước 7 — Đăng nhập người nhận

Đăng xuất và đăng nhập bằng tài khoản chuyên viên.

Lời nói:

“Màn hình của người nhận chỉ hiển thị các task và tài liệu mà tài khoản này được phép tiếp cận.”

Mở task và tài liệu:

“Người nhận xem được nội dung công việc, deadline và tài liệu đã được chia sẻ.”

Nếu có thể tải tài liệu:

“Thao tác tải sử dụng download ticket có thời hạn và gắn với actor, document và version, thay vì đưa thông tin storage trực tiếp cho browser.”

Nếu có thao tác bị từ chối:

“Đây là thao tác không nằm trong grant. Server trả về denied thay vì để giao diện tự quyết định cho phép.”

### Bước 8 — Cập nhật và gửi kết quả

Chuyển task sang `IN_PROGRESS`, nhập:

```text
Đã kiểm tra hồ sơ, tổng hợp các nội dung chính và đề xuất phương án xử lý.
```

Chọn **Submit**.

Lời nói:

“Người nhận gửi kết quả. Task chuyển sang trạng thái chờ review. Người giao việc là người có quyền đánh giá kết quả.”

### Bước 9 — Phê duyệt

Đăng nhập lại người giao việc → mở task → **Review → APPROVED**.

Lời nói:

“Sau khi phê duyệt, task chuyển sang APPROVED. Quyền tài liệu có thể được thu hồi hoặc hết hạn theo deadline và chính sách của tổ chức.”

### Bước 10 — Admin và monitoring

Nếu server ổn định, đăng nhập Admin.

Lời nói:

“Admin tập trung vào người dùng, capability, khóa hoặc mở khóa tài khoản, cảnh báo và rule bảo mật.

Admin không có luồng nghiệp vụ mặc định để xem hoặc chia sẻ nội dung tài liệu. Đây là nguyên tắc tách biệt giữa quản trị hệ thống và xử lý nội dung.”

## 3. Giải thích công nghệ và pattern

### Vì sao chọn Node.js/NestJS?

“Nhóm chọn Node.js và NestJS vì có TypeScript, module rõ ràng, phù hợp xây dựng REST API và microservices. NestJS hỗ trợ guard, interceptor, validation và dependency injection. TypeScript cũng giúp chia sẻ type và contract giữa các module.”

### Vì sao chọn PostgreSQL?

“PostgreSQL phù hợp với dữ liệu nghiệp vụ có quan hệ rõ như task, user, grant và audit event. Prisma giúp định nghĩa schema và truy vấn type-safe.”

### Vì sao database-per-service?

“Database-per-service giúp mỗi service tự sở hữu dữ liệu của mình và giảm coupling. Đổi lại, hệ thống không thể join trực tiếp giữa các database mà phải giao tiếp qua API hoặc event.”

### Vì sao dùng RabbitMQ?

“RabbitMQ phù hợp cho các sự kiện nghiệp vụ và message routing ở quy mô đồ án. Service phát event không cần chờ tất cả service khác xử lý xong.

Kafka phù hợp hơn khi cần throughput rất lớn, lưu event lâu dài và replay nhiều. Với phạm vi hiện tại, RabbitMQ đơn giản và phù hợp hơn.”

### Vì sao dùng Docker?

“Docker đóng gói service cùng môi trường chạy. Khi triển khai lên server, các service có thể khởi động theo cùng cấu hình và dễ kiểm tra health check.”

## 4. Cách trả lời về trạng thái hoàn thiện

Nếu thầy hỏi “Đồ án đã hoàn thiện hết chưa?”:

“Hiện tại nhóm em đã xây dựng kiến trúc microservices, các service backend chính, API Gateway, database schema, permission flow, audit flow và các màn hình Web chính.

Phần nhóm em tiếp tục xác minh là runtime end-to-end trên server, đặc biệt là toàn bộ pipeline upload file, kết nối object storage, malware scan và một số luồng event bất đồng bộ.

Nhóm em phân biệt rõ ba mức: đã có mã nguồn, đã có kiểm thử ở mức service và đã xác minh chạy thực tế trên toàn bộ server. Nhóm em không đánh đồng ba mức này.”

Nếu thầy hỏi “Đã mã hóa file thật chưa?”:

“Trong thiết kế, Document Security Service chịu trách nhiệm scan, encrypt và sign. Phần encryption record và permission flow đã được xây dựng. Việc xác minh toàn bộ file pipeline với MinIO và ClamAV cần được kiểm tra runtime riêng, nên nhóm em không khẳng định quá mức khi chưa có bằng chứng end-to-end.”

Nếu thầy hỏi “Mobile đã hoàn thiện chưa?”:

“Web là bề mặt demo chính. Mobile được thiết kế để dùng chung API Gateway và contract backend. Nhóm em không tuyên bố mobile hoàn thiện nếu chưa có bản chạy thực tế.”

## 5. Câu hỏi thường gặp

### Vì sao không làm Monolith?

“Monolith đơn giản hơn khi bắt đầu. Tuy nhiên đề tài yêu cầu nghiên cứu microservices. Nhóm em tách service theo domain để mỗi service có trách nhiệm rõ, có database riêng và có thể triển khai độc lập. Trade-off là microservices phức tạp hơn ở giao tiếp, giám sát và nhất quán dữ liệu.”

### Nếu Permission Service bị lỗi thì sao?

“Hệ thống fail-closed. Khi timeout hoặc lỗi, Permission Service trả về denied. Tài liệu không được mở mặc định.”

### Người được giao có thể cấp quyền vô hạn không?

“Không. Grant con phải là tập con quyền của grant cha và không thể có thời hạn dài hơn grant cha.”

### JWT có phải mã hóa không?

“JWT thường được ký, không đồng nghĩa với mã hóa. Chữ ký giúp xác minh token không bị sửa. Vì vậy không đưa dữ liệu nhạy cảm vào payload JWT.”

### Admin có xem được tài liệu không?

“Không theo chính sách nghiệp vụ của đồ án. Admin quản lý tài khoản, role, capability và monitoring; không mặc định có quyền đọc hoặc chia sẻ nội dung tài liệu.”

### Audit Log có thể bị sửa không?

“Thiết kế audit là append-only và hash-chain. Mỗi event liên kết với hash của event trước. Khi kiểm tra lại toàn bộ chuỗi, hệ thống có thể phát hiện sai lệch.”

### Có đảm bảo đúng quy định pháp luật không?

“Phần mềm hỗ trợ các nguyên tắc như phân quyền, bảo vệ dữ liệu, ghi vết và phát hiện truy cập trái phép. Việc tuân thủ đầy đủ còn phụ thuộc vào phân loại tài liệu, quy trình nghiệp vụ, hạ tầng, chứng thư số và quy chế cụ thể của từng cơ quan.”

## 6. Kết luận

“Qua đồ án, nhóm em đã nghiên cứu và áp dụng kiến trúc microservices vào bài toán giao việc và chia sẻ tài liệu trong tổ chức.

Điểm chính của hệ thống không chỉ là tạo task hay upload tài liệu, mà là kiểm soát toàn bộ vòng đời truy cập: ai được truy cập, được làm gì, trong bao lâu và hoạt động đó có được ghi nhận hay không.

Trong thời gian tiếp theo, nhóm em sẽ tiếp tục hoàn thiện kiểm thử end-to-end, kết nối đầy đủ file storage và malware scanning, bổ sung các authorization guard còn thiếu và hoàn thiện mobile client.

Nhóm em xin cảm ơn thầy và sẵn sàng nhận câu hỏi.”

## 7. Checklist trước giờ demo

- [ ] Kiểm tra URL server và frontend.
- [ ] Chuẩn bị hai tài khoản: người giao việc và người nhận.
- [ ] Đăng nhập thử cả hai tài khoản.
- [ ] Chuẩn bị sẵn task mẫu.
- [ ] Chuẩn bị sẵn tài liệu mẫu.
- [ ] Chuẩn bị grant `PREVIEW`, `DOWNLOAD`.
- [ ] Ghi lại task ID và user ID nếu cần dùng Postman.
- [ ] Mở sẵn hai trình duyệt hoặc một cửa sổ ẩn danh.
- [ ] Không trình bày password, JWT, secret, object key hoặc thông tin database.
- [ ] Nếu upload lỗi, dùng tài liệu mẫu hoặc Postman.
- [ ] Nếu server lỗi, chuyển sang trình bày sequence flow và kiến trúc.
