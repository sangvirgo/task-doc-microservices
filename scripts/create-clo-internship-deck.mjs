import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const outputDir = join(root, 'docs', 'presentations');
const outputPath = join(outputDir, 'C17-CLO-internship-presentation.pptx');
const workDir = join('/tmp', 'c17-clo-internship-deck');
const packageDir = join(workDir, 'package');
const odpPackageDir = join(workDir, 'odp-package');
const odpPath = join(workDir, 'C17-CLO-internship-presentation.odp');
const width = 1600;
const height = 900;

const C = {
  bg: '#091321',
  panel: '#102238',
  panel2: '#142b44',
  panel3: '#1a3855',
  white: '#f4f8fb',
  muted: '#9bb0c5',
  mint: '#5de3c5',
  cyan: '#5ab9f4',
  amber: '#f2b45f',
  coral: '#f47b7b',
  line: '#294761',
  darkMint: '#173e3c',
};

const esc = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

const approxChars = (fontSize, maxWidth) => Math.max(8, Math.floor(maxWidth / (fontSize * 0.54)));

function wrapText(value, maxWidth, fontSize) {
  const limit = approxChars(fontSize, maxWidth);
  return String(value).split('\n').flatMap((paragraph) => {
    if (!paragraph.trim()) return [''];
    const words = paragraph.split(/\s+/);
    const lines = [];
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (next.length > limit && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
    return lines;
  });
}

function textBlock(x, y, maxWidth, value, fontSize = 24, color = C.white, options = {}) {
  const { weight = 400, lineHeight = Math.round(fontSize * 1.35), anchor = 'start', opacity = 1 } = options;
  const lines = wrapText(value, maxWidth, fontSize);
  const tspans = lines.map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${esc(line)}</tspan>`).join('');
  return `<text x="${x}" y="${y}" fill="${color}" font-family="DejaVu Sans,Arial,sans-serif" font-size="${fontSize}px" font-weight="${weight}" text-anchor="${anchor}" opacity="${opacity}">${tspans}</text>`;
}

function rect(x, y, w, h, fill, radius = 18, stroke = 'none', strokeWidth = 0) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
}

function line(x1, y1, x2, y2, stroke = C.line, strokeWidth = 3, dash = '') {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${strokeWidth}" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`;
}

function circle(cx, cy, r, fill, stroke = 'none', strokeWidth = 0) {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
}

function pill(x, y, label, fill = C.darkMint, color = C.mint, w = null) {
  const widthValue = w ?? Math.max(86, label.length * 9 + 28);
  return `${rect(x, y, widthValue, 32, fill, 16)}${textBlock(x + widthValue / 2, y + 22, widthValue - 12, label.toUpperCase(), 13, color, { weight: 700, anchor: 'middle' })}`;
}

function card(x, y, w, h, title, body, accent = C.mint, options = {}) {
  const { titleSize = 22, bodySize = 17, fill = C.panel, titleColor = C.white } = options;
  return `${rect(x, y, w, h, fill, 18, C.line, 1)}${rect(x, y, 7, h, accent, 4)}${textBlock(x + 24, y + 37, w - 42, title, titleSize, titleColor, { weight: 700 })}${textBlock(x + 24, y + 76, w - 42, body, bodySize, C.muted, { lineHeight: 25 })}`;
}

function iconLock(x, y, scale = 1) {
  return `${rect(x + 15 * scale, y + 32 * scale, 80 * scale, 68 * scale, C.darkMint, 16, C.mint, 3)}<path d="M${x + 32 * scale} ${y + 36 * scale} V${y + 20 * scale} C${x + 32 * scale} ${y - 18 * scale}, ${x + 78 * scale} ${y - 18 * scale}, ${x + 78 * scale} ${y + 20 * scale} V${y + 36 * scale}" fill="none" stroke="${C.mint}" stroke-width="${8 * scale}" stroke-linecap="round"/>${circle(x + 55 * scale, y + 66 * scale, 7 * scale, C.mint)}${line(x + 55 * scale, y + 70 * scale, x + 55 * scale, y + 86 * scale, C.mint, 5)}`;
}

function arrow(x1, y1, x2, y2, color = C.mint, widthValue = 4) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const size = 13;
  const p1 = [x2 - size * Math.cos(angle - Math.PI / 6), y2 - size * Math.sin(angle - Math.PI / 6)];
  const p2 = [x2 - size * Math.cos(angle + Math.PI / 6), y2 - size * Math.sin(angle + Math.PI / 6)];
  return `${line(x1, y1, x2, y2, color, widthValue)}<path d="M${p1[0]} ${p1[1]} L${x2} ${y2} L${p2[0]} ${p2[1]}" fill="none" stroke="${color}" stroke-width="${widthValue}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function header(kicker, title, slideNumber) {
  return `${line(72, 67, 1528, 67, C.line, 2)}${textBlock(76, 47, 500, kicker.toUpperCase(), 14, C.mint, { weight: 700 })}${textBlock(76, 125, 1140, title, 42, C.white, { weight: 700 })}${textBlock(1520, 47, 180, 'C17 · CLO 1–5', 14, C.muted, { anchor: 'end', weight: 700 })}${textBlock(1520, 850, 180, String(slideNumber).padStart(2, '0'), 14, C.muted, { anchor: 'end', weight: 700 })}${textBlock(76, 850, 500, 'TASK & SECURE DOCUMENT PLATFORM', 12, C.muted, { weight: 700 })}`;
}

function bulletList(x, y, w, items, accent = C.mint, fontSize = 20, gap = 54) {
  return items.map((item, index) => {
    const yy = y + index * gap;
    return `${circle(x + 7, yy - 7, 6, accent)}${textBlock(x + 28, yy, w - 28, item, fontSize, C.white, { lineHeight: 27 })}`;
  }).join('');
}

function base(content) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?><svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${C.bg}"/>${content}</svg>`;
}

function slide1() {
  let s = '';
  s += line(78, 88, 420, 88, C.mint, 6);
  s += textBlock(80, 142, 800, 'BÁO CÁO THỰC TẬP TỐT NGHIỆP', 18, C.mint, { weight: 700 });
  s += textBlock(80, 265, 760, 'C17 Task &\nSecure Document\nPlatform', 64, C.white, { weight: 700, lineHeight: 75 });
  s += textBlock(84, 535, 650, 'Từ bài toán giao việc đến kiểm soát truy cập tài liệu theo Task', 25, C.muted, { lineHeight: 35 });
  s += pill(84, 640, 'CLO1–CLO5', C.darkMint, C.mint, 132);
  s += pill(232, 640, 'Security-first', '#16314b', C.cyan, 140);
  s += pill(388, 640, '10–15 phút', '#3c2c1c', C.amber, 120);
  s += rect(1030, 150, 370, 515, C.panel, 34, C.line, 2);
  s += circle(1215, 365, 132, '#0e2b35', C.mint, 3);
  s += iconLock(1160, 293, 1.15);
  s += textBlock(1215, 535, 290, 'TASK-BASED\nACCESS', 25, C.mint, { anchor: 'middle', weight: 700, lineHeight: 35 });
  s += line(1100, 584, 1330, 584, C.line, 2);
  s += textBlock(1215, 622, 290, 'least privilege · auditability · defense in depth', 15, C.muted, { anchor: 'middle', lineHeight: 22 });
  s += textBlock(80, 846, 700, 'C17 Workspace · Internship CLO presentation', 14, C.muted, { weight: 700 });
  return base(s);
}

function slide2() {
  let s = header('01 · Bối cảnh', 'Bài toán: tài liệu chỉ được mở khi có lý do công việc', 2);
  s += textBlock(78, 195, 680, 'Trong tổ chức, quyền xem/tải tài liệu không nên tồn tại độc lập. Quyền phải gắn với Task, có thời hạn, được kiểm tra lại ở thời điểm truy cập và để lại bằng chứng.', 24, C.white, { lineHeight: 36 });
  s += bulletList(88, 390, 610, [
    'Task là căn cứ nghiệp vụ cho quyền truy cập.',
    'Grant hết hạn hoặc bị thu hồi khi Task không còn hợp lệ.',
    'ADMIN quản trị nền tảng nhưng không đọc nội dung tài liệu.',
    'Mọi quyết định cho phép/từ chối đều có thể kiểm tra lại.',
  ], C.mint, 20, 66);
  s += card(850, 190, 300, 190, 'CONFIDENTIALITY', 'Không để quyền đọc/tải tồn tại “mồ côi” ngoài ngữ cảnh Task.', C.mint, { titleSize: 19 });
  s += card(1180, 190, 300, 190, 'TIME-BOUNDED', 'Grant có effective expiry và được kiểm tra tại request-time.', C.cyan, { titleSize: 19 });
  s += card(850, 420, 300, 190, 'FAIL-CLOSED', 'Permission Service lỗi hoặc không có Grant thì kết quả là DENY.', C.coral, { titleSize: 19 });
  s += card(1180, 420, 300, 190, 'TRACEABLE', 'Audit hash chain ghi nhận hoạt động mà không lưu nội dung nhạy cảm.', C.amber, { titleSize: 19 });
  s += pill(80, 755, 'Mục tiêu thực tập', C.darkMint, C.mint, 158);
  s += textBlock(260, 779, 1170, 'Xây dựng, triển khai và vận hành một backend có kiểm soát quyền rõ ràng.', 19, C.muted, { weight: 700 });
  return base(s);
}

function serviceBox(x, y, w, title, sub, accent = C.cyan) {
  return `${rect(x, y, w, 82, C.panel2, 14, C.line, 1)}${rect(x, y, 6, 82, accent, 3)}${textBlock(x + 18, y + 31, w - 30, title, 17, C.white, { weight: 700 })}${textBlock(x + 18, y + 57, w - 30, sub, 12, C.muted)}`;
}

function slide3() {
  let s = header('02 · Kiến trúc', 'Một điểm vào, nhiều ranh giới trách nhiệm', 3);
  s += pill(78, 155, 'Client chỉ gọi Gateway', C.darkMint, C.mint, 180);
  s += rect(570, 150, 460, 70, '#173e3c', 18, C.mint, 2);
  s += textBlock(800, 194, 420, 'API GATEWAY · JWT · RATE LIMIT', 20, C.mint, { anchor: 'middle', weight: 700 });
  const core = [
    ['AUTH', '3001 · identity', C.cyan], ['USER / ROLE', '3002 · capabilities', C.cyan], ['TASK', '3003 · lifecycle', C.mint], ['DOCUMENT', '3004 · metadata', C.mint],
  ];
  core.forEach((item, i) => { const x = 80 + i * 370; s += serviceBox(x, 285, 320, item[0], item[1], item[2]); s += arrow(800, 220, x + 160, 285, C.line, 2); });
  const sec = [
    ['DOC SECURITY', '3005 · scan/encrypt', C.amber], ['PERMISSION', '3006 · default deny', C.mint], ['AUDIT', '3007 · hash chain', C.cyan], ['NOTIFICATION', '3008 · in-app', C.cyan], ['SECURITY MON.', '3009 · alerts/rules', C.coral],
  ];
  sec.forEach((item, i) => { const x = 48 + i * 304; s += serviceBox(x, 415, 270, item[0], item[1], item[2]); });
  s += arrow(520, 367, 585, 415, C.mint, 3);
  s += arrow(900, 367, 720, 415, C.mint, 3);
  s += arrow(980, 367, 1090, 415, C.cyan, 3);
  s += textBlock(80, 560, 330, 'DATABASE-PER-SERVICE', 14, C.muted, { weight: 700 });
  s += rect(80, 590, 680, 100, C.panel, 18, C.line, 1);
  s += textBlock(110, 630, 610, 'PostgreSQL 16 · 9 service databases', 22, C.white, { weight: 700 });
  s += textBlock(110, 662, 610, 'Prisma schema · service owns its data', 16, C.muted);
  s += textBlock(870, 560, 320, 'SHARED INFRASTRUCTURE', 14, C.muted, { weight: 700 });
  s += card(870, 590, 150, 100, 'Redis', 'session', C.coral, { titleSize: 18, bodySize: 15 });
  s += card(1035, 590, 150, 100, 'RabbitMQ', 'events', C.amber, { titleSize: 16, bodySize: 15 });
  s += card(1200, 590, 150, 100, 'MinIO', 'ciphertext', C.mint, { titleSize: 18, bodySize: 15 });
  s += card(1365, 590, 150, 100, 'ClamAV', 'malware', C.cyan, { titleSize: 18, bodySize: 15 });
  s += textBlock(80, 765, 1420, 'Nguyên tắc: client không gọi service nội bộ, không đọc database và không nhận storage secret/KEK.', 20, C.muted, { weight: 700 });
  return base(s);
}

function slide4() {
  let s = header('03 · CLO2', 'Phân tích bài toán và nền tảng lý thuyết', 4);
  s += textBlock(80, 178, 1440, 'Từ yêu cầu nghiệp vụ, mình chuyển hóa thành các ràng buộc kỹ thuật có thể kiểm thử được.', 23, C.muted);
  const cards = [
    ['Microservices', 'Database-per-service và API Gateway tách ranh giới dữ liệu, trách nhiệm và triển khai.', C.cyan],
    ['Least privilege', 'Default deny, Task-scoped Grant, capability cho EMPLOYEE và ADMIN tách khỏi content.', C.mint],
    ['Defense in depth', 'JWT → Gateway → Controller guard → Permission check → download ticket.', C.amber],
    ['Event-driven', 'RabbitMQ cho domain events; audit/notification không chặn luồng nghiệp vụ chính.', C.coral],
  ];
  cards.forEach((item, i) => { const x = 80 + (i % 2) * 740; const y = 245 + Math.floor(i / 2) * 220; s += card(x, y, 680, 174, item[0], item[1], item[2], { titleSize: 25, bodySize: 19 }); });
  s += rect(80, 720, 1440, 65, '#102f3b', 16, C.mint, 1);
  s += textBlock(110, 760, 1380, 'Phân tích tốt = biến “tài liệu nhạy cảm” thành các điểm kiểm soát: identity, policy, expiry, storage, audit.', 19, C.mint, { weight: 700 });
  return base(s);
}

function stepBox(x, y, n, title, sub, accent = C.mint) {
  return `${circle(x + 27, y + 28, 27, accent)}${textBlock(x + 27, y + 36, 40, String(n), 18, C.bg, { anchor: 'middle', weight: 700 })}${textBlock(x + 70, y + 24, 190, title, 18, C.white, { weight: 700 })}${textBlock(x + 70, y + 50, 190, sub, 14, C.muted)}`;
}

function slide5() {
  let s = header('04 · CLO4', 'Thiết kế luồng Task → Grant → Document', 5);
  s += textBlock(80, 178, 1380, 'Sơ đồ dưới đây là thiết kế nghiệp vụ trung tâm: quyền truy cập phải có căn cứ và có điểm kết thúc.', 23, C.muted);
  const xs = [90, 350, 610, 870, 1130, 1390];
  const data = [
    ['1', 'CREATE TASK', 'Creator tạo ngữ cảnh công việc', C.cyan],
    ['2', 'PARTICIPATE', 'Assignee/participant hợp lệ', C.cyan],
    ['3', 'GRANT', 'Cấp PREVIEW/DOWNLOAD có expiry', C.mint],
    ['4', 'CHECK', 'Permission Service quyết định', C.mint],
    ['5', 'TICKET', 'Download ticket dùng một lần', C.amber],
    ['6', 'REVOKE', 'Hết hạn/Task kết thúc → DENY', C.coral],
  ];
  data.forEach((item, i) => { s += stepBox(xs[i], 300, item[0], item[1], item[2], item[3]); if (i < data.length - 1) s += arrow(xs[i] + 220, 328, xs[i + 1] - 32, 328, C.line, 3); });
  s += rect(140, 485, 1320, 180, C.panel, 22, C.line, 1);
  s += textBlock(180, 530, 1240, 'State & policy checkpoints', 22, C.mint, { weight: 700 });
  s += bulletList(190, 585, 540, ['Task status: CREATED → ASSIGNED → IN_PROGRESS → REVIEW → APPROVED', 'Grant status: ACTIVE → EXPIRED / REVOKED'], C.cyan, 17, 42);
  s += bulletList(850, 585, 540, ['ADMIN không được bypass content permission.', 'Mọi lỗi Permission Service đều fail-closed.'], C.amber, 17, 42);
  s += pill(140, 720, 'Thiết kế có thể kiểm thử', '#16314b', C.cyan, 180);
  s += textBlock(340, 744, 1040, 'Mỗi mũi tên tương ứng một API contract, một policy check hoặc một integration test.', 18, C.muted, { weight: 700 });
  return base(s);
}

function slide6() {
  let s = header('05 · Bảo mật tài liệu', 'Security Pipeline: dữ liệu đi qua nhiều lớp bảo vệ', 6);
  s += textBlock(80, 178, 1420, 'File plaintext không đi thẳng vào storage. Pipeline kiểm tra, mã hóa và ký trước khi lưu ciphertext.', 23, C.muted);
  const stages = [
    ['UPLOAD', 'multipart\nmetadata', C.cyan],
    ['SCAN', 'ClamAV\nCLEAN/REJECT', C.amber],
    ['ENCRYPT', 'AES-256-GCM\nversioned KEK', C.mint],
    ['SIGN', 'signature\nverification', C.mint],
    ['STORE', 'MinIO\nciphertext only', C.cyan],
  ];
  stages.forEach((stage, i) => {
    const x = 110 + i * 300;
    s += rect(x, 330, 230, 190, C.panel2, 22, stage[2], 2);
    s += circle(x + 115, 375, 30, stage[2]);
    s += textBlock(x + 115, 383, 50, String(i + 1), 20, C.bg, { anchor: 'middle', weight: 700 });
    s += textBlock(x + 115, 435, 190, stage[0], 22, C.white, { anchor: 'middle', weight: 700 });
    s += textBlock(x + 115, 472, 190, stage[1], 16, C.muted, { anchor: 'middle', lineHeight: 24 });
    if (i < stages.length - 1) s += arrow(x + 232, 425, x + 292, 425, C.mint, 4);
  });
  s += card(110, 605, 430, 120, 'REJECT EARLY', 'State-secret file hoặc malware không tạo Document.', C.coral, { titleSize: 19, bodySize: 16 });
  s += card(585, 605, 430, 120, 'STORE SAFELY', 'PostgreSQL giữ metadata; object storage giữ ciphertext.', C.mint, { titleSize: 19, bodySize: 16 });
  s += card(1060, 605, 430, 120, 'DOWNLOAD MEDIATED', 'Ticket + permission re-check trước khi trả plaintext.', C.amber, { titleSize: 19, bodySize: 16 });
  return base(s);
}

function slide7() {
  let s = header('06 · CLO1', 'Đạo đức, tuân thủ và trách nhiệm kỹ thuật', 7);
  s += textBlock(80, 178, 1440, 'CLO1 được thể hiện bằng các nguyên tắc thiết kế và cách xử lý sai sót, không chỉ bằng khẩu hiệu.', 23, C.muted);
  const cards = [
    ['Tách quyền quản trị và nội dung', 'ADMIN quản lý user/rule nhưng không được đọc tài liệu. Content access thuộc EMPLOYEE + Task + Grant.', C.mint],
    ['Bảo vệ dữ liệu nhạy cảm', 'Không đưa raw document/comment vào Audit; không trả object key, storage secret hoặc KEK cho client.', C.cyan],
    ['Fail closed và trung thực với lỗi', 'Không có Grant, Grant hết hạn hoặc Permission Service lỗi đều từ chối; lỗi không bị biến thành allow.', C.coral],
    ['Chịu trách nhiệm và có bằng chứng', 'Có test, log, audit hash chain, kiểm tra health và ghi nhận các giới hạn/chưa xác minh.', C.amber],
  ];
  cards.forEach((item, i) => { const x = 80 + (i % 2) * 740; const y = 245 + Math.floor(i / 2) * 220; s += card(x, y, 680, 175, item[0], item[1], item[2], { titleSize: 22, bodySize: 18 }); });
  s += pill(80, 735, 'Nguyên tắc ứng xử', C.darkMint, C.mint, 160);
  s += textBlock(260, 759, 1200, 'Không che giấu lỗi bảo mật · Không vượt quyền để “test cho nhanh” · Luôn lưu bằng chứng kiểm tra.', 18, C.white, { weight: 700 });
  return base(s);
}

function slide8() {
  let s = header('07 · CLO5', 'Công đoạn phát triển: từ code đến regression test', 8);
  s += textBlock(80, 178, 1440, 'Một công đoạn mình thực hiện trong thực tập là triển khai và kiểm chứng backend theo từng lát chức năng.', 23, C.muted);
  const timeline = [
    ['ANALYZE', 'Đọc yêu cầu, xác định actor, resource, action và boundary.', C.cyan],
    ['IMPLEMENT', 'NestJS controller/service, Prisma query, Zod validation, shared contracts.', C.mint],
    ['HARDEN', 'Authorization, owner access, pagination, fail-closed và error mapping.', C.amber],
    ['VERIFY', 'Unit/integration test, lint, build và regression toàn backend.', C.coral],
  ];
  timeline.forEach((item, i) => {
    const x = 90 + i * 370;
    s += circle(x + 25, 330, 25, item[2]);
    s += textBlock(x + 25, 338, 40, String(i + 1), 18, C.bg, { anchor: 'middle', weight: 700 });
    if (i < timeline.length - 1) s += line(x + 52, 330, x + 344, 330, C.line, 4);
    s += card(x - 10, 390, 330, 170, item[0], item[1], item[2], { titleSize: 21, bodySize: 17 });
  });
  s += rect(90, 640, 1360, 105, '#102f3b', 20, C.mint, 1);
  s += textBlock(125, 682, 1280, 'MINH CHỨNG HIỆN TẠI', 15, C.mint, { weight: 700 });
  s += textBlock(125, 722, 1280, '41 test suites  ·  212 tests pass  ·  10/10 applications build  ·  backend lint pass', 24, C.white, { weight: 700 });
  return base(s);
}

function slide9() {
  let s = header('08 · CLO5', 'Triển khai local bằng Docker Compose', 9);
  s += textBlock(80, 178, 1440, 'Deployment được mô hình hóa thành một stack có thể dựng lại: infrastructure trước, service sau, Gateway là điểm vào.', 23, C.muted);
  s += rect(520, 260, 560, 105, '#173e3c', 22, C.mint, 2);
  s += textBlock(800, 307, 500, 'docker compose up -d', 27, C.mint, { anchor: 'middle', weight: 700 });
  s += textBlock(800, 340, 500, 'một lệnh dựng toàn bộ local runtime', 16, C.muted, { anchor: 'middle' });
  const left = [['API GATEWAY', 'port 3000', C.cyan], ['10 NESTJS APPS', 'ports 3001–3009', C.mint]];
  left.forEach((item, i) => { s += card(100, 440 + i * 130, 430, 100, item[0], item[1], item[2], { titleSize: 20, bodySize: 16 }); s += arrow(530, 490 + i * 130, 600, 310, C.line, 2); });
  const right = [['POSTGRESQL', '9 databases · Prisma', C.cyan], ['REDIS · RABBITMQ', 'session · domain events', C.amber], ['MINIO · CLAMAV', 'ciphertext · malware scan', C.coral]];
  right.forEach((item, i) => { s += card(1070, 370 + i * 130, 430, 100, item[0], item[1], item[2], { titleSize: 20, bodySize: 16 }); s += arrow(1070, 420 + i * 130, 1000, 310, C.line, 2); });
  s += pill(100, 735, 'Deployment checklist', C.darkMint, C.mint, 178);
  s += textBlock(300, 759, 1180, 'environment → infra health → Prisma schema → services → Gateway → smoke test', 18, C.muted, { weight: 700 });
  return base(s);
}

function slide10() {
  let s = header('09 · CLO5', 'Vận hành và xác minh hệ thống', 10);
  s += textBlock(80, 178, 1440, 'Vận hành không chỉ là “service đang chạy”; cần kiểm tra health, log, quyền, audit chain và khả năng khôi phục.', 23, C.muted);
  const ops = [
    ['START', 'docker compose up -d', C.cyan],
    ['HEALTH', 'health endpoint\ncontainer status', C.mint],
    ['OBSERVE', 'logs · RabbitMQ\nservice errors', C.amber],
    ['VERIFY', 'audit chain\nfull backend script', C.coral],
    ['RECOVER', 'restart isolated\nservice, re-test', C.cyan],
  ];
  ops.forEach((item, i) => {
    const x = 85 + i * 300;
    s += circle(x + 38, 350, 38, item[2]);
    s += textBlock(x + 38, 357, 90, String(i + 1), 20, C.bg, { anchor: 'middle', weight: 700 });
    s += textBlock(x + 90, 337, 175, item[0], 19, C.white, { weight: 700 });
    s += textBlock(x + 90, 370, 180, item[1], 15, C.muted, { lineHeight: 23 });
    if (i < ops.length - 1) s += arrow(x + 78, 350, x + 270, 350, C.line, 3);
  });
  s += card(100, 535, 430, 150, 'CHECK 1 · SERVICE HEALTH', 'Gateway và các app trả health; Docker container ở trạng thái running.', C.mint, { titleSize: 19, bodySize: 17 });
  s += card(585, 535, 430, 150, 'CHECK 2 · SECURITY EVIDENCE', 'Permission decision, download ticket và audit hash chain có thể truy vết.', C.cyan, { titleSize: 19, bodySize: 17 });
  s += card(1070, 535, 430, 150, 'CHECK 3 · REGRESSION', 'verify-full-backend.sh gom lint, build, integration và security workflow.', C.amber, { titleSize: 19, bodySize: 17 });
  s += rect(100, 735, 1400, 50, '#2c2730', 14, C.coral, 1);
  s += textBlock(125, 768, 1350, 'Điểm cần tiếp tục cải thiện: tài liệu vận hành production, migration policy và monitoring dashboard thực tế.', 17, C.amber, { weight: 700 });
  return base(s);
}

function slide11() {
  let s = header('10 · CLO3 + Kết luận', 'Kết quả đạt được và đối chiếu CLO', 11);
  s += textBlock(80, 178, 1440, 'Dự án cho thấy một quy trình khép kín: phân tích đúng → thiết kế có ranh giới → triển khai có kiểm thử → vận hành có bằng chứng.', 23, C.muted);
  const rows = [
    ['CLO1', 'Đạo đức & trách nhiệm', 'ADMIN/content separation · fail-closed · audit · không lộ dữ liệu nhạy cảm', C.mint],
    ['CLO2', 'Bài toán & lý thuyết', 'microservices · least privilege · defense in depth · event-driven', C.cyan],
    ['CLO3', 'Giao tiếp & teamwork', 'API contract rõ ràng · tài liệu hóa · review lỗi · phối hợp theo boundary', C.amber],
    ['CLO4', 'Thiết kế & sơ đồ', 'architecture · Task→Grant→Document flow · security pipeline · state flow', C.mint],
    ['CLO5', 'Phát triển & vận hành', 'NestJS/Prisma · Docker Compose · test/lint/build · health/audit verification', C.coral],
  ];
  rows.forEach((row, i) => {
    const y = 255 + i * 92;
    s += rect(80, y, 1440, 76, i % 2 === 0 ? C.panel : C.panel2, 12, C.line, 1);
    s += pill(100, y + 21, row[0], row[3] === C.coral ? '#442b30' : C.darkMint, row[3], 74);
    s += textBlock(205, y + 32, 280, row[1], 18, C.white, { weight: 700 });
    s += textBlock(510, y + 32, 965, row[2], 17, C.muted, { weight: 600 });
  });
  s += rect(80, 740, 1440, 58, '#173e3c', 16, C.mint, 1);
  s += textBlock(800, 777, 1340, 'CẢM ƠN · SẴN SÀNG TRAO ĐỔI', 20, C.mint, { anchor: 'middle', weight: 700 });
  return base(s);
}

const slides = [slide1(), slide2(), slide3(), slide4(), slide5(), slide6(), slide7(), slide8(), slide9(), slide10(), slide11()];

function themeXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="C17 Security"><a:themeElements><a:clrScheme name="C17"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="091321"/></a:dk2><a:lt2><a:srgbClr val="F4F8FB"/></a:lt2><a:accent1><a:srgbClr val="5DE3C5"/></a:accent1><a:accent2><a:srgbClr val="5AB9F4"/></a:accent2><a:accent3><a:srgbClr val="F2B45F"/></a:accent3><a:accent4><a:srgbClr val="F47B7B"/></a:accent4><a:accent5><a:srgbClr val="102238"/></a:accent5><a:accent6><a:srgbClr val="142B44"/></a:accent6><a:hlink><a:srgbClr val="5AB9F4"/></a:hlink><a:folHlink><a:srgbClr val="F2B45F"/></a:folHlink></a:clrScheme><a:fontScheme name="C17"><a:majorFont><a:latin typeface="DejaVu Sans"/></a:majorFont><a:minorFont><a:latin typeface="DejaVu Sans"/></a:minorFont></a:fontScheme><a:fmtScheme name="C17"><a:fillStyleLst/><a:lnStyleLst/><a:effectStyleLst/><a:bgFillStyleLst/></a:fmtScheme></a:themeElements></a:theme>`;
}

function slideXml(index) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:pic><p:nvPicPr><p:cNvPr id="2" name="slide-${index}.png"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="12192000" cy="6858000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

function contentTypesXml(count) {
  const slideOverrides = Array.from({ length: count }, (_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${slideOverrides}</Types>`;
}

function presentationXml(count) {
  const ids = Array.from({ length: count }, (_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${ids}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle><a:defPPr/><a:lvl1pPr marL="0" algn="l"><a:defRPr lang="vi-VN"/></a:lvl1pPr></p:defaultTextStyle></p:presentation>`;
}

function rootRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`;
}

function presentationRelsXml(count) {
  const slides = Array.from({ length: count }, (_, i) => `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>${slides}</Relationships>`;
}

function masterXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld name="C17 Master"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`;
}

function layoutXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
}

function masterRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`;
}

function layoutRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`;
}

function slideRelsXml(index) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/slide${index}.png"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`;
}

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipDirectory(sourceDir, destination) {
  const files = [];
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const absolute = join(dir, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else files.push({ name: absolute.slice(sourceDir.length + 1).split('\\').join('/'), data: readFileSync(absolute) });
    }
  };
  visit(sourceDir);
  files.sort((a, b) => (a.name === 'mimetype' ? -1 : b.name === 'mimetype' ? 1 : a.name.localeCompare(b.name)));
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const crc = crc32(file.data);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt16LE(0, 14);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(file.data.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    localParts.push(local, file.data);
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(file.data.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centralParts.push(central);
    offset += local.length + file.data.length;
  }
  const central = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  writeFileSync(destination, Buffer.concat([...localParts, central, end]));
}

function odpContentXml() {
  const pages = slides.map((_, index) => `<draw:page draw:name="Slide ${index + 1}" draw:style-name="dp1"><draw:frame draw:style-name="gr1" svg:x="0in" svg:y="0in" svg:width="13.333in" svg:height="7.5in"><draw:image xlink:href="Pictures/slide${index + 1}.svg" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame></draw:page>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:svg="http://www.w3.org/2000/svg" office:version="1.3"><office:automatic-styles><style:style style:name="dp1" style:family="drawing-page"><style:drawing-page-properties draw:fill="none"/></style:style><style:style style:name="gr1" style:family="graphic"><style:graphic-properties draw:fill="none"/></style:style></office:automatic-styles><office:body><office:presentation>${pages}</office:presentation></office:body></office:document-content>`;
}

function odpStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8"?><office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:svg="http://www.w3.org/2000/svg" office:version="1.3"><office:automatic-styles><style:page-layout style:name="PM1"><style:page-layout-properties fo:page-width="13.333in" fo:page-height="7.5in" style:print-orientation="landscape"/></style:page-layout></office:automatic-styles><office:master-styles><style:master-page style:name="Default" style:page-layout-name="PM1"/></office:master-styles></office:document-styles>`;
}

function odpManifestXml() {
  const images = slides.map((_, index) => `<manifest:file-entry manifest:full-path="Pictures/slide${index + 1}.svg" manifest:media-type="image/svg+xml"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.presentation"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="settings.xml" manifest:media-type="text/xml"/>${images}</manifest:manifest>`;
}

function writeOdpPackage() {
  rmSync(odpPackageDir, { recursive: true, force: true });
  mkdirSync(join(odpPackageDir, 'META-INF'), { recursive: true });
  mkdirSync(join(odpPackageDir, 'Pictures'), { recursive: true });
  writeFileSync(join(odpPackageDir, 'mimetype'), 'application/vnd.oasis.opendocument.presentation');
  writeFileSync(join(odpPackageDir, 'content.xml'), odpContentXml());
  writeFileSync(join(odpPackageDir, 'styles.xml'), odpStylesXml());
  writeFileSync(join(odpPackageDir, 'meta.xml'), '<?xml version="1.0" encoding="UTF-8"?><office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" office:version="1.3"><office:meta/></office:document-meta>');
  writeFileSync(join(odpPackageDir, 'settings.xml'), '<?xml version="1.0" encoding="UTF-8"?><office:document-settings xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" office:version="1.3"><office:settings/></office:document-settings>');
  writeFileSync(join(odpPackageDir, 'META-INF', 'manifest.xml'), odpManifestXml());
  slides.forEach((_, index) => writeFileSync(join(odpPackageDir, 'Pictures', `slide${index + 1}.svg`), readFileSync(join(workDir, `slide${index + 1}.svg`))));
  zipDirectory(odpPackageDir, odpPath);
}

function writePackage() {
  rmSync(packageDir, { recursive: true, force: true });
  mkdirSync(join(packageDir, '_rels'), { recursive: true });
  mkdirSync(join(packageDir, 'ppt', '_rels'), { recursive: true });
  mkdirSync(join(packageDir, 'ppt', 'slides', '_rels'), { recursive: true });
  mkdirSync(join(packageDir, 'ppt', 'slides'), { recursive: true });
  mkdirSync(join(packageDir, 'ppt', 'slideMasters', '_rels'), { recursive: true });
  mkdirSync(join(packageDir, 'ppt', 'slideMasters'), { recursive: true });
  mkdirSync(join(packageDir, 'ppt', 'slideLayouts', '_rels'), { recursive: true });
  mkdirSync(join(packageDir, 'ppt', 'slideLayouts'), { recursive: true });
  mkdirSync(join(packageDir, 'ppt', 'theme'), { recursive: true });
  mkdirSync(join(packageDir, 'ppt', 'media'), { recursive: true });

  slides.forEach((svg, index) => {
    const n = index + 1;
    const svgPath = join(workDir, `slide${n}.svg`);
    const pngPath = join(packageDir, 'ppt', 'media', `slide${n}.png`);
    writeFileSync(svgPath, svg);
    writeFileSync(pngPath, readFileSync(join(workDir, `slide${n}.png`)));
    writeFileSync(join(packageDir, 'ppt', 'slides', `slide${n}.xml`), slideXml(n));
    writeFileSync(join(packageDir, 'ppt', 'slides', '_rels', `slide${n}.xml.rels`), slideRelsXml(n));
  });

  writeFileSync(join(packageDir, '[Content_Types].xml'), contentTypesXml(slides.length));
  writeFileSync(join(packageDir, '_rels', '.rels'), rootRelsXml());
  writeFileSync(join(packageDir, 'ppt', 'presentation.xml'), presentationXml(slides.length));
  writeFileSync(join(packageDir, 'ppt', '_rels', 'presentation.xml.rels'), presentationRelsXml(slides.length));
  writeFileSync(join(packageDir, 'ppt', 'slideMasters', 'slideMaster1.xml'), masterXml());
  writeFileSync(join(packageDir, 'ppt', 'slideMasters', '_rels', 'slideMaster1.xml.rels'), masterRelsXml());
  writeFileSync(join(packageDir, 'ppt', 'slideLayouts', 'slideLayout1.xml'), layoutXml());
  writeFileSync(join(packageDir, 'ppt', 'slideLayouts', '_rels', 'slideLayout1.xml.rels'), layoutRelsXml());
  writeFileSync(join(packageDir, 'ppt', 'theme', 'theme1.xml'), themeXml());

  mkdirSync(outputDir, { recursive: true });
  rmSync(outputPath, { force: true });
  zipDirectory(packageDir, outputPath);
}

function writeSvgAssets() {
  rmSync(workDir, { recursive: true, force: true });
  mkdirSync(workDir, { recursive: true });
  slides.forEach((svg, index) => writeFileSync(join(workDir, `slide${index + 1}.svg`), svg));
  console.log(`SVG assets created in ${workDir}`);
  console.log(`Slides: ${slides.length}`);
}

if (process.argv.includes('--assets-only')) {
  writeSvgAssets();
} else {
  if (!existsSync(join(workDir, 'slide1.svg')) || !existsSync(join(workDir, 'slide1.png'))) {
    throw new Error(`Missing slide assets. Run: node ${process.argv[1]} --assets-only, rasterize the SVG files to PNG, then run this command again.`);
  }
  writePackage();
  console.log(`Created ${outputPath}`);
  console.log(`Slides: ${slides.length}`);
}
