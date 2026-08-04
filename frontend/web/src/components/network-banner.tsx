'use client';

import { useEffect, useState } from 'react';
import styles from './network-banner.module.css';

export function NetworkBanner() {
  const [online, setOnline] = useState(true);
  useEffect(() => { const update = () => setOnline(navigator.onLine); update(); window.addEventListener('online', update); window.addEventListener('offline', update); return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); }; }, []);
  return online ? null : <div className={styles.banner} role="status">You appear to be offline. Changes cannot be saved until you reconnect.</div>;
}
