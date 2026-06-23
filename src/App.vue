<script>
import { initCloud } from './utils/cloud'
import { ensureSessionValid } from './utils/session'

export default {
  onLaunch() {
    initCloud()
    if (typeof uni.hideShareMenu === 'function') {
      uni.hideShareMenu()
    }
  },
  async onShow() {
    if (typeof uni.hideShareMenu === 'function') {
      uni.hideShareMenu()
    }
    await ensureSessionValid({
      redirectOnFail: true,
      showExpiredToast: false,
    })
  },
}
</script>

<style lang="scss">
@import './uni.scss';

:root {
  color-scheme: light;
  --color-page-bg: #fff8f0;
  --color-surface: #ffffff;
  --color-surface-soft: #fff8f0;
  --color-surface-muted: #f0f0f0;
  --color-brand: #e8b4b8;
  --color-brand-soft: #f4dfe1;
  --color-brand-strong: #d7a0a5;
  --color-text: #333333;
  --color-text-secondary: #6f6762;
  --color-line: rgba(51, 51, 51, 0.08);
  --color-disabled-bg: #f0f0f0;
  --color-mask: rgba(51, 51, 51, 0.32);
  --color-success: #a8c3b0;
  --color-warning: #d8b78a;
  --color-danger: #c98f95;
  --shadow-soft: 0 2px 8px rgba(0, 0, 0, 0.08);
  --radius-card: 16px;
  --radius-button: 12px;
  --radius-bubble: 16px;
  --page-padding-x: 16px;
  --section-gap: 20px;
  --transition-base: 220ms ease;
}

@media (prefers-color-scheme: dark) {
  :root {
    color-scheme: dark;
    --color-page-bg: #241f1d;
    --color-surface: #2f2927;
    --color-surface-soft: #3a3330;
    --color-surface-muted: #463e3b;
    --color-brand: #c79699;
    --color-brand-soft: #56484a;
    --color-brand-strong: #d4aaac;
    --color-text: #f8f1ea;
    --color-text-secondary: #d6cbc4;
    --color-line: rgba(255, 248, 240, 0.1);
    --color-disabled-bg: #4a4340;
    --color-mask: rgba(0, 0, 0, 0.48);
    --color-success: #8da494;
    --color-warning: #cda77a;
    --color-danger: #cd989d;
    --shadow-soft: 0 4px 18px rgba(0, 0, 0, 0.22);
  }
}

page {
  min-height: 100%;
  background: var(--color-page-bg);
  color: var(--color-text);
  font-size: 28rpx;
}

view,
text,
button,
input,
textarea {
  box-sizing: border-box;
}

button {
  border-radius: var(--radius-button);
  transition: transform var(--transition-base), opacity var(--transition-base), background-color var(--transition-base), color var(--transition-base);
}

button[disabled] {
  opacity: 0.5;
}

image {
  transition: opacity var(--transition-base), transform var(--transition-base);
}
</style>
