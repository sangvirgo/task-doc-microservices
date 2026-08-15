/**
 * Shared HTML email templates for C17 Workspace. All emails ship an HTML body and a plain-text
 * fallback, both generated from the same content so the two never drift.
 */

export interface MailEnvelope {
  subject: string;
  text: string;
  html: string;
}

const BRAND_NAME = 'C17 Workspace';

interface FrameOptions {
  accent: string;
  title: string;
  heading: string;
  paragraphs: string[];
  code?: string;
  cta?: { label: string; url: string };
  note?: string;
}

function frame(options: FrameOptions): { text: string; html: string } {
  const text = [
    options.heading,
    '',
    ...options.paragraphs,
    options.code ? `Mã của bạn: ${options.code}` : '',
    options.cta ? `${options.cta.label}: ${options.cta.url}` : '',
    options.note ?? 'Email này được gửi tự động. Vui lòng không trả lời trực tiếp.',
    '',
    `— ${BRAND_NAME}`,
  ]
    .filter((line) => line !== undefined)
    .join('\n');

  const codeBlock = options.code
    ? `<tr><td style="padding:4px 0 8px;">
          <div style="display:inline-block;background:${options.accent};color:#ffffff;font-size:34px;font-weight:700;letter-spacing:10px;padding:16px 26px 16px 30px;border-radius:10px;">${options.code}</div>
       </td></tr>`
    : '';

  const ctaBlock = options.cta
    ? `<tr><td style="padding:12px 0 4px;">
          <a href="${options.cta.url}" target="_blank" rel="noopener" style="background:${options.accent};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 22px;border-radius:8px;display:inline-block;">${options.cta.label}</a>
       </td></tr>`
    : '';

  const noteBlock = options.note
    ? `<p style="margin:14px 0 0;color:#9CA3AF;font-size:12px;line-height:1.6;">${options.note}</p>`
    : '';

  const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:28px 12px;">
  <tr>
    <td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #E5E7EB;">
        <tr>
          <td style="background:${options.accent};padding:20px 28px;">
            <span style="color:#ffffff;font-size:16px;font-weight:700;letter-spacing:0.3px;">${BRAND_NAME}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:28px;">
            <h1 style="margin:0 0 14px;font-size:20px;color:#111827;line-height:1.35;">${options.heading}</h1>
            ${options.paragraphs.map((p) => `<p style="margin:0 0 10px;color:#374151;font-size:15px;line-height:1.65;">${p}</p>`).join('')}
            ${codeBlock}
            ${ctaBlock}
            ${noteBlock}
          </td>
        </tr>
        <tr>
          <td style="padding:14px 28px;background:#F8FAFC;border-top:1px solid #EEF0F2;color:#9CA3AF;font-size:12px;line-height:1.6;">
            Email này được gửi tự động từ ${BRAND_NAME} nhằm phục vụ bảo mật và nhắc việc. Nếu bạn không thực hiện thao tác này, vui lòng bỏ qua email.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;

  return { text, html };
}

/** OTP email verification code. */
export function verificationCodeEmail(code: string, ttlMinutes: number): MailEnvelope {
  const { text, html } = frame({
    accent: '#4F46E5',
    title: 'Mã xác nhận email',
    heading: 'Xác nhận địa chỉ email của bạn',
    paragraphs: [
      'Bạn đang tạo tài khoản trên C17 Workspace. Dùng mã dưới đây để hoàn tất xác minh địa chỉ email.',
    ],
    code,
    note: `Mã có hiệu lực trong ${ttlMinutes} phút. Nếu bạn không thực hiện thao tác này, vui lòng bỏ qua email này.`,
  });
  return { subject: 'C17 — Mã xác nhận email', text, html };
}

/** Deadline reminder for a task assignee. */
export function deadlineReminderEmail(title: string, deadlineLabel: string, taskUrl?: string): MailEnvelope {
  const { text, html } = frame({
    accent: '#D97706',
    title: 'Sắp đến hạn',
    heading: `Task "${title}" sắp đến hạn`,
    paragraphs: [
      `Task này cần được hoàn thành trước <strong>${deadlineLabel}</strong>.`,
      'Vui lòng kiểm tra tiến độ và nộp kết quả đúng hạn.',
    ],
    cta: taskUrl
      ? { label: 'Mở task trong C17', url: taskUrl }
      : undefined,
    note: 'Đây là email nhắc việc tự động. Bạn sẽ không nhận thêm nhắc nào sau khi đã hoàn thành.',
  });
  return { subject: `[C17] Nhắc hạn: ${title}`, text, html };
}

/** High-severity security alert broadcast to admins. */
export function securityAlertEmail(severity: string, ruleType: string, alertId: string, alertsUrl?: string): MailEnvelope {
  const { text, html } = frame({
    accent: '#DC2626',
    title: 'Cảnh báo bảo mật',
    heading: `Phát hiện cảnh báo bảo mật mức ${severity}`,
    paragraphs: [
      `Hệ thống C17 đã phát hiện một cảnh báo bảo mật cấp độ <strong>${severity}</strong> theo quy tắc <strong>${ruleType}</strong>.`,
      `Alert ID: <code style="font-size:13px;background:#F3F4F6;padding:2px 6px;border-radius:4px;">${alertId}</code>`,
      'Vui lòng kiểm tra bảng điều khiển giám sát bảo mật và xử lý ngay lập tức.',
    ],
    cta: alertsUrl
      ? { label: 'Mở trung tâm bảo mật', url: alertsUrl }
      : undefined,
    note: 'Email cảnh báo tự động từ hệ thống giám sát. Không phải người gửi trực tiếp.',
  });
  return { subject: `[C17] Cảnh báo bảo mật ${severity}: ${ruleType}`, text, html };
}