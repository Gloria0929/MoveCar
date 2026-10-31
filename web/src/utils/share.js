/**
 * 分享「让一让」给朋友（拉新 / 冷启动）。
 *
 * 优先用 Web Share API 唤起手机原生分享面板（需安全上下文），
 * 不可用时回退为复制「推荐语 + 首页链接」，让用户手动粘贴。
 *
 * @returns {Promise<{ok: boolean, method?: 'native'|'copy', aborted?: boolean}>}
 */
import { copyToClipboard } from './clipboard.js';

const SHARE_TITLE = '让一让 · 扫码挪车';
const SHARE_TEXT = '我车上的挪车码，扫码就能联系我挪车，不用留手机号。你也来一张？';

export async function shareApp() {
  const url = `${window.location.origin}/`;

  // 1. 优先原生分享面板
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title: SHARE_TITLE, text: SHARE_TEXT, url });
      return { ok: true, method: 'native' };
    } catch (err) {
      // 用户取消分享不算错误
      if (err && err.name === 'AbortError') return { ok: false, aborted: true };
      // 其余错误落到复制兜底
    }
  }

  // 2. 兜底：复制推荐语 + 首页链接
  const ok = await copyToClipboard(`${SHARE_TEXT}\n${url}`);
  return { ok, method: 'copy' };
}
