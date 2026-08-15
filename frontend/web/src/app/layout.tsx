import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';

export const metadata: Metadata = { title: 'C17 Workspace', description: 'Secure task and document workspace' };

const extensionHydrationGuard = `(() => {
  const removeAttributes = (node) => {
    if (!(node instanceof Element)) return;
    for (const attribute of Array.from(node.attributes)) {
      if (attribute.name === 'bis_skin_checked' || attribute.name === 'bis_register' || attribute.name.startsWith('__processed_')) node.removeAttribute(attribute.name);
    }
  };
  const sweep = () => document.querySelectorAll('*').forEach(removeAttributes);
  sweep();
  const observer = new MutationObserver((records) => records.forEach((record) => {
    if (record.type === 'attributes') removeAttributes(record.target);
    record.addedNodes.forEach((node) => {
      removeAttributes(node);
      if (node instanceof Element) node.querySelectorAll('*').forEach(removeAttributes);
    });
  }));
  observer.observe(document.documentElement, { attributes: true, childList: true, subtree: true });
  window.addEventListener('load', () => { sweep(); observer.disconnect(); }, { once: true });
})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body suppressHydrationWarning><Script id="extension-hydration-guard" strategy="beforeInteractive">{extensionHydrationGuard}</Script><a className="skip-link" href="#main-content">Skip to main content</a>{children}</body></html>;
}
