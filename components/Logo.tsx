"use client";

import { useState } from "react";

export function Logo({ size = 64 }: { size?: number }) {
  const [ok, setOk] = useState(true);
  if (!ok) {
    return (
      <div
        className="gradient-mint flex items-center justify-center rounded-2xl text-xs font-medium text-white"
        style={{ width: size, height: size }}
      >
        VF
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.jpg"
      alt="VivianFi"
      width={size}
      height={size}
      className="rounded-2xl object-cover"
      onError={() => setOk(false)}
    />
  );
}
