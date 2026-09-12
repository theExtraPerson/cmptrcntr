"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ShoppingBag, Users } from "lucide-react";

const items = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/products", label: "Products", icon: ShoppingBag },
  { href: "/team", label: "My Team", icon: Users },
];

export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="bottom-nav mx-auto max-w-md">
      <div className="grid grid-cols-3">
        {items.map((item) => {
          const active = path === item.href || (item.href !== "/dashboard" && path.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className={`bottom-nav-item ${active ? "active" : ""}`}>
              <Icon size={22} />
              <span className="text-xs font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
