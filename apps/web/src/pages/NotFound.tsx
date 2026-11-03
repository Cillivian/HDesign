import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';

export function NotFound() {
  return (
    <div className="flex h-full items-center justify-center bg-app px-6">
      <div className="text-center">
        <Compass size={28} className="mx-auto mb-3 text-faint" />
        <h1 className="font-serif text-[22px] font-semibold text-ink">页面不存在</h1>
        <p className="mt-1 text-[12px] text-muted">链接可能已失效，或项目还在另一台设备上。</p>
        <Link
          to="/"
          className="mt-4 inline-flex h-8 items-center rounded-[2px] bg-[var(--ink)] px-3 text-[12px] text-[var(--bg-surface)]"
        >
          返回项目列表
        </Link>
      </div>
    </div>
  );
}
