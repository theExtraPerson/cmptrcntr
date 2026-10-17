import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";

const steps = [
  {
    title: "Register and become a partner",
    description:
      "Create an account and follow the registration process. Partnership starts with a deposit of UGX 5,000, subject to the applicable terms and conditions.",
  },
  {
    title: "Support computer trading",
    description:
      "Our business model is based on sourcing laptops, desktops, and accessories from international markets, including the United Kingdom and Dubai, to support our computer trading activities.",
  },
  {
    title: "Understand your partnership plan",
    description:
      "Review the selected plan, its stated duration, potential earnings, capital-return terms, conditions, and risks. Any returns are conditional on the applicable terms and confirmed business results; they are not guaranteed.",
  },
  {
    title: "Track your account",
    description:
      "Use your dashboard to review deposits, partnership plans, account history, eligible final payout requests, and withdrawal status.",
  },
  {
    title: "Request eligible withdrawals",
    description:
      "After the plan duration ends, eligible plan earnings and any applicable capital return accumulate toward a final payout. No daily withdrawals are made from active plans. Wallet withdrawals have a minimum of UGX 30,000, are limited to one request per Kampala calendar day, and pending requests carry forward for review.",
  },
];

export default function AboutPage() {
  return (
    <AppShell>
      <PageHeader title="About Computer Center" />
      <div className="space-y-5 px-4 py-4">
        <section className="card-elevated space-y-3 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-primary">COMPUTER CENTER</p>
          <h2 className="text-xl font-semibold">Connecting People With Technology.</h2>
          <p className="text-sm text-muted-foreground">
            Computer Center is a technology-focused business with computer products and accessories, and a partnership
            programme governed by clear terms and account records.
          </p>
          <Link href="/register" className="btn-gradient block rounded-xl py-3 text-center text-sm font-medium">
            Create a partner account
          </Link>
        </section>

        <section className="card-elevated space-y-4 p-4">
          <h2 className="text-lg font-semibold">How Does It Work?</h2>
          <ol className="space-y-4">
            {steps.map((step, index) => (
              <li key={step.title} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {index + 1}
                </span>
                <div>
                  <h3 className="text-sm font-medium">{step.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="card-elevated space-y-3 p-4">
          <h2 className="text-lg font-semibold">Why Choose COMPUTER CENTER?</h2>
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            <li>A technology-focused business model.</li>
            <li>A range of computer products and accessories.</li>
            <li>Clear partnership terms and account records.</li>
            <li>Accessible customer support.</li>
            <li>Transparent information about deposits, returns, and withdrawals.</li>
          </ul>
        </section>

        <section className="card-elevated space-y-3 p-4">
          <h2 className="text-lg font-semibold">Our Commitment</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Trust begins with transparency. We are committed to communicating our business activities, partnership
            conditions, and financial risks clearly so every client can make an informed decision.
          </p>
          <p className="text-sm font-medium">COMPUTER CENTER — Connecting People With Technology.</p>
          <p className="text-sm text-muted-foreground">Location: Kampala Road, Uganda.</p>
          <p className="text-xs text-muted-foreground">Partner responsibly. Understand the terms. Make informed decisions.</p>
        </section>

        <Link href="/products" className="btn-gradient block rounded-xl py-3 text-center text-sm font-medium">
          Review partnership plans
        </Link>
      </div>
    </AppShell>
  );
}
