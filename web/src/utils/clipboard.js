/**
 * 复制文本到剪贴板，兼容非安全上下文（http 内网）。
 *
 * 优先用 Clipboard API（仅 https / localhost 可用），
 * 失败或不可用时回退到 textarea + document.execCommand('copy')，
 * 后者在 http://192.168.x.x 这类内网地址下仍能工作。
 *
 * @param {string} text
 * @returns {Promise<boolean>} 是否复制成功
 */
export async function copyToClipboard(text) {
  const value = String(text ?? '');

  // 1. 优先 Clipboard API（需要安全上下文）
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // 落到下面的兜底
    }
  }

  // 2. 兜底：临时 textarea + execCommand('copy')
  try {
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);

    const selection = document.getSelection();
    const prevRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

    ta.select();
    ta.setSelectionRange(0, value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);

    if (prevRange && selection) {
      selection.removeAllRanges();
      selection.addRange(prevRange);
    }
    return ok;
  } catch {
    return false;
  }
}
