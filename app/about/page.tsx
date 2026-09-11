"use client";

import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";

export default function AboutPage() {
  return (
    <AppShell>
      <PageHeader title="About VivianFi" />
      <div className="space-y-4 px-4 py-4">
        <div className="card-elevated overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/about_us.jpg" alt="VivianFi" className="h-40 w-full object-cover" />
          <div className="p-4">
            <p className="text-xs uppercase tracking-wide text-primary">VIVIAN FINANCE</p>
            <h2 className="mt-1 text-lg font-medium">VivianFi — Intelligent Technology. Smarter Financial Futures.</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              VivianFi is a next-generation technology and financial intelligence platform focused on combining
              data-driven insights, advanced analytics, and innovative solutions to create smarter opportunities for the
              digital economy.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Through intelligent systems, quantitative strategies, and modern financial technologies, VivianFi empowers
              individuals and businesses to make informed decisions, optimize performance, and navigate the future with
              confidence.
            </p>
            <p className="mt-2 text-sm font-medium text-primary">Building a smarter tomorrow through innovation, precision, and technology.</p>
          </div>
        </div>

        <div className="card-elevated overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/hero_image.jpg" alt="" className="h-36 w-full object-cover" />
          <div className="space-y-3 p-4 text-sm text-muted-foreground">
            <h3 className="text-base font-medium text-foreground">About us</h3>
            <p>
              At VivianFi, we are redefining the way people grow their wealth through innovation, precision, and trust.
              As a quantifying investment company, our mission is to provide investors with consistent and sustainable
              returns powered by cutting-edge arbitrage strategies and quantitative market analysis.
            </p>
            <p>
              Our team leverages advanced trading models, real-time data insights, and automated systems to identify
              profitable opportunities across global markets. By combining deep financial expertise with innovative
              technology, we maximize efficiency and minimize risk, ensuring our clients benefit from the ever-changing
              dynamics of the financial landscape.
            </p>
            <p>
              With VivianFi, your money works for you — generating daily payouts derived directly from our arbitrage and
              quantitative profits. We prioritize transparency, security, and long-term growth, building a platform
              where investors can trust that their capital is managed with professionalism and care.
            </p>
            <p className="text-foreground">Join us at VivianFi and experience a smarter, more rewarding way to invest.</p>
          </div>
        </div>

        <div className="card-elevated overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/get_started.jpg" alt="Product list" className="w-full object-cover" />
        </div>

        <div className="card-elevated overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/quantitative_plan_table.jpg" alt="Quantitative plan" className="w-full object-cover" />
          <div className="p-4">
            <h3 className="font-medium">Quantitative plan</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Profit ratio increases with the amount you trade (20% to 26% daily). Each machine runs for 4 days, then
              your initial deposit is returned.
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
