"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname } from "next/navigation";

export function NavigationProgress() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    setVisible(true);
    setWidth(30);
    const t1 = setTimeout(() => setWidth(70), 100);
    const t2 = setTimeout(() => { setWidth(100); }, 300);
    const t3 = setTimeout(() => { setVisible(false); setWidth(0); }, 500);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [pathname]);

  if (!visible) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 h-0.5 bg-[#104e98] z-[200] transition-all duration-300"
      style={{ width: `${width}%` }}
    />
  );
}
